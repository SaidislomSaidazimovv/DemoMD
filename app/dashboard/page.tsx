"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Kpi, StateBadge } from "@/components/ui";
import { useRequireRole } from "@/lib/hooks";
import { supabase } from "@/lib/mock-db";
import type { Media, Workflow } from "@/lib/types";

export default function DashboardPage() {
  const { session, loading } = useRequireRole(["bank_officer", "supervisor", "admin"]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [media, setMedia] = useState<Media[]>([]);
  const [lastPush, setLastPush] = useState<Date | null>(null);

  async function refresh() {
    const { data: wfs } = await supabase
      .from<Workflow>("workflows")
      .select()
      .order("updated_at", { ascending: false });
    const { data: ms } = await supabase.from<Media>("media").select();
    setWorkflows(wfs ?? []);
    setMedia(ms ?? []);
  }

  useEffect(() => {
    if (loading || !session) return;
    refresh();

    const ch = supabase
      .channel("dashboard")
      .on("postgres_changes", { event: "INSERT", table: "ledger_events" }, () => {
        setLastPush(new Date());
        refresh();
      })
      .on("postgres_changes", { event: "INSERT", table: "media" }, () => {
        refresh();
      })
      .on("postgres_changes", { event: "UPDATE", table: "workflows" }, () => {
        setLastPush(new Date());
        refresh();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [loading, session]);

  if (loading || !session) {
    return (
      <main className="min-h-screen p-10 text-slate-500">Loading…</main>
    );
  }

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
    <main className="min-h-screen p-6 sm:p-10 max-w-6xl mx-auto space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Bank Dashboard</h1>
          <p className="text-sm text-slate-400">
            NBU — Demo Bank · signed in as {session.user.email} ({session.user.role})
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {lastPush && (
            <span className="text-xs text-emerald-400">
              ● Live · last update {lastPush.toLocaleTimeString()}
            </span>
          )}
          <Link
            href="/demo"
            className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 hover:bg-slate-700"
          >
            Demo Control →
          </Link>
          <SignOutButton />
        </div>
      </header>

      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Total projects" value={total} tone="slate" />
        <Kpi label="Pending" value={pending} tone="amber" sub="awaiting evidence" />
        <Kpi label="Verified" value={verified} tone="emerald" sub="auto + approved" />
        <Kpi label="Flagged" value={flagged} tone="rose" sub="needs review" />
      </section>

      <section className="rounded-lg border border-slate-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-900 text-slate-400 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left p-3">Project</th>
              <th className="text-left p-3">Developer</th>
              <th className="text-left p-3">Milestone</th>
              <th className="text-left p-3">State</th>
              <th className="text-right p-3">Evidence</th>
              <th className="text-right p-3">Last activity</th>
            </tr>
          </thead>
          <tbody>
            {workflows.map((w) => {
              const evList = media.filter((m) => m.workflow_id === w.id);
              const last = evList.sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
              return (
                <tr
                  key={w.id}
                  className="border-t border-slate-800 hover:bg-slate-900/70 transition"
                >
                  <td className="p-3 align-top">
                    <Link
                      href={`/dashboard/project/${w.id}`}
                      className="font-medium text-brand-fg hover:underline"
                    >
                      {w.reference_label}
                    </Link>
                    <div className="text-xs text-slate-500 mt-0.5">{w.reference_id}</div>
                  </td>
                  <td className="p-3 text-slate-300 align-top">{w.meta.developer_name}</td>
                  <td className="p-3 text-slate-300 align-top">
                    {w.meta.milestone_description}
                    <div className="text-xs text-slate-500">
                      Tranche {w.meta.current_tranche}/{w.meta.total_tranches}
                    </div>
                  </td>
                  <td className="p-3 align-top">
                    <StateBadge state={w.current_state} />
                  </td>
                  <td className="p-3 text-right align-top font-mono text-xs">{evList.length}</td>
                  <td className="p-3 text-right text-xs text-slate-400 align-top whitespace-nowrap">
                    {last
                      ? new Date(last.created_at).toLocaleString()
                      : new Date(w.updated_at).toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <p className="text-xs text-slate-500">
        Dashboard receives live updates via realtime. No polling, no refresh needed.
      </p>
    </main>
  );
}

function SignOutButton() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      onClick={async () => {
        setBusy(true);
        await supabase.auth.signOut();
        window.location.href = "/login";
      }}
      disabled={busy}
      className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 hover:bg-slate-700 disabled:opacity-50"
    >
      Sign out
    </button>
  );
}
