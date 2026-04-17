"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FraudCheckList, FraudScoreBar, VerdictPill } from "@/components/ui";
import { useRequireRole } from "@/lib/hooks";
import { createClient } from "@/lib/supabase/browser";
import { simulateReal, simulateFraud } from "@/lib/actions";
import type { FraudResult, Media, Workflow } from "@/lib/types";

export default function DemoPage() {
  const { session, loading } = useRequireRole(["admin", "bank_officer"]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<"real" | "fraud" | null>(null);
  const [last, setLast] = useState<Media | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const supabase = createClient();
    const { data } = await supabase
      .from("workflows")
      .select("*")
      .order("updated_at", { ascending: false });
    const list = (data as Workflow[]) ?? [];
    setWorkflows(list);
    if (!selectedId && list.length > 0) {
      const prefer = list.find((w) => w.current_state === "EVIDENCE_REQUESTED") ?? list[0];
      setSelectedId(prefer.id);
    }
  }

  useEffect(() => {
    if (loading || !session) return;
    refresh();
    const supabase = createClient();
    const ch = supabase
      .channel("demo-panel")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "workflows" }, () => refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "workflows" }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, session]);

  async function trigger(kind: "real" | "fraud") {
    if (!selectedId) return;
    setBusy(kind);
    setError(null);
    try {
      const r = kind === "real" ? await simulateReal(selectedId) : await simulateFraud(selectedId);
      if (r.media) setLast(r.media as Media);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (loading || !session) {
    return <main className="min-h-screen p-10 text-slate-500">Loading…</main>;
  }

  const active = workflows.find((w) => w.id === selectedId) ?? null;

  return (
    <main className="min-h-screen p-6 sm:p-10 max-w-4xl mx-auto space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Demo Control</h1>
          <p className="text-sm text-slate-400">Inject REAL or FRAUD captures into a project.</p>
        </div>
        <nav className="flex gap-2 text-sm">
          <Link href="/dashboard" className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 hover:bg-slate-700">
            Dashboard →
          </Link>
          {session.profile?.role === "admin" && (
            <Link href="/admin" className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 hover:bg-slate-700">
              Admin →
            </Link>
          )}
        </nav>
      </header>

      {workflows.length === 0 ? (
        <section className="rounded-xl border border-amber-700/40 bg-amber-900/10 p-6">
          <h2 className="text-lg font-semibold text-amber-200">No projects to simulate</h2>
          <p className="text-sm text-amber-200/80 mt-2">
            Admin needs to create a project from{" "}
            <Link href="/admin" className="underline">
              /admin
            </Link>{" "}
            first.
          </p>
        </section>
      ) : (
        <>
          <section className="rounded-lg border border-slate-700 bg-slate-900/60 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="text-xs uppercase tracking-wide text-slate-500">Target project</div>
                <select
                  value={selectedId ?? ""}
                  onChange={(e) => setSelectedId(e.target.value)}
                  className="mt-1 w-full max-w-md rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
                >
                  {workflows.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.reference_label} · {w.current_state}
                    </option>
                  ))}
                </select>
              </div>
              {active && (
                <div className="text-right text-sm">
                  <div className="text-slate-500 text-xs">Challenge code</div>
                  <div className="mt-1 font-mono text-2xl text-emerald-300 bg-slate-800 inline-block px-3 py-1 rounded">
                    {active.meta.challenge_code}
                  </div>
                </div>
              )}
            </div>
            {active && (
              <div className="mt-4 grid sm:grid-cols-3 gap-3 text-xs text-slate-400">
                <Fact
                  label="GPS center"
                  value={`${active.meta.coordinates.lat}, ${active.meta.coordinates.lng}`}
                />
                <Fact label="Geofence" value={`${active.meta.geofence_radius_meters} m`} />
                <Fact label="State" value={active.current_state.replace(/_/g, " ")} />
              </div>
            )}
          </section>

          <section className="grid sm:grid-cols-2 gap-4">
            <button
              onClick={() => trigger("real")}
              disabled={!active || busy !== null}
              className="text-left rounded-xl border border-emerald-500/40 bg-emerald-600/10 hover:bg-emerald-600/20 p-6 transition disabled:opacity-50"
            >
              <div className="text-2xl font-bold text-emerald-200">✅ Simulate REAL capture</div>
              <p className="mt-2 text-sm text-emerald-100/70">
                GPS at site · motion variance 0.45 · fresh unique photo · correct code.
              </p>
              <p className="mt-3 text-xs text-emerald-300/60">
                Expected: all 5 layers pass · <strong>AUTO_VERIFIED</strong>
              </p>
              {busy === "real" && <p className="mt-2 text-xs text-emerald-300">Submitting…</p>}
            </button>

            <button
              onClick={() => trigger("fraud")}
              disabled={!active || busy !== null}
              className="text-left rounded-xl border border-rose-500/40 bg-rose-600/10 hover:bg-rose-600/20 p-6 transition disabled:opacity-50"
            >
              <div className="text-2xl font-bold text-rose-200">🚨 Simulate FRAUD capture</div>
              <p className="mt-2 text-sm text-rose-100/70">
                GPS 2km off · phone flat · duplicate hash · stale code · uniform lighting.
              </p>
              <p className="mt-3 text-xs text-rose-300/60">
                Expected: all 5 layers fail · <strong>FLAGGED</strong>
              </p>
              {busy === "fraud" && <p className="mt-2 text-xs text-rose-300">Submitting…</p>}
            </button>
          </section>

          {error && (
            <div className="rounded border border-rose-700/50 bg-rose-900/20 px-3 py-2 text-sm text-rose-300">
              {error}
            </div>
          )}

          {last && <LastResult media={last} />}

          <p className="text-xs text-slate-500">
            Open{" "}
            <Link href="/dashboard" className="underline">
              /dashboard
            </Link>{" "}
            in another tab — it updates via realtime, no refresh.
          </p>
        </>
      )}
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
            {media.id} · {new Date(media.created_at).toLocaleTimeString()}
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
