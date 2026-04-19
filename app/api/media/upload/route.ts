import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeEventHash } from "@/lib/ledger";
import { analyzeMotion, frameChangeMeanHamming, runAllChecks } from "@/lib/fraud";
import { classifyProgress } from "@/lib/ai";
import { runNarration } from "@/lib/ai-narration";
import type { Media, Workflow } from "@/lib/types";

// Server-side evidence upload + fraud pipeline.
// Client POSTs multipart/form-data:
//   - file           the captured image blob
//   - workflow_id    target workflow (string)
//   - payload        JSON blob with sensor data, GPS, challenge code, etc.
//
// Server:
//   1. Auth + workflow ownership check
//   2. Read bytes, compute file SHA-256
//   3. Fetch existing perceptual hashes for duplicate check
//   4. Run all 5 fraud checks
//   5. Upload bytes to Supabase Storage with service role
//   6. Insert media row
//   7. Emit media_uploaded + evidence_captured (+ fraud_detected if FLAGGED)
//   8. Auto-transition workflow (AUTO_VERIFIED or FLAGGED)
//   9. Return fraud result to the caller

export const dynamic = "force-dynamic";
export const maxDuration = 30;

interface UploadPayload {
  gps: { lat: number; lng: number; accuracy: number };
  motion_samples: number[];
  gyro_samples?: number[];
  lighting_variance: number;
  challenge_submitted: string;
  captured_at: string;
  phash: string;
  device_info: Media["meta"]["device_info"];
  // Optional video pointer — client uploads the video directly to Storage
  // (bypassing Vercel request size limits) and sends us the resulting path.
  video_storage_path?: string | null;
  video_mime_type?: string | null;
  video_bytes?: number | null;
  // Optical-flow proxy (Point 2): dHashes of frames sampled during the 15s
  // recording. Server computes the mean pairwise Hamming distance and folds
  // it into Layer 3 (screen-replay detection).
  frame_dhashes?: string[] | null;
}

