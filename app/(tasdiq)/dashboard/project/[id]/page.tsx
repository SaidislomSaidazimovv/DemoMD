"use client";

import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Package,
  Banknote,
  LinkIcon,
  Flag,
  AlertTriangle,
  MapPin,
  KeyRound,
  FileText,
  Camera,
  ShieldCheck,
} from "lucide-react";
import {
  StateBadge,
  VerdictPill,
  FraudScoreBar,
  FraudCheckList,
  Card,
  CardContent,
  Button,
  EmptyState,
} from "@/components/ui";
import { StateStepper } from "@/components/state-stepper";
import { ToastViewport, useToasts } from "@/components/toast";
import { useRequireRoleFromContext } from "@/components/app-shell";
import { verifyChain } from "@/lib/ledger";
import { generateTranchePack, transitionWorkflow } from "@/lib/actions";
import { createClient } from "@/lib/supabase/browser";
import type { LedgerEvent, Media, Workflow, WorkflowState } from "@/lib/types";

type Tab = "evidence" | "details" | "audit";

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id as string;
  useRequireRoleFromContext(["bank_officer", "supervisor", "admin"]);

  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [media, setMedia] = useState<Media[]>([]);
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [chainValid, setChainValid] = useState<boolean | null>(null);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rejectFormOpen, setRejectFormOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [tab, setTab] = useState<Tab>("evidence");
  const [copied, setCopied] = useState(false);
  const { toasts, push: pushToast } = useToasts();

  async function refresh() {
    const supabase = createClient();
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
    if (!id) return;
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
  }, [id]);

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

  async function copyCaptureLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/capture`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Could not copy link — please share /capture manually.");
    }
  }

  if (!workflow) {
    return (
      <div className="p-10 space-y-4">
        <Link href="/dashboard" className="text-caption text-ink-tertiary hover:text-ink inline-flex items-center gap-1">
          <ArrowLeft size={14} /> Back
        </Link>
        <p className="text-body">Project not found.</p>
      </div>
    );
  }

  const orderedMedia = media.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  const orderedEvents = events.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <div className="p-6 sm:p-10 max-w-5xl mx-auto space-y-6 fade-up">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-caption text-ink-tertiary hover:text-ink"
      >
        <ArrowLeft size={14} /> Back to projects
      </Link>

      <header className="space-y-3">
        <div className="text-micro uppercase text-ink-muted">{workflow.reference_id}</div>
        <h1 className="text-heading-1 text-ink">{workflow.reference_label}</h1>
        <p className="text-body text-ink-tertiary">
          {workflow.meta.developer_name} · {workflow.meta.address}
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <StateBadge state={workflow.current_state} />
          <span className="text-caption text-ink-tertiary">
            Tranche {workflow.meta.current_tranche}/{workflow.meta.total_tranches} ·{" "}
            {workflow.meta.milestone_description}
          </span>
        </div>
      </header>

      <Card>
        <CardContent className="py-5">
          <div className="text-micro uppercase text-ink-muted mb-3">Workflow state</div>
          <StateStepper state={workflow.current_state} />
        </CardContent>
      </Card>

      {/* Contextual action buttons per spec's state → button table */}
      <ContextualActions
        state={workflow.current_state}
        busy={busy}
        copied={copied}
        onApprove={() => act("approve")}
        onReject={() => act("reject")}
        onExport={exportPack}
        onBankAccept={() => bankAct("accept")}
        onBankReject={() => {
          setError(null);
          setRejectFormOpen((v) => !v);
        }}
        onCopyLink={copyCaptureLink}
      />

      {rejectFormOpen && (
        <Card className="border-state-flagged/40 bg-state-flagged-bg">
          <CardContent className="py-4 space-y-3">
            <label className="block text-micro uppercase text-state-flagged">
              Rejection reason (required)
            </label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="e.g. Photo 2 off-site — disbursement held."
              className="w-full rounded-md border border-hairline-strong bg-surface-subtle px-3 py-2 text-body text-ink focus:outline-none focus:ring-2 focus:ring-state-flagged/50"
            />
            <div className="flex gap-2 justify-end">
              <Button
                variant="ghost"
                onClick={() => {
                  setRejectFormOpen(false);
                  setRejectReason("");
                  setError(null);
                }}
                disabled={busy !== null}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => bankAct("reject")}
                disabled={!rejectReason.trim() || busy !== null}
                loading={busy === "bank_reject"}
              >
                Confirm bank rejection
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {error && (
        <div className="rounded-md border border-state-flagged/40 bg-state-flagged-bg px-4 py-3 text-body text-state-flagged">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div>
        <div className="border-b border-hairline-subtle flex items-center gap-1">
          <TabButton active={tab === "evidence"} onClick={() => setTab("evidence")} icon={<Camera size={16} />}>
            Evidence
            <span className="ml-1.5 text-micro text-ink-muted">({orderedMedia.length})</span>
          </TabButton>
          <TabButton active={tab === "details"} onClick={() => setTab("details")} icon={<FileText size={16} />}>
            Details
          </TabButton>
          <TabButton active={tab === "audit"} onClick={() => setTab("audit")} icon={<ShieldCheck size={16} />}>
            Audit trail
            <span className="ml-1.5 text-micro text-ink-muted">({orderedEvents.length})</span>
          </TabButton>
        </div>

        <div className="pt-6">
          {tab === "evidence" && (
            <EvidenceTab media={orderedMedia} />
          )}
          {tab === "details" && (
            <DetailsTab workflow={workflow} />
          )}
          {tab === "audit" && (
            <AuditTab
              events={orderedEvents}
              chainValid={chainValid}
              anchor={anchor}
            />
          )}
        </div>
      </div>

      <ToastViewport toasts={toasts} />
    </div>
  );
}

// ============================================================
// Contextual actions — shows only the buttons relevant to current state
// ============================================================
function ContextualActions({
  state,
  busy,
  copied,
  onApprove,
  onReject,
  onExport,
  onBankAccept,
  onBankReject,
  onCopyLink,
}: {
  state: WorkflowState;
  busy: string | null;
  copied: boolean;
  onApprove: () => void;
  onReject: () => void;
  onExport: () => void;
  onBankAccept: () => void;
  onBankReject: () => void;
  onCopyLink: () => void;
}) {
  // Map per TASDIQ_UI_REDESIGN.md Screen 4 Fix 1
  if (state === "EVIDENCE_REQUESTED") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" leftIcon={<LinkIcon size={16} />} onClick={onCopyLink}>
          {copied ? "Link copied ✓" : "Share capture link with inspector"}
        </Button>
      </div>
    );
  }
  if (state === "CAPTURED") {
    return (
      <Card>
        <CardContent className="py-4 text-body text-ink-tertiary">
          Evidence received — the fraud pipeline is auto-verifying. Result will appear here
          within seconds.
        </CardContent>
      </Card>
    );
  }
  if (state === "AUTO_VERIFIED") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          leftIcon={<CheckCircle2 size={16} />}
          onClick={onApprove}
          disabled={busy !== null}
          loading={busy === "approve"}
        >
          Approve
        </Button>
        <Button
          variant="secondary"
          leftIcon={<Flag size={16} />}
          onClick={onReject}
          disabled={busy !== null}
          loading={busy === "reject"}
        >
          Flag for review
        </Button>
      </div>
    );
  }
  if (state === "FLAGGED") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          leftIcon={<CheckCircle2 size={16} />}
          onClick={onApprove}
          disabled={busy !== null}
          loading={busy === "approve"}
        >
          Approve with override
        </Button>
        <Button
          variant="danger"
          leftIcon={<XCircle size={16} />}
          onClick={onReject}
          disabled={busy !== null}
          loading={busy === "reject"}
        >
          Reject
        </Button>
      </div>
    );
  }
  if (state === "APPROVED") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          leftIcon={<Package size={16} />}
          onClick={onExport}
          disabled={busy !== null}
          loading={busy === "export"}
        >
          Generate tranche pack
        </Button>
      </div>
    );
  }
  if (state === "EXPORTED") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          leftIcon={<Banknote size={16} />}
          onClick={onBankAccept}
          disabled={busy !== null}
          loading={busy === "bank_accept"}
        >
          Mark as bank accepted
        </Button>
        <Button
          variant="danger"
          leftIcon={<XCircle size={16} />}
          onClick={onBankReject}
          disabled={busy !== null}
        >
          Mark as bank rejected
        </Button>
      </div>
    );
  }
  // Terminal states: BANK_ACCEPTED / BANK_REJECTED / REJECTED → show outcome card, no actions
  if (state === "BANK_ACCEPTED") {
    return (
      <Card className="border-state-verified/40 bg-state-verified-bg">
        <CardContent className="py-4 flex items-center gap-3">
          <CheckCircle2 className="text-state-verified" size={22} />
          <div>
            <div className="text-body font-semibold text-ink">Tranche released</div>
            <div className="text-caption text-ink-tertiary">
              Bank confirmed disbursement. Workflow is closed.
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
  if (state === "BANK_REJECTED" || state === "REJECTED") {
    return (
      <Card className="border-state-flagged/40 bg-state-flagged-bg">
        <CardContent className="py-4 flex items-center gap-3">
          <XCircle className="text-state-flagged" size={22} />
          <div>
            <div className="text-body font-semibold text-ink">
              {state === "BANK_REJECTED" ? "Bank rejected tranche" : "Milestone rejected"}
            </div>
            <div className="text-caption text-ink-tertiary">
              Workflow is closed. No further action available.
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
  return null; // DRAFT — no buttons in this demo
}

// ============================================================
// Tab button
// ============================================================
function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        inline-flex items-center gap-2 px-4 py-3 -mb-px border-b-2 transition-colors duration-fast
        ${active
          ? "border-accent text-ink"
          : "border-transparent text-ink-tertiary hover:text-ink"}
      `}
    >
      {icon}
      <span className="text-body font-medium">{children}</span>
    </button>
  );
}

