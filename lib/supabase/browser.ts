"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Browser-side Supabase client — **singleton** per document.
//
// Previously this returned a fresh client on every call. Each instance
// spins up its own auth listeners + cross-tab broadcast channel + storage
// subscriptions; creating one per React component was wasteful and made
// navigation feel slow. A singleton keeps one set of listeners alive for
// the whole session and makes repeated `createClient()` calls essentially
// free.
let instance: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  if (instance) return instance;
  instance = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  return instance;
}
