"use client";

import type { WorkflowState } from "@/lib/types";
import { Check } from "lucide-react";

// Horizontal state stepper for tranche_verification.
// Uses design tokens. Active step pulses per the spec.

const HAPPY_PATH: WorkflowState[] = [
  "EVIDENCE_REQUESTED",
  "CAPTURED",
  "AUTO_VERIFIED",
  "APPROVED",
  "EXPORTED",
  "BANK_ACCEPTED",
];

const LABELS: Record<WorkflowState, string> = {
  DRAFT: "Draft",
  EVIDENCE_REQUESTED: "Evidence",
  CAPTURED: "Captured",
  AUTO_VERIFIED: "Auto-verified",
  FLAGGED: "Flagged",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  EXPORTED: "Exported",
  BANK_ACCEPTED: "Bank accepted",
  BANK_REJECTED: "Bank rejected",
};

const FORK_AT: Partial<Record<WorkflowState, WorkflowState>> = {
  FLAGGED: "AUTO_VERIFIED",
  REJECTED: "APPROVED",
  BANK_REJECTED: "BANK_ACCEPTED",
};

export function StateStepper({ state }: { state: WorkflowState }) {
  const onHappyPath = HAPPY_PATH.includes(state);
  const effectiveAnchor = onHappyPath ? state : FORK_AT[state] ?? "EVIDENCE_REQUESTED";
  const currentIdx = HAPPY_PATH.indexOf(effectiveAnchor);

  return (
    <div className="w-full">
      <ol className="flex items-center gap-0 w-full overflow-x-auto">
        {HAPPY_PATH.map((step, idx) => {
          const done = idx < currentIdx;
          const active = idx === currentIdx;
          const isForkHere = !onHappyPath && idx === currentIdx;
          return (
            <li key={step} className="flex items-center flex-1 min-w-0">
              <div className="flex flex-col items-center min-w-0 shrink-0">
                <div
                  className={`
                    h-8 w-8 rounded-full flex items-center justify-center text-caption font-bold shrink-0
                    transition-colors duration-page
                    ${isForkHere
                      ? "bg-state-flagged text-white"
                      : active
                        ? "bg-accent text-[#04130B] dot-pulse"
                        : done
                          ? "bg-state-verified/20 text-state-verified border border-state-verified/40"
                          : "bg-surface-elevated text-ink-muted border border-hairline-subtle"
                    }
                  `}
                >
                  {done ? <Check size={16} /> : idx + 1}
                </div>
                <div
                  className={`
                    mt-1.5 text-micro text-center w-20 leading-tight uppercase
                    ${isForkHere
                      ? "text-state-flagged"
                      : active
                        ? "text-ink"
                        : done
                          ? "text-ink-secondary"
                          : "text-ink-muted"}
                  `}
                >
                  {isForkHere ? LABELS[state] : LABELS[step]}
                </div>
              </div>
              {idx < HAPPY_PATH.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-2 mb-6 transition-colors duration-page ${
                    idx < currentIdx ? "bg-state-verified/60" : "bg-hairline-subtle"
                  }`}
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
