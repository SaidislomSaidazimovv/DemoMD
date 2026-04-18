"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FraudCheckList, FraudScoreBar, VerdictPill } from "@/components/ui";
import {
  analyzeMotion,
  dHashFromImageData,
  haversineMeters,
  lightingVarianceFromImageData,
} from "@/lib/fraud";
import { useRequireRole } from "@/lib/hooks";
import { createClient } from "@/lib/supabase/browser";
import type { FraudResult, Media, Workflow } from "@/lib/types";

type Screen = "project" | "challenge" | "capture" | "upload" | "result";

interface CapturePayload {
  photoDataUrl: string;
  photoBlob: Blob;
  photoHash: string;
  lightingVariance: number;
  motionVariance: number;
  motionSamples: number[]; // accel magnitudes (raw)
  gyroSamples: number[]; // rotation-rate magnitudes (raw)
  gps: { lat: number; lng: number; accuracy: number };
  capturedAt: Date;
  challengeIssuedAt: Date;
  deviceInfo: Media["meta"]["device_info"];
  // Optional video artifact — present when MediaRecorder succeeded.
  videoBlob: Blob | null;
  videoMimeType: string | null;
  // Optical-flow proxy (Point 2): dHashes of frames sampled during recording.
  // Server uses their mean Hamming distance to refine Layer 3 screen-replay.
  frameDHashes: string[];
}

const FRAME_SAMPLE_COUNT = 6; // sampled at RECORD_SECONDS / 6 intervals

type ResultView = FraudResult & { mediaId: string };

const RECORD_SECONDS = 15; // per Tasdiq spec: 15-second capture window
const CHALLENGE_TIMER_SECONDS = 30;

export default function CapturePage() {
  const { session, loading } = useRequireRole(["inspector", "admin"]);
  const [screen, setScreen] = useState<Screen>("project");
  const [projects, setProjects] = useState<Workflow[]>([]);
  const [selected, setSelected] = useState<Workflow | null>(null);
  const [capture, setCapture] = useState<CapturePayload | null>(null);
  const [result, setResult] = useState<ResultView | null>(null);

  useEffect(() => {
    if (loading || !session) return;
    const supabase = createClient();
    supabase
      .from("workflows")
      .select("*")
      .eq("current_state", "EVIDENCE_REQUESTED")
      .then((r) => setProjects((r.data as Workflow[]) ?? []));
  }, [loading, session]);

  if (loading || !session) {
    return (
      <main className="min-h-screen flex items-center justify-center text-slate-500">
        Loading…
      </main>
    );
  }

  function resetToProjects() {
    setSelected(null);
    setCapture(null);
    setResult(null);
    setScreen("project");
  }

  return (
    <main className="mx-auto min-h-screen max-w-md bg-slate-950 text-slate-100">
      <TopBar email={session.email} onHome={resetToProjects} screen={screen} />

      {screen === "project" && (
        <ProjectSelect
          projects={projects}
          onPick={(p) => {
            setSelected(p);
            setScreen("challenge");
          }}
        />
      )}
      {screen === "challenge" && selected && (
        <ChallengeScreen
          project={selected}
          onReady={() => setScreen("capture")}
          onBack={() => setScreen("project")}
        />
      )}
      {screen === "capture" && selected && (
        <CaptureScreen
          project={selected}
          onCaptured={(payload) => {
            setCapture(payload);
            setScreen("upload");
          }}
          onCancel={() => setScreen("challenge")}
        />
      )}
      {screen === "upload" && selected && capture && (
        <UploadScreen
          project={selected}
          capture={capture}
          onDone={(r) => {
            setResult(r);
            setScreen("result");
          }}
          onBack={() => setScreen("capture")}
        />
      )}
      {screen === "result" && selected && result && (
        <ResultScreen project={selected} result={result} onAnother={resetToProjects} />
      )}
    </main>
  );
}

// ============================================================
// Top bar
// ============================================================
function TopBar({
  email,
  onHome,
  screen,
}: {
  email: string;
  onHome: () => void;
  screen: Screen;
}) {
  const labels: Record<Screen, string> = {
    project: "Select project",
    challenge: "Challenge code",
    capture: "Capture evidence",
    upload: "Upload",
    result: "Result",
  };
  return (
    <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/90 backdrop-blur px-4 py-3 flex items-center justify-between">
      <button onClick={onHome} className="text-xs text-slate-400 hover:text-slate-200">
        ← Projects
      </button>
      <div className="text-sm font-semibold">{labels[screen]}</div>
      <div className="text-xs text-slate-500 font-mono">{email.split("@")[0]}</div>
    </header>
  );
}

