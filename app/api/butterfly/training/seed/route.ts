import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeEventHash } from "@/lib/ledger";

// POST /api/butterfly/training/seed
// Admin-only demo helper: inserts 3 `training_completion` workflows at
// NOT_STARTED for the caller's org. Skips any module that already exists
// (by reference_id). Returns the full list of training workflows so the
// caller can refresh without a second round-trip.
//
// Emits one `workflow_created` ledger event per new row, same pattern as
// Tasdiq's core /api/workflows.

export const dynamic = "force-dynamic";

const DEMO_MODULES = [
  {
    reference_id: "BF-TRAIN-001",
    reference_label: "Noticing — spotting the signal",
    meta: {
      module_id: "noticing",
      summary:
        "Three minutes on what a struggling teammate looks like: withdrawal, missed commitments, unusual irritability.",
      estimated_minutes: 3,
    },
  },
  {
    reference_id: "BF-TRAIN-002",
    reference_label: "Responding — the 60-second protocol",
    meta: {
      module_id: "responding",
      summary:
        "What to say, what not to say, and the three options to offer: 988, EAP, internal counselor.",
      estimated_minutes: 5,
    },
  },
  {
    reference_id: "BF-TRAIN-003",
    reference_label: "Logging — the anonymous record",
    meta: {
      module_id: "logging",
      summary:
        "How to use the 3-tap check-in logger. No names. No details. Just a count.",
      estimated_minutes: 2,
    },
  },
];

export async function POST() {
  const ssb = createServerSupabase();
  const {
    data: { user },
  } = await ssb.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { data: profile } = await ssb.from("users").select("*").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "no profile" }, { status: 403 });
  if (!["hr_admin", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "hr_admin or admin only" }, { status: 403 });
  }

  const sb = createAdminClient();

  // Skip modules that already exist for this org.
  const { data: existing } = await sb
    .from("workflows")
    .select("reference_id")
    .eq("org_id", profile.org_id)
    .eq("type", "training_completion");
  const existingIds = new Set(
    ((existing ?? []) as { reference_id: string }[]).map((r) => r.reference_id)
  );

  let created = 0;
  for (const m of DEMO_MODULES) {
    if (existingIds.has(m.reference_id)) continue;
    const { data: wf } = await sb
      .from("workflows")
      .insert({
        org_id: profile.org_id,
        type: "training_completion",
        reference_id: m.reference_id,
        reference_label: m.reference_label,
        current_state: "NOT_STARTED",
        meta: m.meta,
        created_by: profile.id,
      })
      .select()
      .single();
    if (wf) {
      await appendLedgerEvent(sb, {
        org_id: profile.org_id,
        workflow_id: wf.id,
        event_type: "workflow_created",
        actor_id: profile.id,
        payload: { state: "NOT_STARTED", reference_id: m.reference_id, module_id: m.meta.module_id },
      });
      created++;
    }
  }

  const { data: all } = await sb
    .from("workflows")
    .select("*")
    .eq("org_id", profile.org_id)
    .eq("type", "training_completion")
    .order("created_at", { ascending: true });

  return NextResponse.json({ ok: true, created, modules: all ?? [] });
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
