import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// For an already-authenticated user without a profile — create org + admin profile.
// Covers two cases:
//   (a) Email confirmations where Supabase confirmation is disabled (rare, fallback)
//   (b) Google OAuth users without invitations (the /complete-signup flow)

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { fullName, orgName, orgSlug } = body as {
    fullName?: string;
    orgName?: string;
    orgSlug?: string;
  };

  if (!fullName || !orgName || !orgSlug) {
    return NextResponse.json({ error: "fullName, orgName, orgSlug required" }, { status: 400 });
  }
  if (!/^[a-z0-9-]{3,50}$/.test(orgSlug)) {
    return NextResponse.json({ error: "slug must be 3-50 chars of a-z, 0-9, or -" }, { status: 400 });
  }

  const ssb = createServerSupabase();
  const {
    data: { user },
  } = await ssb.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const admin = createAdminClient();

  // Refuse if they already have a profile
  const { data: existing } = await admin
    .from("users")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (existing) {
    return NextResponse.json({ error: "profile already exists" }, { status: 409 });
  }

  // Slug uniqueness
  const { data: slugCollision } = await admin
    .from("organizations")
    .select("id")
    .eq("slug", orgSlug)
    .maybeSingle();
  if (slugCollision) {
    return NextResponse.json({ error: "organization slug already taken" }, { status: 409 });
  }

  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({ name: orgName, slug: orgSlug, product: "tasdiq", settings: {} })
    .select("id")
    .single();
  if (orgErr || !org) {
    return NextResponse.json({ error: orgErr?.message ?? "org create failed" }, { status: 500 });
  }

  const { error: profileErr } = await admin.from("users").insert({
    id: user.id,
    org_id: org.id,
    email: user.email!,
    full_name: fullName,
    role: "admin",
    accepted_at: new Date().toISOString(),
  });
  if (profileErr) {
    await admin.from("organizations").delete().eq("id", org.id);
    return NextResponse.json({ error: profileErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, orgId: org.id });
}
