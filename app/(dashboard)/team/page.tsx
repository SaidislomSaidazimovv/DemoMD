"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useRequireRole } from "@/lib/hooks";
import { inviteUser } from "@/lib/actions";
import type { User, UserRole } from "@/lib/types";

const ROLES: UserRole[] = ["admin", "bank_officer", "inspector", "supervisor"];

export default function TeamPage() {
  const { session, loading } = useRequireRole(["admin"]);
  const [users, setUsers] = useState<User[]>([]);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<UserRole>("inspector");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    const supabase = createClient();
    const { data } = await supabase
      .from("users")
      .select("*")
      .order("created_at", { ascending: true });
    setUsers((data as User[]) ?? []);
  }

  useEffect(() => {
    if (loading || !session) return;
    refresh();

    // Live refresh when someone accepts their invite
    const supabase = createClient();
    const ch = supabase
      .channel("team-live")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "users" }, () => refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "users" }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [loading, session]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await inviteUser({ email, fullName, role });
      setNotice(`Invitation sent to ${email}.`);
      setEmail("");
      setFullName("");
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading || !session) {
    return <main className="min-h-screen p-10 text-slate-500">Loading…</main>;
  }

  // Sort: pending first (so admin sees who hasn't activated), then active
  const sorted = users.slice().sort((a, b) => {
    const aP = a.accepted_at == null;
    const bP = b.accepted_at == null;
    if (aP !== bP) return aP ? -1 : 1;
    return a.created_at.localeCompare(b.created_at);
  });

  const pendingCount = sorted.filter((u) => u.accepted_at == null).length;

  return (
    <main className="min-h-screen p-6 sm:p-10 max-w-5xl mx-auto space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Team</h1>
          <p className="text-sm text-slate-400">Invite members of your organization.</p>
        </div>
        <nav className="flex gap-2 text-sm">
          <Link href="/admin" className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 hover:bg-slate-700">
            ← Admin
          </Link>
        </nav>
      </header>

      <section className="rounded-xl border border-slate-700 bg-slate-900/60 p-6">
        <h2 className="text-lg font-semibold mb-4">Invite a teammate</h2>
        <form onSubmit={submit} className="grid sm:grid-cols-4 gap-3 items-end">
          <Field label="Full name" className="sm:col-span-1">
            <input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Email" className="sm:col-span-2">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="sardor@nbu.uz"
            />
          </Field>
          <Field label="Role" className="sm:col-span-1">
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="input"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-4">
            {error && (
              <div className="mb-3 rounded border border-rose-700/50 bg-rose-900/20 px-3 py-2 text-sm text-rose-300">
                {error}
              </div>
            )}
            {notice && (
              <div className="mb-3 rounded border border-emerald-700/50 bg-emerald-900/20 px-3 py-2 text-sm text-emerald-300">
                {notice}
              </div>
            )}
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-brand hover:bg-brand/90 px-4 py-2 text-sm font-semibold text-brand-fg disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send invite"}
            </button>
          </div>
        </form>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">
            Members <span className="text-sm font-normal text-slate-500">({users.length})</span>
          </h2>
          {pendingCount > 0 && (
            <div className="text-xs text-amber-300 bg-amber-900/20 border border-amber-700/40 rounded px-2 py-1">
              {pendingCount} pending invitation{pendingCount === 1 ? "" : "s"}
            </div>
          )}
        </div>
        <div className="rounded-lg border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-slate-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3">Email</th>
                <th className="text-left p-3">Role</th>
                <th className="text-left p-3">Status</th>
                <th className="text-right p-3">Joined</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((u) => {
                const pending = u.accepted_at == null;
                return (
                  <tr
                    key={u.id}
                    className={`border-t border-slate-800 ${
                      pending ? "bg-amber-900/10" : ""
                    }`}
                  >
                    <td className="p-3">{u.full_name}</td>
                    <td className="p-3 font-mono text-xs text-slate-300">{u.email}</td>
                    <td className="p-3">
                      <span className="rounded bg-slate-800 px-2 py-0.5 text-xs">
                        {u.role.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="p-3">
                      {pending ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 border border-amber-500/40 px-2 py-0.5 text-xs font-semibold text-amber-200">
                          ⏳ Pending
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 px-2 py-0.5 text-xs font-semibold text-emerald-200">
                          ✓ Active
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-right text-xs text-slate-500">
                      {pending
                        ? `invited ${new Date(u.created_at).toLocaleDateString()}`
                        : new Date(u.accepted_at!).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <style jsx>{`
        :global(.input) {
          width: 100%;
          border-radius: 0.375rem;
          border: 1px solid rgb(51 65 85);
          background: rgb(2 6 23);
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
        }
      `}</style>
    </main>
  );
}

function Field({
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
      <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">{label}</label>
      {children}
    </div>
  );
}
