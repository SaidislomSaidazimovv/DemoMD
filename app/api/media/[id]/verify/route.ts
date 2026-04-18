import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeEventHash } from "@/lib/ledger";
import { runAllChecks } from "@/lib/fraud";
import type { Media, MediaMeta, Workflow } from "@/lib/types";

// POST /api/media/[id]/verify
//
// Per CORE_PLATFORM_SPEC.md §API surface: "Run fraud checks on uploaded media".
// Primary verification runs inline in /api/media/upload — this route is the
// public re-verification hook for when the pipeline itself changed (e.g. a new
// fraud layer was added and we want to re-score historical media). It reads the
// stored `media.meta`, re-runs `runAllChecks`, and if the verdict changed,
// updates the row + emits a fresh `evidence_captured` event through the chain.
//
// Auth: admin, bank_officer, supervisor. The caller must be in the same org
// as the media (enforced by the org_id match on both the media fetch and the
// workflow lookup).

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: { id: string } }) {
  const mediaId = ctx.params.id;

  const ssb = createServerSupabase();
  const {
    data: { user },
  } = await ssb.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { data: profile } = await ssb.from("users").select("*").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "no profile" }, { status: 403 });
  if (!["admin", "bank_officer", "supervisor"].includes(profile.role)) {
    return NextResponse.json(
      { error: "admin, bank_officer, or supervisor only" },
      { status: 403 }
    );
  }

  const sb = createAdminClient();

  const { data: media } = await sb
    .from("media")
    .select("*")
    .eq("id", mediaId)
    .eq("org_id", profile.org_id)
    .maybeSingle();
  if (!media) return NextResponse.json({ error: "media not found" }, { status: 404 });

  const mediaRow = media as Media;
  const meta = mediaRow.meta as MediaMeta;

  const { data: wf } = await sb
    .from("workflows")
    .select("*")
    .eq("id", mediaRow.workflow_id)
    .eq("org_id", profile.org_id)
    .maybeSingle();
  if (!wf) return NextResponse.json({ error: "workflow not found" }, { status: 404 });
  const workflow = wf as Workflow;

  // Existing perceptual hashes for duplicate check (exclude THIS media row so
  // we don't flag it as a duplicate of itself).
  const { data: existingMedia } = await sb
    .from("media")
    .select("phash")
    .eq("org_id", workflow.org_id)
    .neq("id", mediaId);
  const existingHashes = ((existingMedia ?? []) as { phash: string | null }[])
    .map((m) => m.phash)
    .filter((h): h is string => typeof h === "string" && h.length > 0);

  // Re-run the fraud pipeline using the stored meta values. Note that motion
  // and lighting variance are pre-computed numbers, not raw samples — so
  // Layer 2 + Layer 3 don't re-derive from scratch, they re-score against the
  // current thresholds + logic. That's exactly what "re-verify after pipeline
  // change" is supposed to do.
  const fraud = runAllChecks(
    {
      gps: meta.gps,
      motionVariance: meta.motion_variance,
      lightingVariance: meta.lighting_variance,
      photoHash: mediaRow.phash,
      // The original submitted code isn't persisted. We pass the stored
      // expected code as the "submitted" value so Layer 5 evaluates whether
      // the originally-accepted code would still pass under current rules.
      challengeSubmitted: workflow.meta.challenge_code,
      challengeIssuedAt: new Date(workflow.meta.challenge_issued_at),
      capturedAt: new Date(mediaRow.created_at),
      frameChangeAvg: meta.frame_change_avg,
    },
    workflow.meta,
    existingHashes
  );

  const priorVerdict = meta.fraud_result?.verdict ?? null;
  const verdictChanged = priorVerdict !== fraud.verdict;

  // Persist the fresh result into meta
  const updatedMeta: MediaMeta = { ...meta, fraud_result: fraud };
  await sb.from("media").update({ meta: updatedMeta }).eq("id", mediaId);

  // If the verdict changed, emit a fresh `evidence_captured` event so the
  // audit trail reflects the re-verification. If it didn't change, we still
  // emit a `reverified` event (no state machine side-effects) so callers can
  // see the re-verify happened without re-firing the state transition.
  await appendLedgerEvent(sb, {
    org_id: workflow.org_id,
    workflow_id: workflow.id,
    event_type: verdictChanged ? "evidence_captured" : "evidence_reverified",
    actor_id: profile.id,
    payload: {
      media_id: mediaRow.id,
      source: "reverify",
      fraud_score: fraud.aggregate_score,
      verdict: fraud.verdict,
      prior_verdict: priorVerdict,
      failed_layers: fraud.checks.filter((c) => !c.passed).map((c) => c.name),
    },
  });

  return NextResponse.json({
    ok: true,
    verdict: fraud.verdict,
    prior_verdict: priorVerdict,
    verdict_changed: verdictChanged,
    fraud,
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
