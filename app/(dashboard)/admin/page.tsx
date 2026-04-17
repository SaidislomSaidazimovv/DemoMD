"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StateBadge } from "@/components/ui";
import { useRequireRole } from "@/lib/hooks";
import { createClient } from "@/lib/supabase/browser";
import { createWorkflow } from "@/lib/actions";
import type { LedgerEvent, Organization, User, Workflow } from "@/lib/types";

export default function AdminPage() {
  const { session, loading } = useRequireRole(["admin"]);
  const [org, setOrg] = useState<Organization | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function refresh() {
    const supabase = createClient();
    const [{ data: orgs }, { data: u }, { data: w }, { data: e }] = await Promise.all([
      supabase.from("organizations").select("*").limit(1),
      supabase.from("users").select("*"),
      supabase.from("workflows").select("*").order("updated_at", { ascending: false }),
      supabase.from("ledger_events").select("*").order("created_at", { ascending: false }).limit(25),
    ]);
    setOrg(((orgs as Organization[]) ?? [])[0] ?? null);
    setUsers((u as User[]) ?? []);
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

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  if (loading || !session) {
    return <main className="min-h-screen p-10 text-slate-500">Loading…</main>;
  }

  const empty = workflows.length === 0;

  return (
    <main className="min-h-screen p-6 sm:p-10 max-w-6xl mx-auto space-y-8">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">Admin Console</h1>
          <p className="text-sm text-slate-400">
            {org?.name ?? "—"} · signed in as {session.email}
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <Link href="/team" className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 hover:bg-slate-700">
            Team
          </Link>
          <Link href="/dashboard" className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 hover:bg-slate-700">
            Dashboard
          </Link>
          <Link href="/demo" className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 hover:bg-slate-700">
            Demo
          </Link>
          <button onClick={handleSignOut} className="rounded border border-slate-700 bg-slate-800 px-3 py-1.5 hover:bg-slate-700">
            Sign out
          </button>
        </div>
      </header>

      {empty && (
        <section className="rounded-xl border border-amber-700/40 bg-amber-900/10 p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold text-amber-200">Get started</h2>
              <p className="text-sm text-amber-200/70 mt-1">
                Create your first construction project to see the dashboard and demo in action.
              </p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="rounded-md bg-amber-500 hover:bg-amber-400 px-4 py-2 text-sm font-semibold text-amber-950"
            >
              + Create project
            </button>
          </div>
        </section>
      )}

      {!empty && (
        <div>
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-md bg-brand hover:bg-brand/90 px-4 py-2 text-sm font-semibold text-brand-fg"
          >
            + Create new project
          </button>
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

      {notice && (
        <div className="rounded border border-emerald-700/50 bg-emerald-900/20 px-3 py-2 text-sm text-emerald-300">
          {notice}
        </div>
      )}

      <section>
        <h2 className="text-lg font-semibold mb-3">
          Projects <span className="text-sm font-normal text-slate-500">({workflows.length})</span>
        </h2>
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
              {workflows.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-sm text-slate-500">
                    No projects yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">
          Users <span className="text-sm font-normal text-slate-500">({users.length})</span>
        </h2>
        <div className="rounded-lg border border-slate-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-slate-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left p-3">Name</th>
                <th className="text-left p-3">Email</th>
                <th className="text-left p-3">Role</th>
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
          {events.length === 0 && (
            <li className="p-4 text-center text-slate-500">No events yet.</li>
          )}
          {events.map((l) => (
            <li key={l.id} className="p-3 flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{l.event_type}</div>
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
      <div className="w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-950 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold">New construction project</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 text-sm">
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
                className="rounded border border-slate-700 bg-slate-800 px-2 text-xs hover:bg-slate-700"
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
              <span className="self-center text-slate-400">of</span>
              <input type="number" required value={totalTranches} onChange={(e) => setTotalTranches(Number(e.target.value))} className="input font-mono w-20" />
            </div>
          </F>

          {error && (
            <div className="sm:col-span-2 rounded border border-rose-700/50 bg-rose-900/20 px-3 py-2 text-sm text-rose-300">
              {error}
            </div>
          )}

          <div className="sm:col-span-2 flex gap-2 mt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded border border-slate-700 bg-slate-900 py-2 text-sm">
              Cancel
            </button>
            <button type="submit" disabled={busy} className="flex-[2] rounded bg-brand hover:bg-brand/90 py-2 text-sm font-semibold text-brand-fg disabled:opacity-50">
              {busy ? "Creating…" : "Create project"}
            </button>
          </div>
        </form>
      </div>
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
      <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">{label}</label>
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
