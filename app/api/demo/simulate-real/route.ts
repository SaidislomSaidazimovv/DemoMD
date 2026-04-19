import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeEventHash } from "@/lib/ledger";
import { runAllChecks } from "@/lib/fraud";
import type { ClassifierResult } from "@/lib/ai";
import type { Media, Workflow } from "@/lib/types";

// Injects a REAL capture against the given workflow: GPS at site, human tremor,
// fresh unique photo, correct code. Admin-only (demo scaffolding).

export const dynamic = "force-dynamic";

function randomPhash(): string {
  const chars = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < 16; i++) out += chars[Math.floor(Math.random() * 16)];
  return out;
}

const PLACEHOLDER_REAL =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400"><rect width="600" height="400" fill="#7dd3fc"/><rect x="80" y="180" width="160" height="200" fill="#a1a1aa"/><rect x="260" y="140" width="140" height="240" fill="#71717a"/><rect x="420" y="220" width="120" height="160" fill="#d4d4d8"/><text x="300" y="50" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#0f172a">Construction Site</text></svg>'
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

  const now = new Date();
  const photoHash = randomPhash();

  // Simulate a fresh inspector flow: re-issue the challenge at click time so the
  // 30-second window never trips Layer 5.
  const freshIssuedAt = new Date(now.getTime() - 5_000); // issued 5s ago
  const updatedMeta = {
    ...workflow.meta,
    challenge_issued_at: freshIssuedAt.toISOString(),
  };
  await sb.from("workflows").update({ meta: updatedMeta }).eq("id", workflow.id);

  // Canned AI classifier result for the REAL demo path. Layer 6 shows as
  // YES / passed so the demo displays a full 6-green-check breakdown.
  // No narration — narrator only fires on FLAGGED captures.
  const aiClassifier: ClassifierResult = {
    verdict: "YES",
    visible:
      "Multi-storey reinforced concrete frame at mid-construction; scaffolding and floor slabs are visible.",
    reasoning:
      "The structure, materials, and stage of work are consistent with the claimed milestone.",
    score: 1,
    passed: true,
  };

  const fraud = runAllChecks(
    {
      gps: workflow.meta.coordinates,
      motionVariance: 0.45,
      lightingVariance: 0.08,
      photoHash,
      challengeSubmitted: workflow.meta.challenge_code,
      challengeIssuedAt: freshIssuedAt,
      capturedAt: now,
      aiClassifier,
    },
    updatedMeta,
    existingHashes
  );

  const storagePath = `${workflow.org_id}/${workflow.id}/${Date.now()}-real.jpg`;
  // Upload the placeholder data URL directly into storage for the demo.
  // (Real inspector uploads go via the capture page + Supabase Storage SDK.)
  const blob = await (await fetch(PLACEHOLDER_REAL)).blob();
  await sb.storage.from("evidence").upload(storagePath, blob, {
    contentType: "image/svg+xml",
    upsert: true,
  });

  const mediaMeta: Media["meta"] = {
    capture_session_id: "sim-real-" + Date.now(),
    gps: { lat: workflow.meta.coordinates.lat, lng: workflow.meta.coordinates.lng, accuracy: 5 },
    inside_geofence: true,
    motion_samples_count: 600,
    motion_variance: 0.45,
    lighting_variance: 0.08,
    sensor_camera_correlation: 1,
    data_url: PLACEHOLDER_REAL,
    thumbnail_emoji: "🏗️",
    device_info: {
      user_agent: "Simulated Inspector Phone",
      platform: "Android",
      screen: { width: 1080, height: 2340 },
    },
    fraud_result: fraud,
    source: "real",
    ai_progress: aiClassifier,
  };

  const { data: mediaRow } = await sb
    .from("media")
    .insert({
      org_id: workflow.org_id,
      workflow_id: workflow.id,
      storage_path: storagePath,
      file_type: "photo",
      sha256: "sha256:" + photoHash,
      phash: photoHash,
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
      sha256: "sha256:" + photoHash,
      phash: photoHash,
      storage_path: storagePath,
      file_type: "photo",
    },
  });
  await writeLedger(sb, {
    org_id: workflow.org_id,
    workflow_id: workflow.id,
    event_type: "evidence_captured",
    actor_id: profile.id,
    payload: { media_id: mediaRow?.id ?? null, source: "real", score: fraud.aggregate_score, verdict: fraud.verdict },
  });

  const next = fraud.verdict === "VERIFIED" ? "AUTO_VERIFIED" : "FLAGGED";
  const { data: updatedWf } = await sb
    .from("workflows")
    .update({ current_state: next, updated_at: new Date().toISOString() })
    .eq("id", workflow.id)
    .select()
    .single();
  await writeLedger(sb, {
    org_id: workflow.org_id,
    workflow_id: workflow.id,
    event_type: "state_changed",
    actor_id: profile.id,
    payload: { from: workflow.current_state, to: next, reason: `Auto from fraud pipeline — score ${fraud.aggregate_score.toFixed(2)}` },
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
