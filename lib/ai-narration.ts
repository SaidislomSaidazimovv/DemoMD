// Shared narration logic callable both from the /api/ai/narrate-flag route
// and inline from /api/media/upload. Lives in lib/ because Next's App
// Router forbids route files from exporting anything other than HTTP
// method handlers (GET/POST/etc.).

import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeEventHash } from "@/lib/ledger";
import { narrateFlag, MODELS } from "@/lib/ai";
import type { Media, MediaMeta, Workflow } from "@/lib/types";

export async function runNarration(args: {
  mediaId: string;
  orgId: string;
  actorId: string;
}): Promise<{ narration: string; model: string }> {
  const sb = createAdminClient();

  const { data: media } = await sb
    .from("media")
    .select("*")
    .eq("id", args.mediaId)
    .eq("org_id", args.orgId)
    .maybeSingle();
  if (!media) throw new Error("media not found");
  const mediaRow = media as Media;

  const { data: wf } = await sb
    .from("workflows")
    .select("*")
    .eq("id", mediaRow.workflow_id)
    .eq("org_id", args.orgId)
    .maybeSingle();
  if (!wf) throw new Error("workflow not found");
  const workflow = wf as Workflow;

  // Download photo bytes from Storage and base64-encode for the vision call.
  const { data: file, error: dlErr } = await sb.storage
    .from("evidence")
    .download(mediaRow.storage_path);
  if (dlErr || !file) {
    throw new Error(`storage download failed: ${dlErr?.message ?? "no file"}`);
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const photoBase64 = buf.toString("base64");
  const photoMimeType = file.type || "image/jpeg";

  const meta = mediaRow.meta as MediaMeta;
  const failedLayers = (meta.fraud_result?.checks ?? [])
    .filter((c) => !c.passed)
    .map((c) => ({ name: c.name, details: c.details, score: c.score }));

  const narration = await narrateFlag({
    photoBase64,
    photoMimeType,
    projectLabel: workflow.reference_label,
    developer: workflow.meta.developer_name,
    milestone: workflow.meta.milestone_description,
    failedLayers,
  });

  const now = new Date().toISOString();
  const updatedMeta: MediaMeta = {
    ...meta,
    ai_narration: narration,
    ai_narration_model: MODELS.narrator,
    ai_narration_at: now,
  };
  await sb.from("media").update({ meta: updatedMeta }).eq("id", args.mediaId);

  await appendLedgerEvent(sb, {
    org_id: args.orgId,
    workflow_id: workflow.id,
    event_type: "ai_narration_generated",
    actor_id: args.actorId,
    payload: {
      media_id: mediaRow.id,
      model: MODELS.narrator,
      length: narration.length,
    },
  });

  return { narration, model: MODELS.narrator };
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
