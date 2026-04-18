"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

// KPI card — count-up on mount per the spec's animation rules.
// Use tone="neutral" by default; flip to verified/flagged/pending only when
// the number itself tells a story (e.g. "0 flagged" deserves muted; "3 flagged"
// deserves a red tint).

type Tone = "neutral" | "verified" | "pending" | "flagged" | "info";

const TONE: Record<Tone, string> = {
  neutral: "border-hairline-subtle bg-surface-card",
  verified: "border-state-verified/20 bg-state-verified-bg",
  pending: "border-state-pending/20 bg-state-pending-bg",
  flagged: "border-state-flagged/20 bg-state-flagged-bg",
  info: "border-state-info/20 bg-state-info-bg",
};

export function Kpi({
  label,
  value,
  sub,
  tone = "neutral",
  icon,
  animateFrom = 0,
  durationMs = 800,
}: {
  label: string;
  value: number | string;
  sub?: string;
  tone?: Tone;
  icon?: ReactNode;
  animateFrom?: number;
  durationMs?: number;
}) {
  const isNumeric = typeof value === "number";
  const [display, setDisplay] = useState<number | string>(
    isNumeric ? animateFrom : value
  );

  useEffect(() => {
    if (!isNumeric) return;
    const target = value as number;
    if (target === animateFrom) {
      setDisplay(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(animateFrom + (target - animateFrom) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isNumeric, value, animateFrom, durationMs]);

  return (
    <div className={`rounded-lg border p-6 ${TONE[tone]}`}>
      <div className="flex items-center justify-between">
        <div className="text-micro uppercase text-ink-tertiary">{label}</div>
        {icon && <div className="text-ink-muted">{icon}</div>}
      </div>
      <div className="text-[40px] leading-tight font-bold text-ink mt-2 tabular-nums">
        {typeof display === "number" ? display.toLocaleString() : display}
      </div>
      {sub && <div className="text-caption text-ink-tertiary mt-1">{sub}</div>}
    </div>
  );
}
