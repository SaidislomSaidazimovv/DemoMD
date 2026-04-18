import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeEventHash } from "@/lib/ledger";

// POST /api/butterfly/deploy/seed
// Idempotent helper: ensures a single `protocol_deployment` workflow exists
// at SETUP for the caller's org. If one already exists at any state, it is
// returned as-is. Emits `workflow_created` through the chain on first insert.

export const dynamic = "force-dynamic";

export async function POST() {
  const ssb = createServerSupabase();
  const {
    data: { user },
  } = await ssb.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { data: profile } = await ssb.from("users").select("*").eq("id", user.id).single();
  if (!profile || !["hr_admin", "admin"].includes(profile.role)) {
    return NextResponse.json({ error: "hr_admin or admin only" }, { status: 403 });
  }

  const sb = createAdminClient();
  const { data: existing } = await sb
    .from("workflows")
    .select("*")
    .eq("org_id", profile.org_id)
    .eq("type", "protocol_deployment")
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ ok: true, workflow: existing, created: false });
  }

  const { data: wf, error: wfErr } = await sb
    .from("workflows")
    .insert({
      org_id: profile.org_id,
      type: "protocol_deployment",
      reference_id: `DEPLOY-${Date.now()}`,
      reference_label: "Butterfly Protocol Deployment",
      current_state: "SETUP",
      meta: {
        phase_started_at: new Date().toISOString(),
      },
      created_by: profile.id,
    })
    .select()
    .single();
  if (wfErr || !wf) {
    return NextResponse.json(
      { error: wfErr?.message ?? "insert failed" },
      { status: 500 }
    );
  }

  await appendLedgerEvent(sb, {
    org_id: profile.org_id,
    workflow_id: wf.id,
    event_type: "workflow_created",
    actor_id: profile.id,
    payload: { state: "SETUP", type: "protocol_deployment" },
  });

  return NextResponse.json({ ok: true, workflow: wf, created: true });
}

async function appendLedgerEvent(
  sb: ReturnType<typeof createAdminClient>,
  e: {
    org_id: string;
    workflow_id: string | null;
    event_type: string;
    actor_id: string | null;
    payload: Record<string, unknown>;
  }
) {
  const { data: prev } = await sb
    .from("ledger_events")
    .select("hash")
    .eq("org_id", e.org_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const hash = await computeEventHash({
    prevHash: prev?.hash ?? null,
    eventId: id,
    eventType: e.event_type,
    payload: e.payload,
    createdAt,
  });
  await sb.from("ledger_events").insert({
    id,
    org_id: e.org_id,
    workflow_id: e.workflow_id,
    event_type: e.event_type,
    actor_id: e.actor_id,
    payload: e.payload,
    prev_hash: prev?.hash ?? null,
    hash,
    created_at: createdAt,
  });
}
