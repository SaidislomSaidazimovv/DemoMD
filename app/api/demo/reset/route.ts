import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Reset a workflow for the next demo run:
//  - delete all media rows for the workflow + their Storage files
//  - delete all ledger events for the workflow
//  - move workflow state back to EVIDENCE_REQUESTED
//  - clear any pack rows
// Does NOT scrub the org-wide ledger chain for other workflows; those events
// remain (demo resets only affect this workflow's slice). The chain anchor
// will change but remain valid going forward.

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { workflow_id } = body as { workflow_id?: string };
  if (!workflow_id) {
    return NextResponse.json({ error: "workflow_id required" }, { status: 400 });
  }

  const ssb = createServerSupabase();
  const {
    data: { user },
  } = await ssb.auth.getUser();
  if (!user) return NextResponse.json({ error: "not signed in" }, { status: 401 });

  const { data: profile } = await ssb.from("users").select("*").eq("id", user.id).single();
  if (!profile || !["admin", "bank_officer"].includes(profile.role)) {
    return NextResponse.json({ error: "admin or bank_officer only" }, { status: 403 });
  }

  const sb = createAdminClient();
  const { data: wf } = await sb
    .from("workflows")
    .select("*")
    .eq("id", workflow_id)
    .eq("org_id", profile.org_id)
    .maybeSingle();
  if (!wf) return NextResponse.json({ error: "workflow not found" }, { status: 404 });

  // Collect media storage paths to purge from Storage after we clear DB rows.
  const { data: mediaRows } = await sb
    .from("media")
    .select("storage_path, meta")
    .eq("workflow_id", workflow_id);

  const storagePaths: string[] = [];
  for (const row of (mediaRows ?? []) as { storage_path: string; meta: Record<string, unknown> | null }[]) {
    if (row.storage_path) storagePaths.push(row.storage_path);
    const videoPath = row.meta?.video_storage_path as string | undefined;
    if (videoPath) storagePaths.push(videoPath);
  }

  // Remove DB rows (order: media → ledger_events → export_packs → reset workflow).
  await sb.from("media").delete().eq("workflow_id", workflow_id);
  await sb.from("ledger_events").delete().eq("workflow_id", workflow_id);
  await sb.from("export_packs").delete().eq("workflow_id", workflow_id);

  if (storagePaths.length > 0) {
    await sb.storage.from("evidence").remove(storagePaths);
  }

  await sb
    .from("workflows")
    .update({
      current_state: "EVIDENCE_REQUESTED",
      completed_at: null,
      updated_at: new Date().toISOString(),
      meta: {
        ...wf.meta,
        challenge_issued_at: new Date().toISOString(),
      },
    })
    .eq("id", workflow_id);

  return NextResponse.json({
    ok: true,
    cleared: { media: (mediaRows ?? []).length, storage_files: storagePaths.length },
  });
}