// ============================================================
// SCREEN 1 — Project select
// ============================================================
function ProjectSelect({
  projects,
  onPick,
}: {
  projects: Workflow[];
  onPick: (p: Workflow) => void;
}) {
  return (
    <div className="p-4 space-y-3">
      <h2 className="text-lg font-semibold">Assigned projects</h2>
      {projects.length === 0 && (
        <div className="rounded border border-dashed border-slate-700 p-6 text-sm text-slate-400">
          No projects awaiting evidence. Ask your admin to create one.
        </div>
      )}
      {projects.map((p) => (
        <button
          key={p.id}
          onClick={() => onPick(p)}
          className="w-full text-left rounded-lg border border-slate-800 bg-slate-900 hover:bg-slate-800 p-4 transition"
        >
          <div className="text-xs text-slate-500">{p.reference_id}</div>
          <div className="font-semibold">{p.reference_label}</div>
          <div className="text-xs text-slate-400 mt-1">
            {p.meta.address} · milestone: {p.meta.milestone_description}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            Expected by {p.meta.expected_completion}
          </div>
        </button>
      ))}
    </div>
  );
}

// ============================================================
// SCREEN 2 — Challenge code
// ============================================================
function ChallengeScreen({
  project,
  onReady,
  onBack,
}: {
  project: Workflow;
  onReady: () => void;
  onBack: () => void;
}) {
  const [remaining, setRemaining] = useState(CHALLENGE_TIMER_SECONDS);
  useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => setRemaining((n) => Math.max(0, n - 1)), 1000);
    return () => clearInterval(id);
  }, [remaining]);

  return (
    <div className="p-4 space-y-4">
      <div>
        <div className="text-xs text-slate-500">{project.reference_id}</div>
        <h2 className="text-lg font-semibold">{project.reference_label}</h2>
      </div>
      <div className="rounded-xl border border-amber-700/40 bg-amber-900/10 p-6 text-center space-y-3">
        <div className="text-xs uppercase tracking-wide text-amber-300">Today's challenge code</div>
        <div className="text-5xl font-black tracking-widest text-amber-200 font-mono">
          {project.meta.challenge_code}
        </div>
        <div className="text-xs text-amber-200/70">
          Write this on a piece of paper. Hold it in your first shot.
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-900 p-4">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-slate-300">Memorization timer</span>
          <span className="font-mono text-slate-200">{remaining}s</span>
        </div>
        <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
          <div
            className="h-full bg-amber-500 transition-all"
            style={{ width: `${(remaining / CHALLENGE_TIMER_SECONDS) * 100}%` }}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={onBack}
          className="flex-1 rounded-md border border-slate-700 bg-slate-900 py-3 text-sm"
        >
          Back
        </button>
        <button
          onClick={onReady}
          className="flex-[2] rounded-md bg-brand py-3 text-sm font-semibold text-brand-fg"
        >
          Code is ready → Start capture
        </button>
      </div>
    </div>
  );
}

