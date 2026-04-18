"use client";

import { useCallback, useEffect, useState } from "react";
import { Clock, Check, Award, BookOpen } from "lucide-react";
import { BfCard, BfCardContent, BfButton } from "@/components/butterfly/ui";
import { useRequireRole } from "@/lib/hooks";
import { createClient } from "@/lib/supabase/browser";
import { seedButterflyTraining, transitionWorkflow } from "@/lib/actions";
import type { Workflow, WorkflowState } from "@/lib/types";

// Training module player.
// Lists all `training_completion` workflows for the caller's org, with
// state-driven action buttons:
//   NOT_STARTED → Start training (manager, responder)
//   IN_PROGRESS → Mark complete (manager, responder)
//   COMPLETED   → Issue certificate (hr_admin)
//   CERTIFIED   → Download certificate stub
//
// Empty state for hr_admin includes a Seed 3 demo modules button. All
// state transitions go through the core /api/transition endpoint which
// enforces the workflow_transitions table seeded via SQL.

export default function ButterflyTrainingPage() {
  const { session, loading } = useRequireRole(["hr_admin", "manager", "responder", "admin"]);
  const [modules, setModules] = useState<Workflow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("workflows")
      .select("*")
      .eq("type", "training_completion")
      .order("created_at", { ascending: true });
    setModules((data as Workflow[]) ?? []);
  }, []);

  useEffect(() => {
    if (loading || !session) return;
    refresh();
    const supabase = createClient();
    const ch = supabase
      .channel("butterfly-training")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "workflows" },
        () => refresh()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "workflows" },
        () => refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [loading, session, refresh]);

  async function seed() {
    setBusy("seed");
    setError(null);
    try {
      await seedButterflyTraining();
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function progress(workflow: Workflow, to: WorkflowState) {
    setBusy(workflow.id);
    setError(null);
    try {
      await transitionWorkflow({
        workflow_id: workflow.id,
        to_state: to,
        reason: `Training: ${workflow.current_state} → ${to}`,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (loading || !session) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-[color:var(--bf-caption)]">
        Loading…
      </div>
    );
  }

  const role = session.profile?.role;
  const canSeed = role === "hr_admin" || role === "admin";

  const completedCount = modules.filter((m) => m.current_state === "CERTIFIED").length;
  const progressCount = modules.filter((m) => m.current_state !== "NOT_STARTED").length;

  return (
    <div className="bf-fade-in px-6 sm:px-10 py-16 max-w-3xl mx-auto">
      <header className="mb-12">
        <h1 className="text-[40px] font-semibold text-[color:var(--bf-ink)] tracking-tight">
          Training
        </h1>
        <p className="mt-2 text-[18px] text-[color:var(--bf-muted)]">
          Three short modules. Under ten minutes total. Required before the protocol deploys.
        </p>
        {modules.length > 0 && (
          <div className="mt-6 text-[14px] text-[color:var(--bf-caption)]">
            {progressCount} of {modules.length} in progress · {completedCount} certified
          </div>
        )}
      </header>

      {error && (
        <div className="mb-6 rounded-[12px] border border-[color:var(--bf-flagged)]/30 bg-[color:var(--bf-flagged)]/5 px-4 py-3 text-[14px] text-[color:var(--bf-flagged)]">
          {error}
        </div>
      )}

      {modules.length === 0 ? (
        <BfCard>
          <BfCardContent className="py-12 text-center space-y-6">
            <BookOpen size={40} className="mx-auto text-[color:var(--bf-caption)]" />
            <div>
              <div className="text-[20px] font-semibold text-[color:var(--bf-ink)]">
                No training assigned yet
              </div>
              <p className="mt-2 text-[15px] text-[color:var(--bf-muted)] max-w-md mx-auto">
                {canSeed
                  ? "Seed three demo modules to walk through the training flow end-to-end."
                  : "An HR admin will assign modules for you. They will appear here when they do."}
              </p>
            </div>
            {canSeed && (
              <BfButton
                variant="primary"
                onClick={seed}
                disabled={busy !== null}
              >
                {busy === "seed" ? "Seeding…" : "Seed 3 demo modules"}
              </BfButton>
            )}
          </BfCardContent>
        </BfCard>
      ) : (
        <ol className="space-y-4">
          {modules.map((m, idx) => (
            <ModuleRow
              key={m.id}
              module={m}
              index={idx + 1}
              busy={busy === m.id}
              role={role}
              onProgress={progress}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

function ModuleRow({
  module: m,
  index,
  busy,
  role,
  onProgress,
}: {
  module: Workflow;
  index: number;
  busy: boolean;
  role: string | undefined;
  onProgress: (wf: Workflow, to: WorkflowState) => void;
}) {
  const meta = m.meta as unknown as Record<string, unknown>;
  const summary = meta?.summary as string | undefined;
  const minutes = meta?.estimated_minutes as number | undefined;

  return (
    <li>
      <BfCard>
        <BfCardContent className="py-6">
          <div className="flex items-start gap-6">
            <div className="shrink-0 w-9 h-9 rounded-full border border-[color:var(--bf-hair)] text-[color:var(--bf-caption)] flex items-center justify-center text-[14px] font-semibold tabular-nums">
              {index}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[17px] font-semibold text-[color:var(--bf-ink)] tracking-tight">
                {m.reference_label}
              </div>
              {summary && (
                <p className="mt-2 text-[15px] text-[color:var(--bf-muted)] leading-[1.6]">
                  {summary}
                </p>
              )}
              <div className="mt-3 flex items-center gap-4 text-[13px] text-[color:var(--bf-caption)]">
                {minutes && (
                  <span className="inline-flex items-center gap-1.5">
                    <Clock size={13} /> {minutes} min
                  </span>
                )}
                <StateChip state={m.current_state} />
              </div>
            </div>
            <div className="shrink-0">
              <ActionButton module={m} busy={busy} role={role} onProgress={onProgress} />
            </div>
          </div>
        </BfCardContent>
      </BfCard>
    </li>
  );
}

function StateChip({ state }: { state: WorkflowState }) {
  const label =
    state === "NOT_STARTED"
      ? "Not started"
      : state === "IN_PROGRESS"
        ? "In progress"
        : state === "COMPLETED"
          ? "Completed"
          : state === "CERTIFIED"
            ? "Certified"
            : state;
  const cls =
    state === "CERTIFIED"
      ? "text-[color:var(--bf-verified)]"
      : state === "COMPLETED"
        ? "text-[color:var(--bf-accent)]"
        : state === "IN_PROGRESS"
          ? "text-[color:var(--bf-ink)]"
          : "text-[color:var(--bf-caption)]";
  return <span className={`inline-flex items-center gap-1 ${cls}`}>{label}</span>;
}

function ActionButton({
  module: m,
  busy,
  role,
  onProgress,
}: {
  module: Workflow;
  busy: boolean;
  role: string | undefined;
  onProgress: (wf: Workflow, to: WorkflowState) => void;
}) {
  const canProgress = role === "manager" || role === "responder" || role === "hr_admin" || role === "admin";
  const canCertify = role === "hr_admin" || role === "admin";

  switch (m.current_state) {
    case "NOT_STARTED":
      return (
        <BfButton
          variant="primary"
          onClick={() => onProgress(m, "IN_PROGRESS")}
          disabled={busy || !canProgress}
          size="md"
        >
          {busy ? "…" : "Start"}
        </BfButton>
      );
    case "IN_PROGRESS":
      return (
        <BfButton
          variant="primary"
          onClick={() => onProgress(m, "COMPLETED")}
          disabled={busy || !canProgress}
          size="md"
        >
          {busy ? "…" : "Mark complete"}
        </BfButton>
      );
    case "COMPLETED":
      return (
        <BfButton
          variant="primary"
          onClick={() => onProgress(m, "CERTIFIED")}
          disabled={busy || !canCertify}
          size="md"
          leftIcon={<Award size={16} />}
        >
          {busy ? "…" : "Certify"}
        </BfButton>
      );
    case "CERTIFIED":
      return (
        <span className="inline-flex items-center gap-1.5 text-[14px] text-[color:var(--bf-verified)] font-medium">
          <Check size={16} /> Certified
        </span>
      );
    default:
      return null;
  }
}
