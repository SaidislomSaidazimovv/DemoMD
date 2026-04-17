import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";

// Service-role client — bypasses RLS. Server-only. Never import from browser code.
let cached: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  cached = createSupabaseClient(url, key, { auth: { persistSession: false } });
  return cached;
}
