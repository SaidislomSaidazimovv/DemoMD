import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeEventHash } from "@/lib/ledger";

// Create a workflow (currently: a construction project under tranche_verification).
// Admins only. Writes a genesis ledger event through the hash chain.

export const dynamic = "force-dynamic";

// GET — list all workflows in the caller's org (RLS-scoped).
export async function GET() {
  const ssb = createServerSupabase();
  const {
    data: { user },
  } = await ssb.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { data, error } = await ssb
    .from("workflows")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, workflows: data ?? [] });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { type, reference_id, reference_label, meta } = body as {
    type?: string;
    reference_id?: string;
    reference_label?: string;
    meta?: Record<string, unknown>;
  };

  if (type !== "tranche_verification") {
    return NextResponse.json({ error: "type must be tranche_verification" }, { status: 400 });
  }
  if (!reference_id || !reference_label || !meta) {
    return NextResponse.json(
      { error: "reference_id, reference_label, meta required" },
      { status: 400 }
    );
  }

  const ssb = createServerSupabase();
  const {
    data: { user },
  } = await ssb.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { data: profile } = await ssb.from("users").select("*").eq("id", user.id).single();
  if (!profile || !["admin", "bank_officer"].includes(profile.role)) {
    return NextResponse.json({ error: "admin or bank_officer only" }, { status: 403 });
  }

  const sb = createAdminClient();

  const { data: workflow, error: wfErr } = await sb
    .from("workflows")
    .insert({
      org_id: profile.org_id,
      type,
      reference_id,
      reference_label,
      current_state: "EVIDENCE_REQUESTED",
      meta,
      created_by: profile.id,
    })
    .select()
    .single();
  if (wfErr || !workflow) {
    return NextResponse.json({ error: wfErr?.message ?? "insert failed" }, { status: 500 });
  }

  await appendEvent(sb, {
    org_id: profile.org_id,
    workflow_id: workflow.id,
    event_type: "workflow_created",
    actor_id: profile.id,
    payload: { state: "EVIDENCE_REQUESTED", reference_id },
  });

  // Emit challenge_issued alongside workflow_created — the challenge code is
  // part of the workflow's meta and the ledger should reflect its issuance.
  const challengeCode = (meta as Record<string, unknown>).challenge_code;
  const challengeIssuedAt = (meta as Record<string, unknown>).challenge_issued_at;
  if (typeof challengeCode === "string") {
    await appendEvent(sb, {
      org_id: profile.org_id,
      workflow_id: workflow.id,
      event_type: "challenge_issued",
      actor_id: profile.id,
      payload: {
        code: challengeCode,
        issued_at: challengeIssuedAt ?? new Date().toISOString(),
        project_workflow_id: workflow.id,
      },
    });
  }

  return NextResponse.json({ ok: true, workflow });
}

// Internal: append a ledger event with proper hash chain.
// Kept here as a tiny utility; /api/events/append exposes the same logic as HTTP.
async function appendEvent(
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
