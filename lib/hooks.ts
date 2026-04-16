"use client";

import { useEffect, useState } from "react";
import { supabase } from "./mock-db";
import type { Session } from "./types";

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then((r) => {
      if (cancelled) return;
      setSession(r.data?.session ?? null);
      setLoading(false);
    });
    const sub = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => {
      cancelled = true;
      sub.data.subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
}

// Redirects out of the page if auth state doesn't match requirement.
export function useRequireRole(allowed: string[], redirectTo = "/login") {
  const { session, loading } = useSession();
  useEffect(() => {
    if (loading) return;
    if (!session) {
      window.location.href = redirectTo;
    } else if (allowed.length > 0 && !allowed.includes(session.user.role)) {
      window.location.href = "/";
    }
  }, [session, loading, allowed.join(","), redirectTo]);
  return { session, loading };
}
