"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FraudCheckList, FraudScoreBar, VerdictPill } from "@/components/ui";
import {
  analyzeMotion,
  dHashFromImageData,
  haversineMeters,
  lightingVarianceFromImageData,
  runAllChecks,
} from "@/lib/fraud";
import { useRequireRole } from "@/lib/hooks";
import {
  appendLedgerEvent,
  supabase,
  transitionWorkflow,
} from "@/lib/mock-db";
import type { FraudResult, Media, Session, Workflow } from "@/lib/types";

type Screen = "project" | "challenge" | "capture" | "upload" | "result";

interface CapturePayload {
  photoDataUrl: string;
  photoHash: string;
  lightingVariance: number;
  motionVariance: number;
  motionSampleCount: number;
  gps: { lat: number; lng: number; accuracy: number };
  capturedAt: Date;
  challengeIssuedAt: Date;
  deviceInfo: Media["meta"]["device_info"];
}

type ResultView = FraudResult & { mediaId: string };

const RECORD_SECONDS = 5;
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
    supabase
      .from<Workflow>("workflows")
      .select()
      .eq("current_state", "EVIDENCE_REQUESTED")
      .then((r) => setProjects(r.data ?? []));
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
      <TopBar session={session} onHome={resetToProjects} screen={screen} />

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
          session={session}
          onDone={(r) => {
            setResult(r);
            setScreen("result");
          }}
          onBack={() => setScreen("capture")}
        />
      )}
      {screen === "result" && selected && result && (
        <ResultScreen
          project={selected}
          result={result}
          onAnother={resetToProjects}
        />
      )}
    </main>
  );
}

