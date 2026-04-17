import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Unified OAuth + email-confirmation callback.
// Handles three cases:
//   1. Email-confirmation of a traditional signup — creates org + profile from user_metadata
//   2. Invited user accepting a magic link — they land here, already have a profile,
//      then get forwarded to /accept-invite to set a password
//   3. Google OAuth sign-in — creates profile if their email matches an invited row,
//      otherwise routes to /complete-signup to finish org setup
//
// Anything unexpected lands back at /login with an error message.

export const dynamic = "force-dynamic";

const ROLE_ROUTE: Record<string, string> = {
  admin: "/admin",
  inspector: "/capture",
  bank_officer: "/dashboard",
  supervisor: "/dashboard",
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const errorDesc = url.searchParams.get("error_description");

  if (errorDesc) {
    return NextResponse.redirect(
      `${url.origin}/login?error=${encodeURIComponent(errorDesc)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(`${url.origin}/login?error=no_code`);
  }

  const ssb = createServerSupabase();
  const { data: exchange, error: exErr } = await ssb.auth.exchangeCodeForSession(code);
  if (exErr || !exchange.user) {
    return NextResponse.redirect(
      `${url.origin}/login?error=${encodeURIComponent(exErr?.message ?? "exchange failed")}`
    );
  }

  const user = exchange.user;
  const admin = createAdminClient();

  // 1. Profile already exists — regular sign-in
  const { data: profile } = await admin
    .from("users")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile) {
    // If invited metadata is still present, they haven't set a password yet.
    // Route them to /accept-invite to finish setup.
    const meta = (user.user_metadata ?? {}) as { invited_org_id?: string };
    if (meta.invited_org_id) {
      return NextResponse.redirect(`${url.origin}/accept-invite`);
    }
    return NextResponse.redirect(
      `${url.origin}${ROLE_ROUTE[profile.role as string] ?? "/"}`
    );
  }

  const meta = (user.user_metadata ?? {}) as {
    full_name?: string;
    pending_org_name?: string;
    pending_org_slug?: string;
    invited_org_id?: string;
    invited_role?: string;
  };

  // 2. Invited user, profile row wasn't created at invite time for some reason.
  // accepted_at stays null until they finish /accept-invite (set password).
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
      return NextResponse.redirect(
        `${url.origin}/login?error=${encodeURIComponent(insErr.message)}`
      );
    }
    return NextResponse.redirect(`${url.origin}/accept-invite`);
  }

  // 3. Traditional signup, email just confirmed — create org + admin profile
  if (meta.pending_org_name && meta.pending_org_slug) {
    const { data: slugCollision } = await admin
      .from("organizations")
      .select("id")
      .eq("slug", meta.pending_org_slug)
      .maybeSingle();
    if (slugCollision) {
      // Clean up the auth user so they can try again with a different slug
      await admin.auth.admin.deleteUser(user.id).catch(() => {});
      return NextResponse.redirect(
        `${url.origin}/signup?error=${encodeURIComponent("slug already taken")}`
      );
    }

    const { data: org, error: orgErr } = await admin
      .from("organizations")
      .insert({
        name: meta.pending_org_name,
        slug: meta.pending_org_slug,
        product: "tasdiq",
        settings: {},
      })
      .select("id")
      .single();
    if (orgErr || !org) {
      await admin.auth.admin.deleteUser(user.id).catch(() => {});
      return NextResponse.redirect(
        `${url.origin}/signup?error=${encodeURIComponent(orgErr?.message ?? "org create failed")}`
      );
    }

    const { error: profileErr } = await admin.from("users").insert({
      id: user.id,
      org_id: org.id,
      email: user.email!,
      full_name: meta.full_name ?? user.email!,
      role: "admin",
      accepted_at: new Date().toISOString(),
    });
    if (profileErr) {
      await admin.from("organizations").delete().eq("id", org.id);
      await admin.auth.admin.deleteUser(user.id).catch(() => {});
      return NextResponse.redirect(
        `${url.origin}/signup?error=${encodeURIComponent(profileErr.message)}`
      );
    }

    // Clear the pending metadata so a re-visit doesn't try to create another org
    await admin.auth.admin.updateUserById(user.id, {
      user_metadata: {
        full_name: meta.full_name,
        pending_org_name: null,
        pending_org_slug: null,
      },
    });

    return NextResponse.redirect(`${url.origin}/admin`);
  }

  // 4. OAuth sign-in without any profile or invite metadata (e.g. first-time Google user).
  // Send them to /complete-signup to establish an organization.
  return NextResponse.redirect(`${url.origin}/complete-signup`);
}
