import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeEventHash } from "@/lib/ledger";
import { generateChallengeCode } from "@/lib/challenge";

// Issue a fresh challenge code for an existing workflow.
// Used when the initial code has expired (30s window) or when the admin
// wants to rotate for a new capture attempt. Rewrites
// `workflow.meta.challenge_code` + `challenge_issued_at` and emits a
// `challenge_issued` ledger event through the org-wide hash chain.

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { workflow_id } = body as { workflow_id?: string };
  if (!workflow_id) {
    return NextResponse.json({ error: "workflow_id required" }, { status: 400 });
  }

  const ssb = createServerSupabase();
  const {
    data: { user },
  } = await ssb.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { data: profile } = await ssb.from("users").select("*").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "no profile" }, { status: 403 });
  if (!["admin", "supervisor", "bank_officer"].includes(profile.role)) {
    return NextResponse.json(
      { error: "admin, supervisor, or bank_officer only" },
      { status: 403 }
    );
  }

  const sb = createAdminClient();
  const { data: wf } = await sb
    .from("workflows")
    .select("*")
    .eq("id", workflow_id)
    .eq("org_id", profile.org_id)
    .maybeSingle();
  if (!wf) return NextResponse.json({ error: "workflow not found" }, { status: 404 });

  const code = generateChallengeCode();
  const issuedAt = new Date().toISOString();

  const { data: updated, error: updErr } = await sb
    .from("workflows")
    .update({
      meta: { ...wf.meta, challenge_code: code, challenge_issued_at: issuedAt },
      updated_at: issuedAt,
    })
    .eq("id", wf.id)
    .select()
    .single();
  if (updErr || !updated) {
    return NextResponse.json({ error: updErr?.message ?? "update failed" }, { status: 500 });
  }

  await appendLedgerEvent(sb, {
    org_id: wf.org_id,
    workflow_id: wf.id,
    event_type: "challenge_issued",
    actor_id: profile.id,
    payload: { code, issued_at: issuedAt, project_workflow_id: wf.id, rotated: true },
  });

  return NextResponse.json({
    ok: true,
    challenge_code: code,
    challenge_issued_at: issuedAt,
  });
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