// ============================================================
// Evidence tab
// ============================================================
function EvidenceTab({ media }: { media: Media[] }) {
  if (media.length === 0) {
    return (
      <EmptyState
        icon={<Camera />}
        title="No evidence yet"
        description="An inspector can submit via /capture, or you can simulate one from /demo."
      />
    );
  }
  return (
    <div className="space-y-3">
      {media.map((m) => (
        <EvidenceCard key={m.id} media={m} />
      ))}
    </div>
  );
}

// ============================================================
// Details tab
// ============================================================
function DetailsTab({ workflow }: { workflow: Workflow }) {
  const { meta } = workflow;
  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <DetailCard
        icon={<Banknote className="text-ink-muted" size={18} />}
        label="Loan"
        value={`${meta.loan_amount.toLocaleString()} ${meta.loan_currency}`}
        sub={`Tranche ${meta.current_tranche} of ${meta.total_tranches}`}
      />
      <DetailCard
        icon={<MapPin className="text-ink-muted" size={18} />}
        label="Geofence"
        value={`${meta.coordinates.lat.toFixed(4)}, ${meta.coordinates.lng.toFixed(4)}`}
        sub={`radius ${meta.geofence_radius_meters} m`}
        mono
      />
      <DetailCard
        icon={<FileText className="text-ink-muted" size={18} />}
        label="Milestone"
        value={meta.milestone_description}
        sub={`Expected ${meta.expected_completion}`}
      />
      <DetailCard
        icon={<KeyRound className="text-ink-muted" size={18} />}
        label="Challenge code"
        value={meta.challenge_code}
        sub={`Issued ${new Date(meta.challenge_issued_at).toLocaleString()}`}
        mono
      />
      <Card className="sm:col-span-2">
        <CardContent className="py-4">
          <div className="text-micro uppercase text-ink-muted mb-1">Developer</div>
          <div className="text-body text-ink">{meta.developer_name}</div>
          <div className="text-caption text-ink-tertiary mt-0.5">{meta.address}</div>
        </CardContent>
      </Card>
    </div>
  );
}

