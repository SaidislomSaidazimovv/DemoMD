"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { FraudCheckList, FraudScoreBar, StateBadge, VerdictPill } from "@/components/ui";
import { useRequireRole } from "@/lib/hooks";
import { verifyChain } from "@/lib/ledger";
import { appendLedgerEvent, supabase, transitionWorkflow } from "@/lib/mock-db";
import type { LedgerEvent, Media, Workflow } from "@/lib/types";

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id as string;
  const { session, loading } = useRequireRole(["bank_officer", "supervisor", "admin"]);

  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [media, setMedia] = useState<Media[]>([]);
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [chainValid, setChainValid] = useState<boolean | null>(null);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function refresh() {
    const [{ data: wf }, { data: ms }, { data: evs }] = await Promise.all([
      supabase.from<Workflow>("workflows").select().eq("id", id).maybeSingle(),
      supabase.from<Media>("media").select().eq("workflow_id", id),
      supabase.from<LedgerEvent>("ledger_events").select().eq("workflow_id", id),
    ]);
    setWorkflow(wf);
    setMedia(ms ?? []);
    setEvents(evs ?? []);

    const verification = await verifyChain(evs ?? []);
    setChainValid(verification.valid);
    setAnchor(verification.anchor);
  }

  useEffect(() => {
    if (loading || !session || !id) return;
    refresh();

    const ch = supabase
      .channel(`project-${id}`)
      .on("postgres_changes", { event: "INSERT", table: "ledger_events", filter: `workflow_id=eq.${id}` }, () => refresh())
      .on("postgres_changes", { event: "INSERT", table: "media", filter: `workflow_id=eq.${id}` }, () => refresh())
      .on("postgres_changes", { event: "UPDATE", table: "workflows", filter: `id=eq.${id}` }, () => refresh())
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [loading, session, id]);

  async function act(kind: "approve" | "reject") {
    if (!workflow || !session) return;
    setBusy(kind);
    try {
      const toState = kind === "approve" ? "APPROVED" : "REJECTED";
      await transitionWorkflow({
        workflowId: workflow.id,
        toState,
        actorId: session.user.id,
        reason: kind === "approve" ? "Banker approved milestone" : "Banker rejected milestone",
      });
    } finally {
      setBusy(null);
    }
  }

  async function exportPack() {
    if (!workflow || !session) return;
    setBusy("export");
    try {
      const result = await verifyChain(events);
      await appendLedgerEvent({
        org_id: workflow.org_id,
        workflow_id: workflow.id,
        event_type: "export_generated",
        actor_id: session.user.id,
        payload: {
          chain_valid: result.valid,
          anchor: result.anchor,
          media_count: media.length,
        },
      });
      await transitionWorkflow({
        workflowId: workflow.id,
        toState: "EXPORTED",
        actorId: session.user.id,
        reason: "Tranche pack generated",
      });
    } finally {
      setBusy(null);
    }
  }

  if (loading || !session) {
    return <main className="min-h-screen p-10 text-slate-500">Loading…</main>;
  }
  if (!workflow) {
    return (
      <main className="min-h-screen p-10 space-y-4">
        <Link href="/dashboard" className="text-sm text-slate-400">← Back</Link>
        <p>Project not found.</p>
      </main>
    );
  }

  const orderedMedia = media.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  const orderedEvents = events.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  const canApprove = ["AUTO_VERIFIED", "FLAGGED", "CAPTURED"].includes(workflow.current_state);
  const canReject = ["AUTO_VERIFIED", "FLAGGED", "CAPTURED"].includes(workflow.current_state);
  const canExport = workflow.current_state === "APPROVED";

  return (
    <main className="min-h-screen p-6 sm:p-10 max-w-6xl mx-auto space-y-6">
      <Link href="/dashboard" className="text-sm text-slate-400 hover:text-slate-200">
        ← Back to dashboard
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-xs text-slate-500">{workflow.reference_id}</div>
          <h1 className="text-3xl font-bold">{workflow.reference_label}</h1>
          <p className="text-sm text-slate-400">
            {workflow.meta.developer_name} · {workflow.meta.address}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <StateBadge state={workflow.current_state} />
            <span className="text-xs text-slate-500">
              Tranche {workflow.meta.current_tranche}/{workflow.meta.total_tranches} ·{" "}
              {workflow.meta.milestone_description}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => act("approve")}
            disabled={!canApprove || busy !== null}
            className="rounded bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ✅ Approve
          </button>
          <button
            onClick={() => act("reject")}
            disabled={!canReject || busy !== null}
            className="rounded bg-rose-600 hover:bg-rose-500 px-4 py-2 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ❌ Reject
          </button>
          <button
            onClick={exportPack}
            disabled={!canExport || busy !== null}
            className="rounded bg-indigo-600 hover:bg-indigo-500 px-4 py-2 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            📦 Generate tranche pack
          </button>
        </div>
      </header>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-4 grid sm:grid-cols-3 gap-4 text-sm">
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Loan</div>
          <div className="font-mono text-slate-200">
            {workflow.meta.loan_amount.toLocaleString()} {workflow.meta.loan_currency}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Geofence</div>
          <div className="font-mono text-slate-200">
            {workflow.meta.coordinates.lat.toFixed(4)}, {workflow.meta.coordinates.lng.toFixed(4)} · r{" "}
            {workflow.meta.geofence_radius_meters}m
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-500 mb-1">Ledger integrity</div>
          {chainValid === null ? (
            <div className="text-slate-500 text-xs">verifying…</div>
          ) : chainValid ? (
            <div className="text-emerald-300 text-xs">
              ✓ {events.length} events, hash chain valid
              {anchor && (
                <div className="text-slate-500 font-mono truncate">anchor: {anchor.slice(0, 32)}…</div>
              )}
            </div>
          ) : (
            <div className="text-rose-300 text-xs">⚠ chain broken</div>
          )}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">
          Evidence timeline{" "}
          <span className="text-sm font-normal text-slate-500">({orderedMedia.length})</span>
        </h2>
        {orderedMedia.length === 0 ? (
          <div className="rounded border border-dashed border-slate-700 p-6 text-sm text-slate-400">
            No evidence yet. An inspector will submit via <Link href="/capture" className="underline">/capture</Link>,
            or simulate one from <Link href="/demo" className="underline">/demo</Link>.
          </div>
        ) : (
          <div className="space-y-3">
            {orderedMedia.map((m) => (
              <EvidenceCard key={m.id} media={m} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">
          Ledger events{" "}
          <span className="text-sm font-normal text-slate-500">({orderedEvents.length})</span>
        </h2>
        <ol className="rounded border border-slate-800 divide-y divide-slate-800 text-sm bg-slate-900/40">
          {orderedEvents.map((l) => (
            <li key={l.id} className="p-3 flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="font-medium">{l.event_type}</div>
                <div className="text-xs text-slate-500 font-mono truncate">
                  actor: {l.actor_id ?? "system"} · {JSON.stringify(l.payload)}
                </div>
                <div className="text-[10px] text-slate-600 font-mono mt-0.5 truncate">
                  hash: {l.hash.slice(0, 24)}… · prev: {l.prev_hash?.slice(0, 16) ?? "GENESIS"}
                </div>
              </div>
              <div className="text-xs text-slate-500 whitespace-nowrap">
                {new Date(l.created_at).toLocaleString()}
              </div>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

function EvidenceCard({ media }: { media: Media }) {
  const r = media.meta.fraud_result;
  const verified = r.verdict === "VERIFIED";
  const [open, setOpen] = useState(false);

  return (
    <div
      className={`rounded-lg border p-4 ${
        verified
          ? "border-emerald-700/50 bg-emerald-900/10"
          : "border-rose-700/50 bg-rose-900/10"
      }`}
    >
      <div className="flex items-center gap-4">
        {media.meta.data_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={media.meta.data_url}
            alt="evidence"
            className="w-16 h-16 object-cover rounded border border-slate-700"
          />
        ) : (
          <span className="text-4xl">{media.meta.thumbnail_emoji ?? "📷"}</span>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <VerdictPill verdict={r.verdict} />
            <span className="font-mono text-sm text-slate-300">
              {r.aggregate_score.toFixed(2)}
            </span>
            <span className="text-xs text-slate-500">
              source: <span className="font-mono">{media.meta.source}</span>
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {new Date(media.created_at).toLocaleString()} · sha256: {media.sha256.slice(0, 20)}…
          </div>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-xs text-slate-400 hover:text-slate-200"
        >
          {open ? "Hide" : "Details"}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-3">
          <FraudScoreBar score={r.aggregate_score} />
          <FraudCheckList result={r} />
          <div className="text-xs text-slate-500 font-mono">
            storage: {media.storage_path}
          </div>
        </div>
      )}
    </div>
  );
}
