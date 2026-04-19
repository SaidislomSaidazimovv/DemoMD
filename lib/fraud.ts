// Five-layer fraud detection pipeline.
// All pure functions — no I/O, no external deps.
// Imported by mock-db (to verify uploads), simulate (to score demo scenarios),
// and the capture page (to preview results client-side).

import type { FraudCheck, FraudResult, WorkflowMeta } from "./types";
import type { ClassifierResult } from "./ai";

// Layer weights rebalanced after adding the AI progress-match layer.
// Total must sum to 1.00.
// The five original layers lost 0.10 weight proportionally to make room
// for Layer 6, which is advisory (see AI_INTEGRATION_SPEC.md).
export const CHECK_WEIGHTS = {
  geofence: 0.23,       // was 0.25
  motion: 0.18,         // was 0.20
  screen_replay: 0.23,  // was 0.25
  duplicate: 0.13,      // was 0.15
  challenge: 0.13,      // was 0.15
  ai_progress_match: 0.10,
} as const;

export const VERIFIED_THRESHOLD = 0.7;

// Which layers force an automatic FLAG on failure regardless of aggregate.
// The AI layer is NOT included — it's advisory. A single AI hiccup must
// never FLAG a legitimate capture; only the algorithmic layers do that.
const HARD_FAIL_LAYERS: FraudCheck["name"][] = [
  "geofence",
  "motion",
  "screen_replay",
  "duplicate",
  "challenge",
];

// =============================================================
// Math helpers
// =============================================================

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Variance of an array of numbers. Used for accelerometer magnitude spread.
export function variance(xs: number[]): number {
  if (xs.length === 0) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
}

// =============================================================
// Layer 1 — GPS geofence
// =============================================================

export function checkGeofence(
  captureGps: { lat: number; lng: number },
  project: { coordinates: { lat: number; lng: number }; geofence_radius_meters: number }
): FraudCheck {
  const distance = haversineMeters(captureGps, project.coordinates);
  const passed = distance <= project.geofence_radius_meters;
  return {
    name: "geofence",
    label: "GPS Geofence",
    passed,
    weight: CHECK_WEIGHTS.geofence,
    score: passed ? 1 : 0,
    details: passed
      ? `Inside geofence — ${distance.toFixed(0)} m from site center`
      : `Outside geofence — ${(distance / 1000).toFixed(2)} km from site (limit ${project.geofence_radius_meters} m)`,
  };
}

// =============================================================
// Layer 2 — Human tremor (accelerometer variance)
// =============================================================

// Valid human tremor range: variance in [0.001, 1.0] of accel magnitude (m/s²).
// Below → phone is stationary (tripod or flat on a table).
// Above → violent shaking (intentional obfuscation or malfunction).
export function analyzeMotion(magnitudes: number[]): number {
  return variance(magnitudes);
}

export function checkMotion(motionVariance: number): FraudCheck {
  const passed = motionVariance >= 0.001 && motionVariance <= 1.0;
  return {
    name: "motion",
    label: "Human Motion",
    passed,
    weight: CHECK_WEIGHTS.motion,
    score: passed ? 1 : 0,
    details: passed
      ? `Human tremor detected (variance ${motionVariance.toFixed(4)})`
      : motionVariance < 0.001
        ? `Phone stationary (variance ${motionVariance.toFixed(4)}) — tripod or flat surface`
        : `Excessive motion (variance ${motionVariance.toFixed(4)}) — not a normal hand-hold`,
  };
}

// =============================================================
// Layer 3 — Screen replay detection (the headline feature)
// =============================================================

