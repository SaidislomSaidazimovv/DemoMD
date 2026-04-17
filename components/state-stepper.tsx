"use client";

import type { WorkflowState } from "@/lib/types";

// Horizontal state stepper for tranche_verification.
// Shows the happy-path progression with the current state highlighted. If the
// workflow is in a fork state (FLAGGED / REJECTED / BANK_REJECTED), that is
// rendered as an inline annotation at the relevant step.

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
  EVIDENCE_REQUESTED: "Evidence requested",
  CAPTURED: "Captured",
  AUTO_VERIFIED: "Auto-verified",
  FLAGGED: "Flagged",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  EXPORTED: "Exported",
  BANK_ACCEPTED: "Bank accepted",
  BANK_REJECTED: "Bank rejected",
};

// Map off-path states to the step they belong near.
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
              <div className="flex flex-col items-center min-w-0">
                <div
                  className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    isForkHere
                      ? "bg-rose-600 text-white"
                      : active
                        ? "bg-emerald-500 text-emerald-950"
                        : done
                          ? "bg-emerald-900/70 text-emerald-300 border border-emerald-700"
                          : "bg-slate-800 text-slate-500 border border-slate-700"
                  }`}
                >
                  {done ? "✓" : idx + 1}
                </div>
                <div
                  className={`mt-1 text-[10px] text-center w-20 leading-tight ${
                    isForkHere
                      ? "text-rose-300"
                      : active
                        ? "text-emerald-300"
                        : done
                          ? "text-slate-300"
                          : "text-slate-500"
                  }`}
                >
                  {isForkHere ? LABELS[state] : LABELS[step]}
                </div>
              </div>
              {idx < HAPPY_PATH.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-1 mb-4 ${
                    idx < currentIdx ? "bg-emerald-700" : "bg-slate-800"
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
