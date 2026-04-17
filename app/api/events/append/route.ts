import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeEventHash } from "@/lib/ledger";

// Append an arbitrary (non-state-change) ledger event through the hash chain.
// Used by: capture flow (`evidence_captured`), export generator, demo scenarios.

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { workflow_id, event_type, payload } = body as {
    workflow_id?: string | null;
    event_type?: string;
    payload?: Record<string, unknown>;
  };
  if (!event_type || !payload) {
    return NextResponse.json({ error: "event_type, payload required" }, { status: 400 });
  }

  const ssb = createServerSupabase();
  const {
    data: { user },
  } = await ssb.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { data: profile } = await ssb.from("users").select("*").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "no profile" }, { status: 403 });

  const sb = createAdminClient();

  // If workflow_id is supplied, verify it belongs to caller's org.
  if (workflow_id) {
    const { data: wf } = await sb
      .from("workflows")
      .select("org_id")
      .eq("id", workflow_id)
      .maybeSingle();
    if (!wf || wf.org_id !== profile.org_id) {
      return NextResponse.json({ error: "workflow not in your org" }, { status: 403 });
    }
  }

  const { data: prev } = await sb
    .from("ledger_events")
    .select("hash")
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const hash = await computeEventHash({
    prevHash: prev?.hash ?? null,
    eventId: id,
    eventType: event_type,
    payload,
    createdAt,
  });

  const { data: event, error } = await sb
    .from("ledger_events")
    .insert({
      id,
      org_id: profile.org_id,
      workflow_id: workflow_id ?? null,
      event_type,
      actor_id: profile.id,
      payload,
      prev_hash: prev?.hash ?? null,
      hash,
      created_at: createdAt,
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, event });
}