// If the phone is nearly stationary while the camera observes motion in the frame,
// the camera is looking at a moving screen. In our demo we proxy "observed motion"
// two ways:
//   1. lighting-variance of the captured still — a real scene has highlights and
//      shadows; a laptop playing a walkthrough tends to be uniform.
//   2. mean Hamming distance between dHashes of frames sampled during the 15s
//      recording. A genuine handheld capture of a construction site changes
//      frame-to-frame (parallax, operator walk); a static screen replay barely
//      changes at all. Threshold derived empirically: below ~3 bits out of 64
//      means the scene is effectively frozen.
//
// detectScreenReplay returns true when fraud is detected.
// passes ⇢ not a screen replay.
const FRAME_CHANGE_FROZEN_THRESHOLD = 3; // bits (out of 64) below which scene is "frozen"

export function detectScreenReplay(
  motionVariance: number,
  lightingVariance: number,
  frameChangeAvg?: number
): boolean {
  const phoneFlat = motionVariance < 0.01;
  const uniformLighting = lightingVariance < 0.02;
  const frozenScene =
    typeof frameChangeAvg === "number" && frameChangeAvg < FRAME_CHANGE_FROZEN_THRESHOLD;
  // Classic signal: phone still + uniform lighting.
  if (phoneFlat && uniformLighting) return true;
  // Optical-flow proxy: scene barely changes across 15s — regardless of the
  // phone's motion. A moving hand pointed at a static screen still looks like
  // a frozen scene to the optical-flow check.
  if (frozenScene) return true;
  return false;
}

// Returns a correlation score in [0, 1]. 1 = sensor and camera agree, 0 = totally inconsistent.
export function sensorCameraCorrelation(
  motionVariance: number,
  lightingVariance: number,
  frameChangeAvg?: number
): number {
  const motionOk = motionVariance >= 0.01 && motionVariance <= 1.5;
  const lightingOk = lightingVariance >= 0.02;
  // When frame dHashes are available, their change rate is the strongest signal.
  // We blend it with the static indicators: healthy scene change + healthy
  // sensor motion = full 1.0; one signal weak drops to 0.5.
  if (typeof frameChangeAvg === "number") {
    const sceneOk = frameChangeAvg >= FRAME_CHANGE_FROZEN_THRESHOLD;
    if (sceneOk && motionOk) return 1;
    if (sceneOk && !motionOk) return 0.6;
    if (!sceneOk && motionOk) return 0.3;
    return 0;
  }
  if (motionOk && lightingOk) return 1;
  if (!motionOk && !lightingOk) return 0;
  return 0.4;
}

export function checkScreenReplay(
  motionVariance: number,
  lightingVariance: number,
  frameChangeAvg?: number
): FraudCheck {
  const replay = detectScreenReplay(motionVariance, lightingVariance, frameChangeAvg);
  const correlation = sensorCameraCorrelation(motionVariance, lightingVariance, frameChangeAvg);
  const frameStr =
    typeof frameChangeAvg === "number"
      ? `, scene change ${frameChangeAvg.toFixed(1)} bits/pair`
      : "";
  return {
    name: "screen_replay",
    label: "Sensor-Camera Consistency",
    passed: !replay,
    weight: CHECK_WEIGHTS.screen_replay,
    score: replay ? 0 : correlation,
    details: replay
      ? `Screen replay detected — motion var ${motionVariance.toFixed(4)}, lighting var ${lightingVariance.toFixed(4)}${frameStr}`
      : `Sensor and camera agree — motion var ${motionVariance.toFixed(4)}, lighting var ${lightingVariance.toFixed(4)}${frameStr}`,
  };
}

// =============================================================
// Layer 4 — Perceptual hash duplicate detection (dHash + Hamming)
// =============================================================

// dHash: difference hash — reduce to 9×8 grayscale, compare each pixel to its right neighbor,
// bit = 1 if brighter. Produces a 64-bit hash as a 16-char hex string.
// In-browser implementation takes an ImageData; headless callers pass a pre-computed hex.
export function dHashFromImageData(data: ImageData): string {
  const W = 9;
  const H = 8;
  const gs = resizeToGray(data, W, H);
  let bits = "";
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W - 1; x++) {
      const left = gs[y * W + x];
      const right = gs[y * W + x + 1];
      bits += left < right ? "1" : "0";
    }
  }
  // Pack 64 bits into 16 hex chars
  let hex = "";
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

