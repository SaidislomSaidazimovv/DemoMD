import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Returns a fresh 1-hour signed URL for a previously-generated tranche pack.
// Any member of the owning org may download.

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const ssb = createServerSupabase();
  const {
    data: { user },
  } = await ssb.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { data: profile } = await ssb
    .from("users")
    .select("org_id")
    .eq("id", user.id)
    .single();
  if (!profile) return NextResponse.json({ error: "no profile" }, { status: 403 });

  const admin = createAdminClient();
  const { data: pack } = await admin
    .from("export_packs")
    .select("*")
    .eq("id", ctx.params.id)
    .maybeSingle();
  if (!pack || pack.org_id !== profile.org_id) {
    return NextResponse.json({ error: "pack not found" }, { status: 404 });
  }

  const { data: signed, error: signErr } = await admin.storage
    .from("exports")
    .createSignedUrl(pack.storage_path, 60 * 60);
  if (signErr || !signed) {
    return NextResponse.json(
      { error: signErr?.message ?? "could not sign" },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, downloadUrl: signed.signedUrl });
}
