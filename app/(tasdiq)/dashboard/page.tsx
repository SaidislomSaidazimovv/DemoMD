"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Building2, Plus, ArrowRight } from "lucide-react";
import {
  Kpi,
  StateBadge,
  Card,
  Button,
  EmptyState,
} from "@/components/ui";
import { ToastViewport, useToasts } from "@/components/toast";
import { useRequireRoleFromContext } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/browser";
import type { LedgerEvent, Media, Workflow } from "@/lib/types";

// Bank dashboard — KPI overview + project list with two-line rows.
// Per TASDIQ_UI_REDESIGN.md Screen 3.

export default function DashboardPage() {
  const session = useRequireRoleFromContext(["bank_officer", "supervisor", "admin"]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [media, setMedia] = useState<Media[]>([]);
  const [lastPush, setLastPush] = useState<Date | null>(null);
  const { toasts, push: pushToast } = useToasts();

  async function refresh() {
    const supabase = createClient();
    const [{ data: wfs }, { data: ms }] = await Promise.all([
      supabase.from("workflows").select("*").order("updated_at", { ascending: false }),
      supabase.from("media").select("*"),
    ]);
    setWorkflows((wfs as Workflow[]) ?? []);
    setMedia((ms as Media[]) ?? []);
  }

  useEffect(() => {
    refresh();
    const supabase = createClient();
    const ch = supabase
      .channel("dashboard-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "ledger_events" },
        (payload) => {
          setLastPush(new Date());
          refresh();
          const ev = payload.new as LedgerEvent;
          if (ev.event_type === "evidence_captured") {
            const verdict = (ev.payload as { verdict?: string })?.verdict;
            pushToast({
              tone: verdict === "VERIFIED" ? "success" : "warn",
              title:
                verdict === "VERIFIED"
                  ? "New evidence verified"
                  : "Evidence flagged",
              detail:
                verdict === "VERIFIED"
                  ? "Auto-verified by the fraud pipeline."
                  : "One or more fraud checks failed — needs review.",
            });
          } else if (ev.event_type === "fraud_detected") {
            pushToast({
              tone: "error",
              title: "Fraud detected",
              detail: "Screen-replay or duplicate patterns flagged this capture.",
            });
          } else if (ev.event_type === "export_generated") {
            pushToast({
              tone: "info",
              title: "Tranche pack generated",
              detail: "Ready for bank officer review.",
            });
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const total = workflows.length;
  const pending = workflows.filter((w) =>
    ["EVIDENCE_REQUESTED", "CAPTURED"].includes(w.current_state)
  ).length;
  const verified = workflows.filter((w) =>
    ["AUTO_VERIFIED", "APPROVED", "EXPORTED", "BANK_ACCEPTED"].includes(w.current_state)
  ).length;
  const flagged = workflows.filter((w) =>
    ["FLAGGED", "REJECTED", "BANK_REJECTED"].includes(w.current_state)
  ).length;

  return (
    <div className="p-6 sm:p-10 max-w-6xl mx-auto space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-heading-1 text-ink">Projects</h1>
          <p className="text-caption text-ink-tertiary mt-1">
            {session.email} · {session.profile?.role ?? "—"}
          </p>
        </div>
        {lastPush && (
          <span className="text-caption text-state-verified inline-flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-state-verified dot-pulse" />
            Live · last update {lastPush.toLocaleTimeString()}
          </span>
        )}
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Kpi
          label="Active projects"
          value={total}
          sub={total === 0 ? "none yet" : `${total} under verification`}
        />
        <Kpi
          label="Awaiting evidence"
          value={pending}
          tone={pending > 0 ? "pending" : "neutral"}
          sub={pending === 0 ? "all caught up" : `${pending} need${pending === 1 ? "s" : ""} capture`}
        />
        <Kpi
          label="Verified this quarter"
          value={verified}
          tone={verified > 0 ? "verified" : "neutral"}
          sub={verified === 0 ? "none ready yet" : "ready for release"}
        />
        <Kpi
          label="Flagged for review"
          value={flagged}
          tone={flagged > 0 ? "flagged" : "neutral"}
          sub={flagged === 0 ? "no callbacks" : "inspector callbacks"}
        />
      </section>

      {workflows.length === 0 ? (
        <EmptyState
          icon={<Building2 />}
          title="No construction projects yet"
          description="Create your first project to begin verifying construction milestones."
          action={
            session.profile?.role === "admin" ? (
              <Link href="/admin">
                <Button variant="primary" leftIcon={<Plus size={16} />}>
                  Create project
                </Button>
              </Link>
            ) : (
              <p className="text-caption text-ink-muted">
                An admin needs to create one from{" "}
                <Link href="/admin" className="underline">/admin</Link>.
              </p>
            )
          }
        />
      ) : (
        <section>
          <Card>
            <ul className="divide-y divide-hairline-subtle">
              {workflows.map((w) => (
                <ProjectRow
                  key={w.id}
                  workflow={w}
                  media={media.filter((m) => m.workflow_id === w.id)}
                />
              ))}
            </ul>
          </Card>
        </section>
      )}

      <ToastViewport toasts={toasts} />
    </div>
  );
}

function ProjectRow({ workflow, media }: { workflow: Workflow; media: Media[] }) {
  const evList = media.sort((a, b) => b.created_at.localeCompare(a.created_at));
  const last = evList[0];
  const lastScore = last?.meta.fraud_result?.aggregate_score ?? null;
  const lastAt = last ? new Date(last.created_at) : new Date(workflow.updated_at);

  const scoreColor =
    lastScore == null
      ? "text-ink-muted"
      : lastScore >= 0.7
        ? "text-state-verified"
        : lastScore >= 0.4
          ? "text-state-pending"
          : "text-state-flagged";

  return (
    <li>
      <Link
        href={`/dashboard/project/${workflow.id}`}
        className="flex items-start gap-4 px-6 py-5 hover:bg-surface-elevated transition-colors duration-fast"
      >
        <div className="flex-1 min-w-0">
          <div className="text-body font-semibold text-ink truncate">
            {workflow.reference_label}
          </div>
          <div className="text-caption text-ink-tertiary mt-0.5 truncate">
            {workflow.reference_id} · {workflow.meta.developer_name} · Tranche{" "}
            {workflow.meta.current_tranche}/{workflow.meta.total_tranches} ·{" "}
            {workflow.meta.milestone_description}
          </div>
        </div>
        <div className="flex items-center gap-6 shrink-0">
          <div className="flex flex-col items-end gap-1">
            <StateBadge state={workflow.current_state} />
            <span className="text-micro text-ink-muted uppercase">
              {evList.length} evidence{evList.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="hidden sm:flex flex-col items-end gap-1 w-20">
            <span className={`font-mono text-caption tabular-nums ${scoreColor}`}>
              {lastScore == null ? "—" : lastScore.toFixed(2)}
            </span>
            <span className="text-micro text-ink-muted uppercase">score</span>
          </div>
          <div className="hidden md:flex flex-col items-end gap-1 w-28">
            <span className="text-caption text-ink-secondary whitespace-nowrap">
              {relativeTime(lastAt)}
            </span>
            <span className="text-micro text-ink-muted uppercase">
              last activity
            </span>
          </div>
          <ArrowRight size={16} className="text-ink-muted" />
        </div>
      </Link>
    </li>
  );
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