// Naive nearest-neighbor resize + grayscale. Fine for 64-pixel targets in a demo.
function resizeToGray(src: ImageData, targetW: number, targetH: number): number[] {
  const out = new Array<number>(targetW * targetH);
  for (let y = 0; y < targetH; y++) {
    for (let x = 0; x < targetW; x++) {
      const sx = Math.floor((x * src.width) / targetW);
      const sy = Math.floor((y * src.height) / targetH);
      const idx = (sy * src.width + sx) * 4;
      const r = src.data[idx];
      const g = src.data[idx + 1];
      const b = src.data[idx + 2];
      out[y * targetW + x] = 0.299 * r + 0.587 * g + 0.114 * b;
    }
  }
  return out;
}

export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length) return Math.max(a.length, b.length) * 4;
  let d = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      d += x & 1;
      x >>>= 1;
    }
  }
  return d;
}

const DUPLICATE_THRESHOLD = 10;

export function checkDuplicate(
  photoHash: string,
  existingHashes: string[]
): FraudCheck {
  let closest = { hash: "", distance: Number.POSITIVE_INFINITY };
  for (const h of existingHashes) {
    const d = hammingDistance(photoHash, h);
    if (d < closest.distance) closest = { hash: h, distance: d };
  }
  const duplicate = closest.distance < DUPLICATE_THRESHOLD;
  return {
    name: "duplicate",
    label: "Unique Photo",
    passed: !duplicate,
    weight: CHECK_WEIGHTS.duplicate,
    score: duplicate ? 0 : 1,
    details: duplicate
      ? `Duplicate — Hamming distance ${closest.distance} to prior submission (threshold ${DUPLICATE_THRESHOLD})`
      : existingHashes.length === 0
        ? "Unique — no prior submissions to compare"
        : `Unique — nearest match is Hamming ${closest.distance} away (threshold ${DUPLICATE_THRESHOLD})`,
  };
}

// =============================================================
// Layer 5 — Challenge code (match + not expired)
// =============================================================

const CHALLENGE_VALID_WINDOW_MS = 30 * 1000; // spec: 30-second countdown

export function verifyChallenge(args: {
  submitted: string;
  expected: string;
  issuedAt: Date;
  capturedAt: Date;
}): { match: boolean; expired: boolean; ageSeconds: number } {
  const match =
    args.submitted.trim().toUpperCase() === args.expected.trim().toUpperCase();
  const ageSeconds = Math.max(
    0,
    (args.capturedAt.getTime() - args.issuedAt.getTime()) / 1000
  );
  const expired = ageSeconds * 1000 > CHALLENGE_VALID_WINDOW_MS;
  return { match, expired, ageSeconds };
}

export function checkChallenge(args: {
  submitted: string;
  expected: string;
  issuedAt: Date;
  capturedAt: Date;
}): FraudCheck {
  const r = verifyChallenge(args);
  const passed = r.match && !r.expired;
  let details: string;
  if (!r.match) {
    details = `Code mismatch — expected "${args.expected}", got "${args.submitted || "—"}"`;
  } else if (r.expired) {
    details = `Code expired — submitted ${r.ageSeconds.toFixed(0)}s after issuance (window ${CHALLENGE_VALID_WINDOW_MS / 1000}s)`;
  } else {
    details = `Code "${args.expected}" matched, submitted ${r.ageSeconds.toFixed(0)}s after issuance`;
  }
  return {
    name: "challenge",
    label: "Challenge Code",
    passed,
    weight: CHECK_WEIGHTS.challenge,
    score: passed ? 1 : 0,
    details,
  };
}

// =============================================================
// Aggregate — run all 5 and return the verdict
// =============================================================