// ============================================================
// SCREEN 3 — Live capture
// ============================================================
function CaptureScreen({
  project,
  onCaptured,
  onCancel,
}: {
  project: Workflow;
  onCaptured: (p: CapturePayload) => void;
  onCancel: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const motionRef = useRef<number[]>([]);
  const gyroRef = useRef<number[]>([]);
  const motionHandlerRef = useRef<((e: DeviceMotionEvent) => void) | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const frameDHashesRef = useRef<string[]>([]);
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [motionPerm, setMotionPerm] = useState<"unknown" | "granted" | "denied" | "unsupported">(
    "unknown"
  );
  const [currentMotion, setCurrentMotion] = useState(0);
  const [currentGyro, setCurrentGyro] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordCountdown, setRecordCountdown] = useState(RECORD_SECONDS);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (e) {
        setCameraError((e as Error).message ?? "Camera unavailable");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      setGpsError("Geolocation unavailable");
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setGps({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
        setGpsError(null);
      },
      (err) => setGpsError(err.message),
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );
    watchIdRef.current = id;
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    };
  }, []);

  useEffect(() => {
    const AnyDME = (window as unknown as { DeviceMotionEvent?: any }).DeviceMotionEvent;
    if (!AnyDME) {
      setMotionPerm("unsupported");
      return;
    }
    if (typeof AnyDME.requestPermission === "function") {
      setMotionPerm("unknown");
    } else {
      attachMotionListener();
      setMotionPerm("granted");
    }
    return () => {
      if (motionHandlerRef.current) {
        window.removeEventListener("devicemotion", motionHandlerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function attachMotionListener() {
    const handler = (e: DeviceMotionEvent) => {
      // Accelerometer magnitude (includes gravity)
      const a = e.accelerationIncludingGravity ?? { x: 0, y: 0, z: 0 };
      const m = Math.sqrt((a.x ?? 0) ** 2 + (a.y ?? 0) ** 2 + (a.z ?? 0) ** 2);
      motionRef.current.push(m);
      setCurrentMotion(m);

      // Gyroscope magnitude (angular velocity)
      const r = e.rotationRate ?? { alpha: 0, beta: 0, gamma: 0 };
      const g = Math.sqrt(
        (r.alpha ?? 0) ** 2 + (r.beta ?? 0) ** 2 + (r.gamma ?? 0) ** 2
      );
      gyroRef.current.push(g);
      setCurrentGyro(g);
    };
    motionHandlerRef.current = handler;
    window.addEventListener("devicemotion", handler);
  }

  async function enableMotion() {
    try {
      const res = await (
        window as unknown as { DeviceMotionEvent: { requestPermission: () => Promise<string> } }
      ).DeviceMotionEvent.requestPermission();
      if (res === "granted") {
        attachMotionListener();
        setMotionPerm("granted");
      } else setMotionPerm("denied");
    } catch {
      setMotionPerm("denied");
    }
  }

  const distance = gps ? haversineMeters(gps, project.meta.coordinates) : null;
  const insideGeofence = distance != null && distance <= project.meta.geofence_radius_meters;

  async function startRecording() {
    if (!videoRef.current) return;
    motionRef.current = [];
    gyroRef.current = [];
    videoChunksRef.current = [];
    frameDHashesRef.current = [];
    setRecording(true);
    setRecordCountdown(RECORD_SECONDS);

    // Start MediaRecorder on the same stream the <video> element is showing.
    // If the browser can't record (rare — older iOS Safari), we still proceed
    // with still-frame capture. Video is additive, not required.
    let chosenMime: string | null = null;
    const stream = streamRef.current;
    if (stream && typeof MediaRecorder !== "undefined") {
      for (const candidate of [
        "video/webm;codecs=vp9",
        "video/webm;codecs=vp8",
        "video/webm",
        "video/mp4",
      ]) {
        if (MediaRecorder.isTypeSupported(candidate)) {
          chosenMime = candidate;
          break;
        }
      }
      if (chosenMime) {
        try {
          const recorder = new MediaRecorder(stream, { mimeType: chosenMime });
          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) videoChunksRef.current.push(e.data);
          };
          recorder.start(1000); // emit a chunk every second — safer for long recordings
          mediaRecorderRef.current = recorder;
        } catch {
          mediaRecorderRef.current = null;
        }
      }
    }

    // Sensor + countdown loop for exactly RECORD_SECONDS. At FRAME_SAMPLE_COUNT
    // evenly-spaced moments we also grab a still frame and compute its dHash
    // — that array becomes the optical-flow proxy on the server (Layer 3).
    const start = Date.now();
    const sampleInterval = (RECORD_SECONDS * 1000) / FRAME_SAMPLE_COUNT;
    const nextSampleAtRef = { current: start + sampleInterval / 2 };
    const sampleCanvas =
      sampleCanvasRef.current ??
      (sampleCanvasRef.current = document.createElement("canvas"));
    const iv = setInterval(() => {
      const now = Date.now();
      const elapsed = (now - start) / 1000;
      setRecordCountdown(Math.max(0, RECORD_SECONDS - Math.floor(elapsed)));
      // Grab a frame if we've crossed the next sample boundary and the video
      // element is producing frames. Small canvas (64x48) keeps this cheap.
      if (
        now >= nextSampleAtRef.current &&
        frameDHashesRef.current.length < FRAME_SAMPLE_COUNT &&
        videoRef.current &&
        videoRef.current.videoWidth > 0
      ) {
        try {
          sampleCanvas.width = 64;
          sampleCanvas.height = 48;
          const sctx = sampleCanvas.getContext("2d");
          if (sctx) {
            sctx.drawImage(videoRef.current, 0, 0, 64, 48);
            const imgData = sctx.getImageData(0, 0, 64, 48);
            frameDHashesRef.current.push(dHashFromImageData(imgData));
          }
        } catch {
          // ignore sampling errors — optical-flow proxy is additive, not required
        }
        nextSampleAtRef.current += sampleInterval;
      }
    }, 100);
    await new Promise((r) => setTimeout(r, RECORD_SECONDS * 1000));
    clearInterval(iv);

    // Stop the recorder and wait for the final chunk.
    let videoBlob: Blob | null = null;
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === "recording") {
      await new Promise<void>((res) => {
        recorder.onstop = () => res();
        try {
          recorder.stop();
        } catch {
          res();
        }
      });
      if (videoChunksRef.current.length > 0 && chosenMime) {
        videoBlob = new Blob(videoChunksRef.current, { type: chosenMime });
      }
    }
    mediaRecorderRef.current = null;

    // Still-frame capture — feeds the fraud pipeline (dHash + lighting variance).
    const video = videoRef.current;
    const canvas = canvasRef.current ?? document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setRecording(false);
      return;
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const phash = dHashFromImageData(imageData);
    const lightingVar = lightingVarianceFromImageData(imageData);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
    const blob = await new Promise<Blob>((resolve) =>
      canvas.toBlob((b) => resolve(b as Blob), "image/jpeg", 0.7)
    );

    const motionVar = motionRef.current.length > 0 ? analyzeMotion(motionRef.current) : 0;
    setRecording(false);

    if (!gps) {
      alert("GPS lock not acquired yet. Please wait a moment and retry.");
      return;
    }

    onCaptured({
      photoDataUrl: dataUrl,
      photoBlob: blob,
      photoHash: phash,
      lightingVariance: lightingVar,
      motionVariance: motionVar,
      motionSamples: motionRef.current.slice(),
      gyroSamples: gyroRef.current.slice(),
      gps,
      capturedAt: new Date(),
      challengeIssuedAt: new Date(project.meta.challenge_issued_at),
      deviceInfo: {
        user_agent: navigator.userAgent,
        platform: navigator.platform,
        screen: { width: window.screen.width, height: window.screen.height },
      },
      videoBlob,
      videoMimeType: chosenMime,
      frameDHashes: frameDHashesRef.current.slice(),
    });
  }

  return (
    <div className="relative">
      <div className="relative aspect-[3/4] bg-black">
        {cameraError ? (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-rose-300">
            Camera error: {cameraError}
          </div>
        ) : (
          <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
        )}
        <canvas ref={canvasRef} className="hidden" />

        <div className="absolute top-2 left-2 right-2 flex items-start justify-between text-xs">
          <Pill
            tone={insideGeofence ? "ok" : "bad"}
            label={
              gps
                ? distance != null
                  ? insideGeofence
                    ? `inside · ${distance.toFixed(0)} m`
                    : `outside · ${(distance / 1000).toFixed(2)} km`
                  : "locating…"
                : gpsError ?? "locating…"
            }
          />
          <Pill
            tone={motionPerm === "granted" ? "ok" : "warn"}
            label={
              motionPerm === "granted"
                ? `motion ${currentMotion.toFixed(1)} m/s²`
                : motionPerm === "unsupported"
                  ? "no motion API"
                  : motionPerm === "denied"
                    ? "motion denied"
                    : "motion: tap to enable"
            }
          />
        </div>

        {recording && (
          <div className="absolute bottom-2 left-2 right-2 text-center">
            <div className="inline-block rounded-full bg-rose-600 text-white px-4 py-1 text-sm font-mono">
              ● REC · {recordCountdown}s
            </div>
          </div>
        )}
      </div>

      <div className="p-3 grid grid-cols-2 gap-2 text-xs">
        <DataCell
          label="GPS"
          value={gps ? `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}` : gpsError ?? "acquiring…"}
        />
        <DataCell label="Accuracy" value={gps ? `${gps.accuracy.toFixed(0)} m` : "—"} />
        <DataCell label="Accel samples" value={`${motionRef.current.length}`} mono />
        <DataCell label="Gyro samples" value={`${gyroRef.current.length}`} mono />
        <DataCell label="Live |a|" value={`${currentMotion.toFixed(2)} m/s²`} mono />
        <DataCell label="Live |ω|" value={`${currentGyro.toFixed(1)} °/s`} mono />
      </div>

      <div className="p-3 space-y-2">
        {motionPerm === "unknown" && (
          <button
            onClick={enableMotion}
            className="w-full rounded-md border border-amber-700/40 bg-amber-900/20 py-2 text-sm text-amber-200"
          >
            Tap to enable motion sensors (iOS)
          </button>
        )}
        <button
          onClick={startRecording}
          disabled={recording || !gps}
          className="w-full rounded-md bg-rose-600 hover:bg-rose-500 py-3 text-sm font-semibold disabled:opacity-50"
        >
          {recording ? `Recording… ${recordCountdown}s` : `● Record ${RECORD_SECONDS} seconds`}
        </button>
        <button
          onClick={onCancel}
          disabled={recording}
          className="w-full rounded-md border border-slate-700 bg-slate-900 py-2 text-xs text-slate-400 disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ============================================================
// SCREEN 4 — Upload
// ============================================================
function UploadScreen({
  project,
  capture,
  onDone,
  onBack,
}: {
  project: Workflow;
  capture: CapturePayload;
  onDone: (r: ResultView) => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      // Step 1 — if we have a video, upload it to Supabase Storage directly
      // from the browser. Bypasses the Vercel request-body limit (4.5 MB),
      // which matters because a 15s webm is 3-8 MB. Video is additive —
      // failure here doesn't block the still-frame fraud pipeline.
      let videoStoragePath: string | null = null;
      let videoBytes: number | null = null;
      if (capture.videoBlob && capture.videoMimeType) {
        try {
          const supabase = createClient();
          const ext = capture.videoMimeType.includes("mp4") ? "mp4" : "webm";
          // Resolve org id via session — RLS requires the org_id prefix on the path.
          const { data: userRes } = await supabase.auth.getUser();
          const uid = userRes.user?.id;
          if (uid) {
            const { data: profile } = await supabase
              .from("users")
              .select("org_id")
              .eq("id", uid)
              .maybeSingle();
            const orgId = (profile as { org_id?: string } | null)?.org_id;
            if (orgId) {
              const path = `${orgId}/${project.id}/${Date.now()}-video.${ext}`;
              const { error: upErr } = await supabase.storage
                .from("evidence")
                .upload(path, capture.videoBlob, {
                  contentType: capture.videoMimeType,
                  upsert: false,
                });
              if (!upErr) {
                videoStoragePath = path;
                videoBytes = capture.videoBlob.size;
              } else {
                console.warn("video upload failed:", upErr.message);
              }
            }
          }
        } catch (e) {
          console.warn("video upload error:", (e as Error).message);
        }
      }

      // Step 2 — POST the still frame + sensor data + optional video pointer
      // to the server-side fraud pipeline. The server:
      //   - computes the canonical file SHA-256 from the bytes
      //   - re-runs all 5 fraud checks (including duplicate lookup)
      //   - uploads the photo to Storage with the service role
      //   - writes media_uploaded + evidence_captured (+ fraud_detected) events
      //   - transitions the workflow to AUTO_VERIFIED or FLAGGED
      const form = new FormData();
      form.append("file", capture.photoBlob, "capture.jpg");
      form.append("workflow_id", project.id);
      form.append(
        "payload",
        JSON.stringify({
          gps: capture.gps,
          motion_samples: capture.motionSamples,
          gyro_samples: capture.gyroSamples,
          lighting_variance: capture.lightingVariance,
          challenge_submitted: code.trim(),
          captured_at: capture.capturedAt.toISOString(),
          phash: capture.photoHash,
          device_info: capture.deviceInfo,
          video_storage_path: videoStoragePath,
          video_mime_type: capture.videoMimeType,
          video_bytes: videoBytes,
          frame_dhashes: capture.frameDHashes,
        })
      );

      const r = await fetch("/api/media/upload", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data?.error ?? "upload failed");

      const fraud = data.fraud as FraudResult;
      const mediaId = data.media?.id as string;
      onDone({ ...fraud, mediaId });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="rounded-lg overflow-hidden border border-slate-700">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={capture.photoDataUrl} alt="capture" className="w-full" />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <DataCell
          label="GPS"
          value={`${capture.gps.lat.toFixed(5)}, ${capture.gps.lng.toFixed(5)}`}
        />
        <DataCell label="Motion variance" value={capture.motionVariance.toFixed(4)} mono />
        <DataCell label="Lighting variance" value={capture.lightingVariance.toFixed(4)} mono />
        <DataCell label="Photo hash" value={capture.photoHash} mono />
      </div>

      <div>
        <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">
          Enter the challenge code from your paper
        </label>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="e.g. 7X4M"
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-mono tracking-widest"
        />
      </div>

      {error && (
        <div className="rounded border border-rose-700/50 bg-rose-900/20 px-3 py-2 text-sm text-rose-300">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onBack}
          disabled={busy}
          className="flex-1 rounded-md border border-slate-700 bg-slate-900 py-3 text-sm"
        >
          Retake
        </button>
        <button
          onClick={submit}
          disabled={busy || !code.trim()}
          className="flex-[2] rounded-md bg-brand py-3 text-sm font-semibold text-brand-fg disabled:opacity-50"
        >
          {busy ? "Verifying…" : "Upload & verify"}
        </button>
      </div>
    </div>
  );
}

// ============================================================
// SCREEN 5 — Result
// ============================================================
// Per TASDIQ_UI_REDESIGN.md Screen 5: "full-screen verification progress
// with 5 checkmark animations appearing one by one as checks complete."
// Server-side the checks run in parallel, so the staggered reveal is a UI
// effect — each layer reveals 400 ms after the previous one, finishing in
// ~2 s. Then the verdict + actions fade in.
function ResultScreen({
  project,
  result,
  onAnother,
}: {
  project: Workflow;
  result: ResultView;
  onAnother: () => void;
}) {
  const [revealedCount, setRevealedCount] = useState(0);
  const total = result.checks.length;

  useEffect(() => {
    if (revealedCount >= total) return;
    const id = setTimeout(() => setRevealedCount((n) => n + 1), 400);
    return () => clearTimeout(id);
  }, [revealedCount, total]);

  const allRevealed = revealedCount >= total;
  const passed = result.verdict === "VERIFIED";

  return (
    <div className="p-4 space-y-6 fade-up">
      <div className="text-center space-y-1">
        <div className="text-xs text-slate-500 uppercase tracking-wide">
          {project.reference_id}
        </div>
        <div className="text-sm text-slate-300">{project.reference_label}</div>
      </div>

      {/* Checkmark stack — reveals 1-by-1 */}
      <ol className="space-y-2">
        {result.checks.map((c, idx) => {
          const revealed = idx < revealedCount;
          return (
            <li
              key={c.name}
              className={`rounded-md border p-3 flex items-center gap-3 transition-all duration-500 ${
                revealed ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
              } ${
                c.passed
                  ? "border-emerald-700/50 bg-emerald-900/10"
                  : "border-rose-700/50 bg-rose-900/10"
              }`}
            >
              <span className="text-2xl leading-none">
                {c.passed ? "✅" : "⚠️"}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-100">{c.label}</div>
                <div className="text-xs text-slate-400 mt-0.5">{c.details}</div>
              </div>
            </li>
          );
        })}
      </ol>

      {/* Verdict — appears after all checks revealed */}
      <div
        className={`transition-opacity duration-500 ${allRevealed ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      >
        <div
          className={`rounded-lg border p-5 text-center space-y-2 ${
            passed
              ? "border-emerald-500/40 bg-emerald-900/20"
              : "border-amber-500/40 bg-amber-900/20"
          }`}
        >
          <div className="text-3xl">{passed ? "✓" : "⚠"}</div>
          <div className="text-lg font-semibold text-slate-100">
            {passed ? "Evidence verified" : "Some checks need review"}
          </div>
          <div className="text-xs text-slate-400">
            {passed
              ? "Your supervisor has been notified. The bank dashboard has updated in realtime."
              : "Your supervisor has been notified and will review the flagged checks."}
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <Link
            href="/dashboard"
            className="flex-1 rounded-md border border-slate-700 bg-slate-900 py-3 text-sm text-center min-h-[44px] flex items-center justify-center"
          >
            View dashboard →
          </Link>
          <button
            onClick={onAnother}
            className="flex-[2] rounded-md bg-brand py-3 text-sm font-semibold text-brand-fg min-h-[44px]"
          >
            Capture another project
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Atoms
// ============================================================
function Pill({ tone, label }: { tone: "ok" | "warn" | "bad"; label: string }) {
  const cls =
    tone === "ok"
      ? "bg-emerald-600/80 text-emerald-50"
      : tone === "warn"
        ? "bg-amber-600/80 text-amber-50"
        : "bg-rose-600/80 text-rose-50";
  return <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] ${cls}`}>{label}</span>;
}

function DataCell({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded border border-slate-800 bg-slate-900/40 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-slate-200 mt-0.5 ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
