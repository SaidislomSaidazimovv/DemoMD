"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StateBadge } from "@/components/ui";
import { useRequireRole } from "@/lib/hooks";
import { supabase } from "@/lib/mock-db";
import type { LedgerEvent, User, Workflow } from "@/lib/types";

export default function AdminPage() {
  const { session, loading } = useRequireRole(["admin"]);
  const [users, setUsers] = useState<User[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [events, setEvents] = useState<LedgerEvent[]>([]);

  async function refresh() {
    const [u, w, e] = await Promise.all([
      supabase.from<User>("users").select(),
      supabase.from<Workflow>("workflows").select(),
      supabase.from<LedgerEvent>("ledger_events").select().order("created_at", { ascending: false }).limit(25),
    ]);
    setUsers(u.data ?? []);
    setWorkflows(w.data ?? []);
    setEvents(e.data ?? []);
  }

  useEffect(() => {
    if (loading || !session) return;
    refresh();
    const ch = supabase
      .channel("admin")
      .on("postgres_changes", { event: "INSERT", table: "ledger_events" }, () => refresh())
      .on("postgres_changes", { event: "UPDATE", table: "workflows" }, () => refresh())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [loading, session]);

  if (loading || !session) {
    return <main className="min-h-screen p-10 text-slate-500">Loading…</main>;
  }

  return (
    <main className="min-h-screen p-6 sm:p-10 max-w-6xl mx-auto space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">Admin Console</h1>
          <p className="text-sm text-slate-400">
            Signed in as {session.user.email} (admin)
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <Link href="/dashboard" className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 hover:bg-slate-700">
            Dashboard →
          </Link>
          <Link href="/demo" className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 hover:bg-slate-700">
            Demo panel →
          </Link>
        </div>
      </header>

      <section>
        <h2 className="text-lg font-semibold mb-3">Users</h2>
        <div className="rounded-lg border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-slate-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3">Email</th>
                <th className="text-left p-3">Role</th>
                <th className="text-left p-3">Org</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-slate-800">
                  <td className="p-3">{u.full_name}</td>
                  <td className="p-3 font-mono text-xs text-slate-300">{u.email}</td>
                  <td className="p-3">
                    <span className="rounded bg-slate-800 px-2 py-0.5 text-xs">{u.role}</span>
                  </td>
                  <td className="p-3 font-mono text-xs text-slate-500">{u.org_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Workflows</h2>
        <div className="rounded-lg border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-slate-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left p-3">Reference</th>
                <th className="text-left p-3">Label</th>
                <th className="text-left p-3">State</th>
                <th className="text-right p-3">Updated</th>
              </tr>
            </thead>
            <tbody>
              {workflows.map((w) => (
                <tr key={w.id} className="border-t border-slate-800">
                  <td className="p-3 font-mono text-xs">{w.reference_id}</td>
                  <td className="p-3">
                    <Link href={`/dashboard/project/${w.id}`} className="hover:underline">
                      {w.reference_label}
                    </Link>
                  </td>
                  <td className="p-3">
                    <StateBadge state={w.current_state} />
                  </td>
                  <td className="p-3 text-right text-xs text-slate-500">
                    {new Date(w.updated_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">
          Recent ledger events{" "}
          <span className="text-sm font-normal text-slate-500">({events.length})</span>
        </h2>
        <ol className="rounded border border-slate-800 divide-y divide-slate-800 text-sm bg-slate-900/40">
          {events.map((l) => (
            <li key={l.id} className="p-3 flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{l.event_type}</div>
                <div className="text-xs text-slate-500 font-mono truncate">
                  workflow: {l.workflow_id ?? "—"} · actor: {l.actor_id ?? "system"}
                </div>
                <div className="text-[10px] text-slate-600 font-mono truncate">
                  hash: {l.hash.slice(0, 24)}…
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
