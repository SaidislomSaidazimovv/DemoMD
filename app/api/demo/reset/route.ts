import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeEventHash } from "@/lib/ledger";

// Reset a workflow for the next demo run.
//
// PRESERVES the ledger-event history per CORE_PLATFORM_SPEC.md:
//   "ledger_events and workflow_transitions are append-only by design —
//    never deleted, never updated."
//
// This means the hash chain stays valid after reset, and every past demo
// run remains auditable. What we DO clear is demo-facing state:
//   - media rows + Storage files (both the photo and the optional video)
//   - export_packs rows (tranche packs that were generated)
//   - workflow.current_state returns to EVIDENCE_REQUESTED
//   - challenge_issued_at is bumped to now (so the new capture gets a
//     fresh 30s window against the existing challenge_code)
//
// We then APPEND a `demo_reset` event through the chain so the reset
// itself is part of the tamper-evident record. The chain anchor moves
// forward by one event but remains valid end-to-end.

export const dynamic = "force-dynamic";

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

  const sb = createAdminClient();
  const { data: wf } = await sb
    .from("workflows")
    .select("*")
    .eq("id", workflow_id)
    .eq("org_id", profile.org_id)
    .maybeSingle();
  if (!wf) return NextResponse.json({ error: "workflow not found" }, { status: 404 });

  // Collect media storage paths to purge from Storage after we clear DB rows.
  const { data: mediaRows } = await sb
    .from("media")
    .select("id, storage_path, meta")
    .eq("workflow_id", workflow_id);

  const storagePaths: string[] = [];
  const mediaIds: string[] = [];
  for (const row of (mediaRows ?? []) as {
    id: string;
    storage_path: string;
    meta: Record<string, unknown> | null;
  }[]) {
    mediaIds.push(row.id);
    if (row.storage_path) storagePaths.push(row.storage_path);
    const videoPath = row.meta?.video_storage_path as string | undefined;
    if (videoPath) storagePaths.push(videoPath);
  }

  // Collect pack ids + paths so we can clear both rows and Storage.
  const { data: packRows } = await sb
    .from("export_packs")
    .select("id, storage_path")
    .eq("workflow_id", workflow_id);
  const packIds: string[] = [];
  const packStoragePaths: string[] = [];
  for (const row of (packRows ?? []) as { id: string; storage_path: string }[]) {
    packIds.push(row.id);
    if (row.storage_path) packStoragePaths.push(row.storage_path);
  }

  // Clear demo state. Ledger events stay — they are append-only per spec.
  await sb.from("media").delete().eq("workflow_id", workflow_id);
  await sb.from("export_packs").delete().eq("workflow_id", workflow_id);
  if (storagePaths.length > 0) {
    await sb.storage.from("evidence").remove(storagePaths);
  }
  if (packStoragePaths.length > 0) {
    await sb.storage.from("exports").remove(packStoragePaths);
  }

  const nowIso = new Date().toISOString();
  await sb
    .from("workflows")
    .update({
      current_state: "EVIDENCE_REQUESTED",
      completed_at: null,
      updated_at: nowIso,
      meta: {
        ...wf.meta,
        challenge_issued_at: nowIso,
      },
    })
    .eq("id", workflow_id);

  // Append the reset itself to the chain — makes the reset auditable and
  // preserves tamper-evidence going forward.
  await appendLedgerEvent(sb, {
    org_id: wf.org_id,
    workflow_id: wf.id,
    event_type: "demo_reset",
    actor_id: profile.id,
    payload: {
      cleared: {
        media: mediaIds.length,
        storage_files: storagePaths.length,
        export_packs: packIds.length,
      },
      previous_state: wf.current_state,
      reason: "Demo operator reset this project",
    },
  });

  return NextResponse.json({
    ok: true,
    cleared: {
      media: mediaIds.length,
      storage_files: storagePaths.length,
      export_packs: packIds.length,
    },
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
