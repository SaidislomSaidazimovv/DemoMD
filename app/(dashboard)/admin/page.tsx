"use client";

import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
import {
  Plus,
  ArrowRight,
  Building2,
  TrendingUp,
  ShieldCheck,
  CheckCircle2,
  Camera,
  KeyRound,
  AlertTriangle,
  Package,
  Banknote,
  UserPlus,
  ArrowRightLeft,
  FileDown,
} from "lucide-react";
import { useRequireRole } from "@/lib/hooks";
import { createClient } from "@/lib/supabase/browser";
import { createWorkflow } from "@/lib/actions";
import { Kpi, Card, CardContent, Button, EmptyState } from "@/components/ui";
import type { LedgerEvent, Organization, Workflow } from "@/lib/types";

// Home screen per TASDIQ_UI_REDESIGN.md Screen 2.
// Hero + 3 KPIs + humanized Recent activity feed.
// Users list moved to /team. Raw ledger hashes moved to /audit.

export default function AdminHomePage() {
  const { session, loading } = useRequireRole(["admin"]);
  const [org, setOrg] = useState<Organization | null>(null);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    const supabase = createClient();
    const [{ data: orgs }, { data: w }, { data: e }] = await Promise.all([
      supabase.from("organizations").select("*").limit(1),
      supabase.from("workflows").select("*").order("updated_at", { ascending: false }),
      supabase.from("ledger_events").select("*").order("created_at", { ascending: false }).limit(12),
    ]);
    setOrg(((orgs as Organization[]) ?? [])[0] ?? null);
    setWorkflows((w as Workflow[]) ?? []);
    setEvents((e as LedgerEvent[]) ?? []);
  }

  useEffect(() => {
    if (loading || !session) return;
    refresh();
    const supabase = createClient();
    const ch = supabase
      .channel("admin-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ledger_events" }, () => refresh())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "workflows" }, () => refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "workflows" }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [loading, session]);

  const stats = useMemo(() => {
    const total = workflows.length;
    const active = workflows.filter((w) =>
      ["EVIDENCE_REQUESTED", "CAPTURED", "AUTO_VERIFIED", "FLAGGED", "APPROVED"].includes(w.current_state)
    ).length;
    const verified = workflows.filter((w) =>
      ["AUTO_VERIFIED", "APPROVED", "EXPORTED", "BANK_ACCEPTED"].includes(w.current_state)
    ).length;
    const terminal = workflows.filter((w) =>
      ["BANK_ACCEPTED", "BANK_REJECTED", "REJECTED"].includes(w.current_state)
    ).length;
    const verifiedLoanSum = workflows
      .filter((w) => ["AUTO_VERIFIED", "APPROVED", "EXPORTED", "BANK_ACCEPTED"].includes(w.current_state))
      .reduce((s, w) => s + (Number(w.meta?.loan_amount) || 0), 0);
    const successRate = terminal > 0
      ? Math.round(
          (workflows.filter((w) => w.current_state === "BANK_ACCEPTED").length / terminal) * 100
        )
      : null;
    return { total, active, verified, verifiedLoanSum, successRate };
  }, [workflows]);

  const awaiting = workflows.find((w) => w.current_state === "EVIDENCE_REQUESTED") ?? null;

  if (loading || !session) {
    return <div className="p-10 text-ink-muted">Loading…</div>;
  }

  const greeting = greetingFor(new Date());
  const firstName = (session.profile?.full_name ?? "").split(" ")[0] || "there";

  return (
    <div className="p-6 sm:p-10 max-w-6xl mx-auto space-y-10">
      {/* Hero */}
      <header className="space-y-3">
        <h1 className="text-display text-ink">
          {greeting}, {firstName}
        </h1>
        <p className="text-caption text-ink-tertiary uppercase">
          {org?.name ?? "—"} · admin
        </p>

        {awaiting ? (
          <Card className="mt-6">
            <CardContent className="py-5 flex items-center gap-4">
              <div className="shrink-0 rounded-md bg-state-pending-bg p-2.5 text-state-pending">
                <Camera size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-caption text-ink-tertiary">
                  1 active project awaiting evidence
                </div>
                <div className="text-body font-semibold text-ink truncate">
                  {awaiting.reference_label}
                </div>
              </div>
              <Link href={`/dashboard/project/${awaiting.id}`}>
                <Button variant="ghost" rightIcon={<ArrowRight size={16} />}>
                  View
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : stats.total === 0 ? null : (
          <Card className="mt-6">
            <CardContent className="py-5 flex items-center gap-4">
              <div className="shrink-0 rounded-md bg-state-verified-bg p-2.5 text-state-verified">
                <CheckCircle2 size={22} />
              </div>
              <div className="flex-1">
                <div className="text-caption text-ink-tertiary">All caught up</div>
                <div className="text-body text-ink">
                  No projects are currently waiting for evidence.
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="pt-2">
          <Button
            variant="primary"
            size="lg"
            leftIcon={<Plus size={18} />}
            onClick={() => setShowCreate(true)}
          >
            Create new project
          </Button>
        </div>
      </header>

      {notice && (
        <div className="rounded-md border border-state-verified/30 bg-state-verified-bg px-4 py-3 text-body text-state-verified">
          {notice}
        </div>
      )}

      {showCreate && (
        <CreateProjectModal
          onClose={() => setShowCreate(false)}
          onCreated={(msg) => {
            setShowCreate(false);
            setNotice(msg);
            refresh();
          }}
        />
      )}

      {/* KPIs */}
      <section>
        <h2 className="text-heading-2 text-ink mb-4">This quarter</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Kpi
            label="Total projects"
            value={stats.total}
            sub={stats.active === 0 ? "none active" : `${stats.active} under verification`}
            icon={<Building2 size={18} />}
          />
          <Kpi
            label="Verified loan volume"
            value={formatCurrency(stats.verifiedLoanSum)}
            sub={stats.verified > 0 ? `${stats.verified} milestone${stats.verified === 1 ? "" : "s"} passed` : "nothing verified yet"}
            tone={stats.verified > 0 ? "verified" : "neutral"}
            icon={<Banknote size={18} />}
          />
          <Kpi
            label="Success rate"
            value={stats.successRate == null ? "—" : `${stats.successRate}%`}
            sub={
              stats.successRate == null
                ? "no completed tranches yet"
                : stats.successRate >= 90
                  ? "above industry baseline"
                  : "below industry baseline"
            }
            tone={stats.successRate != null && stats.successRate >= 90 ? "verified" : "neutral"}
            icon={<TrendingUp size={18} />}
          />
        </div>
      </section>

      {/* Recent activity */}
      <section>
        <div className="flex items-baseline justify-between mb-4">
          <h2 className="text-heading-2 text-ink">Recent activity</h2>
          <Link
            href="/audit"
            className="text-caption text-ink-tertiary hover:text-ink inline-flex items-center gap-1"
          >
            View full audit trail <ArrowRight size={14} />
          </Link>
        </div>

        {events.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck />}
            title="No activity yet"
            description="Once you create a project and evidence starts flowing, every action will be listed here and sealed into the tamper-evident ledger."
          />
        ) : (
          <Card>
            <ul className="divide-y divide-hairline-subtle">
              {events.map((ev) => (
                <ActivityRow key={ev.id} event={ev} workflows={workflows} />
              ))}
            </ul>
          </Card>
        )}
      </section>
    </div>
  );
}

