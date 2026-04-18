import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Called from /auth/callback (client page) immediately after a successful
// exchangeCodeForSession(). Reads the newly-established session, creates any
// missing profile rows, and tells the client where to route to next.
//
// Three cases in order:
//   1. Profile already exists ─ returning user. Respect invited-but-not-activated
//      state by sending them to /accept-invite.
//   2. Fresh invite (invited_org_id metadata) ─ create provisional profile,
//      send to /accept-invite for password setup.
//   3. Fresh signup (pending_org_name metadata) ─ create org + admin profile,
//      send to /admin.
//   4. OAuth new user with no metadata ─ send to /complete-signup.

export const dynamic = "force-dynamic";

const ROLE_ROUTE: Record<string, string> = {
  // Tasdiq roles
  admin: "/admin",
  inspector: "/capture",
  bank_officer: "/dashboard",
  supervisor: "/dashboard",
  // Butterfly roles
  hr_admin: "/app/home",
  manager: "/app/checkin",
  responder: "/app/checkin",
};

export async function POST() {
  const ssb = createServerSupabase();
  const {
    data: { user },
    error: userErr,
  } = await ssb.auth.getUser();
  if (userErr || !user) {
    return NextResponse.json(
      { error: "no authenticated session" },
      { status: 401 }
    );
  }

  const admin = createAdminClient();

  // 1. Profile already exists ─ returning user
  const { data: profile } = await admin
    .from("users")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile) {
    // If the invite metadata is still present, they haven't set a password yet.
    const meta = (user.user_metadata ?? {}) as { invited_org_id?: string };
    if (meta.invited_org_id) {
      return NextResponse.json({ ok: true, redirect: "/accept-invite" });
    }
    return NextResponse.json({
      ok: true,
      redirect: ROLE_ROUTE[profile.role as string] ?? "/",
    });
  }

  const meta = (user.user_metadata ?? {}) as {
    full_name?: string;
    pending_org_name?: string;
    pending_org_slug?: string;
    pending_product?: "tasdiq" | "butterfly";
    invited_org_id?: string;
    invited_role?: string;
  };

  // 2. Invited user, profile not yet inserted
  if (meta.invited_org_id && meta.invited_role) {
    const { error: insErr } = await admin.from("users").insert({
      id: user.id,
      org_id: meta.invited_org_id,
      email: user.email!,
      full_name: meta.full_name ?? user.email!,
      role: meta.invited_role,
      accepted_at: null,
    });
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, redirect: "/accept-invite" });
  }

  // 3. Fresh traditional signup — create org + profile
  if (meta.pending_org_name && meta.pending_org_slug) {
    const { data: slugCollision } = await admin
      .from("organizations")
      .select("id")
      .eq("slug", meta.pending_org_slug)
      .maybeSingle();
    if (slugCollision) {
      await admin.auth.admin.deleteUser(user.id).catch(() => {});
      return NextResponse.json(
        { error: "slug already taken" },
        { status: 409 }
      );
    }

    const product: "tasdiq" | "butterfly" =
      meta.pending_product === "butterfly" ? "butterfly" : "tasdiq";
    // Butterfly orgs get the hr_admin owner role; Tasdiq orgs get admin.
    const role = product === "butterfly" ? "hr_admin" : "admin";
    const landingRoute = product === "butterfly" ? "/app/home" : "/admin";

    const { data: org, error: orgErr } = await admin
      .from("organizations")
      .insert({
        name: meta.pending_org_name,
        slug: meta.pending_org_slug,
        product,
        settings: {},
      })
      .select("id")
      .single();
    if (orgErr || !org) {
      await admin.auth.admin.deleteUser(user.id).catch(() => {});
      return NextResponse.json(
        { error: orgErr?.message ?? "org create failed" },
        { status: 500 }
      );
    }

    const { error: profileErr } = await admin.from("users").insert({
      id: user.id,
      org_id: org.id,
      email: user.email!,
      full_name: meta.full_name ?? user.email!,
      role,
      accepted_at: new Date().toISOString(),
    });
    if (profileErr) {
      await admin.from("organizations").delete().eq("id", org.id);
      await admin.auth.admin.deleteUser(user.id).catch(() => {});
      return NextResponse.json(
        { error: profileErr.message },
        { status: 500 }
      );
    }

    // Clear pending metadata so a re-visit doesn't retry
    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        full_name: meta.full_name,
        pending_org_name: null,
        pending_org_slug: null,
        pending_product: null,
      },
    });

    return NextResponse.json({ ok: true, redirect: landingRoute });
  }

  // 4. OAuth new user, no metadata ─ send to finish signup
  return NextResponse.json({ ok: true, redirect: "/complete-signup" });
}
