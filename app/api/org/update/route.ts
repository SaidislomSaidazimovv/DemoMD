import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeEventHash } from "@/lib/ledger";

// PATCH /api/org/update
// Body: { name?: string }
//
// Admin-only. Updates editable fields on the caller's organization and
// appends an `org_settings_updated` ledger event through the hash chain
// so renames are auditable.
//
// Slug is deliberately NOT editable — it's part of URLs and the storage
// path prefix; changing it would break existing links + migrate storage
// objects. If that's ever needed, build a migration endpoint.

export const dynamic = "force-dynamic";

const MAX_NAME_LENGTH = 120;

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { name } = body as { name?: string };

  if (typeof name !== "string" || name.trim().length === 0) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  const trimmed = name.trim();
  if (trimmed.length > MAX_NAME_LENGTH) {
    return NextResponse.json(
      { error: `name must be ${MAX_NAME_LENGTH} characters or fewer` },
      { status: 400 }
    );
  }

  const ssb = createServerSupabase();
  const {
    data: { user },
  } = await ssb.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { data: profile } = await ssb.from("users").select("*").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "no profile" }, { status: 403 });
  if (profile.role !== "admin" && profile.role !== "hr_admin") {
    return NextResponse.json(
      { error: "admin or hr_admin only" },
      { status: 403 }
    );
  }

  const sb = createAdminClient();

  const { data: existingOrg } = await sb
    .from("organizations")
    .select("id, name")
    .eq("id", profile.org_id)
    .maybeSingle();
  if (!existingOrg) {
    return NextResponse.json({ error: "org not found" }, { status: 404 });
  }
  if (existingOrg.name === trimmed) {
    return NextResponse.json({ ok: true, org: existingOrg, unchanged: true });
  }

  const { data: updated, error: updErr } = await sb
    .from("organizations")
    .update({ name: trimmed })
    .eq("id", profile.org_id)
    .select()
    .single();
  if (updErr || !updated) {
    return NextResponse.json(
      { error: updErr?.message ?? "update failed" },
      { status: 500 }
    );
  }

  await appendLedgerEvent(sb, {
    org_id: profile.org_id,
    workflow_id: null,
    event_type: "org_settings_updated",
    actor_id: profile.id,
    payload: {
      field: "name",
      from: existingOrg.name,
      to: trimmed,
    },
  });

  return NextResponse.json({ ok: true, org: updated });
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
