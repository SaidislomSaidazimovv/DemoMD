"use client";

import { useEffect, useState } from "react";
import { Clock, CheckCircle2, Users as UsersIcon, Send } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { useRequireRoleFromContext } from "@/components/app-shell";
import { inviteUser } from "@/lib/actions";
import { Card, CardContent, Button, EmptyState } from "@/components/ui";
import type { User, UserRole } from "@/lib/types";

const ROLES: UserRole[] = ["admin", "bank_officer", "inspector", "supervisor"];

export default function TeamPage() {
  useRequireRoleFromContext(["admin"]);
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
    refresh();
    const supabase = createClient();
    const ch = supabase
      .channel("team-live")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "users" }, () => refresh())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "users" }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

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

  const sorted = users.slice().sort((a, b) => {
    const aP = a.accepted_at == null;
    const bP = b.accepted_at == null;
    if (aP !== bP) return aP ? -1 : 1;
    return a.created_at.localeCompare(b.created_at);
  });
  const pendingCount = sorted.filter((u) => u.accepted_at == null).length;

  return (
    <div className="p-6 sm:p-10 max-w-5xl mx-auto space-y-8 fade-up">
      <header>
        <h1 className="text-heading-1 text-ink">Team</h1>
        <p className="text-body text-ink-tertiary mt-1">
          Invite members of your organization.
        </p>
      </header>

      <Card>
        <CardContent className="py-5">
          <h2 className="text-heading-2 text-ink mb-4">Invite a teammate</h2>
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
            <div className="sm:col-span-4 space-y-2">
              {error && (
                <div className="rounded-md border border-state-flagged/40 bg-state-flagged-bg px-3 py-2 text-caption text-state-flagged">
                  {error}
                </div>
              )}
              {notice && (
                <div className="rounded-md border border-state-verified/40 bg-state-verified-bg px-3 py-2 text-caption text-state-verified">
                  {notice}
                </div>
              )}
              <Button
                type="submit"
                variant="primary"
                leftIcon={<Send size={16} />}
                loading={busy}
                disabled={busy}
              >
                {busy ? "Sending…" : "Send invite"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-heading-2 text-ink">
            Members{" "}
            <span className="text-caption text-ink-muted font-normal">({users.length})</span>
          </h2>
          {pendingCount > 0 && (
            <div className="text-caption text-state-pending bg-state-pending-bg border border-state-pending/30 rounded-full px-3 py-1">
              {pendingCount} pending invitation{pendingCount === 1 ? "" : "s"}
            </div>
          )}
        </div>

        {users.length === 0 ? (
          <EmptyState
            icon={<UsersIcon />}
            title="No teammates yet"
            description="Invite inspectors, supervisors, and bank officers above. They'll get a magic-link email to set their password."
          />
        ) : (
          <Card>
            <ul className="divide-y divide-hairline-subtle">
              {sorted.map((u) => (
                <MemberRow key={u.id} user={u} />
              ))}
            </ul>
          </Card>
        )}
      </section>

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
  );
}

function MemberRow({ user }: { user: User }) {
  const pending = user.accepted_at == null;
  return (
    <li
      className={`px-6 py-4 flex items-center gap-4 ${
        pending ? "bg-state-pending-bg/30" : ""
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="text-body text-ink font-medium truncate">{user.full_name}</div>
        <div className="text-caption text-ink-tertiary font-mono truncate">{user.email}</div>
      </div>
      <span className="rounded-md bg-surface-elevated border border-hairline-subtle px-2 py-0.5 text-micro uppercase text-ink-secondary shrink-0">
        {user.role.replace(/_/g, " ")}
      </span>
      {pending ? (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-state-pending-bg border border-state-pending/40 px-2.5 py-0.5 text-micro uppercase text-state-pending shrink-0">
          <Clock size={12} /> Pending
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-state-verified-bg border border-state-verified/40 px-2.5 py-0.5 text-micro uppercase text-state-verified shrink-0">
          <CheckCircle2 size={12} /> Active
        </span>
      )}
      <span className="hidden sm:inline text-caption text-ink-muted shrink-0 w-28 text-right">
        {pending
          ? `invited ${new Date(user.created_at).toLocaleDateString()}`
          : new Date(user.accepted_at!).toLocaleDateString()}
      </span>
    </li>
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
      <label className="block text-micro uppercase text-ink-tertiary mb-1">{label}</label>
      {children}
    </div>
  );
}