// ============================================================
// Activity feed row — humanized from a raw ledger event
// ============================================================
function ActivityRow({ event, workflows }: { event: LedgerEvent; workflows: Workflow[] }) {
  const { Icon, tone, title, detail } = humanize(event);
  const project = workflows.find((w) => w.id === event.workflow_id);
  const when = new Date(event.created_at);

  return (
    <li className="flex items-start gap-4 px-6 py-4">
      <div className={`shrink-0 rounded-md p-2 ${tone}`}>
        <Icon size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-body text-ink">{title}</div>
        <div className="text-caption text-ink-tertiary mt-0.5 truncate">
          {project ? (
            <Link href={`/dashboard/project/${project.id}`} className="hover:text-ink">
              {project.reference_label}
            </Link>
          ) : (
            <span>{event.workflow_id ? "project" : "organization-level"}</span>
          )}
          {detail && <span> · {detail}</span>}
          <span> · {relativeTime(when)}</span>
        </div>
      </div>
    </li>
  );
}

function humanize(event: LedgerEvent): {
  Icon: typeof Camera;
  tone: string;
  title: string;
  detail?: string;
} {
  const payload = event.payload as Record<string, unknown>;
  switch (event.event_type) {
    case "workflow_created":
      return {
        Icon: Building2,
        tone: "bg-state-info-bg text-state-info",
        title: "Project created",
      };
    case "challenge_issued":
      return {
        Icon: KeyRound,
        tone: "bg-state-pending-bg text-state-pending",
        title: payload?.rotated ? "Challenge code rotated" : "Challenge code issued",
      };
    case "media_uploaded":
      return {
        Icon: Camera,
        tone: "bg-state-info-bg text-state-info",
        title: "Evidence uploaded",
      };
    case "evidence_captured": {
      const verdict = (payload?.verdict as string) ?? "—";
      return {
        Icon: verdict === "VERIFIED" ? CheckCircle2 : AlertTriangle,
        tone: verdict === "VERIFIED"
          ? "bg-state-verified-bg text-state-verified"
          : "bg-state-flagged-bg text-state-flagged",
        title: verdict === "VERIFIED" ? "Evidence verified" : "Evidence flagged",
        detail: typeof payload?.fraud_score === "number"
          ? `score ${(payload.fraud_score as number).toFixed(2)}`
          : undefined,
      };
    }
    case "fraud_detected":
      return {
        Icon: AlertTriangle,
        tone: "bg-state-flagged-bg text-state-flagged",
        title: "Fraud detected",
      };
    case "state_changed": {
      const to = (payload?.to as string) ?? "";
      return {
        Icon: ArrowRightLeft,
        tone: "bg-surface-elevated text-ink-secondary",
        title: `Moved to ${to.replace(/_/g, " ").toLowerCase()}`,
      };
    }
    case "export_generated":
      return {
        Icon: Package,
        tone: "bg-state-info-bg text-state-info",
        title: "Tranche pack exported",
      };
    case "tranche_released":
      return {
        Icon: FileDown,
        tone: "bg-state-verified-bg text-state-verified",
        title: "Tranche released by bank",
      };
    case "user_invited":
      return {
        Icon: UserPlus,
        tone: "bg-surface-elevated text-ink-secondary",
        title: "Team member invited",
      };
    case "ai_narration_generated":
      return {
        Icon: ShieldCheck,
        tone: "bg-state-info-bg text-state-info",
        title: "AI review generated",
      };
    default:
      return {
        Icon: ShieldCheck,
        tone: "bg-surface-elevated text-ink-muted",
        title: event.event_type.replace(/_/g, " "),
      };
  }
}