export async function POST(req: Request) {
  const ssb = createServerSupabase();
  const {
    data: { user },
  } = await ssb.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { data: profile } = await ssb
    .from("users")
    .select("*")
    .eq("id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "no profile" }, { status: 403 });

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const workflowId = form.get("workflow_id") as string | null;
  const payloadJson = form.get("payload") as string | null;
  if (!file || !workflowId || !payloadJson) {
    return NextResponse.json(
      { error: "file, workflow_id, payload required" },
      { status: 400 }
    );
  }

  let payload: UploadPayload;
  try {
    payload = JSON.parse(payloadJson) as UploadPayload;
  } catch {
    return NextResponse.json({ error: "payload is not valid JSON" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: wfRow } = await admin
    .from("workflows")
    .select("*")
    .eq("id", workflowId)
    .maybeSingle();
  if (!wfRow || wfRow.org_id !== profile.org_id) {
    return NextResponse.json({ error: "workflow not found" }, { status: 404 });
  }
  const workflow = wfRow as Workflow;

  // 1. Read bytes + compute file SHA-256 (canonical — server-recorded, not client-asserted)
  const bytes = Buffer.from(await file.arrayBuffer());
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");

  // 2. Re-compute motion variance from the raw samples the client sent.
  // Variance is cheap; doing it server-side means we don't trust a pre-computed number.
  const motionVariance =
    payload.motion_samples && payload.motion_samples.length > 0
      ? analyzeMotion(payload.motion_samples)
      : 0;
  const gyroVariance =
    payload.gyro_samples && payload.gyro_samples.length > 0
      ? analyzeMotion(payload.gyro_samples)
      : 0;
  // Optical-flow proxy: mean Hamming distance between consecutive dHashes.
  // Undefined if the client sent fewer than 2 hashes (e.g. MediaRecorder
  // unavailable, sampling errors). Layer 3 gracefully falls back without it.
  const frameChangeAvg = frameChangeMeanHamming(payload.frame_dhashes ?? []);

  // 3. Existing perceptual hashes for duplicate check (all within this org)
  //    In parallel, run the AI classifier on the photo — Layer 6 of the
  //    fraud pipeline. The classifier is advisory (excluded from the hard-
  //    fail rule); on error it returns UNCLEAR with passed=true so AI
  //    downtime never blocks uploads.
  const photoBase64 = bytes.toString("base64");
  const photoMimeType = file.type || "image/jpeg";
  const [
    { data: existingMedia },
    aiClassifier,
  ] = await Promise.all([
    admin.from("media").select("phash").eq("org_id", workflow.org_id),
    classifyProgress(photoBase64, photoMimeType, workflow.meta.milestone_description),
  ]);
  const existingHashes = ((existingMedia ?? []) as { phash: string | null }[])
    .map((m) => m.phash)
    .filter((h): h is string => typeof h === "string" && h.length > 0);

  // 4. Run the fraud pipeline (5 algorithmic layers + AI Layer 6)
  const fraud = runAllChecks(
    {
      gps: payload.gps,
      motionVariance,
      lightingVariance: payload.lighting_variance,
      photoHash: payload.phash,
      challengeSubmitted: payload.challenge_submitted,
      challengeIssuedAt: new Date(workflow.meta.challenge_issued_at),
      capturedAt: new Date(payload.captured_at),
      frameChangeAvg,
      aiClassifier,
    },
    workflow.meta,
    existingHashes
  );

  // 5. Upload bytes to Storage with the service role (bypasses RLS in a controlled way).
  const ext = (file.type.split("/")[1] || "jpg").slice(0, 4);
  const storagePath = `${workflow.org_id}/${workflow.id}/${Date.now()}-${sha256.slice(0, 8)}.${ext}`;
  const { error: upErr } = await admin.storage
    .from("evidence")
    .upload(storagePath, bytes, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });
  if (upErr) {
    return NextResponse.json(
      { error: `storage upload failed: ${upErr.message}` },
      { status: 500 }
    );
  }

  // 6. Insert media row
  const mediaMeta: Media["meta"] = {
    capture_session_id: "srv-" + Date.now().toString(36),
    gps: payload.gps,
    inside_geofence: fraud.checks[0].passed,
    motion_samples_count: payload.motion_samples?.length ?? 0,
    motion_variance: motionVariance,
    lighting_variance: payload.lighting_variance,
    sensor_camera_correlation: fraud.checks[2].score,
    device_info: payload.device_info,
    fraud_result: fraud,
    source: "real",
  };
  // Extend meta with gyro + optional video-pointer + optical-flow fields.
  const metaWithExtras: Media["meta"] = {
    ...mediaMeta,
    gyro_samples_count: payload.gyro_samples?.length ?? 0,
    gyro_variance: gyroVariance,
    ...(payload.video_storage_path
      ? {
          video_storage_path: payload.video_storage_path,
          video_mime_type: payload.video_mime_type ?? undefined,
          video_bytes: payload.video_bytes ?? undefined,
        }
      : {}),
    ...(payload.frame_dhashes && payload.frame_dhashes.length > 0
      ? {
          frame_dhashes: payload.frame_dhashes,
          frame_change_avg: frameChangeAvg,
        }
      : {}),
    // AI Layer 6 verdict — stored even when the classifier returned
    // UNCLEAR (which happens on API downtime). The UI shows this next to
    // the other layers; future re-verification can re-run against it.
    ai_progress: {
      verdict: aiClassifier.verdict,
      visible: aiClassifier.visible,
      reasoning: aiClassifier.reasoning,
      score: aiClassifier.score,
      passed: aiClassifier.passed,
    },
  };

  const { data: mediaRow, error: mediaErr } = await admin
    .from("media")
    .insert({
      org_id: workflow.org_id,
      workflow_id: workflow.id,
      storage_path: storagePath,
      file_type: "photo",
      sha256,
      phash: payload.phash,
      uploaded_by: profile.id,
      meta: metaWithExtras,
    })
    .select()
    .single();
  if (mediaErr || !mediaRow) {
    return NextResponse.json(
      { error: mediaErr?.message ?? "media insert failed" },
      { status: 500 }
    );
  }

  // 7. Ledger events through the hash chain
  await writeLedger(admin, {
    org_id: workflow.org_id,
    workflow_id: workflow.id,
    event_type: "media_uploaded",
    actor_id: profile.id,
    payload: {
      media_id: mediaRow.id,
      sha256,
      phash: payload.phash,
      storage_path: storagePath,
      file_type: "photo",
    },
  });
  await writeLedger(admin, {
    org_id: workflow.org_id,
    workflow_id: workflow.id,
    event_type: "evidence_captured",
    actor_id: profile.id,
    payload: {
      media_id: mediaRow.id,
      source: "real",
      fraud_score: fraud.aggregate_score,
      verdict: fraud.verdict,
      failed_layers: fraud.checks.filter((c) => !c.passed).map((c) => c.name),
    },
  });
  if (fraud.verdict === "FLAGGED") {
    await writeLedger(admin, {
      org_id: workflow.org_id,
      workflow_id: workflow.id,
      event_type: "fraud_detected",
      actor_id: null,
      payload: {
        media_id: mediaRow.id,
        failed_layers: fraud.checks.filter((c) => !c.passed).map((c) => c.name),
        score: fraud.aggregate_score,
      },
    });
  }

  // 8. Transition workflow based on verdict
  const nextState = fraud.verdict === "VERIFIED" ? "AUTO_VERIFIED" : "FLAGGED";
  await admin
    .from("workflows")
    .update({
      current_state: nextState,
      updated_at: new Date().toISOString(),
    })
    .eq("id", workflow.id);
  await writeLedger(admin, {
    org_id: workflow.org_id,
    workflow_id: workflow.id,
    event_type: "state_changed",
    actor_id: profile.id,
    payload: {
      from: workflow.current_state,
      to: nextState,
      reason: `Auto from server fraud pipeline — score ${fraud.aggregate_score.toFixed(2)}`,
    },
  });

  // 9. AI Narrator — runs inline ONLY on FLAGGED captures. The spec calls
  //    for fire-and-forget HTTP from here, but Vercel serverless has a race
  //    where the response can return before the child fetch starts.
  //    Inlining adds ~2s to FLAGGED-upload latency, which is fine on a
  //    "needs review" path, and guarantees the narration is in the response
  //    so the UI can render the AI Review callout immediately.
  //
  //    On any failure (rate limit, API key missing, timeout), the narration
  //    is skipped silently — the verdict still stands on its own.
  let narratedMedia = mediaRow;
  if (fraud.verdict === "FLAGGED") {
    try {
      await runNarration({
        mediaId: mediaRow.id,
        orgId: workflow.org_id,
        actorId: profile.id,
      });
      // Re-fetch so the response includes the updated ai_narration fields.
      const { data: fresh } = await admin
        .from("media")
        .select("*")
        .eq("id", mediaRow.id)
        .maybeSingle();
      if (fresh) narratedMedia = fresh as Media;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("AI narration skipped:", (e as Error).message);
    }
  }

  return NextResponse.json({
    ok: true,
    media: narratedMedia,
    fraud,
    next_state: nextState,
  });
}

async function writeLedger(
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
