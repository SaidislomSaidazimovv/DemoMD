// Scenario generators for the /demo control panel.
// Both produce a complete evidence record and push it through mock-db so the
// dashboard (subscribed via realtime) sees it within 1 event loop.

import { runAllChecks } from "./fraud";
import { supabase, IDS, STOCK_FRAUD_PHASH, transitionWorkflow, appendLedgerEvent } from "./mock-db";
import type { Media, Workflow } from "./types";

const PLACEHOLDER_REAL = "🏗️";
const PLACEHOLDER_FRAUD = "🎬";

function randomPhash(): string {
  const chars = "0123456789abcdef";
  let out = "";
  for (let i = 0; i < 16; i++) out += chars[Math.floor(Math.random() * 16)];
  return out;
}

async function knownPhashes(): Promise<string[]> {
  const { data } = await supabase.from<Media>("media").select();
  const hashes = (data ?? []).map((m) => m.phash);
  // Plant the fraud fixture so the duplicate layer will match on fraud captures.
  if (!hashes.includes(STOCK_FRAUD_PHASH)) hashes.push(STOCK_FRAUD_PHASH);
  return hashes;
}

export interface SimulationResult {
  media: Media;
  workflow: Workflow;
}

// ✅ REAL capture: GPS at site, human tremor, fresh unique photo, correct code.
export async function simulateReal(workflowId: string = IDS.proj1): Promise<SimulationResult | null> {
  const { data: wf } = await supabase.from<Workflow>("workflows").select().eq("id", workflowId).single();
  if (!wf) return null;

  const now = new Date();
  const capture = {
    gps: {
      lat: wf.meta.coordinates.lat,
      lng: wf.meta.coordinates.lng,
      accuracy: 5,
    },
    motionVariance: 0.45, // plausible hand-hold
    lightingVariance: 0.08, // real scene with highlights
    photoHash: randomPhash(),
    challengeSubmitted: wf.meta.challenge_code,
    challengeIssuedAt: new Date(wf.meta.challenge_issued_at),
    capturedAt: now,
  };

  const existing = await knownPhashes();
  const fraud = runAllChecks(capture, wf.meta, existing);

  const storage_path = `${wf.org_id}/${wf.id}/${Date.now()}-real.jpg`;
  await supabase.storage.from("evidence").upload(storage_path, DATAURL_REAL);

  const { data: mediaRow } = await supabase
    .from<Media>("media")
    .insert({
      org_id: wf.org_id,
      workflow_id: wf.id,
      storage_path,
      file_type: "photo",
      sha256: "sha256:" + capture.photoHash,
      phash: capture.photoHash,
      uploaded_by: IDS.inspector,
      meta: {
        capture_session_id: "sim-real-" + Date.now(),
        gps: capture.gps,
        inside_geofence: true,
        motion_samples_count: 600,
        motion_variance: capture.motionVariance,
        lighting_variance: capture.lightingVariance,
        sensor_camera_correlation: 1.0,
        data_url: DATAURL_REAL,
        thumbnail_emoji: PLACEHOLDER_REAL,
        device_info: {
          user_agent: "Simulated Inspector Phone",
          platform: "Android",
          screen: { width: 1080, height: 2340 },
        },
        fraud_result: fraud,
        source: "real",
      },
    })
    .select()
    .single();

  await appendLedgerEvent({
    org_id: wf.org_id,
    workflow_id: wf.id,
    event_type: "evidence_captured",
    actor_id: IDS.inspector,
    payload: {
      media_id: mediaRow?.id ?? null,
      source: "real",
      fraud_score: fraud.aggregate_score,
      verdict: fraud.verdict,
    },
  });

  const next = fraud.verdict === "VERIFIED" ? "AUTO_VERIFIED" : "FLAGGED";
  const updated = await transitionWorkflow({
    workflowId: wf.id,
    toState: next,
    actorId: IDS.inspector,
    reason: `Auto from fraud pipeline — score ${fraud.aggregate_score.toFixed(2)}`,
  });

  return { media: mediaRow!, workflow: updated! };
}

