import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyChallengeCode } from "@/lib/challenge";

// Pre-flight challenge verification. The capture UI can hit this before
// uploading the full still+video payload to avoid a round-trip if the code
// is already stale. The canonical verification still runs inside
// /api/media/upload (via runAllChecks) — this endpoint is advisory.

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { workflow_id, submitted, captured_at } = body as {
    workflow_id?: string;
    submitted?: string;
    captured_at?: string;
  };
  if (!workflow_id || typeof submitted !== "string") {
    return NextResponse.json(
      { error: "workflow_id and submitted required" },
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

  const sb = createAdminClient();
  const { data: wf } = await sb
    .from("workflows")
    .select("meta, org_id")
    .eq("id", workflow_id)
    .eq("org_id", profile.org_id)
    .maybeSingle();
  if (!wf) return NextResponse.json({ error: "workflow not found" }, { status: 404 });

  const expected = wf.meta?.challenge_code as string | undefined;
  const issuedAtStr = wf.meta?.challenge_issued_at as string | undefined;
  if (!expected || !issuedAtStr) {
    return NextResponse.json({ error: "workflow has no challenge code" }, { status: 400 });
  }

  const result = verifyChallengeCode({
    submitted,
    expected,
    issuedAt: new Date(issuedAtStr),
    capturedAt: captured_at ? new Date(captured_at) : new Date(),
  });

  return NextResponse.json({ ok: true, ...result });
}
