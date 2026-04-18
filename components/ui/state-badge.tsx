import type { WorkflowState } from "@/lib/types";

// Per spec: amber (DRAFT/EVIDENCE_REQUESTED), blue (CAPTURED),
// green (AUTO_VERIFIED/APPROVED/BANK_ACCEPTED), red (FLAGGED/REJECTED/BANK_REJECTED),
// purple (EXPORTED). Pill shape, micro caps.

type Tone = "pending" | "info" | "verified" | "flagged" | "exported" | "neutral";

const TONE_OF_STATE: Partial<Record<WorkflowState, Tone>> = {
  DRAFT: "neutral",
  EVIDENCE_REQUESTED: "pending",
  CAPTURED: "info",
  AUTO_VERIFIED: "verified",
  APPROVED: "verified",
  BANK_ACCEPTED: "verified",
  FLAGGED: "flagged",
  REJECTED: "flagged",
  BANK_REJECTED: "flagged",
  EXPORTED: "exported",
};

const TONE_CLS: Record<Tone, string> = {
  pending: "bg-state-pending-bg text-state-pending border-state-pending/30",
  info: "bg-state-info-bg text-state-info border-state-info/30",
  verified: "bg-state-verified-bg text-state-verified border-state-verified/30",
  flagged: "bg-state-flagged-bg text-state-flagged border-state-flagged/30",
  exported: "bg-[rgba(147,51,234,0.10)] text-[#C4B5FD] border-[#7C3AED]/30",
  neutral: "bg-surface-elevated text-ink-tertiary border-hairline-strong",
};

const LABEL: Partial<Record<WorkflowState, string>> = {
  EVIDENCE_REQUESTED: "Evidence requested",
  AUTO_VERIFIED: "Auto-verified",
  BANK_ACCEPTED: "Bank accepted",
  BANK_REJECTED: "Bank rejected",
};

export function StateBadge({
  state,
  className = "",
}: {
  state: WorkflowState | string;
  className?: string;
}) {
  const tone = TONE_OF_STATE[state as WorkflowState] ?? "neutral";
  const label =
    LABEL[state as WorkflowState] ??
    String(state)
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/^./, (c) => c.toUpperCase());
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-micro uppercase ${TONE_CLS[tone]} ${className}`}
    >
      {label}
    </span>
  );
}

export function VerdictPill({
  verdict,
  className = "",
}: {
  verdict: "VERIFIED" | "FLAGGED";
  className?: string;
}) {
  const isVerified = verdict === "VERIFIED";
  const cls = isVerified
    ? "bg-state-verified-bg text-state-verified border-state-verified/40"
    : "bg-state-flagged-bg text-state-flagged border-state-flagged/40";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-micro uppercase ${cls} ${className}`}
    >
      {isVerified ? "✓ Verified" : "⚠ Flagged"}
    </span>
  );
}
