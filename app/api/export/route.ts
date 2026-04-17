import { NextResponse } from "next/server";
import archiver from "archiver";
import crypto from "node:crypto";
import { PassThrough } from "node:stream";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeEventHash, verifyChain } from "@/lib/ledger";
import { generateActPdf } from "@/lib/pdf";
import type { LedgerEvent, Media, Organization, Workflow } from "@/lib/types";

// Tranche-pack generator.
// Auth: admin or bank_officer.
// Produces a ZIP with:
//   01_act/acceptance_act.pdf
//   02_manifest/evidence_manifest.json
//   03_media/<filename>  (one per media row)
//   05_audit/ledger_events.jsonl
//   05_audit/hash_anchor.txt
// Uploads to Supabase Storage bucket `exports`, records an export_packs row,
// writes an `export_generated` ledger event, transitions APPROVED → EXPORTED,
// returns a signed download URL.

export const dynamic = "force-dynamic";
// Allow extra time for downloading media + zipping (Vercel Pro supports up to 300s).
export const maxDuration = 60;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { workflow_id } = body as { workflow_id?: string };
  if (!workflow_id) {
    return NextResponse.json({ error: "workflow_id required" }, { status: 400 });
  }

  const ssb = createServerSupabase();
  const {
    data: { user },
  } = await ssb.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const { data: profile } = await ssb.from("users").select("*").eq("id", user.id).single();
  if (!profile || !["admin", "bank_officer"].includes(profile.role)) {
    return NextResponse.json({ error: "admin or bank_officer only" }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: wfRow } = await admin
    .from("workflows")
    .select("*")
    .eq("id", workflow_id)
    .maybeSingle();
  if (!wfRow || wfRow.org_id !== profile.org_id) {
    return NextResponse.json({ error: "workflow not found" }, { status: 404 });
  }
  const workflow = wfRow as Workflow;

  const { data: orgRow } = await admin
    .from("organizations")
    .select("*")
    .eq("id", workflow.org_id)
    .maybeSingle();
  const org = (orgRow as Organization) ?? null;

  const [{ data: mediaRows }, { data: eventRows }] = await Promise.all([
    admin
      .from("media")
      .select("*")
      .eq("workflow_id", workflow.id)
      .order("created_at", { ascending: true }),
    admin
      .from("ledger_events")
      .select("*")
      .eq("workflow_id", workflow.id)
      .order("created_at", { ascending: true }),
  ]);
  const media = (mediaRows as Media[]) ?? [];
  const events = (eventRows as LedgerEvent[]) ?? [];

  // 1. Verify the hash chain before generating anything.
  const verification = await verifyChain(events);
  if (!verification.valid) {
    return NextResponse.json(
      {
        error: "Hash chain broken — export blocked.",
        brokenAt: verification.brokenAt,
      },
      { status: 409 }
    );
  }

  // 2. Build the manifest.
  const manifest = {
    workflow: {
      id: workflow.id,
      reference_id: workflow.reference_id,
      reference_label: workflow.reference_label,
      current_state: workflow.current_state,
      meta: workflow.meta,
    },
    org: org
      ? { id: org.id, name: org.name, slug: org.slug, product: org.product }
      : null,
    generated_at: new Date().toISOString(),
    generated_by: {
      id: profile.id,
      email: profile.email,
      role: profile.role,
      full_name: profile.full_name,
    },
    media: media.map((m) => ({
      id: m.id,
      storage_path: m.storage_path,
      file_type: m.file_type,
      sha256: m.sha256,
      phash: m.phash,
      uploaded_by: m.uploaded_by,
      created_at: m.created_at,
      gps: m.meta.gps,
      inside_geofence: m.meta.inside_geofence,
      fraud_result: m.meta.fraud_result,
    })),
    chain: {
      event_count: events.length,
      anchor: verification.anchor,
      valid: true,
    },
  };
  const manifestJson = JSON.stringify(manifest, null, 2);
  const manifestHash = crypto
    .createHash("sha256")
    .update(manifestJson)
    .digest("hex");

  // 3. Generate the PDF.
  const pdfBuffer = await generateActPdf({
    org,
    workflow,
    media,
    events,
    chain: verification,
    manifestHash,
    generatedBy: {
      email: profile.email,
      fullName: profile.full_name,
      role: profile.role,
    },
  });

  // 4. Download each media file from Storage (in parallel).
  type MediaFile = { name: string; buf: Buffer };
  const mediaFiles: MediaFile[] = [];
  await Promise.all(
    media.map(async (m) => {
      try {
        const { data: blob } = await admin.storage
          .from("evidence")
          .download(m.storage_path);
        if (!blob) return;
        const buf = Buffer.from(await blob.arrayBuffer());
        const extFromPath = m.storage_path.split(".").pop() ?? "bin";
        const ext = extFromPath.length <= 4 ? extFromPath : "bin";
        mediaFiles.push({ name: `${m.id}.${ext}`, buf });
      } catch {
        // swallow — missing media shouldn't block the pack
      }
    })
  );

  // 5. Build the ZIP.
  const ledgerJsonl = events.map((e) => JSON.stringify(e)).join("\n");
  const hashAnchor = verification.anchor ?? "GENESIS";
  const zipFiles: Array<{ name: string; data: Buffer | string }> = [
    { name: "01_act/acceptance_act.pdf", data: pdfBuffer },
    { name: "02_manifest/evidence_manifest.json", data: manifestJson },
    { name: "05_audit/ledger_events.jsonl", data: ledgerJsonl },
    { name: "05_audit/hash_anchor.txt", data: hashAnchor },
  ];
  for (const f of mediaFiles) {
    zipFiles.push({ name: `03_media/${f.name}`, data: f.buf });
  }
  const zipBuffer = await buildZip(zipFiles);

  // 6. Upload the ZIP to Storage.
  const packPath = `${workflow.org_id}/${workflow.id}/pack-${Date.now()}.zip`;
  const { error: upErr } = await admin.storage
    .from("exports")
    .upload(packPath, zipBuffer, {
      contentType: "application/zip",
      upsert: false,
    });
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  // 7. Insert the export_packs row.
  const { data: pack, error: packErr } = await admin
    .from("export_packs")
    .insert({
      org_id: workflow.org_id,
      workflow_id: workflow.id,
      pack_type: "tranche_pack",
      storage_path: packPath,
      manifest_hash: manifestHash,
      generated_by: profile.id,
    })
    .select()
    .single();
  if (packErr || !pack) {
    return NextResponse.json(
      { error: packErr?.message ?? "export_packs insert failed" },
      { status: 500 }
    );
  }

  // 8. Write the `export_generated` ledger event through the hash chain.
  await appendLedger(admin, {
    org_id: workflow.org_id,
    workflow_id: workflow.id,
    event_type: "export_generated",
    actor_id: profile.id,
    payload: {
      pack_id: pack.id,
      manifest_hash: manifestHash,
      anchor: verification.anchor,
      media_count: media.length,
    },
  });

  // 9. If APPROVED, transition to EXPORTED.
  if (workflow.current_state === "APPROVED") {
    await admin
      .from("workflows")
      .update({
        current_state: "EXPORTED",
        updated_at: new Date().toISOString(),
      })
      .eq("id", workflow.id);
    await appendLedger(admin, {
      org_id: workflow.org_id,
      workflow_id: workflow.id,
      event_type: "state_changed",
      actor_id: profile.id,
      payload: {
        from: "APPROVED",
        to: "EXPORTED",
        reason: "Tranche pack generated",
      },
    });
  }

  // 10. Signed URL for immediate download.
  const { data: signed } = await admin.storage
    .from("exports")
    .createSignedUrl(packPath, 60 * 60); // 1 hour

  return NextResponse.json({
    ok: true,
    pack,
    downloadUrl: signed?.signedUrl ?? null,
  });
}

// ---- helpers ----

function buildZip(
  files: Array<{ name: string; data: Buffer | string }>
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver("zip", { zlib: { level: 9 } });
    const sink = new PassThrough();
    const chunks: Buffer[] = [];

    sink.on("data", (c: Buffer) => chunks.push(c));
    sink.on("end", () => resolve(Buffer.concat(chunks)));
    sink.on("error", reject);

    archive.on("error", reject);
    archive.pipe(sink);

    for (const f of files) {
      archive.append(f.data, { name: f.name });
    }
    archive.finalize();
  });
}

async function appendLedger(
  admin: ReturnType<typeof createAdminClient>,
  e: {
    org_id: string;
    workflow_id: string | null;
    event_type: string;
    actor_id: string | null;
    payload: Record<string, unknown>;
  }
) {
  const { data: prev } = await admin
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
  await admin.from("ledger_events").insert({
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