function relativeTime(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hour${diffHr === 1 ? "" : "s"} ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
  return d.toLocaleDateString();
}

function greetingFor(now: Date): string {
  const h = now.getHours();
  if (h < 5) return "Still up";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function formatCurrency(amount: number): string {
  if (amount === 0) return "0 UZS";
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(1)}B UZS`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M UZS`;
  return `${amount.toLocaleString()} UZS`;
}

// ============================================================
// Create project modal
// ============================================================
function CreateProjectModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (message: string) => void;
}) {
  const [referenceId, setReferenceId] = useState("NBU-2026-Q2-0001");
  const [label, setLabel] = useState("Yashnobod Residential, Block 4 — 3rd floor");
  const [developer, setDeveloper] = useState("YashnobodQurilish LLC");
  const [address, setAddress] = useState("Yashnobod district, Tashkent");
  const [lat, setLat] = useState(41.2995);
  const [lng, setLng] = useState(69.2401);
  const [radius, setRadius] = useState(100);
  const [milestone, setMilestone] = useState("3rd floor frame complete");
  const [challenge, setChallenge] = useState(generateChallenge());
  const [loanAmount, setLoanAmount] = useState(8_500_000_000);
  const [tranche, setTranche] = useState(3);
  const [totalTranches, setTotalTranches] = useState(5);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      await createWorkflow({
        type: "tranche_verification",
        reference_id: referenceId,
        reference_label: label,
        meta: {
          developer_name: developer,
          address,
          coordinates: { lat, lng },
          geofence_radius_meters: radius,
          milestone_description: milestone,
          total_tranches: totalTranches,
          current_tranche: tranche,
          loan_amount: loanAmount,
          loan_currency: "UZS",
          expected_completion: "2026-05-15",
          challenge_code: challenge,
          challenge_issued_at: now,
        },
      });
      onCreated(`Project ${referenceId} created.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-2xl rounded-xl border border-hairline-strong bg-surface-card p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-heading-2 text-ink">New construction project</h3>
          <button onClick={onClose} className="text-ink-tertiary hover:text-ink text-body">
            ✕
          </button>
        </div>
        <form onSubmit={submit} className="grid sm:grid-cols-2 gap-3">
          <F label="Reference ID">
            <input required value={referenceId} onChange={(e) => setReferenceId(e.target.value)} className="input font-mono" />
          </F>
          <F label="Label">
            <input required value={label} onChange={(e) => setLabel(e.target.value)} className="input" />
          </F>
          <F label="Developer">
            <input required value={developer} onChange={(e) => setDeveloper(e.target.value)} className="input" />
          </F>
          <F label="Address">
            <input required value={address} onChange={(e) => setAddress(e.target.value)} className="input" />
          </F>
          <F label="GPS lat">
            <input type="number" step="any" required value={lat} onChange={(e) => setLat(Number(e.target.value))} className="input font-mono" />
          </F>
          <F label="GPS lng">
            <input type="number" step="any" required value={lng} onChange={(e) => setLng(Number(e.target.value))} className="input font-mono" />
          </F>
          <F label="Geofence radius (m)">
            <input type="number" required value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="input font-mono" />
          </F>
          <F label="Challenge code">
            <div className="flex gap-2">
              <input required value={challenge} onChange={(e) => setChallenge(e.target.value.toUpperCase())} className="input font-mono" />
              <button
                type="button"
                onClick={() => setChallenge(generateChallenge())}
                className="rounded border border-hairline-strong bg-surface-elevated px-2 text-caption hover:bg-surface-card"
              >
                ↻
              </button>
            </div>
          </F>
          <F label="Milestone description" className="sm:col-span-2">
            <input required value={milestone} onChange={(e) => setMilestone(e.target.value)} className="input" />
          </F>
          <F label="Loan amount (UZS)">
            <input type="number" required value={loanAmount} onChange={(e) => setLoanAmount(Number(e.target.value))} className="input font-mono" />
          </F>
          <F label="Tranche #">
            <div className="flex gap-2">
              <input type="number" required value={tranche} onChange={(e) => setTranche(Number(e.target.value))} className="input font-mono w-20" />
              <span className="self-center text-ink-tertiary">of</span>
              <input type="number" required value={totalTranches} onChange={(e) => setTotalTranches(Number(e.target.value))} className="input font-mono w-20" />
            </div>
          </F>

          {error && (
            <div className="sm:col-span-2 rounded border border-state-flagged/40 bg-state-flagged-bg px-3 py-2 text-caption text-state-flagged">
              {error}
            </div>
          )}

          <div className="sm:col-span-2 flex gap-2 mt-2">
            <Button type="button" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" variant="primary" loading={busy} className="flex-[2]">
              {busy ? "Creating…" : "Create project"}
            </Button>
          </div>
        </form>
        <style jsx>{`
          :global(.input) {
            width: 100%;
            border-radius: 0.375rem;
            border: 1px solid var(--border-strong);
            background: var(--bg-subtle);
            padding: 0.5rem 0.75rem;
            font-size: 0.875rem;
            color: var(--text-primary);
          }
          :global(.input:focus) {
            outline: none;
            border-color: var(--accent);
          }
        `}</style>
      </div>
    </div>
  );
}

function F({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-micro uppercase text-ink-tertiary mb-1">{label}</label>
      {children}
    </div>
  );
}

function generateChallenge(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 4; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}
