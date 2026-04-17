"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { FraudCheckList, FraudScoreBar, StateBadge, VerdictPill } from "@/components/ui";
import { StateStepper } from "@/components/state-stepper";
import { ToastViewport, useToasts } from "@/components/toast";
import { useRequireRole } from "@/lib/hooks";
import { verifyChain } from "@/lib/ledger";
import { generateTranchePack, transitionWorkflow } from "@/lib/actions";
import { createClient } from "@/lib/supabase/browser";
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
  const [error, setError] = useState<string | null>(null);
  const [rejectFormOpen, setRejectFormOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const { toasts, push: pushToast } = useToasts();

  async function refresh() {
    const supabase = createClient();
    // Note: the hash chain is ORG-wide (every event's prev_hash points to the
    // previous event in the entire org, not just this workflow). So verification
    // must walk the full org chain. RLS keeps the query scoped to the caller's
    // org automatically. The UI timeline still shows only this workflow's events.
    const [
      { data: wf },
      { data: ms },
      { data: workflowEvs },
      { data: orgEvs },
    ] = await Promise.all([
      supabase.from("workflows").select("*").eq("id", id).maybeSingle(),
      supabase.from("media").select("*").eq("workflow_id", id),
      supabase.from("ledger_events").select("*").eq("workflow_id", id),
      supabase.from("ledger_events").select("*"),
    ]);
    setWorkflow((wf as Workflow) ?? null);
    setMedia((ms as Media[]) ?? []);
    setEvents((workflowEvs as LedgerEvent[]) ?? []);
    const verification = await verifyChain((orgEvs as LedgerEvent[]) ?? []);
    setChainValid(verification.valid);
    setAnchor(verification.anchor);
  }

  useEffect(() => {
    if (loading || !session || !id) return;
    refresh();
    const supabase = createClient();
    const ch = supabase
      .channel(`project-${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ledger_events", filter: `workflow_id=eq.${id}` },
        (payload) => {
          refresh();
          const ev = payload.new as LedgerEvent;
          if (ev.event_type === "evidence_captured") {
            const verdict = (ev.payload as { verdict?: string })?.verdict;
            const score = (ev.payload as { fraud_score?: number })?.fraud_score;
            pushToast({
              tone: verdict === "VERIFIED" ? "success" : "warn",
              title: verdict === "VERIFIED" ? "Evidence verified" : "Evidence flagged",
              detail: typeof score === "number" ? `Score ${score.toFixed(2)}` : undefined,
            });
          } else if (ev.event_type === "state_changed") {
            const to = (ev.payload as { to?: string })?.to;
            pushToast({
              tone: "info",
              title: `State → ${to?.replace(/_/g, " ") ?? "?"}`,
            });
          }
        }
      )
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "media", filter: `workflow_id=eq.${id}` }, () => refresh())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "workflows", filter: `id=eq.${id}` }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [loading, session, id]);

  async function act(kind: "approve" | "reject") {
    if (!workflow) return;
    setBusy(kind);
    setError(null);
    try {
      await transitionWorkflow({
        workflow_id: workflow.id,
        to_state: kind === "approve" ? "APPROVED" : "REJECTED",
        reason: kind === "approve" ? "Banker approved milestone" : "Banker rejected milestone",
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function exportPack() {
    if (!workflow) return;
    setBusy("export");
    setError(null);
    try {
      const result = await generateTranchePack({ workflow_id: workflow.id });
      if (result.downloadUrl) {
        // Trigger the browser download automatically.
        window.location.href = result.downloadUrl;
      } else {
        setError("Pack generated but no download URL returned.");
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  // Final lifecycle step: the bank confirms (or refuses) tranche release.
  // Transitions EXPORTED → BANK_ACCEPTED | BANK_REJECTED. On accept, the
  // server also emits a `tranche_released` ledger event (done in /api/transition).
  async function bankAct(kind: "accept" | "reject") {
    if (!workflow) return;
    if (kind === "reject" && !rejectReason.trim()) {
      setError("A rejection reason is required.");
      return;
    }
    setBusy(kind === "accept" ? "bank_accept" : "bank_reject");
    setError(null);
    try {
      await transitionWorkflow({
        workflow_id: workflow.id,
        to_state: kind === "accept" ? "BANK_ACCEPTED" : "BANK_REJECTED",
        reason:
          kind === "accept"
            ? "Bank confirmed tranche release"
            : rejectReason.trim(),
      });
      setRejectFormOpen(false);
      setRejectReason("");
    } catch (e) {
      setError((e as Error).message);
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
        <Link href="/dashboard" className="text-sm text-slate-400">
          ← Back
        </Link>
        <p>Project not found.</p>
      </main>
    );
  }

  const orderedMedia = media.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  const orderedEvents = events.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  const canApprove = ["AUTO_VERIFIED", "FLAGGED", "CAPTURED"].includes(workflow.current_state);
  const canReject = ["AUTO_VERIFIED", "FLAGGED", "CAPTURED"].includes(workflow.current_state);
  const canExport = workflow.current_state === "APPROVED";
  const canBankAccept = workflow.current_state === "EXPORTED";
  const canBankReject = workflow.current_state === "EXPORTED";

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
        <div className="flex gap-2 flex-wrap">
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
          <button
            onClick={() => bankAct("accept")}
            disabled={!canBankAccept || busy !== null}
            className="rounded bg-emerald-700 hover:bg-emerald-600 px-4 py-2 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            🏦 Mark as bank accepted
          </button>
          <button
            onClick={() => {
              setError(null);
              setRejectFormOpen((v) => !v);
            }}
            disabled={!canBankReject || busy !== null}
            className="rounded bg-rose-700 hover:bg-rose-600 px-4 py-2 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
          >
            🏦 Mark as bank rejected
          </button>
        </div>
      </header>

      {rejectFormOpen && (
        <section className="rounded-lg border border-rose-700/50 bg-rose-900/10 p-4 space-y-3">
          <div>
            <label className="block text-xs uppercase tracking-wide text-rose-300 mb-1">
              Rejection reason (required)
            </label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="e.g. Photo 2 off-site — disbursement held."
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => {
                setRejectFormOpen(false);
                setRejectReason("");
                setError(null);
              }}
              disabled={busy !== null}
              className="rounded border border-slate-700 bg-slate-900 hover:bg-slate-800 px-3 py-1.5 text-sm"
            >
              Cancel
            </button>
            <button
              onClick={() => bankAct("reject")}
              disabled={!rejectReason.trim() || busy !== null}
              className="rounded bg-rose-600 hover:bg-rose-500 px-3 py-1.5 text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {busy === "bank_reject" ? "Rejecting…" : "Confirm bank rejection"}
            </button>
          </div>
        </section>
      )}

      {error && (
        <div className="rounded border border-rose-700/50 bg-rose-900/20 px-3 py-2 text-sm text-rose-300">
          {error}
        </div>
      )}

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
        <div className="text-xs uppercase tracking-wide text-slate-500 mb-3">
          Workflow state
        </div>
        <StateStepper state={workflow.current_state} />
      </section>

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
              ✓ {events.length} events, chain valid
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
            No evidence yet. An inspector can submit via{" "}
            <Link href="/capture" className="underline">
              /capture
            </Link>
            , or simulate one from{" "}
            <Link href="/demo" className="underline">
              /demo
            </Link>
            .
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

      <ToastViewport toasts={toasts} />
    </main>
  );
}

function EvidenceCard({ media }: { media: Media }) {
  const r = media.meta.fraud_result;
  const verified = r.verdict === "VERIFIED";
  const [open, setOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoErr, setVideoErr] = useState<string | null>(null);

  const videoPath = media.meta.video_storage_path;

  // Fetch a fresh signed URL for the video the first time the card is expanded.
  // Evidence bucket is private + org-scoped; Supabase returns a 1-hour signed URL.
  useEffect(() => {
    if (!open || !videoPath || videoUrl) return;
    const supabase = createClient();
    supabase.storage
      .from("evidence")
      .createSignedUrl(videoPath, 3600)
      .then(({ data, error }) => {
        if (error) setVideoErr(error.message);
        else if (data?.signedUrl) setVideoUrl(data.signedUrl);
      });
  }, [open, videoPath, videoUrl]);

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
            <span className="font-mono text-sm text-slate-300">{r.aggregate_score.toFixed(2)}</span>
            <span className="text-xs text-slate-500">
              source: <span className="font-mono">{media.meta.source}</span>
            </span>
            {videoPath && (
              <span className="rounded-full bg-sky-900/40 border border-sky-700/40 px-2 py-0.5 text-[10px] text-sky-200">
                🎥 video
              </span>
            )}
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
          {videoPath && (
            <div className="rounded-md border border-slate-800 bg-slate-950/50 p-2">
              <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">
                15-second site video
              </div>
              {videoErr ? (
                <div className="text-xs text-rose-300">video unavailable: {videoErr}</div>
              ) : videoUrl ? (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video
                  controls
                  preload="metadata"
                  src={videoUrl}
                  className="w-full max-h-64 rounded bg-black"
                />
              ) : (
                <div className="text-xs text-slate-500">loading video…</div>
              )}
              {media.meta.video_bytes != null && (
                <div className="text-[10px] text-slate-500 font-mono mt-1">
                  {(media.meta.video_bytes / 1024).toFixed(0)} KB ·{" "}
                  {media.meta.video_mime_type ?? "video"}
                </div>
              )}
            </div>
          )}
          <FraudScoreBar score={r.aggregate_score} />
          <FraudCheckList result={r} />
          <div className="text-xs text-slate-500 font-mono">storage: {media.storage_path}</div>
        </div>
      )}
    </div>
  );
}