export interface CaptureInput {
  gps: { lat: number; lng: number; accuracy?: number };
  motionVariance: number;
  lightingVariance: number;
  photoHash: string;
  challengeSubmitted: string;
  challengeIssuedAt: Date;
  capturedAt: Date;
  // Optional optical-flow proxy — mean Hamming distance between consecutive
  // dHashes of frames sampled during the capture window.
  frameChangeAvg?: number;
  // Optional AI Layer 6 — when present, folded into the checks array as
  // `ai_progress_match`. When absent (e.g. browser-side preview or AI
  // disabled), the layer is simply omitted and the other five layers
  // scale up to match their original weights.
  aiClassifier?: ClassifierResult;
}

// Returns the FraudCheck shape for the AI Layer 6, given a classifier result.
export function checkAiProgressMatch(result: ClassifierResult): FraudCheck {
  return {
    name: "ai_progress_match",
    label: "AI Progress Match",
    passed: result.passed,
    weight: CHECK_WEIGHTS.ai_progress_match,
    score: result.score,
    details:
      result.visible || result.reasoning
        ? `${result.verdict}${result.visible ? ` · ${result.visible}` : ""}${
            result.reasoning ? ` · ${result.reasoning}` : ""
          }`
        : `Verdict: ${result.verdict}`,
  };
}

// Mean pairwise Hamming distance between consecutive dHashes in an ordered list.
// Returns undefined when there are fewer than 2 hashes to compare.
export function frameChangeMeanHamming(dhashes: string[]): number | undefined {
  if (!Array.isArray(dhashes) || dhashes.length < 2) return undefined;
  let total = 0;
  let pairs = 0;
  for (let i = 1; i < dhashes.length; i++) {
    total += hammingDistance(dhashes[i - 1], dhashes[i]);
    pairs++;
  }
  return pairs === 0 ? undefined : total / pairs;
}

export function runAllChecks(
  capture: CaptureInput,
  project: WorkflowMeta,
  existingHashes: string[]
): FraudResult {
  const checks: FraudCheck[] = [
    checkGeofence(capture.gps, project),
    checkMotion(capture.motionVariance),
    checkScreenReplay(capture.motionVariance, capture.lightingVariance, capture.frameChangeAvg),
    checkDuplicate(capture.photoHash, existingHashes),
    checkChallenge({
      submitted: capture.challengeSubmitted,
      expected: project.challenge_code,
      issuedAt: capture.challengeIssuedAt,
      capturedAt: capture.capturedAt,
    }),
  ];
  // Optional Layer 6 — only present when the server caller ran the AI
  // classifier. The capture-page's client-side preview omits it and falls
  // back to the original 5-layer scoring.
  if (capture.aiClassifier) {
    checks.push(checkAiProgressMatch(capture.aiClassifier));
  }

  const aggregate = checks.reduce((s, c) => s + c.score * c.weight, 0);

  // Hard-fail rule: any non-AI algorithmic layer failure forces FLAGGED
  // regardless of aggregate. The AI layer is excluded — it's advisory.
  // A replay attack that defeats 4 of 5 algorithmic layers still fails
  // the 5th, and weighted average alone could let it slip above 0.7.
  const hardFailed = checks.some(
    (c) => HARD_FAIL_LAYERS.includes(c.name) && !c.passed
  );
  const verdict: "VERIFIED" | "FLAGGED" =
    aggregate >= VERIFIED_THRESHOLD && !hardFailed ? "VERIFIED" : "FLAGGED";
  return { checks, aggregate_score: aggregate, verdict };
}

// Compute lighting variance from luma channel of an ImageData.
// Exported for the capture page to use in real captures.
export function lightingVarianceFromImageData(data: ImageData): number {
  const step = Math.max(1, Math.floor((data.width * data.height) / 5000));
  const lumas: number[] = [];
  for (let i = 0; i < data.data.length; i += 4 * step) {
    const r = data.data[i];
    const g = data.data[i + 1];
    const b = data.data[i + 2];
    lumas.push((0.299 * r + 0.587 * g + 0.114 * b) / 255);
  }
  return variance(lumas);
}
