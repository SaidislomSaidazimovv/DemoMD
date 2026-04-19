"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin,
  Activity,
  Video,
  Fingerprint,
  KeyRound,
  Sparkles,
  Check,
  X,
  Circle,
  Play,
  Pause,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

// Interactive fraud-pipeline explainer for the landing page. Inspired by
// the "RFP Requirements / Executive Summary" panel pattern: left-side
// progress tracker, right-side detail reveal.
//
// Two scenarios toggle: REAL (all six layers pass) and FRAUD (all fail).
// Auto-advances one layer every 1.4 s, auto-swaps scenario after a full pass.
// User can pause, scrub with the layer list, or flip the scenario manually.

type Scenario = "real" | "fraud";
type LayerStatus = "pending" | "active" | "passed" | "failed";

interface Layer {
  name: string;
  icon: LucideIcon;
  short: string;
  // Detail copy per scenario
  real: { title: string; metric: string; body: string };
  fraud: { title: string; metric: string; body: string };
}

const LAYERS: Layer[] = [
  {
    name: "GPS Geofence",
    icon: MapPin,
    short: "Location check",
    real: {
      title: "Inspector is at the site.",
      metric: "0 m from site center · within 100 m radius",
      body: "Haversine distance between the captured GPS and the registered project coordinates is under the geofence threshold. The phone is physically at the construction site.",
    },
    fraud: {
      title: "Location is wrong.",
      metric: "2.5 km from site center · threshold 100 m",
      body: "The capture GPS is nowhere near the registered project coordinates. Whoever uploaded this is not at the site — or is using a GPS-spoofing app.",
    },
  },
  {
    name: "Human Motion",
    icon: Activity,
    short: "Tremor detection",
    real: {
      title: "A real hand is holding the phone.",
      metric: "variance 0.45 m/s² · pass zone 0.001–1.0",
      body: "Accelerometer variance during the 15-second capture shows natural human tremor. A phone resting on a tripod or a stationary rig would read near zero; violent shaking would read above one. This reads like a hand.",
    },
    fraud: {
      title: "The phone didn't move.",
      metric: "variance 0.0001 m/s² · pass zone 0.001–1.0",
      body: "Accelerometer variance is orders of magnitude below human tremor. The device was stationary — tripod, car mount, or on a table pointed at a screen. Not a real handheld capture.",
    },
  },
  {
    name: "Sensor-Camera Consistency",
    icon: Video,
    short: "The screen-replay killer",
    real: {
      title: "What the camera sees matches how the phone moved.",
      metric: "scene change 7 bits/pair · threshold 3",
      body: "Six frames sampled across the recording show substantial pixel-level change — parallax, operator walking, lighting shift. The visible motion is consistent with the phone's inertial signal.",
    },
    fraud: {
      title: "The camera saw nothing, but something said it moved.",
      metric: "scene change 0.2 bits/pair · threshold 3",
      body: "Frames are nearly identical. The camera was aimed at a static scene — almost certainly a laptop or TV playing back old construction footage. Classic screen-replay attack.",
    },
  },
  {
    name: "Unique Photo",
    icon: Fingerprint,
    short: "Duplicate detection",
    real: {
      title: "This photo hasn't been submitted before.",
      metric: "nearest match 58 / 64 bits Hamming",
      body: "Perceptual hash of the capture compared against every prior submission in the bank's evidence pool. No close match — this is a fresh photo, not a recycled one from a previous milestone.",
    },
    fraud: {
      title: "We've seen this photo before.",
      metric: "nearest match 0 / 64 bits Hamming",
      body: "Perceptual hash is identical to an earlier submission for this or another project. The developer is recycling evidence across milestones — which wouldn't be a problem if the construction actually progressed.",
    },
  },
  {
    name: "Challenge Code",
    icon: KeyRound,
    short: "Freshness proof",
    real: {
      title: "The paper code matches today's.",
      metric: "code HE76 · submitted 12 s after issue · window 30 s",
      body: "The server issued a random 4-character code 12 seconds before capture. The inspector wrote it on paper and held it in the first frame. Match + in-window — this capture is happening now, not being replayed.",
    },
    fraud: {
      title: "Wrong code — or the window closed.",
      metric: "expected HE76 · got XXXX · 15 minutes stale",
      body: "Either the code doesn't match today's (someone replayed an old capture) or the 30-second window expired. A genuine inspector would have the paper in hand and submit within seconds.",
    },
  },
  {
    name: "AI Progress Match",
    icon: Sparkles,
    short: "Gemini reviews the image",
    real: {
      title: "The photo shows what was claimed.",
      metric: "verdict YES · weight 0.10 (advisory)",
      body: 'Google Gemini looked at the image and compared it against the claimed milestone. Response: "Multi-storey reinforced concrete frame at mid-construction; scaffolding and floor slabs visible — consistent with the claimed stage."',
    },
    fraud: {
      title: "The photo doesn't match the milestone.",
      metric: "verdict NO · narrator fires next",
      body: 'Gemini: "Static dark frame with grainy uniform texture — consistent with a playback screen, not a live scene." On a FLAGGED verdict, the narrator writes a 2-sentence explanation the bank officer reads in seconds.',
    },
  },
];

