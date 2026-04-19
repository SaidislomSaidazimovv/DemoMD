import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeEventHash } from "@/lib/ledger";
import { runAllChecks } from "@/lib/fraud";
import { MODELS } from "@/lib/ai";
import type { ClassifierResult } from "@/lib/ai";
import type { Media, Workflow } from "@/lib/types";

// Injects a FRAUD capture: GPS 2km off, phone flat, duplicate of stock hash,
// wrong challenge code, uniform lighting. All 5 layers fail.

export const dynamic = "force-dynamic";

const STOCK_FRAUD_PHASH = "a5a5a5a55a5a5a5a";

const PLACEHOLDER_FRAUD =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400"><rect width="600" height="400" fill="#1e293b"/><rect x="40" y="40" width="520" height="320" fill="#0f172a" stroke="#334155" stroke-width="4"/><text x="300" y="210" text-anchor="middle" font-family="monospace" font-size="22" fill="#ef4444">▶ REPLAY — OLD FOOTAGE</text></svg>'
  );

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { workflowId } = body as { workflowId?: string };
  if (!workflowId) return NextResponse.json({ error: "workflowId required" }, { status: 400 });

  const ssb = createServerSupabase();
  const { data: { user } } = await ssb.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });
  const { data: profile } = await ssb.from("users").select("*").eq("id", user.id).single();
  if (!profile || !["admin", "bank_officer"].includes(profile.role)) {
    return NextResponse.json({ error: "admin/bank_officer only" }, { status: 403 });
  }

  const sb = createAdminClient();
  const { data: wf } = await sb
    .from("workflows")
    .select("*")
    .eq("id", workflowId)
    .eq("org_id", profile.org_id)
    .maybeSingle();
  if (!wf) return NextResponse.json({ error: "workflow not found" }, { status: 404 });
  const workflow = wf as Workflow;

  const { data: existingMedia } = await sb.from("media").select("phash");
  const existingHashes = ((existingMedia ?? []) as { phash: string }[]).map((m) => m.phash);
  if (!existingHashes.includes(STOCK_FRAUD_PHASH)) existingHashes.push(STOCK_FRAUD_PHASH);

  // Canned AI output so the demo's "wow moment" (spec-defined) renders
  // end-to-end without a live Gemini call. Real uploads run Gemini for
  // real; the simulator hardcodes the kind of result a screen-replay
  // capture would produce.
  const aiClassifier: ClassifierResult = {
    verdict: "NO",
    visible:
      "Static dark frame with grainy uniform texture — consistent with a playback screen, not a live scene.",
    reasoning:
      "The visible content doesn't match an actively-filmed construction site; combined with flat gyro, suggests screen replay.",
    score: 0,
    passed: false,
  };
  const aiNarration =
    "The photo shows what appears to be concrete formwork, but the gyroscope was flat during capture — " +
    "the inspector wasn't moving. This is typical of someone filming a screen replay rather than walking the site.";

  const now = new Date();
  const fraud = runAllChecks(
    {
      gps: {
        lat: workflow.meta.coordinates.lat + 0.018,
        lng: workflow.meta.coordinates.lng + 0.018,
        accuracy: 18,
      },
      motionVariance: 0.0001,
      lightingVariance: 0.004,
      photoHash: STOCK_FRAUD_PHASH,
      challengeSubmitted: "XXXX",
      challengeIssuedAt: new Date(now.getTime() - 15 * 60 * 1000),
      capturedAt: now,
      aiClassifier,
    },
    workflow.meta,
    existingHashes
  );

  const storagePath = `${workflow.org_id}/${workflow.id}/${Date.now()}-fraud.jpg`;
  const blob = await (await fetch(PLACEHOLDER_FRAUD)).blob();
  await sb.storage.from("evidence").upload(storagePath, blob, {
    contentType: "image/svg+xml",
    upsert: true,
  });

  const mediaMeta: Media["meta"] = {
    capture_session_id: "sim-fraud-" + Date.now(),
    gps: {
      lat: workflow.meta.coordinates.lat + 0.018,
      lng: workflow.meta.coordinates.lng + 0.018,
      accuracy: 18,
    },
    inside_geofence: false,
    motion_samples_count: 600,
    motion_variance: 0.0001,
    lighting_variance: 0.004,
    sensor_camera_correlation: 0,
    data_url: PLACEHOLDER_FRAUD,
    thumbnail_emoji: "🎬",
    device_info: {
      user_agent: "Simulated Inspector Phone",
      platform: "Android",
      screen: { width: 1080, height: 2340 },
    },
    fraud_result: fraud,
    source: "fraud",
    ai_progress: aiClassifier,
    ai_narration: aiNarration,
    ai_narration_model: MODELS.narrator,
    ai_narration_at: now.toISOString(),
  };

  const { data: mediaRow } = await sb
    .from("media")
    .insert({
      org_id: workflow.org_id,
      workflow_id: workflow.id,
      storage_path: storagePath,
      file_type: "photo",
      sha256: "sha256:" + STOCK_FRAUD_PHASH,
      phash: STOCK_FRAUD_PHASH,
      uploaded_by: profile.id,
      meta: mediaMeta,
    })
    .select()
    .single();

  await writeLedger(sb, {
    org_id: workflow.org_id,
    workflow_id: workflow.id,
    event_type: "media_uploaded",
    actor_id: profile.id,
    payload: {
      media_id: mediaRow?.id ?? null,
      sha256: "sha256:" + STOCK_FRAUD_PHASH,
      phash: STOCK_FRAUD_PHASH,
      storage_path: storagePath,
      file_type: "photo",
    },
  });
  await writeLedger(sb, {
    org_id: workflow.org_id,
    workflow_id: workflow.id,
    event_type: "evidence_captured",
    actor_id: profile.id,
    payload: { media_id: mediaRow?.id ?? null, source: "fraud", score: fraud.aggregate_score, verdict: fraud.verdict },
  });
  await writeLedger(sb, {
    org_id: workflow.org_id,
    workflow_id: workflow.id,
    event_type: "fraud_detected",
    actor_id: null,
    payload: { failed_layers: fraud.checks.filter((c) => !c.passed).map((c) => c.name) },
  });
  await writeLedger(sb, {
    org_id: workflow.org_id,
    workflow_id: workflow.id,
    event_type: "ai_narration_generated",
    actor_id: profile.id,
    payload: {
      media_id: mediaRow?.id ?? null,
      model: MODELS.narrator,
      length: aiNarration.length,
      simulated: true,
    },
  });

  const { data: updatedWf } = await sb
    .from("workflows")
    .update({ current_state: "FLAGGED", updated_at: new Date().toISOString() })
    .eq("id", workflow.id)
    .select()
    .single();
  await writeLedger(sb, {
    org_id: workflow.org_id,
    workflow_id: workflow.id,
    event_type: "state_changed",
    actor_id: profile.id,
    payload: { from: workflow.current_state, to: "FLAGGED", reason: "Screen replay detected by fraud pipeline" },
  });

  return NextResponse.json({ ok: true, media: mediaRow, workflow: updatedWf });
}

async function writeLedger(
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