function DetailCard({
  icon,
  label,
  value,
  sub,
  mono = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  mono?: boolean;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center gap-2 text-micro uppercase text-ink-muted mb-1.5">
          {icon}
          {label}
        </div>
        <div className={`text-body text-ink ${mono ? "font-mono" : ""}`}>{value}</div>
        {sub && <div className="text-caption text-ink-tertiary mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

// ============================================================
// Audit tab — chain integrity indicator + event timeline
// ============================================================
function AuditTab({
  events,
  chainValid,
  anchor,
}: {
  events: LedgerEvent[];
  chainValid: boolean | null;
  anchor: string | null;
}) {
  return (
    <div className="space-y-4">
      {/* Integrity indicator */}
      <Card>
        <CardContent className="py-4 flex items-start gap-3">
          <div
            className={`shrink-0 rounded-md p-2 ${
              chainValid === null
                ? "bg-surface-elevated text-ink-muted"
                : chainValid
                  ? "bg-state-verified-bg text-state-verified"
                  : "bg-state-flagged-bg text-state-flagged"
            }`}
          >
            <ShieldCheck size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-body font-semibold text-ink">
              Ledger integrity
            </div>
            {chainValid === null ? (
              <div className="text-caption text-ink-tertiary">verifying chain…</div>
            ) : chainValid ? (
              <>
                <div className="text-caption text-state-verified">
                  ✓ chain valid · {events.length} events in this workflow
                </div>
                {anchor && (
                  <div className="text-micro text-ink-muted font-mono mt-1 truncate">
                    anchor: {anchor.slice(0, 40)}…
                  </div>
                )}
              </>
            ) : (
              <div className="text-caption text-state-flagged">
                ⚠ chain broken — export blocked until investigated
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {events.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck />}
          title="No events yet"
          description="Ledger entries will appear here as the workflow progresses."
        />
      ) : (
        <Card>
          <ol className="divide-y divide-hairline-subtle">
            {events.map((l) => (
              <li key={l.id} className="px-6 py-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="text-body font-medium text-ink">
                    {l.event_type.replace(/_/g, " ")}
                  </div>
                  <div className="text-caption text-ink-tertiary font-mono truncate mt-0.5">
                    {l.actor_id ? `actor ${l.actor_id.slice(0, 8)}…` : "system"}
                  </div>
                  <details className="mt-2">
                    <summary className="text-micro text-ink-muted cursor-pointer hover:text-ink-tertiary uppercase">
                      Technical details
                    </summary>
                    <div className="mt-2 space-y-1 text-micro font-mono text-ink-muted">
                      <div className="truncate">
                        hash: {l.hash.slice(0, 32)}…
                      </div>
                      <div className="truncate">
                        prev: {l.prev_hash?.slice(0, 32) ?? "GENESIS"}
                      </div>
                      <pre className="bg-surface-subtle rounded p-2 text-micro overflow-x-auto">
                        {JSON.stringify(l.payload, null, 2)}
                      </pre>
                    </div>
                  </details>
                </div>
                <div className="text-caption text-ink-tertiary whitespace-nowrap">
                  {new Date(l.created_at).toLocaleString()}
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// Evidence card — restyled for Day 6 in the same pass
// ============================================================
function EvidenceCard({ media }: { media: Media }) {
  const r = media.meta.fraud_result;
  const verified = r.verdict === "VERIFIED";
  const [open, setOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoErr, setVideoErr] = useState<string | null>(null);

  const videoPath = media.meta.video_storage_path;

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
    <Card
      className={
        verified
          ? "border-state-verified/30"
          : "border-state-flagged/30"
      }
    >
      <CardContent className="py-4">
        <div className="flex items-center gap-4">
          {media.meta.data_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={media.meta.data_url}
              alt="evidence"
              className="w-14 h-14 object-cover rounded border border-hairline-subtle shrink-0"
            />
          ) : (
            <div className="w-14 h-14 rounded bg-surface-elevated flex items-center justify-center text-2xl shrink-0">
              {media.meta.thumbnail_emoji ?? "📷"}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <VerdictPill verdict={r.verdict} />
              <span className="font-mono text-caption text-ink-secondary">
                {r.aggregate_score.toFixed(2)}
              </span>
              <span className="text-micro uppercase text-ink-muted">
                {media.meta.source}
              </span>
              {videoPath && (
                <span className="rounded-full bg-state-info-bg border border-state-info/30 px-2 py-0.5 text-micro text-state-info uppercase">
                  🎥 video
                </span>
              )}
              {media.meta.ai_narration && (
                <span className="rounded-full bg-state-flagged-bg border border-state-flagged/30 px-2 py-0.5 text-micro text-state-flagged uppercase">
                  AI review
                </span>
              )}
            </div>
            <div className="text-caption text-ink-tertiary mt-1 truncate">
              {new Date(media.created_at).toLocaleString()} · sha256: {media.sha256.slice(0, 20)}…
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Hide" : "Details"}
          </Button>
        </div>

        {open && (
          <div className="mt-5 space-y-3 pt-5 border-t border-hairline-subtle">
            {media.meta.ai_narration && (
              <AiReviewCallout
                text={media.meta.ai_narration}
                model={media.meta.ai_narration_model}
                when={media.meta.ai_narration_at}
              />
            )}
            {videoPath && (
              <div className="rounded-md border border-hairline-subtle bg-surface-subtle p-2">
                <div className="text-micro uppercase text-ink-muted mb-1">
                  15-second site video
                </div>
                {videoErr ? (
                  <div className="text-caption text-state-flagged">
                    video unavailable: {videoErr}
                  </div>
                ) : videoUrl ? (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video
                    controls
                    preload="metadata"
                    src={videoUrl}
                    className="w-full max-h-64 rounded bg-black"
                  />
                ) : (
                  <div className="text-caption text-ink-tertiary">loading video…</div>
                )}
                {media.meta.video_bytes != null && (
                  <div className="text-micro text-ink-muted font-mono mt-1">
                    {(media.meta.video_bytes / 1024).toFixed(0)} KB ·{" "}
                    {media.meta.video_mime_type ?? "video"}
                  </div>
                )}
              </div>
            )}
            <FraudScoreBar score={r.aggregate_score} />
            <FraudCheckList result={r} />
            <EvidenceGpsMap
              lat={media.meta.gps.lat}
              lng={media.meta.gps.lng}
              accuracy={media.meta.gps.accuracy}
            />
            <SensorVariancePanel
              motionVariance={media.meta.motion_variance}
              gyroVariance={media.meta.gyro_variance}
              lightingVariance={media.meta.lighting_variance}
              frameChangeAvg={media.meta.frame_change_avg}
              frameSamples={media.meta.frame_dhashes?.length}
            />
            <div className="text-micro font-mono text-ink-muted">
              storage: {media.storage_path}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// AI narration callout (shown when /api/ai/narrate-flag has written to meta)
function AiReviewCallout({
  text,
  model,
  when,
}: {
  text: string;
  model?: string;
  when?: string;
}) {
  return (
    <div className="rounded-md border border-state-flagged/30 bg-state-flagged-bg p-4">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle size={14} className="text-state-flagged" />
        <span className="text-micro uppercase text-state-flagged font-semibold">AI Review</span>
        {when && (
          <span className="text-micro text-ink-muted">
            · {new Date(when).toLocaleTimeString()}
          </span>
        )}
        {model && <span className="text-micro text-ink-muted font-mono">· {model}</span>}
      </div>
      <p className="text-body text-ink-secondary leading-relaxed">
        &ldquo;{text}&rdquo;
      </p>
    </div>
  );
}

// Embedded OSM map pin at the capture GPS.
function EvidenceGpsMap({
  lat,
  lng,
  accuracy,
}: {
  lat: number;
  lng: number;
  accuracy: number;
}) {
  const pad = 0.0025;
  const bbox = `${lng - pad},${lat - pad},${lng + pad},${lat + pad}`;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
  const osmLink = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=18/${lat}/${lng}`;
  return (
    <div className="rounded-md border border-hairline-subtle bg-surface-subtle p-2">
      <div className="flex items-center justify-between mb-1">
        <div className="text-micro uppercase text-ink-muted">Capture location</div>
        <a
          href={osmLink}
          target="_blank"
          rel="noreferrer"
          className="text-micro text-state-info hover:underline"
        >
          open on OpenStreetMap
        </a>
      </div>
      <iframe
        title="capture location map"
        src={src}
        className="w-full h-48 rounded border border-hairline-subtle bg-surface-card"
        loading="lazy"
      />
      <div className="text-micro text-ink-muted font-mono mt-1">
        {lat.toFixed(5)}, {lng.toFixed(5)} · ±{accuracy.toFixed(0)} m
      </div>
    </div>
  );
}

// Sensor variance + optical-flow proxy panel.
function SensorVariancePanel({
  motionVariance,
  gyroVariance,
  lightingVariance,
  frameChangeAvg,
  frameSamples,
}: {
  motionVariance: number;
  gyroVariance: number | undefined;
  lightingVariance: number;
  frameChangeAvg: number | undefined;
  frameSamples: number | undefined;
}) {
  return (
    <div className="rounded-md border border-hairline-subtle bg-surface-subtle p-3 space-y-2">
      <div className="text-micro uppercase text-ink-muted">Sensor variance</div>
      <VarianceBar label="Accel (m/s²)" value={motionVariance} min={1e-5} max={10} passMin={0.001} passMax={1.0} />
      {gyroVariance != null && (
        <VarianceBar label="Gyro (°/s)" value={gyroVariance} min={1e-3} max={1e5} passMin={1} passMax={1e4} />
      )}
      <VarianceBar label="Lighting (luma)" value={lightingVariance} min={1e-4} max={1} passMin={0.02} passMax={1} />
      {frameChangeAvg != null && frameSamples != null && (
        <div className="pt-1 border-t border-hairline-subtle flex items-center justify-between">
          <span className="text-micro text-ink-tertiary">
            Optical-flow proxy ({frameSamples} frames)
          </span>
          <span
            className={`font-mono text-caption ${
              frameChangeAvg >= 3 ? "text-state-verified" : "text-state-flagged"
            }`}
          >
            {frameChangeAvg.toFixed(1)} bits/pair ·{" "}
            {frameChangeAvg >= 3 ? "scene moved" : "scene frozen"}
          </span>
        </div>
      )}
    </div>
  );
}

function VarianceBar({
  label,
  value,
  min,
  max,
  passMin,
  passMax,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  passMin: number;
  passMax: number;
}) {
  const clamp = (x: number) => Math.max(min, Math.min(max, x));
  const toPct = (x: number) => {
    const lx = Math.log10(clamp(x));
    const lmin = Math.log10(min);
    const lmax = Math.log10(max);
    return ((lx - lmin) / (lmax - lmin)) * 100;
  };
  const markerPct = toPct(value);
  const passStart = toPct(passMin);
  const passEnd = toPct(passMax);
  const inside = value >= passMin && value <= passMax;

  return (
    <div>
      <div className="flex items-center justify-between text-micro text-ink-tertiary mb-1">
        <span>{label}</span>
        <span className={`font-mono ${inside ? "text-state-verified" : "text-state-flagged"}`}>
          {value.toExponential(2)}
        </span>
      </div>
      <div className="relative h-3 rounded bg-surface-elevated overflow-hidden">
        <div
          className="absolute top-0 bottom-0 bg-state-verified/20 border-x border-state-verified/40"
          style={{ left: `${passStart}%`, width: `${passEnd - passStart}%` }}
        />
        <div
          className={`absolute top-0 bottom-0 w-0.5 ${inside ? "bg-state-verified" : "bg-state-flagged"}`}
          style={{ left: `calc(${markerPct}% - 1px)` }}
        />
      </div>
      <div className="flex justify-between text-micro text-ink-muted font-mono mt-0.5">
        <span>{min.toExponential(0)}</span>
        <span>pass zone</span>
        <span>{max.toExponential(0)}</span>
      </div>
    </div>
  );
}

// Unused import shim — keeps useMemo tree-shaken friendly in dev mode
void useMemo;
