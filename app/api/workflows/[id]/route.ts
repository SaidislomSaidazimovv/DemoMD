import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";

// GET a single workflow with its media + ledger events, all in one round-trip.
// Auth: any member of the workflow's org (enforced by RLS).

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const ssb = createServerSupabase();
  const {
    data: { user },
  } = await ssb.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const [{ data: workflow, error: wfErr }, { data: media }, { data: events }] =
    await Promise.all([
      ssb.from("workflows").select("*").eq("id", ctx.params.id).maybeSingle(),
      ssb
        .from("media")
        .select("*")
        .eq("workflow_id", ctx.params.id)
        .order("created_at", { ascending: false }),
      ssb
        .from("ledger_events")
        .select("*")
        .eq("workflow_id", ctx.params.id)
        .order("created_at", { ascending: true }),
    ]);

  if (wfErr) {
    return NextResponse.json({ error: wfErr.message }, { status: 500 });
  }
  if (!workflow) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    workflow,
    media: media ?? [],
    events: events ?? [],
  });
}
