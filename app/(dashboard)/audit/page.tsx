"use client";

import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
import { ShieldCheck, ShieldAlert, Search } from "lucide-react";
import {
  Card,
  CardContent,
  EmptyState,
} from "@/components/ui";
import { useRequireRoleFromContext } from "@/components/app-shell";
import { verifyChain } from "@/lib/ledger";
import { createClient } from "@/lib/supabase/browser";
import type { LedgerEvent, Workflow } from "@/lib/types";

// Raw hash-chain ledger viewer. Moved out of /admin per TASDIQ_UI_REDESIGN.md.
// This is the power-user view — full chain, full hashes, full payloads,
// filterable by event type or project.

export default function AuditPage() {
  useRequireRoleFromContext(["admin", "bank_officer", "supervisor"]);
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [chainValid, setChainValid] = useState<boolean | null>(null);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [brokenAt, setBrokenAt] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [query, setQuery] = useState("");

  async function refresh() {
    const supabase = createClient();
    const [{ data: evs }, { data: wfs }] = await Promise.all([
      supabase.from("ledger_events").select("*").order("created_at", { ascending: true }),
      supabase.from("workflows").select("*"),
    ]);
    const all = (evs as LedgerEvent[]) ?? [];
    setEvents(all);
    setWorkflows((wfs as Workflow[]) ?? []);
    const verification = await verifyChain(all);
    setChainValid(verification.valid);
    setAnchor(verification.anchor);
    setBrokenAt(verification.brokenAt);
  }

  useEffect(() => {
    refresh();
    const supabase = createClient();
    const ch = supabase
      .channel("audit-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "ledger_events" }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const eventTypes = useMemo(() => {
    const s = new Set<string>();
    for (const e of events) s.add(e.event_type);
    return Array.from(s).sort();
  }, [events]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events
      .slice()
      .reverse() // newest first for display; verification already validated oldest→newest
      .filter((e) => typeFilter === "all" || e.event_type === typeFilter)
      .filter((e) => projectFilter === "all" || e.workflow_id === projectFilter)
      .filter((e) => {
        if (!q) return true;
        return (
          e.event_type.includes(q) ||
          e.hash.toLowerCase().includes(q) ||
          (e.prev_hash ?? "").toLowerCase().includes(q) ||
          JSON.stringify(e.payload).toLowerCase().includes(q)
        );
      });
  }, [events, typeFilter, projectFilter, query]);

  return (
    <div className="p-6 sm:p-10 max-w-6xl mx-auto space-y-6 fade-up">
      <header className="space-y-2">
        <h1 className="text-heading-1 text-ink">Audit trail</h1>
        <p className="text-body text-ink-tertiary">
          The full, org-wide, tamper-evident ledger. Every event is SHA-256 hashed and chained
          to the one before it. Break any row and the chain detects it immediately.
        </p>
      </header>

      {/* Integrity */}
      <Card
        className={
          chainValid === false
            ? "border-state-flagged/40 bg-state-flagged-bg"
            : chainValid
              ? "border-state-verified/40 bg-state-verified-bg"
              : ""
        }
      >
        <CardContent className="py-5 flex items-start gap-4">
          <div
            className={`shrink-0 rounded-md p-2.5 ${
              chainValid === false
                ? "text-state-flagged"
                : chainValid
                  ? "text-state-verified"
                  : "text-ink-muted"
            }`}
          >
            {chainValid === false ? <ShieldAlert size={22} /> : <ShieldCheck size={22} />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-body font-semibold text-ink">
              {chainValid === null
                ? "Verifying chain…"
                : chainValid
                  ? "Chain valid"
                  : "Chain broken"}
            </div>
            <div className="text-caption text-ink-tertiary mt-0.5">
              {events.length} total events across the organization
            </div>
            {anchor && (
              <div className="text-micro font-mono text-ink-muted mt-1 truncate">
                anchor: {anchor}
              </div>
            )}
            {brokenAt && (
              <div className="text-caption text-state-flagged mt-1">
                broken at event id: <span className="font-mono">{brokenAt}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search event type, hash, or payload…"
            className="w-full rounded-md border border-hairline-subtle bg-surface-card pl-9 pr-3 py-2 text-body text-ink focus:outline-none focus:border-accent"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-md border border-hairline-subtle bg-surface-card px-3 py-2 text-body text-ink focus:outline-none focus:border-accent"
        >
          <option value="all">All event types</option>
          {eventTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          className="rounded-md border border-hairline-subtle bg-surface-card px-3 py-2 text-body text-ink focus:outline-none focus:border-accent"
        >
          <option value="all">All projects</option>
          {workflows.map((w) => (
            <option key={w.id} value={w.id}>
              {w.reference_id}
            </option>
          ))}
        </select>
      </div>

      {/* Events */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<ShieldCheck />}
          title={events.length === 0 ? "No events yet" : "No events match these filters"}
          description={
            events.length === 0
              ? "Once projects and captures happen, every action will be sealed into this ledger."
              : "Try clearing the search or selecting a different project / event type."
          }
        />
      ) : (
        <Card>
          <ol className="divide-y divide-hairline-subtle">
            {filtered.map((ev) => (
              <AuditRow key={ev.id} event={ev} workflows={workflows} />
            ))}
          </ol>
        </Card>
      )}
    </div>
  );
}

function AuditRow({ event, workflows }: { event: LedgerEvent; workflows: Workflow[] }) {
  const project = workflows.find((w) => w.id === event.workflow_id);
  return (
    <li className="px-6 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-body font-medium text-ink">
              {event.event_type.replace(/_/g, " ")}
            </span>
            {project && (
              <Link
                href={`/dashboard/project/${project.id}`}
                className="text-caption text-state-info hover:underline"
              >
                {project.reference_id}
              </Link>
            )}
          </div>
          <div className="text-caption text-ink-tertiary mt-0.5">
            {event.actor_id ? (
              <>actor <span className="font-mono">{event.actor_id.slice(0, 8)}…</span></>
            ) : (
              <>system</>
            )}
          </div>
          <details className="mt-2">
            <summary className="text-micro uppercase text-ink-muted cursor-pointer hover:text-ink-tertiary">
              Technical details
            </summary>
            <div className="mt-2 space-y-1 text-micro font-mono text-ink-muted">
              <div className="truncate">hash: {event.hash}</div>
              <div className="truncate">prev: {event.prev_hash ?? "GENESIS"}</div>
              <pre className="bg-surface-subtle rounded p-2 text-micro overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(event.payload, null, 2)}
              </pre>
            </div>
          </details>
        </div>
        <div className="text-caption text-ink-tertiary whitespace-nowrap shrink-0">
          {new Date(event.created_at).toLocaleString()}
        </div>
      </div>
    </li>
  );
}
