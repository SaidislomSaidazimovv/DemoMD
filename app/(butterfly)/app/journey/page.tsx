"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { JourneyPanel } from "@/components/butterfly/journey-panel";
import { WorldMapLights } from "@/components/butterfly/world-map-lights";
import { BfButton } from "@/components/butterfly/ui";
import { useRequireRole } from "@/lib/hooks";

// Screen 2 — The Journey.
// Scroll-driven, five panels. Per spec: "panel 1 is somber, 2 is practical,
// 3 is technical, 4 is uplifting, 5 is assurance." 60 seconds of scroll
// compressing the story of the protocol.

export default function ButterflyJourneyPage() {
  const { session, loading } = useRequireRole(["hr_admin", "manager", "responder", "admin"]);

  if (loading || !session) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-[color:var(--bf-caption)]">
        Loading…
      </div>
    );
  }

  return (
    <div className="bf-fade-in">
      <JourneyPanel>
        <Panel1Signal />
      </JourneyPanel>

      <JourneyPanel>
        <Panel2Protocol />
      </JourneyPanel>

      <JourneyPanel>
        <Panel3Ledger />
      </JourneyPanel>

      <JourneyPanel>
        <Panel4Scale />
      </JourneyPanel>

      <JourneyPanel>
        <Panel5Proof />
      </JourneyPanel>
    </div>
  );
}

// ===========================================================
// Panel 1 — The signal
// ===========================================================
function Panel1Signal() {
  return (
    <>
      {/* Minimal flat SVG — chair + figure, no photos of people */}
      <div className="mx-auto mb-10" aria-hidden>
        <svg width="180" height="180" viewBox="0 0 180 180" fill="none">
          <rect x="30" y="100" width="60" height="8" fill="#E9E9EF" />
          <rect x="34" y="108" width="6" height="36" fill="#E9E9EF" />
          <rect x="80" y="108" width="6" height="36" fill="#E9E9EF" />
          <rect x="30" y="60" width="8" height="48" fill="#E9E9EF" />
          <circle cx="130" cy="80" r="14" fill="#D1D1D6" />
          <rect x="118" y="94" width="24" height="38" rx="10" fill="#D1D1D6" />
        </svg>
      </div>
      <p className="text-[28px] sm:text-[36px] font-semibold text-[color:var(--bf-ink)] leading-[1.2] tracking-tight">
        Someone on your team is struggling.
      </p>
      <p className="mt-4 text-[22px] text-[color:var(--bf-muted)]">
        Your manager noticed.
      </p>
    </>
  );
}

// ===========================================================
// Panel 2 — The protocol
// ===========================================================
function Panel2Protocol() {
  const taps = [
    { label: "Tap 1", text: "Log a check-in" },
    { label: "Tap 2", text: "Routed to EAP" },
    { label: "Tap 3", text: "Resource accepted" },
  ];
  return (
    <>
      <div className="text-[13px] uppercase tracking-[0.14em] text-[color:var(--bf-caption)] mb-8">
        The protocol
      </div>
      <div className="mx-auto flex items-start gap-8 justify-center">
        {/* Phone mock */}
        <div className="relative w-[200px] h-[340px] rounded-[28px] border border-[color:var(--bf-hair)] bg-[color:var(--bf-bg-muted)] flex items-center justify-center">
          <div className="text-[14px] text-[color:var(--bf-caption)] px-6 text-center">
            Butterfly check-in
          </div>
          <div className="absolute bottom-6 left-6 right-6 h-12 rounded-full bg-[color:var(--bf-accent)]" />
        </div>
      </div>
      <div className="mt-10 space-y-3 text-left max-w-sm mx-auto">
        {taps.map((tap, i) => (
          <motion.div
            key={tap.label}
            initial={{ opacity: 0, x: -8 }}
            whileInView={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 + i * 0.25, duration: 0.4 }}
            viewport={{ once: true, margin: "-100px" }}
            className="flex items-baseline gap-3 text-[18px]"
          >
            <span className="text-[13px] uppercase tracking-[0.14em] text-[color:var(--bf-caption)] w-14 shrink-0">
              {tap.label}
            </span>
            <span className="text-[color:var(--bf-ink)]">{tap.text}</span>
          </motion.div>
        ))}
      </div>
      <p className="mt-10 text-[15px] text-[color:var(--bf-muted)] italic">
        Ten seconds of interaction. No names. No descriptions.
      </p>
    </>
  );
}

