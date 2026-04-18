import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeEventHash } from "@/lib/ledger";

// POST /api/butterfly/checkin
// Body: { routing_type: "988"|"eap"|"counselor"|"self_resolved"|"declined", accepted: boolean }
//
// Per CORE_PLATFORM_SPEC.md §"Butterfly-specific" ledger events:
//   checkin_initiated — aggregate only: {org_id, timestamp, routing_type, accepted}
//   resource_routed — routing_type, accepted
//
// Absolutely no PII: no user_id, no text, no description. The event is a
// count + a routing label + a boolean. That's it.
//
// We emit BOTH checkin_initiated AND resource_routed so the aggregate
// view on /app/home and the routing-breakdown view on /app/reports can
// each read the event type that best matches their purpose.

export const dynamic = "force-dynamic";

const ROUTING_TYPES = ["988", "eap", "counselor", "self_resolved", "declined"] as const;
type RoutingType = typeof ROUTING_TYPES[number];

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { routing_type, accepted } = body as {
    routing_type?: string;
    accepted?: boolean;
  };
  if (!routing_type || !ROUTING_TYPES.includes(routing_type as RoutingType)) {
    return NextResponse.json(
      { error: `routing_type must be one of ${ROUTING_TYPES.join(", ")}` },
      { status: 400 }
    );
  }
  if (typeof accepted !== "boolean") {
    return NextResponse.json({ error: "accepted (boolean) required" }, { status: 400 });
  }

  const ssb = createServerSupabase();
  const {
    data: { user },
  } = await ssb.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { data: profile } = await ssb.from("users").select("*").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "no profile" }, { status: 403 });
  if (!["hr_admin", "manager", "responder", "admin"].includes(profile.role)) {
    return NextResponse.json(
      { error: "hr_admin, manager, responder, or admin only" },
      { status: 403 }
    );
  }

  const sb = createAdminClient();

  // Emit checkin_initiated. Payload is aggregate only — no actor_id either.
  // Spec: "we log only that a check-in occurred, what resource was offered,
  // and whether it was accepted. No names."
  await appendLedgerEvent(sb, {
    org_id: profile.org_id,
    workflow_id: null,
    event_type: "checkin_initiated",
    actor_id: null, // <-- deliberately null, even though we know who did it
    payload: {
      routing_type,
      accepted,
    },
  });

  await appendLedgerEvent(sb, {
    org_id: profile.org_id,
    workflow_id: null,
    event_type: "resource_routed",
    actor_id: null,
    payload: {
      routing_type,
      accepted,
    },
  });

  return NextResponse.json({ ok: true });
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
