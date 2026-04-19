"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Butterfly landing explainer.
//
// Deliberately different from the Tasdiq pipeline demo:
//   - White surface (Butterfly .theme-butterfly), blue accent
//   - Slower pacing — ~8 s per cycle, contemplative not technical
//   - No progress bar, no checklist, no technical metrics
//   - Split-screen: humanized narrative on the left (what happened),
//     stripped ledger entry on the right (what got recorded)
//   - Big counter at bottom ticks up each cycle, matching Screen 1
//
// The contrast between the two sides IS the pitch. The left column
// carries everything a manager or employee would remember. The right
// column carries what survives — an anonymous row of aggregate data
// plus a SHA-256 hash. Nothing in the right column can identify
// anything in the left column.

interface Scenario {
  narrative: string[];
  routing: "eap" | "988" | "counselor" | "self_resolved" | "declined";
  routingLabel: string;
  accepted: boolean;
}

// Each entry plays through the full animation cycle before we pick another.
// Kept deliberately varied so repeat viewers see different check-ins.
const SCENARIOS: Scenario[] = [
  {
    narrative: [
      "A manager noticed their teammate had gone quiet in the last two stand-ups.",
      "They caught them in the break room and asked how they were doing.",
      "The manager offered the EAP number. They called it together from the manager's phone.",
    ],
    routing: "eap",
    routingLabel: "Referred to EAP",
    accepted: true,
  },
  {
    narrative: [
      "A team lead found out their colleague was going through a divorce.",
      "They stepped outside the office, sat on a bench for twenty minutes.",
      "The team lead shared the 988 number. They dialled it together. The colleague accepted.",
    ],
    routing: "988",
    routingLabel: "Called 988 together",
    accepted: true,
  },
  {
    narrative: [
      "An employee mentioned panic attacks during a one-on-one.",
      "Their manager listened. No advice, no interruption.",
      "The manager offered the internal counselor. The employee took the referral.",
    ],
    routing: "counselor",
    routingLabel: "Connected with counselor",
    accepted: true,
  },
  {
    narrative: [
      "A teammate seemed tense after a difficult client call.",
      "Their peer pulled them aside. They talked for ten minutes.",
      "The teammate said they'd be okay — they just needed a moment.",
    ],
    routing: "self_resolved",
    routingLabel: "Self-resolved — a moment",
    accepted: false,
  },
  {
    narrative: [
      "A manager noticed signs of burnout in a senior engineer.",
      "They approached gently. Offered EAP, the counselor, a day off.",
      "The engineer thanked them but declined. Said they'd reach out if needed.",
    ],
    routing: "declined",
    routingLabel: "Declined all support",
    accepted: false,
  },
];

// Rough cycle timing (ms). Each narrative line dwells ~1.8 s, then a 1 s
// beat before the ledger appears, then 2 s on the ledger + counter, then
// a short rest.
const LINE_DWELL = 1800;
const BEAT = 900;
const LEDGER_HOLD = 2400;
const REST = 800;

type Phase = "narrative" | "transition" | "ledger" | "rest";

