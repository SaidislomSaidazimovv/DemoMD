"use client";

import { useCallback, useEffect, useState } from "react";
import { Check } from "lucide-react";
import { BfCard, BfCardContent, BfButton } from "@/components/butterfly/ui";
import { useBfSession } from "@/components/butterfly/app-shell";
import { createClient } from "@/lib/supabase/browser";
import { seedButterflyDeploy, transitionWorkflow } from "@/lib/actions";
import type { Workflow, WorkflowState } from "@/lib/types";

// Deploy phase tracker.
// Renders the single `protocol_deployment` workflow for the org across
// the 6-state machine: SETUP → TRAINING_SCHEDULED → TRAINING_ACTIVE →
// DEPLOYED → ACTIVE → REPORTING. Calm progress view, one advance
// button visible at a time.

type PhaseDef = { state: WorkflowState; label: string; summary: string; next?: WorkflowState };

const PHASES: PhaseDef[] = [
  {
    state: "SETUP",
    label: "Setup",
    summary: "Workspace created. Review privacy posture. Decide who trains first.",
    next: "TRAINING_SCHEDULED",
  },
  {
    state: "TRAINING_SCHEDULED",
    label: "Training scheduled",
    summary: "Training modules assigned to managers. Start date set.",
    next: "TRAINING_ACTIVE",
  },
  {
    state: "TRAINING_ACTIVE",
    label: "Training active",
    summary: "Managers are completing the three-module sequence. Wait for coverage > threshold.",
    next: "DEPLOYED",
  },
  {
    state: "DEPLOYED",
    label: "Deployed",
    summary: "Protocol is live. Managers can respond and log check-ins.",
    next: "ACTIVE",
  },
  {
    state: "ACTIVE",
    label: "Active",
    summary: "Check-ins flowing. Aggregate metrics visible on the home screen.",
    next: "REPORTING",
  },
  {
    state: "REPORTING",
    label: "Reporting",
    summary: "Quarter-end. Generate compliance report. Returns to Active afterward.",
    next: "ACTIVE",
  },
];

export default function ButterflyDeployPage() {
  useBfSession();
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("workflows")
      .select("*")
      .eq("type", "protocol_deployment")
      .maybeSingle();
    setWorkflow((data as Workflow | null) ?? null);
  }, []);

  useEffect(() => {
    refresh();
    const supabase = createClient();
    const ch = supabase
      .channel("butterfly-deploy")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "workflows" },
        () => refresh()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [refresh]);

  async function start() {
    setBusy("start");
    setError(null);
    try {
      await seedButterflyDeploy();
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function advance(to: WorkflowState) {
    if (!workflow) return;
    setBusy(to);
    setError(null);
    try {
      await transitionWorkflow({
        workflow_id: workflow.id,
        to_state: to,
        reason: `Advanced to ${to}`,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="bf-fade-in px-6 sm:px-10 py-16 max-w-3xl mx-auto">
      <header className="mb-10">
        <h1 className="text-[40px] font-semibold text-[color:var(--bf-ink)] tracking-tight">
          Deploy
        </h1>
        <p className="mt-3 text-[18px] text-[color:var(--bf-muted)] leading-[1.6] max-w-2xl">
          Six phases, top to bottom. Advance when the organization is ready.
          Every transition is sealed into the ledger.
        </p>
      </header>

      {error && (
        <div className="mb-6 rounded-[12px] border border-[color:var(--bf-flagged)]/30 bg-[color:var(--bf-flagged)]/5 px-4 py-3 text-[14px] text-[color:var(--bf-flagged)]">
          {error}
        </div>
      )}

      {!workflow ? (
        <BfCard>
          <BfCardContent className="py-12 text-center space-y-5">
            <div className="text-[20px] font-semibold text-[color:var(--bf-ink)]">
              Deployment not started
            </div>
            <p className="text-[15px] text-[color:var(--bf-muted)] max-w-md mx-auto">
              Create the protocol-deployment workflow for your workspace. It begins at SETUP
              and advances one phase at a time.
            </p>
            <BfButton variant="primary" onClick={start} disabled={busy !== null}>
              {busy === "start" ? "Starting…" : "Start deployment"}
            </BfButton>
          </BfCardContent>
        </BfCard>
      ) : (
        <ol className="space-y-4">
          {PHASES.map((phase, idx) => (
            <PhaseRow
              key={phase.state}
              phase={phase}
              index={idx + 1}
              currentState={workflow.current_state}
              busy={busy}
              onAdvance={advance}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

function PhaseRow({
  phase,
  index,
  currentState,
  busy,
  onAdvance,
}: {
  phase: PhaseDef;
  index: number;
  currentState: WorkflowState;
  busy: string | null;
  onAdvance: (to: WorkflowState) => void;
}) {
  const currentIdx = PHASES.findIndex((p) => p.state === currentState);
  const myIdx = PHASES.findIndex((p) => p.state === phase.state);
  const done = myIdx < currentIdx;
  const active = myIdx === currentIdx;

  return (
    <li>
      <BfCard
        className={active ? "border-[color:var(--bf-accent)]/40" : ""}
      >
        <BfCardContent className="py-6">
          <div className="flex items-start gap-6">
            <div
              className={`
                shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-[14px] font-semibold tabular-nums transition-colors
                ${done
                  ? "bg-[color:var(--bf-verified)]/10 text-[color:var(--bf-verified)] border border-[color:var(--bf-verified)]/30"
                  : active
                    ? "bg-[color:var(--bf-accent)] text-white"
                    : "border border-[color:var(--bf-hair)] text-[color:var(--bf-caption)]"
                }
              `}
            >
              {done ? <Check size={16} /> : index}
            </div>
            <div className="flex-1 min-w-0">
              <div
                className={`text-[17px] font-semibold tracking-tight ${active ? "text-[color:var(--bf-ink)]" : done ? "text-[color:var(--bf-ink)]" : "text-[color:var(--bf-caption)]"}`}
              >
                {phase.label}
              </div>
              <p
                className={`mt-1.5 text-[14px] leading-[1.6] ${active ? "text-[color:var(--bf-muted)]" : "text-[color:var(--bf-caption)]"}`}
              >
                {phase.summary}
              </p>
            </div>
            <div className="shrink-0">
              {active && phase.next && (
                <BfButton
                  variant="primary"
                  size="md"
                  onClick={() => onAdvance(phase.next!)}
                  disabled={busy !== null}
                >
                  {busy === phase.next ? "…" : "Advance"}
                </BfButton>
              )}
            </div>
          </div>
        </BfCardContent>
      </BfCard>
    </li>
  );
}