// ============================================================
// Top bar
// ============================================================
function TopBar({
  session,
  onHome,
  screen,
}: {
  session: Session;
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
      <div className="text-xs text-slate-500 font-mono">
        {session.user.email.split("@")[0]}
      </div>
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
          No projects currently awaiting evidence. Use{" "}
          <Link href="/demo" className="underline">
            /demo → Reset
          </Link>{" "}
          to start over.
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
        <div className="text-xs uppercase tracking-wide text-amber-300">
          Today's challenge code
        </div>
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
// SCREEN 3 — Live capture with camera + GPS + motion
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
  const motionHandlerRef = useRef<((e: DeviceMotionEvent) => void) | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [gps, setGps] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [motionPerm, setMotionPerm] = useState<"unknown" | "granted" | "denied" | "unsupported">(
    "unknown"
  );
  const [currentMotion, setCurrentMotion] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordCountdown, setRecordCountdown] = useState(RECORD_SECONDS);

  // ----- Camera -----
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

  // ----- GPS -----
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

  // ----- Motion -----
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
      const a = e.accelerationIncludingGravity ?? { x: 0, y: 0, z: 0 };
      const m = Math.sqrt((a.x ?? 0) ** 2 + (a.y ?? 0) ** 2 + (a.z ?? 0) ** 2);
      motionRef.current.push(m);
      setCurrentMotion(m);
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
      } else {
        setMotionPerm("denied");
      }
    } catch {
      setMotionPerm("denied");
    }
  }

  const distance = gps ? haversineMeters(gps, project.meta.coordinates) : null;
  const insideGeofence = distance != null && distance <= project.meta.geofence_radius_meters;

  async function startRecording() {
    if (!videoRef.current) return;
    motionRef.current = [];
    setRecording(true);
    setRecordCountdown(RECORD_SECONDS);

    const start = Date.now();
    const iv = setInterval(() => {
      const elapsed = (Date.now() - start) / 1000;
      setRecordCountdown(Math.max(0, RECORD_SECONDS - Math.floor(elapsed)));
    }, 100);

    await new Promise((r) => setTimeout(r, RECORD_SECONDS * 1000));
    clearInterval(iv);

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

    const motionVar = motionRef.current.length > 0 ? analyzeMotion(motionRef.current) : 0;

    setRecording(false);

    if (!gps) {
      alert("GPS lock not acquired yet. Please wait a moment and retry.");
      return;
    }

    onCaptured({
      photoDataUrl: dataUrl,
      photoHash: phash,
      lightingVariance: lightingVar,
      motionVariance: motionVar,
      motionSampleCount: motionRef.current.length,
      gps,
      capturedAt: new Date(),
      challengeIssuedAt: new Date(project.meta.challenge_issued_at),
      deviceInfo: {
        user_agent: navigator.userAgent,
        platform: navigator.platform,
        screen: { width: window.screen.width, height: window.screen.height },
      },
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
                : gpsError
                  ? "GPS error"
                  : "locating…"
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
        <DataCell label="Motion samples" value={`${motionRef.current.length}`} mono />
        <DataCell label="Live |a|" value={`${currentMotion.toFixed(2)} m/s²`} mono />
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
          {recording ? `Recording… ${recordCountdown}s` : "● Record 5 seconds"}
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
// SCREEN 4 — Upload + run fraud pipeline
// ============================================================
function UploadScreen({
  project,
  capture,
  session,
  onDone,
  onBack,
}: {
  project: Workflow;
  capture: CapturePayload;
  session: Session;
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
      const { data: existingMedia } = await supabase.from<Media>("media").select();
      const existingHashes = (existingMedia ?? []).map((m) => m.phash);

      const result = runAllChecks(
        {
          gps: capture.gps,
          motionVariance: capture.motionVariance,
          lightingVariance: capture.lightingVariance,
          photoHash: capture.photoHash,
          challengeSubmitted: code.trim(),
          challengeIssuedAt: capture.challengeIssuedAt,
          capturedAt: capture.capturedAt,
        },
        project.meta,
        existingHashes
      );

      const storagePath = `${project.org_id}/${project.id}/${Date.now()}.jpg`;
      await supabase.storage.from("evidence").upload(storagePath, capture.photoDataUrl);

      const { data: mediaRow, error: mediaErr } = await supabase
        .from<Media>("media")
        .insert({
          org_id: project.org_id,
          workflow_id: project.id,
          storage_path: storagePath,
          file_type: "photo",
          sha256: "sha256:" + capture.photoHash,
          phash: capture.photoHash,
          uploaded_by: session.user.id,
          meta: {
            capture_session_id: "cap-" + Date.now().toString(36),
            gps: capture.gps,
            inside_geofence: result.checks[0].passed,
            motion_samples_count: capture.motionSampleCount,
            motion_variance: capture.motionVariance,
            lighting_variance: capture.lightingVariance,
            sensor_camera_correlation: result.checks[2].score,
            data_url: capture.photoDataUrl,
            device_info: capture.deviceInfo,
            fraud_result: result,
            source: "real",
          },
        })
        .select()
        .single();

      if (mediaErr || !mediaRow) {
        throw new Error(mediaErr?.message ?? "insert failed");
      }

      await appendLedgerEvent({
        org_id: project.org_id,
        workflow_id: project.id,
        event_type: "evidence_captured",
        actor_id: session.user.id,
        payload: {
          media_id: mediaRow.id,
          source: "real",
          fraud_score: result.aggregate_score,
          verdict: result.verdict,
        },
      });

      const nextState = result.verdict === "VERIFIED" ? "AUTO_VERIFIED" : "FLAGGED";
      await transitionWorkflow({
        workflowId: project.id,
        toState: nextState,
        actorId: session.user.id,
        reason: `Auto from fraud pipeline — score ${result.aggregate_score.toFixed(2)}`,
      });

      onDone({ ...result, mediaId: mediaRow.id });
    } catch (e) {
      setError((e as Error)?.message ?? "Upload failed");
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
function ResultScreen({
  project,
  result,
  onAnother,
}: {
  project: Workflow;
  result: ResultView;
  onAnother: () => void;
}) {
  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-slate-500">{project.reference_id}</div>
          <div className="text-sm">{project.reference_label}</div>
        </div>
        <VerdictPill verdict={result.verdict} />
      </div>

      <FraudScoreBar score={result.aggregate_score} />
      <FraudCheckList result={result} />

      <div className="text-xs text-slate-400 rounded border border-slate-800 bg-slate-900/50 p-3">
        Your supervisor has been notified. The bank dashboard has updated in realtime.
      </div>

      <div className="flex gap-2">
        <Link
          href="/dashboard"
          className="flex-1 rounded-md border border-slate-700 bg-slate-900 py-3 text-sm text-center"
        >
          View dashboard →
        </Link>
        <button
          onClick={onAnother}
          className="flex-[2] rounded-md bg-brand py-3 text-sm font-semibold text-brand-fg"
        >
          Capture another project
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Small UI atoms
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

function DataCell({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-900/40 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-slate-200 mt-0.5 ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
