import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Called from /accept-invite after the user arrives via magic link and sets
// a password. Validates that their public.users row exists; if not, creates it
// from the user_metadata the inviter stored.

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { password } = body as { password?: string };
  if (!password || password.length < 8) {
    return NextResponse.json({ error: "password ≥ 8 chars required" }, { status: 400 });
  }

  const ssb = createServerSupabase();
  const {
    data: { user },
  } = await ssb.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  // Set the password and clear invite metadata so the callback won't
  // bounce them back here on next sign-in.
  const { error: pwErr } = await ssb.auth.updateUser({
    password,
    data: {
      ...(user.user_metadata ?? {}),
      invited_org_id: null,
      invited_role: null,
    },
  });
  if (pwErr) return NextResponse.json({ error: pwErr.message }, { status: 400 });

  // Ensure users profile row exists
  const sb = createAdminClient();
  const nowIso = new Date().toISOString();
  const { data: profile } = await sb.from("users").select("*").eq("id", user.id).maybeSingle();
  if (!profile) {
    const meta = (user.user_metadata ?? {}) as {
      full_name?: string;
      invited_org_id?: string;
      invited_role?: string;
    };
    if (!meta.invited_org_id || !meta.invited_role) {
      return NextResponse.json(
        { error: "invite metadata missing — contact your admin" },
        { status: 400 }
      );
    }
    const { error: insertErr } = await sb.from("users").insert({
      id: user.id,
      org_id: meta.invited_org_id,
      email: user.email!,
      full_name: meta.full_name ?? user.email!,
      role: meta.invited_role,
      accepted_at: nowIso,
    });
    if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
  } else if (!profile.accepted_at) {
    // Profile exists (provisional from invite). Mark it accepted now.
    const { error: updErr } = await sb
      .from("users")
      .update({ accepted_at: nowIso })
      .eq("id", user.id);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
