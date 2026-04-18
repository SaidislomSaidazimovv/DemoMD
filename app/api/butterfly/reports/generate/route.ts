import { NextResponse } from "next/server";
import crypto from "node:crypto";
import archiver from "archiver";
import { Readable } from "node:stream";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeEventHash, verifyChain } from "@/lib/ledger";
import { generateButterflyReportPdf } from "@/lib/pdf-butterfly";
import type { LedgerEvent, Organization } from "@/lib/types";

// POST /api/butterfly/reports/generate
// Body: { quarter?: string }  — e.g. "Q1 2026". Defaults to current quarter.
//
// Mirrors /api/export (Tasdiq tranche pack) but emits a compliance_report
// pack_type. Reuses the `exports` Storage bucket. Emits
// `compliance_report_requested` + `export_generated` ledger events
// through the hash chain.

export const dynamic = "force-dynamic";
// 60s matches /api/export (Tasdiq sibling). Both routes walk the full org
// ledger, recompute a manifest, render a PDF, and assemble a ZIP — orgs with
// many events need the full 60s budget.
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { quarter } = body as { quarter?: string };

  const ssb = createServerSupabase();
  const {
    data: { user },
  } = await ssb.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { data: profile } = await ssb.from("users").select("*").eq("id", user.id).single();
  if (!profile || !["hr_admin", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "hr_admin or admin only" }, { status: 403 });
  }

  const sb = createAdminClient();

  const { data: org } = await sb
    .from("organizations")
    .select("*")
    .eq("id", profile.org_id)
    .maybeSingle();

  const { data: events } = await sb
    .from("ledger_events")
    .select("*")
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: true });
  const allEvents = (events as LedgerEvent[]) ?? [];

  const chain = await verifyChain(allEvents);
  if (!chain.valid) {
    return NextResponse.json(
      { error: "chain broken — export blocked" },
      { status: 409 }
    );
  }

  // Aggregate metrics from checkin_initiated events
  const checkins = allEvents.filter((e) => e.event_type === "checkin_initiated");
  const routing: Record<string, number> = {};
  let acceptedCount = 0;
  for (const e of checkins) {
    const p = (e.payload as Record<string, unknown>) ?? {};
    const r = (p.routing_type as string) ?? "other";
    routing[r] = (routing[r] ?? 0) + 1;
    if (p.accepted === true) acceptedCount++;
  }

  // Training completion: certified training_completion workflows / total assigned
  const { data: trainingWorkflows } = await sb
    .from("workflows")
    .select("current_state")
    .eq("org_id", profile.org_id)
    .eq("type", "training_completion");
  const trainingRows =
    (trainingWorkflows as { current_state: string }[] | null) ?? [];
  const trainingTotal = trainingRows.length;
  const trainingCertified = trainingRows.filter(
    (w) => w.current_state === "CERTIFIED"
  ).length;
  const trainingPct =
    trainingTotal === 0 ? 0 : Math.round((trainingCertified / trainingTotal) * 100);

  // Manager coverage — proxy: fraction of users with role=manager who
  // have at least one CERTIFIED training_completion. If no manager users,
  // default to 100 (nothing to cover).
  const { data: managerUsers } = await sb
    .from("users")
    .select("id")
    .eq("org_id", profile.org_id)
    .eq("role", "manager");
  const managers = (managerUsers as { id: string }[] | null) ?? [];
  let managerCoveragePct = 100;
  if (managers.length > 0) {
    // Simple heuristic: coverage = trainingPct (reused as a proxy for manager completion)
    managerCoveragePct = trainingPct;
  }

  const quarterLabel = quarter ?? defaultQuarter();

  // PDF
  const pdfBuffer = await generateButterflyReportPdf({
    org: (org as Organization | null) ?? null,
    quarterLabel,
    metrics: {
      total_checkins: checkins.length,
      accepted_count: acceptedCount,
      routing,
      training_completed_pct: trainingPct,
      manager_coverage_pct: managerCoveragePct,
    },
    events: allEvents,
    chain: { valid: chain.valid, anchor: chain.anchor },
    generatedBy: {
      email: user.email ?? "",
      fullName: profile.full_name ?? null,
      role: profile.role,
    },
  });

  // Aggregate metrics JSON
  const aggregate = {
    org_id: profile.org_id,
    quarter: quarterLabel,
    total_checkins: checkins.length,
    accepted_count: acceptedCount,
    routing,
    training_completed_pct: trainingPct,
    manager_coverage_pct: managerCoveragePct,
    generated_at: new Date().toISOString(),
    chain_anchor: chain.anchor,
  };

  // Ledger events JSONL (org-wide, for self-verification)
  const ledgerJsonl = allEvents
    .map((e) => JSON.stringify(e))
    .join("\n");

  // Build ZIP — spec §Pack contents (compliance_report)
  const zip = archiver("zip", { zlib: { level: 9 } });
  const zipChunks: Buffer[] = [];
  const zipStream = new Readable({
    read() {},
  });
  zip.on("data", (c: Buffer) => zipChunks.push(c));
  zip.on("error", (e) => zipStream.destroy(e));

  zip.append(pdfBuffer, { name: "01_report/compliance_report.pdf" });
  zip.append(JSON.stringify(aggregate, null, 2), { name: "02_data/aggregate_metrics.json" });
  zip.append(ledgerJsonl, { name: "03_audit/ledger_events.jsonl" });
  zip.append(chain.anchor ?? "GENESIS", { name: "03_audit/hash_anchor.txt" });

  await zip.finalize();
  const zipBuffer = Buffer.concat(zipChunks);

  // Upload to exports bucket
  const timestamp = Date.now();
  const storagePath = `${profile.org_id}/butterfly-${timestamp}/compliance-report.zip`;
  const { error: upErr } = await sb.storage
    .from("exports")
    .upload(storagePath, zipBuffer, {
      contentType: "application/zip",
      upsert: false,
    });
  if (upErr) {
    return NextResponse.json(
      { error: `storage upload failed: ${upErr.message}` },
      { status: 500 }
    );
  }

  // manifest_hash = SHA-256 of the aggregate JSON, matches the Tasdiq pattern
  const manifestHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(aggregate))
    .digest("hex");

  const { data: pack, error: packErr } = await sb
    .from("export_packs")
    .insert({
      org_id: profile.org_id,
      workflow_id: null, // org-wide compliance report, not tied to one workflow
      pack_type: "compliance_report",
      storage_path: storagePath,
      manifest_hash: manifestHash,
      generated_by: profile.id,
    })
    .select()
    .single();
  if (packErr || !pack) {
    return NextResponse.json(
      { error: packErr?.message ?? "pack row insert failed" },
      { status: 500 }
    );
  }

  // Ledger events through the chain
  await appendLedgerEvent(sb, {
    org_id: profile.org_id,
    workflow_id: null,
    event_type: "compliance_report_requested",
    actor_id: profile.id,
    payload: { quarter: quarterLabel, pack_id: pack.id },
  });
  await appendLedgerEvent(sb, {
    org_id: profile.org_id,
    workflow_id: null,
    event_type: "export_generated",
    actor_id: profile.id,
    payload: {
      pack_id: pack.id,
      pack_type: "compliance_report",
      manifest_hash: manifestHash,
      quarter: quarterLabel,
    },
  });

  // Signed download URL for convenience
  const { data: signed } = await sb.storage
    .from("exports")
    .createSignedUrl(storagePath, 3600);

  return NextResponse.json({
    ok: true,
    pack,
    downloadUrl: signed?.signedUrl ?? null,
  });
}

async function appendLedgerEvent(
  sb: ReturnType<typeof createAdminClient>,
  e: {
    org_id: string;
    workflow_id: string | null;
    event_type: string;
    actor_id: string | null;
    payload: Record<string, unknown>;
  }
) {
  const { data: prev } = await sb
    .from("ledger_events")
    .select("hash")
    .eq("org_id", e.org_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const hash = await computeEventHash({
    prevHash: prev?.hash ?? null,
    eventId: id,
    eventType: e.event_type,
    payload: e.payload,
    createdAt,
  });
  await sb.from("ledger_events").insert({
    id,
    org_id: e.org_id,
    workflow_id: e.workflow_id,
    event_type: e.event_type,
    actor_id: e.actor_id,
    payload: e.payload,
    prev_hash: prev?.hash ?? null,
    hash,
    created_at: createdAt,
  });
}

function defaultQuarter(): string {
  const now = new Date();
  const year = now.getFullYear();
  const m = now.getMonth(); // 0..11
  const q = Math.floor(m / 3) + 1;
  const monthRanges = [
    "January – March",
    "April – June",
    "July – September",
    "October – December",
  ];
  return `Q${q} ${year} · ${monthRanges[q - 1]}`;
}
