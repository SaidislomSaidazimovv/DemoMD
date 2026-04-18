"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, RotateCcw } from "lucide-react";
import {
  FraudCheckList,
  FraudScoreBar,
  VerdictPill,
  Card,
  CardContent,
  Button,
  EmptyState,
} from "@/components/ui";
import { useRequireRoleFromContext } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/browser";
import { simulateReal, simulateFraud, resetDemoProject } from "@/lib/actions";
import type { FraudResult, Media, Workflow } from "@/lib/types";

// Demo Control is the template for the rest of the app per TASDIQ_UI_REDESIGN.md.
// Two big CTAs + live fraud-score breakdown + Reset.

export default function DemoPage() {
  useRequireRoleFromContext(["admin", "bank_officer"]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<"real" | "fraud" | "reset" | null>(null);
  const [last, setLast] = useState<Media | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resetNotice, setResetNotice] = useState<string | null>(null);

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
  }, []);

  async function trigger(kind: "real" | "fraud") {
    if (!selectedId) return;
    setBusy(kind);
    setError(null);
    setResetNotice(null);
    try {
      const r = kind === "real" ? await simulateReal(selectedId) : await simulateFraud(selectedId);
      if (r.media) setLast(r.media as Media);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function onReset() {
    if (!selectedId) return;
    if (!confirm("Reset this project? All simulated evidence, ledger events, and tranche packs for it will be deleted. Workflow returns to EVIDENCE_REQUESTED.")) {
      return;
    }
    setBusy("reset");
    setError(null);
    try {
      const r = await resetDemoProject(selectedId);
      setLast(null);
      setResetNotice(
        `Cleared ${r.cleared.media} evidence row${r.cleared.media === 1 ? "" : "s"} and ${r.cleared.storage_files} storage file${r.cleared.storage_files === 1 ? "" : "s"}.`
      );
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const active = workflows.find((w) => w.id === selectedId) ?? null;

  return (
    <div className="p-6 sm:p-10 max-w-4xl mx-auto space-y-8 fade-up">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-heading-1 text-ink">Demo Control</h1>
          <p className="text-caption text-ink-tertiary mt-1">
            Inject REAL or FRAUD captures into a project.
          </p>
        </div>
        {active && (
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<RotateCcw size={14} />}
            onClick={onReset}
            disabled={busy !== null}
            loading={busy === "reset"}
          >
            Reset demo
          </Button>
        )}
      </header>

      {workflows.length === 0 ? (
        <EmptyState
          icon={<AlertTriangle />}
          title="No projects to simulate"
          description="An admin needs to create a project first."
          action={
            <Link href="/admin">
              <Button variant="primary">Go to Home</Button>
            </Link>
          }
        />
      ) : (
        <>
          <Card>
            <CardContent className="py-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-micro uppercase text-ink-muted">Target project</div>
                  <select
                    value={selectedId ?? ""}
                    onChange={(e) => setSelectedId(e.target.value)}
                    className="mt-2 w-full max-w-md rounded-md border border-hairline-strong bg-surface-subtle px-3 py-2 text-body text-ink focus:outline-none focus:border-accent"
                  >
                    {workflows.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.reference_label} · {w.current_state.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </div>
                {active && (
                  <div className="text-right">
                    <div className="text-micro uppercase text-ink-muted">Challenge code</div>
                    <div className="mt-1 font-mono text-[28px] font-bold text-accent bg-surface-subtle inline-block px-4 py-1.5 rounded-md tracking-widest">
                      {active.meta.challenge_code}
                    </div>
                  </div>
                )}
              </div>
              {active && (
                <div className="mt-5 grid sm:grid-cols-3 gap-3">
                  <Fact
                    label="GPS center"
                    value={`${active.meta.coordinates.lat}, ${active.meta.coordinates.lng}`}
                  />
                  <Fact label="Geofence" value={`${active.meta.geofence_radius_meters} m`} />
                  <Fact label="State" value={active.current_state.replace(/_/g, " ").toLowerCase()} />
                </div>
              )}
            </CardContent>
          </Card>

          <section className="grid sm:grid-cols-2 gap-4">
            <button
              onClick={() => trigger("real")}
              disabled={!active || busy !== null}
              className="text-left rounded-lg border border-state-verified/40 bg-state-verified-bg hover:bg-state-verified/15 p-6 transition-colors duration-base disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-center gap-2">
                <CheckCircle2 className="text-state-verified" size={24} />
                <span className="text-heading-2 text-state-verified">Simulate REAL capture</span>
              </div>
              <p className="mt-3 text-body text-ink-secondary">
                GPS at site · motion variance 0.45 · fresh unique photo · correct code.
              </p>
              <p className="mt-3 text-caption text-ink-tertiary">
                Expected: all 5 layers pass · <strong className="text-state-verified">AUTO_VERIFIED</strong>
              </p>
              {busy === "real" && (
                <p className="mt-2 text-caption text-state-verified">Submitting…</p>
              )}
            </button>

            <button
              onClick={() => trigger("fraud")}
              disabled={!active || busy !== null}
              className="text-left rounded-lg border border-state-flagged/40 bg-state-flagged-bg hover:bg-state-flagged/15 p-6 transition-colors duration-base disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex items-center gap-2">
                <AlertTriangle className="text-state-flagged" size={24} />
                <span className="text-heading-2 text-state-flagged">Simulate FRAUD capture</span>
              </div>
              <p className="mt-3 text-body text-ink-secondary">
                GPS 2 km off · phone flat · duplicate hash · stale code · uniform lighting.
              </p>
              <p className="mt-3 text-caption text-ink-tertiary">
                Expected: all 5 layers fail · <strong className="text-state-flagged">FLAGGED</strong>
              </p>
              {busy === "fraud" && (
                <p className="mt-2 text-caption text-state-flagged">Submitting…</p>
              )}
            </button>
          </section>

          {error && (
            <div className="rounded-md border border-state-flagged/40 bg-state-flagged-bg px-4 py-3 text-body text-state-flagged">
              {error}
            </div>
          )}

          {resetNotice && (
            <div className="rounded-md border border-state-info/40 bg-state-info-bg px-4 py-3 text-body text-state-info">
              {resetNotice}
            </div>
          )}

          {last && <LastResult media={last} />}

          <p className="text-caption text-ink-muted">
            Open{" "}
            <Link href="/dashboard" className="underline text-ink-tertiary hover:text-ink">
              /dashboard
            </Link>{" "}
            in another tab — it updates via realtime, no refresh.
          </p>
        </>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-hairline-subtle bg-surface-subtle p-3">
      <div className="text-micro uppercase text-ink-muted">{label}</div>
      <div className="text-body text-ink-secondary font-mono mt-0.5 truncate">{value}</div>
    </div>
  );
}

function LastResult({ media }: { media: Media }) {
  const r: FraudResult = media.meta.fraud_result;
  const verified = r.verdict === "VERIFIED";
  return (
    <Card className={verified ? "border-state-verified/40" : "border-state-flagged/40"}>
      <CardContent className="py-5 space-y-4">
        <div className="flex items-center gap-4">
          {media.meta.data_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={media.meta.data_url}
              alt="last"
              className="w-16 h-16 rounded-md object-cover border border-hairline-subtle shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-md bg-surface-elevated flex items-center justify-center text-3xl shrink-0">
              {media.meta.thumbnail_emoji ?? "📷"}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <VerdictPill verdict={r.verdict} />
              <span className="font-mono text-caption text-ink-secondary">
                score {r.aggregate_score.toFixed(2)}
              </span>
            </div>
            <div className="text-caption text-ink-tertiary mt-1 font-mono truncate">
              {media.id} · {new Date(media.created_at).toLocaleTimeString()}
            </div>
          </div>
        </div>
        <FraudScoreBar score={r.aggregate_score} />
        <FraudCheckList result={r} />
      </CardContent>
    </Card>
  );
}
