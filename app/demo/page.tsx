"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FraudCheckList, FraudScoreBar, VerdictPill } from "@/components/ui";
import { resetDemoState, supabase } from "@/lib/mock-db";
import { simulateFraud, simulateReal } from "@/lib/simulate";
import type { FraudResult, Media, Workflow } from "@/lib/types";

export default function DemoPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [busy, setBusy] = useState<"real" | "fraud" | "reset" | null>(null);
  const [last, setLast] = useState<{ media: Media; workflow: Workflow } | null>(null);

  async function refresh() {
    const { data } = await supabase
      .from<Workflow>("workflows")
      .select()
      .order("updated_at", { ascending: false });
    setWorkflows(data ?? []);
  }

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel("demo-panel")
      .on("postgres_changes", { event: "UPDATE", table: "workflows" }, () => refresh())
      .on("postgres_changes", { event: "INSERT", table: "media" }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  async function trigger(kind: "real" | "fraud") {
    setBusy(kind);
    try {
      const r = kind === "real" ? await simulateReal() : await simulateFraud();
      if (r) setLast(r);
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function resetAll() {
    setBusy("reset");
    try {
      await resetDemoState();
      setLast(null);
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  const active = workflows.find((w) => w.current_state === "EVIDENCE_REQUESTED") ?? workflows[0];

  return (
    <main className="min-h-screen p-6 sm:p-10 max-w-4xl mx-auto space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Demo Control</h1>
          <p className="text-sm text-slate-400">
            Simulate inspector captures. Watch the dashboard update in real time.
          </p>
        </div>
        <nav className="flex gap-2 text-sm">
          <Link
            href="/dashboard"
            className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 hover:bg-slate-700"
          >
            Bank Dashboard →
          </Link>
          <Link
            href="/capture"
            className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 hover:bg-slate-700"
          >
            Inspector PWA →
          </Link>
          <button
            onClick={resetAll}
            disabled={busy !== null}
            className="rounded border border-rose-800/50 bg-rose-900/30 text-rose-200 px-3 py-1.5 hover:bg-rose-900/50 disabled:opacity-50"
          >
            Reset state
          </button>
        </nav>
      </header>

      {active && (
        <section className="rounded-lg border border-slate-700 bg-slate-900/60 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-slate-500">
                Active demo project
              </div>
              <div className="text-xl font-semibold">{active.reference_label}</div>
              <div className="text-sm text-slate-400">
                {active.reference_id} · {active.meta.milestone_description}
              </div>
            </div>
            <div className="text-right text-sm">
              <div className="text-slate-500">Today's challenge code</div>
              <div className="mt-1 font-mono text-2xl text-emerald-300 bg-slate-800 inline-block px-3 py-1 rounded">
                {active.meta.challenge_code}
              </div>
            </div>
          </div>
          <div className="mt-4 grid sm:grid-cols-3 gap-3 text-xs text-slate-400">
            <Fact
              label="GPS center"
              value={`${active.meta.coordinates.lat}, ${active.meta.coordinates.lng}`}
            />
            <Fact label="Geofence" value={`${active.meta.geofence_radius_meters} m`} />
            <Fact label="State" value={active.current_state.replace(/_/g, " ")} />
          </div>
        </section>
      )}

      <section className="grid sm:grid-cols-2 gap-4">
        <button
          onClick={() => trigger("real")}
          disabled={busy !== null}
          className="text-left rounded-xl border border-emerald-500/40 bg-emerald-600/10 hover:bg-emerald-600/20 p-6 transition disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-emerald-400"
        >
          <div className="text-2xl font-bold text-emerald-200">✅ Simulate REAL capture</div>
          <p className="mt-2 text-sm text-emerald-100/70">
            Inspector on site. GPS at project. Motion variance 0.45 (hand-hold). Fresh unique
            photo. Correct challenge code. Sensor-camera consistent.
          </p>
          <p className="mt-3 text-xs text-emerald-300/60">
            Expected: all 5 layers pass · aggregate 1.00 · <strong>AUTO_VERIFIED</strong>
          </p>
          {busy === "real" && <p className="mt-2 text-xs text-emerald-300">Submitting…</p>}
        </button>

        <button
          onClick={() => trigger("fraud")}
          disabled={busy !== null}
          className="text-left rounded-xl border border-rose-500/40 bg-rose-600/10 hover:bg-rose-600/20 p-6 transition disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-rose-400"
        >
          <div className="text-2xl font-bold text-rose-200">🚨 Simulate FRAUD capture</div>
          <p className="mt-2 text-sm text-rose-100/70">
            Screen replay. GPS 2 km off. Motion variance 0.0001 (phone flat). Uniform lighting.
            Duplicate of prior submission. Stale challenge code.
          </p>
          <p className="mt-3 text-xs text-rose-300/60">
            Expected: all 5 layers fail · <strong>FLAGGED</strong>
          </p>
          {busy === "fraud" && <p className="mt-2 text-xs text-rose-300">Submitting…</p>}
        </button>
      </section>

      {last && <LastResult media={last.media} />}

      <p className="text-xs text-slate-500">
        Tip: open <Link href="/dashboard" className="underline">/dashboard</Link> in another tab —
        it updates via realtime, no refresh needed.
      </p>
    </main>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-800 bg-slate-950/50 p-2">
      <div className="uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-slate-200 font-mono mt-0.5">{value}</div>
    </div>
  );
}

function LastResult({ media }: { media: Media }) {
  const r: FraudResult = media.meta.fraud_result;
  return (
    <section
      className={`rounded-xl border p-5 ${
        r.verdict === "VERIFIED"
          ? "border-emerald-500/40 bg-emerald-900/10"
          : "border-rose-500/40 bg-rose-900/10"
      }`}
    >
      <div className="flex items-center gap-4">
        {media.meta.data_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.meta.data_url}
            alt="last"
            className="w-20 h-20 rounded object-cover border border-slate-700"
          />
        ) : (
          <span className="text-4xl">{media.meta.thumbnail_emoji ?? "📷"}</span>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <VerdictPill verdict={r.verdict} />
            <span className="font-mono text-sm text-slate-300">
              score {r.aggregate_score.toFixed(2)}
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {media.id} · source: {media.meta.source} ·{" "}
            {new Date(media.created_at).toLocaleTimeString()}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <FraudScoreBar score={r.aggregate_score} />
      </div>
      <div className="mt-3">
        <FraudCheckList result={r} />
      </div>
    </section>
  );
}