const CYCLE_MS = 1400;

export function PipelineDemo() {
  const [scenario, setScenario] = useState<Scenario>("fraud");
  const [activeIdx, setActiveIdx] = useState(0);
  const [playing, setPlaying] = useState(true);

  // Auto-advance
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setActiveIdx((i) => {
        if (i < LAYERS.length - 1) return i + 1;
        // End of cycle — flip scenario and reset
        setScenario((s) => (s === "fraud" ? "real" : "fraud"));
        return 0;
      });
    }, CYCLE_MS);
    return () => clearInterval(id);
  }, [playing]);

  const jumpTo = useCallback((idx: number) => {
    setPlaying(false);
    setActiveIdx(idx);
  }, []);

  const flip = useCallback(() => {
    setScenario((s) => (s === "fraud" ? "real" : "fraud"));
    setActiveIdx(0);
  }, []);

  const statusFor = (idx: number): LayerStatus => {
    if (idx > activeIdx) return "pending";
    if (idx === activeIdx) return "active";
    return scenario === "real" ? "passed" : "failed";
  };

  // Coverage = percent of layers that have been revealed (active or past)
  const coverage = Math.round(((activeIdx + 1) / LAYERS.length) * 100);

  const current = LAYERS[activeIdx];
  const detail = scenario === "real" ? current.real : current.fraud;

  return (
    <div className="rounded-2xl border border-hairline-subtle bg-surface-card overflow-hidden">
      {/* Control strip */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-hairline-subtle">
        <div className="flex items-center gap-2 text-caption text-ink-tertiary">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
          Live demonstration of the Tasdiq fraud pipeline
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={flip}
            className="text-micro uppercase tracking-wide rounded-md border border-hairline-strong px-3 h-8 text-ink-secondary hover:text-ink hover:border-accent/50 transition-colors"
          >
            {scenario === "real"
              ? "Switch to FRAUD capture"
              : "Switch to REAL capture"}
          </button>
          <button
            onClick={() => setPlaying((p) => !p)}
            className="rounded-md border border-hairline-strong w-8 h-8 inline-flex items-center justify-center text-ink-secondary hover:text-ink hover:border-accent/50 transition-colors"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause size={14} /> : <Play size={14} />}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[minmax(260px,320px)_1fr]">
        {/* LEFT — progress tracker */}
        <div className="border-r border-hairline-subtle bg-surface-subtle/30 p-6 space-y-6">
          <div>
            <div className="text-micro uppercase tracking-[0.14em] text-ink-muted">
              Fraud Pipeline
            </div>
            <div className="mt-3 flex items-baseline justify-between">
              <span className="text-micro uppercase tracking-[0.14em] text-ink-muted">
                Coverage
              </span>
              <span
                className={`font-mono text-body font-semibold tabular-nums ${
                  scenario === "real" ? "text-state-verified" : "text-state-flagged"
                }`}
              >
                {coverage}%
              </span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-surface-elevated overflow-hidden">
              <motion.div
                className={`h-full ${
                  scenario === "real" ? "bg-state-verified" : "bg-state-flagged"
                }`}
                initial={false}
                animate={{ width: `${coverage}%` }}
                transition={{ duration: 0.4, ease: "easeOut" }}
              />
            </div>
          </div>

          <ol className="space-y-2">
            {LAYERS.map((layer, idx) => (
              <LayerRow
                key={layer.name}
                layer={layer}
                idx={idx}
                scenario={scenario}
                status={statusFor(idx)}
                onClick={() => jumpTo(idx)}
              />
            ))}
          </ol>
        </div>

        {/* RIGHT — detail reveal */}
        <div className="p-6 sm:p-10 min-h-[420px] flex flex-col">
          <div className="text-micro uppercase tracking-[0.14em] text-ink-muted mb-4">
            Layer {activeIdx + 1} of {LAYERS.length} · {current.name}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={`${scenario}-${activeIdx}`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="flex-1 flex flex-col"
            >
              {/* Highlight block — left accent bar + metric */}
              <div
                className={`border-l-4 rounded-r-lg py-4 px-5 ${
                  scenario === "real"
                    ? "border-state-verified bg-state-verified-bg"
                    : "border-state-flagged bg-state-flagged-bg"
                }`}
              >
                <div className="text-heading-2 text-ink leading-tight">
                  {detail.title}
                </div>
                <div
                  className={`mt-2 font-mono text-caption ${
                    scenario === "real" ? "text-state-verified" : "text-state-flagged"
                  }`}
                >
                  {detail.metric}
                </div>
              </div>

              <p className="mt-6 text-body text-ink-secondary leading-relaxed max-w-2xl">
                {detail.body}
              </p>

              {/* Footer verdict — appears when last layer is active */}
              {activeIdx === LAYERS.length - 1 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="mt-auto pt-6 flex items-center gap-3"
                >
                  <div
                    className={`rounded-full px-3 py-1 text-micro font-semibold uppercase ${
                      scenario === "real"
                        ? "bg-state-verified/15 text-state-verified border border-state-verified/30"
                        : "bg-state-flagged/15 text-state-flagged border border-state-flagged/30"
                    }`}
                  >
                    {scenario === "real" ? "✓ Verified" : "⚠ Flagged"}
                  </div>
                  <div className="text-caption text-ink-tertiary">
                    {scenario === "real"
                      ? "Aggregate score 1.00 · state → AUTO_VERIFIED"
                      : "Hard-fail triggered by 5 algorithmic layers · state → FLAGGED · narrator fires"}
                  </div>
                </motion.div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function LayerRow({
  layer,
  idx,
  scenario,
  status,
  onClick,
}: {
  layer: Layer;
  idx: number;
  scenario: Scenario;
  status: LayerStatus;
  onClick: () => void;
}) {
  const Icon = layer.icon;
  const isActive = status === "active";
  const isPassed = status === "passed";
  const isFailed = status === "failed";
  const isPending = status === "pending";

  const rowBg = isActive
    ? scenario === "real"
      ? "bg-state-verified-bg border border-state-verified/30"
      : "bg-state-flagged-bg border border-state-flagged/30"
    : "border border-transparent hover:bg-surface-elevated/50";

  return (
    <li>
      <button
        onClick={onClick}
        className={`w-full text-left px-3 py-2 rounded-md transition-colors ${rowBg}`}
      >
        <div className="flex items-center gap-3">
          <div
            className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
              isPassed
                ? "bg-state-verified text-[#04130B]"
                : isFailed
                  ? "bg-state-flagged text-white"
                  : isActive
                    ? scenario === "real"
                      ? "border-2 border-state-verified"
                      : "border-2 border-state-flagged"
                    : "border border-hairline-strong"
            }`}
          >
            {isPassed ? (
              <Check size={12} strokeWidth={3} />
            ) : isFailed ? (
              <X size={12} strokeWidth={3} />
            ) : isActive ? (
              <Circle size={8} className="fill-current" />
            ) : null}
          </div>
          <Icon
            size={14}
            className={
              isPending
                ? "text-ink-muted"
                : isActive
                  ? "text-ink"
                  : isPassed
                    ? "text-state-verified"
                    : "text-state-flagged"
            }
          />
          <div className="flex-1 min-w-0">
            <div
              className={`text-caption font-medium ${
                isPending ? "text-ink-muted" : "text-ink"
              }`}
            >
              {layer.name}
            </div>
            <div className="text-micro text-ink-muted uppercase tracking-wide mt-0.5">
              {isPending
                ? "pending"
                : isActive
                  ? "running…"
                  : isPassed
                    ? "passed"
                    : "failed"}
            </div>
          </div>
          <span className="text-micro text-ink-muted font-mono">
            L{idx + 1}
          </span>
        </div>
      </button>
    </li>
  );
}
