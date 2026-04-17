import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { computeEventHash } from "@/lib/ledger";
import type { UserRole } from "@/lib/types";

// Admin invites a new teammate.
// Handles three cases cleanly:
//   (A) Brand-new email → create auth user + profile + send invite email.
//   (B) Email exists in auth.users but no profile here (orphan from prior delete)
//       → reuse the auth user, create a fresh profile, re-send a magic link.
//   (C) Email is already registered in *another* organization → reject.
// The "user already in your organization" case is blocked earlier.

export const dynamic = "force-dynamic";

const INVITABLE_ROLES: UserRole[] = ["admin", "bank_officer", "inspector", "supervisor"];

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { email, fullName, role } = body as { email?: string; fullName?: string; role?: UserRole };

  if (!email || !fullName || !role) {
    return NextResponse.json({ error: "email, fullName, role required" }, { status: 400 });
  }
  if (!INVITABLE_ROLES.includes(role)) {
    return NextResponse.json(
      { error: `role must be one of ${INVITABLE_ROLES.join(", ")}` },
      { status: 400 }
    );
  }

  // Require a signed-in admin
  const ssb = createServerSupabase();
  const {
    data: { user: caller },
  } = await ssb.auth.getUser();
  if (!caller) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { data: callerProfile } = await ssb
    .from("users")
    .select("*")
    .eq("id", caller.id)
    .single();
  if (!callerProfile || callerProfile.role !== "admin") {
    return NextResponse.json({ error: "admin only" }, { status: 403 });
  }

  const sb = createAdminClient();
  const origin = new URL(req.url).origin;
  const redirectTo = `${origin}/accept-invite`;
  const inviteMeta = {
    full_name: fullName,
    invited_org_id: callerProfile.org_id,
    invited_role: role,
  };

  // Find any existing auth user with this email
  const existingAuth = await findAuthUserByEmail(sb, email);

  if (existingAuth) {
    // Check their existing profile
    const { data: existingProfile } = await sb
      .from("users")
      .select("id, org_id, role, accepted_at")
      .eq("id", existingAuth.id)
      .maybeSingle();

    if (existingProfile) {
      if (existingProfile.org_id === callerProfile.org_id) {
        return NextResponse.json(
          { error: "User is already in your organization." },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "This email belongs to a user in another organization." },
        { status: 409 }
      );
    }

    // Orphan auth user — reuse it. Update metadata, create fresh profile, re-send link.
    await sb.auth.admin.updateUserById(existingAuth.id, {
      user_metadata: { ...(existingAuth.user_metadata ?? {}), ...inviteMeta },
    });

    const { error: profileErr } = await sb.from("users").insert({
      id: existingAuth.id,
      org_id: callerProfile.org_id,
      email,
      full_name: fullName,
      role,
      accepted_at: null,
    });
    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 500 });
    }

    // Re-send a magic link so they can activate
    const { error: linkErr } = await sb.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo },
    });
    if (linkErr) {
      return NextResponse.json({ error: linkErr.message }, { status: 500 });
    }

    await emitUserInvited(sb, callerProfile, existingAuth.id, email, role, fullName, true);
    return NextResponse.json({ ok: true, userId: existingAuth.id, reinvited: true });
  }

  // Brand-new email — standard invite flow
  const { data: invited, error: inviteErr } = await sb.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: inviteMeta,
  });
  if (inviteErr || !invited.user) {
    return NextResponse.json(
      { error: inviteErr?.message ?? "invite failed" },
      { status: 500 }
    );
  }

  const { error: profileErr } = await sb.from("users").upsert(
    {
      id: invited.user.id,
      org_id: callerProfile.org_id,
      email,
      full_name: fullName,
      role,
      accepted_at: null,
    },
    { onConflict: "id" }
  );
  if (profileErr) {
    return NextResponse.json({ error: profileErr.message }, { status: 500 });
  }

  await emitUserInvited(sb, callerProfile, invited.user.id, email, role, fullName, false);
  return NextResponse.json({ ok: true, userId: invited.user.id });
}

// Write a `user_invited` ledger event through the hash chain.
async function emitUserInvited(
  sb: ReturnType<typeof createAdminClient>,
  caller: { id: string; org_id: string },
  invitedUserId: string,
  email: string,
  role: UserRole,
  fullName: string,
  reinvite: boolean
) {
  const { data: prev } = await sb
    .from("ledger_events")
    .select("hash")
    .eq("org_id", caller.org_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const payload = {
    invited_user_id: invitedUserId,
    email,
    role,
    full_name: fullName,
    reinvite,
  };
  const hash = await computeEventHash({
    prevHash: prev?.hash ?? null,
    eventId: id,
    eventType: "user_invited",
    payload,
    createdAt,
  });
  await sb.from("ledger_events").insert({
    id,
    org_id: caller.org_id,
    workflow_id: null,
    event_type: "user_invited",
    actor_id: caller.id,
    payload,
    prev_hash: prev?.hash ?? null,
    hash,
    created_at: createdAt,
  });
}

// Page through auth.users looking for an email match.
// Supabase Admin API returns at most 1000 users per page.
async function findAuthUserByEmail(
  sb: ReturnType<typeof createAdminClient>,
  email: string
) {
  const target = email.toLowerCase();
  let page = 1;
  while (true) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === target);
    if (hit) return hit;
    if (data.users.length < 1000) return null;
    page += 1;
  }
}