// 🚨 FRAUD capture: phone on a table replaying old footage.
export async function simulateFraud(workflowId: string = IDS.proj1): Promise<SimulationResult | null> {
  const { data: wf } = await supabase.from<Workflow>("workflows").select().eq("id", workflowId).single();
  if (!wf) return null;

  const now = new Date();
  const capture = {
    gps: {
      // ~2 km north-east of the site — well outside the 100m geofence.
      lat: wf.meta.coordinates.lat + 0.018,
      lng: wf.meta.coordinates.lng + 0.018,
      accuracy: 12,
    },
    motionVariance: 0.0001, // phone lying flat, essentially stationary
    lightingVariance: 0.004, // uniform screen surface
    photoHash: STOCK_FRAUD_PHASH, // matches a prior ledger entry
    challengeSubmitted: "XXXX",
    // Use an expired timestamp so the challenge layer also flags on age.
    challengeIssuedAt: new Date(now.getTime() - 15 * 60 * 1000),
    capturedAt: now,
  };

  const existing = await knownPhashes();
  const fraud = runAllChecks(capture, wf.meta, existing);

  const storage_path = `${wf.org_id}/${wf.id}/${Date.now()}-fraud.jpg`;
  await supabase.storage.from("evidence").upload(storage_path, DATAURL_FRAUD);

  const { data: mediaRow } = await supabase
    .from<Media>("media")
    .insert({
      org_id: wf.org_id,
      workflow_id: wf.id,
      storage_path,
      file_type: "photo",
      sha256: "sha256:" + capture.photoHash,
      phash: capture.photoHash,
      uploaded_by: IDS.inspector,
      meta: {
        capture_session_id: "sim-fraud-" + Date.now(),
        gps: capture.gps,
        inside_geofence: false,
        motion_samples_count: 600,
        motion_variance: capture.motionVariance,
        lighting_variance: capture.lightingVariance,
        sensor_camera_correlation: 0,
        data_url: DATAURL_FRAUD,
        thumbnail_emoji: PLACEHOLDER_FRAUD,
        device_info: {
          user_agent: "Simulated Inspector Phone",
          platform: "Android",
          screen: { width: 1080, height: 2340 },
        },
        fraud_result: fraud,
        source: "fraud",
      },
    })
    .select()
    .single();

  await appendLedgerEvent({
    org_id: wf.org_id,
    workflow_id: wf.id,
    event_type: "evidence_captured",
    actor_id: IDS.inspector,
    payload: {
      media_id: mediaRow?.id ?? null,
      source: "fraud",
      fraud_score: fraud.aggregate_score,
      verdict: fraud.verdict,
    },
  });

  await appendLedgerEvent({
    org_id: wf.org_id,
    workflow_id: wf.id,
    event_type: "fraud_detected",
    actor_id: null,
    payload: {
      failed_layers: fraud.checks.filter((c) => !c.passed).map((c) => c.name),
      score: fraud.aggregate_score,
    },
  });

  const updated = await transitionWorkflow({
    workflowId: wf.id,
    toState: "FLAGGED",
    actorId: IDS.inspector,
    reason: "Screen replay detected by fraud pipeline",
  });

  return { media: mediaRow!, workflow: updated! };
}

// -------------------------------------------------------------
// Tiny inline SVG placeholders used as data-URL "photos" so the
// demo has something visual without bundling real images.
// -------------------------------------------------------------

const DATAURL_REAL =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400">
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
<stop offset="0%" stop-color="#7dd3fc"/><stop offset="100%" stop-color="#fef3c7"/></linearGradient></defs>
<rect width="600" height="400" fill="url(#sky)"/>
<rect x="80" y="180" width="160" height="200" fill="#a1a1aa"/>
<rect x="260" y="140" width="140" height="240" fill="#71717a"/>
<rect x="420" y="220" width="120" height="160" fill="#d4d4d8"/>
<rect x="90" y="210" width="30" height="50" fill="#1e293b"/>
<rect x="130" y="210" width="30" height="50" fill="#1e293b"/>
<rect x="170" y="210" width="30" height="50" fill="#1e293b"/>
<rect x="270" y="170" width="25" height="40" fill="#1e293b"/>
<rect x="310" y="170" width="25" height="40" fill="#1e293b"/>
<rect x="350" y="170" width="25" height="40" fill="#1e293b"/>
<text x="300" y="50" text-anchor="middle" font-family="sans-serif" font-size="24" fill="#0f172a">Construction Site</text>
<text x="300" y="78" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#334155">Yashnobod Block 4 · 3rd floor</text>
</svg>`);

const DATAURL_FRAUD =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400">
<rect width="600" height="400" fill="#1e293b"/>
<rect x="40" y="40" width="520" height="320" fill="#0f172a" stroke="#334155" stroke-width="4"/>
<text x="300" y="200" text-anchor="middle" font-family="monospace" font-size="22" fill="#ef4444">▶ REPLAY — OLD FOOTAGE</text>
<text x="300" y="232" text-anchor="middle" font-family="monospace" font-size="14" fill="#94a3b8">phone pointed at a laptop screen</text>
</svg>`);
