import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";

// List ledger events, optionally filtered by workflow_id.
// Paginated via ?limit=N&before=<iso-timestamp>.
// RLS restricts to the caller's org.

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(req: Request) {
  const ssb = createServerSupabase();
  const {
    data: { user },
  } = await ssb.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const url = new URL(req.url);
  const workflowId = url.searchParams.get("workflow_id");
  const before = url.searchParams.get("before");
  const limitParam = parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit = Math.min(
    MAX_LIMIT,
    Number.isFinite(limitParam) && limitParam > 0 ? limitParam : DEFAULT_LIMIT
  );

  let q = ssb
    .from("ledger_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (workflowId) q = q.eq("workflow_id", workflowId);
  if (before) q = q.lt("created_at", before);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, events: data ?? [] });
}
