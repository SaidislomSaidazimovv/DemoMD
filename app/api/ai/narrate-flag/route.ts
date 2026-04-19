import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { runNarration } from "@/lib/ai-narration";

// POST /api/ai/narrate-flag
// Body: { mediaId: string }
//
// Thin wrapper around runNarration() in lib/ai-narration.ts. Primary
// caller is UI (after a FLAGGED capture, to re-run narration manually);
// /api/media/upload also calls the underlying function inline, not over
// HTTP, to avoid Vercel's fire-and-forget race.
//
// Auth: admin, bank_officer, or supervisor.

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { mediaId } = body as { mediaId?: string };
  if (!mediaId) {
    return NextResponse.json({ error: "mediaId required" }, { status: 400 });
  }

  const ssb = createServerSupabase();
  const {
    data: { user },
  } = await ssb.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { data: profile } = await ssb.from("users").select("*").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "no profile" }, { status: 403 });
  if (!["admin", "bank_officer", "supervisor"].includes(profile.role)) {
    return NextResponse.json(
      { error: "admin, bank_officer, or supervisor only" },
      { status: 403 }
    );
  }

  try {
    const result = await runNarration({
      mediaId,
      orgId: profile.org_id,
      actorId: profile.id,
    });
    return NextResponse.json({
      ok: true,
      narration: result.narration,
      model: result.model,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
