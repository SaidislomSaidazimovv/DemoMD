import type { FraudCheck, FraudResult } from "@/lib/types";
import { CheckCircle2, XCircle } from "lucide-react";

// Demo Control is our template. These components are the single source of
// truth for fraud score + layer breakdown rendering — reuse them anywhere.

export function FraudScoreBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(1, score)) * 100;
  const tone =
    score >= 0.7
      ? "bg-state-verified"
      : score >= 0.4
        ? "bg-state-pending"
        : "bg-state-flagged";
  return (
    <div className="w-full">
      <div className="flex justify-between text-caption text-ink-tertiary mb-1.5">
        <span>Aggregate fraud score</span>
        <span className="font-mono text-ink-secondary">{score.toFixed(2)} / 1.00</span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-surface-elevated overflow-hidden">
        <div
          className={`h-full ${tone} transition-all duration-page ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-micro text-ink-muted mt-1.5 uppercase">
        <span>0.00</span>
        <span className="text-ink-tertiary normal-case">
          threshold 0.70 {score >= 0.7 ? "✓" : "✗"}
        </span>
        <span>1.00</span>
      </div>
    </div>
  );
}

export function FraudCheckList({ result }: { result: FraudResult }) {
  return (
    <ol className="space-y-2">
      {result.checks.map((c, idx) => (
        <FraudCheckRow key={c.name} check={c} index={idx + 1} />
      ))}
    </ol>
  );
}

export function FraudCheckRow({
  check,
  index,
}: {
  check: FraudCheck;
  index: number;
}) {
  const passed = check.passed;
  return (
    <li
      className={`rounded-md border p-3 flex items-start gap-3 ${
        passed
          ? "border-state-verified/30 bg-state-verified-bg"
          : "border-state-flagged/30 bg-state-flagged-bg"
      }`}
    >
      <span className={passed ? "text-state-verified" : "text-state-flagged"}>
        {passed ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-micro uppercase text-ink-muted font-mono">
            Layer {index}
          </span>
          <span className="text-body font-semibold text-ink">{check.label}</span>
          <span className="text-micro uppercase text-ink-muted">
            weight {check.weight.toFixed(2)}
          </span>
        </div>
        <p className="text-caption text-ink-tertiary mt-1">{check.details}</p>
      </div>
      <span className="font-mono text-caption text-ink-secondary w-12 text-right shrink-0">
        {check.score.toFixed(2)}
      </span>
    </li>
  );
}