// ===========================================================
// Panel 3 — The ledger
// ===========================================================
function Panel3Ledger() {
  // Deterministic demo hash — not tied to a real event, but looks real.
  const demoLine = "2026-04-18T14:22Z · checkin_initiated · routed:eap · accepted:true";
  const demoHash =
    "7f3a9b2c1d8e0f4a6b5c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b6c5d4e3f2a";
  return (
    <>
      <div className="text-[13px] uppercase tracking-[0.14em] text-[color:var(--bf-caption)] mb-8">
        The ledger
      </div>
      <div className="mx-auto max-w-xl bg-[color:var(--bf-bg-muted)] border border-[color:var(--bf-hair)] rounded-2xl p-5">
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="font-mono text-[13px] text-[color:var(--bf-ink)] break-all leading-[1.8]"
        >
          {demoLine}
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.8 }}
          viewport={{ once: true }}
          className="mt-3 font-mono text-[11px] text-[color:var(--bf-caption)] break-all"
        >
          sha256: {demoHash}
        </motion.div>
      </div>
      <p className="mt-10 text-[18px] text-[color:var(--bf-ink)]">
        Cryptographically sealed. Tamper-evident.
      </p>
      <p className="mt-2 text-[18px] text-[color:var(--bf-muted)]">
        Nobody sees who. The organization sees that it happened.
      </p>
    </>
  );
}

// ===========================================================
// Panel 4 — The scale
// ===========================================================
function Panel4Scale() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    // Subtle count-up that runs when the panel comes into view.
    // Not precise timing — sync'd to the world map's fade sequence.
    const target = 247;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 1800);
      const eased = 1 - Math.pow(1 - t, 3);
      setCount(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <>
      <div className="text-[13px] uppercase tracking-[0.14em] text-[color:var(--bf-caption)] mb-6">
        The scale
      </div>
      <div className="max-w-3xl mx-auto mb-8">
        <WorldMapLights />
      </div>
      <p className="text-[28px] sm:text-[36px] font-semibold text-[color:var(--bf-ink)] tracking-tight tabular-nums">
        {count.toLocaleString()} this quarter.
      </p>
      <p className="mt-2 text-[20px] text-[color:var(--bf-muted)]">
        8,000 across deployments.
      </p>
      <p className="mt-6 text-[16px] text-[color:var(--bf-muted)] italic max-w-md mx-auto">
        A quiet infrastructure of people showing up.
      </p>
    </>
  );
}

// ===========================================================
// Panel 5 — The proof
// ===========================================================
function Panel5Proof() {
  return (
    <>
      <div className="text-[13px] uppercase tracking-[0.14em] text-[color:var(--bf-caption)] mb-8">
        The proof
      </div>
      {/* Simulated PDF preview — wire to real /app/reports later */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        whileInView={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.7 }}
        viewport={{ once: true }}
        className="mx-auto w-[280px] h-[360px] rounded-2xl border border-[color:var(--bf-hair)] bg-[color:var(--bf-bg)] p-6 text-left"
      >
        <div className="text-[10px] uppercase tracking-[0.14em] text-[color:var(--bf-caption)]">
          Butterfly · Q1 2026
        </div>
        <div className="mt-3 text-[16px] font-semibold text-[color:var(--bf-ink)] leading-tight">
          Protocol Deployment Report
        </div>
        <div className="mt-4 space-y-2 text-[11px] text-[color:var(--bf-muted)]">
          <div>247 check-ins logged</div>
          <div>92% manager coverage</div>
          <div>74% resource acceptance</div>
        </div>
        <div className="mt-5 h-px bg-[color:var(--bf-hair)]" />
        <div className="mt-3 text-[9px] text-[color:var(--bf-caption)] font-mono break-all">
          anchor: 7f3a9b2c1d8e0f4a…
        </div>
      </motion.div>
      <div className="mt-10 space-y-2">
        <p className="text-[18px] text-[color:var(--bf-ink)]">Hash-chain verified. OSHA posture documented.</p>
        <p className="text-[18px] text-[color:var(--bf-muted)]">
          Zero PHI collected. Zero logs used in discipline.
        </p>
      </div>
      <div className="mt-10">
        <Link href="/app/reports">
          <BfButton variant="primary">Download the report</BfButton>
        </Link>
      </div>
    </>
  );
}
