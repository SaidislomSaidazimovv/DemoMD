"use client";

import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client. Reads session from cookies, keeps it in sync
// across tabs via the Supabase auth broadcast channel.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
