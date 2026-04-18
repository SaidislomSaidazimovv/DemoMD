"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { BigNumber, BfButton } from "@/components/butterfly/ui";
import { useBfSession } from "@/components/butterfly/app-shell";
import { createClient } from "@/lib/supabase/browser";

// Screen 1 — The One Number.
// Per BUTTERFLY_SAAS_UI.md: "In a product demo, the first screen sets everything.
// If Butterfly's first screen is a grid of KPIs, the board thinks 'oh, another
// HR tool.' If it's one number centered in white space, they pause. The pause
// is the product."
//
// Counts aggregate `checkin_initiated` ledger events for the caller's org.
// No PII, no per-user data. Below-fold section shows the quiet compliance
// metrics + privacy note.

export default function ButterflyHomePage() {
  // Session is already resolved by the shell; reading from context is sync.
  useBfSession();
  const [orgName, setOrgName] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    const supabase = createClient();
    (async () => {
      const { data: org } = await supabase
        .from("organizations")
        .select("name")
        .limit(1)
        .maybeSingle();
      setOrgName((org as { name: string } | null)?.name ?? null);

      const { data: events } = await supabase
        .from("ledger_events")
        .select("event_type, payload, created_at")
        .eq("event_type", "checkin_initiated");
      setStats(summarize((events as CheckinEvent[]) ?? []));
    })();
  }, []);

  const total = stats?.total ?? 0;
  const today = new Date();
  const dateStr = today.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="bf-fade-in">
      {/* Above the fold — the one number */}
      <section className="min-h-[82vh] flex flex-col items-center justify-center px-6 text-center">
        <div className="text-[13px] uppercase tracking-[0.14em] text-[color:var(--bf-caption)] mb-10">
          {orgName ?? "Your workspace"} · {dateStr}
        </div>

        <BigNumber target={total} />

        <div className="mt-10 text-[18px] text-[color:var(--bf-muted)]">
          check-ins this quarter
        </div>
        <div className="mt-6 max-w-xl text-[20px] text-[color:var(--bf-ink)] italic leading-[1.5]">
          That&apos;s {total.toLocaleString()} moment{total === 1 ? "" : "s"} someone showed up.
        </div>

        <Link href="/app/journey" className="mt-12">
          <BfButton variant="ghost" rightIcon={<ArrowRight size={18} />}>
            View the journey
          </BfButton>
        </Link>
      </section>

      {/* Below the fold — the quiet detail */}
      <section className="max-w-2xl mx-auto px-6 sm:px-10 py-24 border-t border-[color:var(--bf-hair)]">
        <h2 className="text-[22px] font-semibold text-[color:var(--bf-ink)] mb-8 tracking-tight">
          This quarter at {orgName ?? "your workspace"}
        </h2>

        {stats === null ? (
          <p className="text-[color:var(--bf-caption)]">Loading…</p>
        ) : total === 0 ? (
          <p className="text-[18px] text-[color:var(--bf-muted)] leading-[1.6]">
            No check-ins logged yet. Once your team starts using the protocol, aggregate
            counts will appear here. Nothing else.
          </p>
        ) : (
          <dl className="space-y-3 text-[18px] leading-[1.6]">
            <Row label="check-ins logged" value={stats.total} />
            <Row
              label={`accepted (${percent(stats.accepted, stats.total)}%)`}
              value={stats.accepted}
              indent
            />
            <Row label="routed to 988" value={stats.routing["988"]} indent />
            <Row label="routed to EAP" value={stats.routing.eap} indent />
            <Row label="internal counselor" value={stats.routing.counselor} indent />
            <Row label="self-resolved" value={stats.routing.self_resolved} indent />
            <Row label="declined support" value={stats.routing.declined} indent />
          </dl>
        )}

        <div className="mt-12">
          <Link href="/app/reports">
            <BfButton variant="ghost" rightIcon={<ArrowRight size={16} />}>
              Download Q1 Compliance Report
            </BfButton>
          </Link>
        </div>
      </section>

      {/* Privacy note */}
      <section className="max-w-2xl mx-auto px-6 sm:px-10 pb-24 text-[15px] text-[color:var(--bf-caption)] leading-[1.7]">
        <p className="border-l-2 border-[color:var(--bf-hair)] pl-5">
          <strong className="text-[color:var(--bf-ink)]">Privacy note.</strong> We log only
          that a check-in occurred, what resource was offered, and whether it was accepted.
          No names. No descriptions. No health data. All individual events purge after
          90 days.
        </p>
      </section>
    </div>
  );
}

// ============================================================
// Aggregates over checkin_initiated events
// ============================================================
type RoutingType = "988" | "eap" | "counselor" | "self_resolved" | "declined" | "other";
interface Stats {
  total: number;
  accepted: number;
  routing: Record<RoutingType, number>;
}
interface CheckinEvent {
  payload: { routing_type?: RoutingType; accepted?: boolean } | null;
}

function summarize(events: CheckinEvent[]): Stats {
  const routing: Record<RoutingType, number> = {
    "988": 0,
    eap: 0,
    counselor: 0,
    self_resolved: 0,
    declined: 0,
    other: 0,
  };
  let accepted = 0;
  for (const ev of events) {
    const p = ev.payload ?? {};
    const r = (p.routing_type ?? "other") as RoutingType;
    routing[r] = (routing[r] ?? 0) + 1;
    if (p.accepted) accepted++;
  }
  return { total: events.length, accepted, routing };
}

function percent(part: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((part / total) * 100);
}

function Row({
  label,
  value,
  indent = false,
}: {
  label: string;
  value: number;
  indent?: boolean;
}) {
  return (
    <div className={`flex items-baseline justify-between ${indent ? "pl-5" : ""}`}>
      <dt className="text-[color:var(--bf-ink)]">{label}</dt>
      <dd className="font-semibold tabular-nums text-[color:var(--bf-ink)]">
        {value.toLocaleString()}
      </dd>
    </div>
  );
}
