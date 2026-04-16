"use client";

import type { FraudCheck, FraudResult, WorkflowState } from "@/lib/types";

export function Kpi({
  label,
  value,
  tone,
  sub,
}: {
  label: string;
  value: number | string;
  tone: "slate" | "amber" | "emerald" | "rose" | "sky";
  sub?: string;
}) {
  const tones: Record<string, string> = {
    slate: "border-slate-700 bg-slate-900 text-slate-100",
    amber: "border-amber-700/50 bg-amber-900/30 text-amber-200",
    emerald: "border-emerald-700/50 bg-emerald-900/30 text-emerald-200",
    rose: "border-rose-700/50 bg-rose-900/30 text-rose-200",
    sky: "border-sky-700/50 bg-sky-900/30 text-sky-200",
  };
  return (
    <div className={`rounded-lg border p-4 ${tones[tone]}`}>
      <div className="text-xs uppercase tracking-wide opacity-70">{label}</div>
      <div className="text-3xl font-bold mt-1">{value}</div>
      {sub && <div className="text-xs opacity-60 mt-0.5">{sub}</div>}
    </div>
  );
}

const STATE_STYLE: Record<string, string> = {
  DRAFT: "bg-slate-700 text-slate-100",
  EVIDENCE_REQUESTED: "bg-amber-900/60 text-amber-200",
  CAPTURED: "bg-sky-900/60 text-sky-200",
  AUTO_VERIFIED: "bg-emerald-900/60 text-emerald-200",
  APPROVED: "bg-emerald-600 text-emerald-50",
  FLAGGED: "bg-rose-900/60 text-rose-200",
  REJECTED: "bg-rose-600 text-rose-50",
  EXPORTED: "bg-indigo-900/60 text-indigo-200",
  BANK_ACCEPTED: "bg-emerald-700 text-emerald-50",
  BANK_REJECTED: "bg-rose-700 text-rose-50",
};

export function StateBadge({ state }: { state: WorkflowState | string }) {
  const cls = STATE_STYLE[state] ?? "bg-slate-700 text-slate-100";
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold tracking-wide ${cls}`}
    >
      {String(state).replace(/_/g, " ")}
    </span>
  );
}

export function VerdictPill({ verdict }: { verdict: "VERIFIED" | "FLAGGED" }) {
  return verdict === "VERIFIED" ? (
    <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-300 border border-emerald-500/40">
      ✓ VERIFIED
    </span>
  ) : (
    <span className="rounded-full bg-rose-500/20 px-3 py-1 text-xs font-bold text-rose-300 border border-rose-500/40">
      ⚠ FLAGGED
    </span>
  );
}

export function FraudScoreBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(1, score)) * 100;
  const tone =
    score >= 0.7 ? "bg-emerald-500" : score >= 0.4 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-slate-400 mb-1">
        <span>Aggregate fraud score</span>
        <span className="font-mono">{score.toFixed(2)} / 1.00</span>
      </div>
      <div className="h-2.5 w-full rounded-full bg-slate-800 overflow-hidden">
        <div
          className={`h-full ${tone} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-slate-500 mt-1">
        <span>0.00</span>
        <span className="text-slate-400">
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

function FraudCheckRow({ check, index }: { check: FraudCheck; index: number }) {
  return (
    <li
      className={`rounded-md border p-3 flex items-start gap-3 ${
        check.passed
          ? "border-emerald-700/50 bg-emerald-900/10"
          : "border-rose-700/50 bg-rose-900/10"
      }`}
    >
      <span className="text-xl leading-none">{check.passed ? "✅" : "❌"}</span>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500 font-mono">Layer {index}</span>
          <span className="font-semibold">{check.label}</span>
          <span className="text-xs text-slate-500">weight {check.weight.toFixed(2)}</span>
        </div>
        <p className="text-sm text-slate-400 mt-0.5">{check.details}</p>
      </div>
      <span className="font-mono text-xs text-slate-300 w-12 text-right">
        {check.score.toFixed(2)}
      </span>
    </li>
  );
}