export function ButterflyDemo() {
  const [cycleIdx, setCycleIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>("narrative");
  const [lineIdx, setLineIdx] = useState(0);
  const [count, setCount] = useState(246);

  const scenario = SCENARIOS[cycleIdx % SCENARIOS.length];

  // Drive the animation phases manually with timeouts so we can control the
  // beats precisely between lines, transition, ledger, rest.
  useEffect(() => {
    if (phase === "narrative") {
      if (lineIdx < scenario.narrative.length - 1) {
        const t = setTimeout(() => setLineIdx((i) => i + 1), LINE_DWELL);
        return () => clearTimeout(t);
      }
      // Last line has dwelled; go to transition
      const t = setTimeout(() => setPhase("transition"), LINE_DWELL);
      return () => clearTimeout(t);
    }
    if (phase === "transition") {
      const t = setTimeout(() => setPhase("ledger"), BEAT);
      return () => clearTimeout(t);
    }
    if (phase === "ledger") {
      // Tick the count up right as the ledger appears
      setCount((c) => c + 1);
      const t = setTimeout(() => setPhase("rest"), LEDGER_HOLD);
      return () => clearTimeout(t);
    }
    // rest
    const t = setTimeout(() => {
      setCycleIdx((i) => i + 1);
      setLineIdx(0);
      setPhase("narrative");
    }, REST);
    return () => clearTimeout(t);
  }, [phase, lineIdx, scenario.narrative.length]);

  const narrativeVisible = phase === "narrative" || phase === "transition";
  const ledgerVisible = phase === "ledger" || phase === "rest";

  const demoTimestamp = formatQuarterStamp();
  const demoHash = `${Math.floor(count * 7919).toString(16).padStart(6, "0")}${Math.floor(count * 1259).toString(16).padStart(6, "0")}…`;

  return (
    <div className="theme-butterfly rounded-[28px] bg-[color:var(--bf-bg)] border border-[color:var(--bf-hair)] overflow-hidden">
      {/* Header — a single, quiet line. No controls, no chrome. */}
      <div className="px-8 pt-8">
        <div className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--bf-caption)]">
          Butterfly · an anonymised check-in
        </div>
      </div>

      {/* Two columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-0 min-h-[340px]">
        {/* LEFT — the narrative. Serif-ish, italic, fading. */}
        <div className="px-8 py-10 md:border-r md:border-[color:var(--bf-hair)] flex flex-col">
          <div className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--bf-caption)] mb-6">
            What happened
          </div>
          <div className="flex-1 space-y-5 relative">
            <AnimatePresence mode="sync">
              {narrativeVisible &&
                scenario.narrative.slice(0, lineIdx + 1).map((line, i) => (
                  <motion.p
                    key={`${cycleIdx}-${i}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: phase === "transition" ? 0.25 : 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="text-[18px] leading-[1.55] text-[color:var(--bf-ink)]"
                    style={{ fontStyle: i === lineIdx ? "normal" : "italic" }}
                  >
                    {line}
                  </motion.p>
                ))}
            </AnimatePresence>

            {/* Once ledger is shown, leave a whispering line on the left */}
            {ledgerVisible && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="text-[14px] italic text-[color:var(--bf-caption)] pt-2 border-t border-[color:var(--bf-hair)]"
              >
                None of this was recorded.
              </motion.div>
            )}
          </div>
        </div>

        {/* RIGHT — the ledger entry. Monospace, clinical, brief. */}
        <div className="px-8 py-10 bg-[color:var(--bf-bg-muted)] flex flex-col">
          <div className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--bf-caption)] mb-6">
            What got logged
          </div>
          <div className="flex-1 flex flex-col justify-center">
            <AnimatePresence mode="wait">
              {ledgerVisible ? (
                <motion.div
                  key={`ledger-${cycleIdx}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5 }}
                  className="space-y-4"
                >
                  <div className="rounded-2xl border border-[color:var(--bf-hair)] bg-[color:var(--bf-bg)] p-5 space-y-3">
                    <div className="font-mono text-[13px] text-[color:var(--bf-ink)] leading-[1.8]">
                      <KeyValue k="event_type" v="checkin_initiated" />
                      <KeyValue k="timestamp" v={demoTimestamp} />
                      <KeyValue k="routing_type" v={scenario.routing} />
                      <KeyValue
                        k="accepted"
                        v={scenario.accepted ? "true" : "false"}
                      />
                      <KeyValue k="actor_id" v="null" dim />
                    </div>
                  </div>
                  <div className="font-mono text-[11px] text-[color:var(--bf-caption)] break-all leading-relaxed">
                    sha256:{demoHash}
                  </div>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    className="text-[13px] text-[color:var(--bf-muted)] leading-relaxed"
                  >
                    No names. No descriptions. No health data. The row auto-
                    purges after 90 days — only the aggregate count survives.
                  </motion.div>
                </motion.div>
              ) : (
                <motion.div
                  key="ledger-wait"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="text-[14px] italic text-[color:var(--bf-caption)]"
                >
                  Waiting for the check-in to complete…
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Bottom — the one number. */}
      <div className="border-t border-[color:var(--bf-hair)] px-8 py-8 flex items-end justify-between gap-6">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--bf-caption)]">
            This quarter, across deployments
          </div>
          <div className="flex items-baseline gap-3 mt-2">
            <motion.span
              key={count}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="text-[52px] sm:text-[72px] font-bold tabular-nums text-[color:var(--bf-ink)] leading-none tracking-tight"
            >
              {count.toLocaleString()}
            </motion.span>
            <span className="text-[18px] text-[color:var(--bf-muted)]">
              check-ins logged
            </span>
          </div>
        </div>
        <div className="hidden sm:block text-right text-[13px] text-[color:var(--bf-caption)] max-w-[200px] leading-relaxed">
          A quiet infrastructure of people showing up.
        </div>
      </div>
    </div>
  );
}

function KeyValue({ k, v, dim = false }: { k: string; v: string; dim?: boolean }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-[color:var(--bf-caption)] shrink-0 w-28">{k}</span>
      <span
        className={dim ? "text-[color:var(--bf-caption)] italic" : "text-[color:var(--bf-ink)]"}
      >
        {v}
      </span>
    </div>
  );
}

function formatQuarterStamp(): string {
  const now = new Date();
  const y = now.getFullYear();
  const q = Math.floor(now.getMonth() / 3) + 1;
  // Emit a truncated timestamp — deliberately not precise enough to
  // identify an individual submission, matching the spec's aggregation.
  return `${y}-Q${q}`;
}
