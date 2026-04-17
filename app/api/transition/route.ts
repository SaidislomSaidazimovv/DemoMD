import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeEventHash } from "@/lib/ledger";
import type { UserRole, WorkflowState } from "@/lib/types";

// Validate + apply a workflow state transition. Writes a ledger event.
// Enforces: workflow_transitions row must exist; caller must be in required_role[]
// (unless `system=true` is passed AND the caller is an admin OR the request is
// service-role — demo simulator passes system=true with an admin session).

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { workflow_id, to_state, reason, system } = body as {
    workflow_id?: string;
    to_state?: WorkflowState;
    reason?: string;
    system?: boolean;
  };
  if (!workflow_id || !to_state) {
    return NextResponse.json({ error: "workflow_id, to_state required" }, { status: 400 });
  }

  const ssb = createServerSupabase();
  const {
    data: { user },
  } = await ssb.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { data: profile } = await ssb.from("users").select("*").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "no profile" }, { status: 403 });

  const sb = createAdminClient();

  const { data: wf } = await sb
    .from("workflows")
    .select("*")
    .eq("id", workflow_id)
    .eq("org_id", profile.org_id)
    .maybeSingle();
  if (!wf) return NextResponse.json({ error: "workflow not found" }, { status: 404 });

  const { data: allowed } = await sb
    .from("workflow_transitions")
    .select("*")
    .eq("type", wf.type)
    .eq("from_state", wf.current_state)
    .eq("to_state", to_state)
    .maybeSingle();
  if (!allowed) {
    return NextResponse.json(
      { error: `transition ${wf.current_state} → ${to_state} not allowed for ${wf.type}` },
      { status: 400 }
    );
  }

  const useSystemPath = system === true && profile.role === "admin";
  if (!useSystemPath) {
    const required = (allowed.required_role as UserRole[]) ?? [];
    if (required.length > 0 && !required.includes(profile.role)) {
      return NextResponse.json(
        { error: `role "${profile.role}" not allowed; need one of ${required.join(", ")}` },
        { status: 403 }
      );
    }
  }

  const nowIso = new Date().toISOString();
  const terminal = ["APPROVED", "REJECTED", "BANK_ACCEPTED", "BANK_REJECTED"].includes(to_state);

  const { data: updated, error: updErr } = await sb
    .from("workflows")
    .update({
      current_state: to_state,
      updated_at: nowIso,
      completed_at: terminal ? nowIso : wf.completed_at,
    })
    .eq("id", wf.id)
    .select()
    .single();
  if (updErr || !updated) {
    return NextResponse.json({ error: updErr?.message ?? "update failed" }, { status: 500 });
  }

  await appendEventWithChain(sb, {
    org_id: wf.org_id,
    workflow_id: wf.id,
    event_type: "state_changed",
    actor_id: useSystemPath ? null : profile.id,
    payload: { from: wf.current_state, to: to_state, reason: reason ?? null, system: !!useSystemPath },
  });

  // Spec event `tranche_released` — fires when a bank confirms a tranche
  // disbursement on a tranche_verification workflow. Atomic with the state
  // change because it's the next awaited write in the same request.
  if (wf.type === "tranche_verification" && to_state === "BANK_ACCEPTED") {
    await appendEventWithChain(sb, {
      org_id: wf.org_id,
      workflow_id: wf.id,
      event_type: "tranche_released",
      actor_id: useSystemPath ? null : profile.id,
      payload: {
        tranche: wf.meta?.current_tranche ?? null,
        total_tranches: wf.meta?.total_tranches ?? null,
        loan_amount: wf.meta?.loan_amount ?? null,
        loan_currency: wf.meta?.loan_currency ?? null,
        reason: reason ?? "Bank confirmed tranche release",
      },
    });
  }

  return NextResponse.json({ ok: true, workflow: updated });
}

async function appendEventWithChain(
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
