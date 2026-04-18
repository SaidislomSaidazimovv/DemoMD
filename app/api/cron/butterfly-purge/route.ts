import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeEventHash } from "@/lib/ledger";
import type { LedgerEvent } from "@/lib/types";

// Scheduled 90-day auto-purge for Butterfly check-in events.
//
// Per BUTTERFLY_SAAS_UI.md §"Privacy note": "All individual events purge
// after 90 days." This is the privacy commitment that closes General
// Counsel reviews — so the cron that honors it is a first-class part of
// the product, not an afterthought.
//
// IMPLEMENTATION NOTE — chain integrity after a purge
// ---------------------------------------------------
// The org's ledger_events form a hash chain (prev_hash → hash). If we
// simply DELETE old check-in rows, every surviving event whose
// prev_hash pointed at a deleted row would fail verifyChain().
//
// So we re-stitch: after deleting target rows, we walk the remaining
// events in created_at order and recompute prev_hash + hash. The final
// anchor changes (which is correct — the history now reflects that the
// old events were redacted), and the chain from purge-boundary forward
// verifies cleanly.
//
// Anyone holding an older anchor will see it no longer match — that is
// the *intended* behavior for a privacy purge. Tasdiq export packs that
// were generated before a purge remain self-verifiable because they
// contain their own snapshot of the ledger at pack time.
//
// SECURITY
// --------
// Vercel Cron Jobs call this route with `Authorization: Bearer $CRON_SECRET`.
// Outside Vercel, invoke manually with the same header to trigger a purge
// (e.g. during testing).

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Event types subject to the 90-day rolling purge. Tasdiq evidence /
// state-change events are explicitly NOT in this list — they belong to
// the tamper-evident audit chain and are retained forever.
const PURGEABLE_EVENT_TYPES = ["checkin_initiated", "resource_routed"];
const RETENTION_DAYS = 90;

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 }
    );
  }
  if (authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const sb = createAdminClient();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);
  const cutoffIso = cutoff.toISOString();

  // Which orgs have any purgeable events older than the cutoff?
  const { data: candidateOrgs, error: orgsErr } = await sb
    .from("ledger_events")
    .select("org_id")
    .in("event_type", PURGEABLE_EVENT_TYPES)
    .lt("created_at", cutoffIso);
  if (orgsErr) {
    return NextResponse.json({ error: orgsErr.message }, { status: 500 });
  }

  const orgIds = Array.from(
    new Set(((candidateOrgs ?? []) as { org_id: string }[]).map((r) => r.org_id))
  );

  const report: {
    orgs_processed: number;
    events_deleted: number;
    events_restitched: number;
    errors: { org_id: string; error: string }[];
  } = { orgs_processed: 0, events_deleted: 0, events_restitched: 0, errors: [] };

  for (const orgId of orgIds) {
    try {
      const r = await purgeOneOrg(sb, orgId, cutoffIso);
      report.orgs_processed++;
      report.events_deleted += r.deleted;
      report.events_restitched += r.restitched;
    } catch (e) {
      report.errors.push({ org_id: orgId, error: (e as Error).message });
    }
  }

  return NextResponse.json({ ok: true, cutoff: cutoffIso, ...report });
}

async function purgeOneOrg(
  sb: ReturnType<typeof createAdminClient>,
  orgId: string,
  cutoffIso: string
): Promise<{ deleted: number; restitched: number }> {
  // Delete target rows, capture the count.
  const { data: toDelete, error: selectErr } = await sb
    .from("ledger_events")
    .select("id")
    .eq("org_id", orgId)
    .in("event_type", PURGEABLE_EVENT_TYPES)
    .lt("created_at", cutoffIso);
  if (selectErr) throw selectErr;

  const deleteIds = ((toDelete ?? []) as { id: string }[]).map((r) => r.id);
  if (deleteIds.length === 0) {
    return { deleted: 0, restitched: 0 };
  }

  const { error: delErr } = await sb
    .from("ledger_events")
    .delete()
    .in("id", deleteIds);
  if (delErr) throw delErr;

  // Re-stitch: walk remaining events oldest → newest, recompute prev_hash + hash.
  const { data: remaining, error: remErr } = await sb
    .from("ledger_events")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  if (remErr) throw remErr;

  const events = (remaining as LedgerEvent[]) ?? [];
  let prevHash: string | null = null;
  let restitched = 0;
  for (const ev of events) {
    // Normalize the created_at timestamp exactly like verifyChain does, so the
    // re-stitched chain hashes the same string the verifier will reconstruct.
    const normalizedCreatedAt = new Date(ev.created_at).toISOString();
    const newHash = await computeEventHash({
      prevHash,
      eventId: ev.id,
      eventType: ev.event_type,
      payload: ev.payload,
      createdAt: normalizedCreatedAt,
    });
    if (newHash !== ev.hash || prevHash !== ev.prev_hash) {
      const { error: upErr } = await sb
        .from("ledger_events")
        .update({ prev_hash: prevHash, hash: newHash })
        .eq("id", ev.id);
      if (upErr) throw upErr;
      restitched++;
    }
    prevHash = newHash;
  }

  return { deleted: deleteIds.length, restitched };
}
