"use client";

import { useEffect, useState } from "react";
import { createClient } from "./supabase/browser";
import type { User, UserRole } from "./types";

interface SessionInfo {
  userId: string;
  email: string;
  profile: User | null;
}

// Returns the current Supabase auth user + their public.users profile row.
// Resilient: any error inside hydrate still flips `loading` to false so callers
// don't spin on "Loading…" forever. Logs problems to the console.
export function useSession() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    async function hydrate() {
      try {
        const { data: userRes, error: userErr } = await supabase.auth.getUser();
        if (cancelled) return;
        if (userErr || !userRes.user) {
          setSession(null);
          return;
        }
        const { data: profile, error: profileErr } = await supabase
          .from("users")
          .select("*")
          .eq("id", userRes.user.id)
          .maybeSingle();
        if (cancelled) return;
        if (profileErr) {
          console.error("useSession: failed to load profile", profileErr);
        }
        setSession({
          userId: userRes.user.id,
          email: userRes.user.email ?? "",
          profile: (profile as User) ?? null,
        });
      } catch (e) {
        console.error("useSession: hydrate error", e);
        if (!cancelled) setSession(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    hydrate();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      // Only rehydrate on events that could change the session.
      // INITIAL_SESSION fires right after mount; skip it since hydrate() already ran.
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        hydrate();
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
}

// Guards a page behind role membership; redirects elsewhere if wrong.
// Returns `authorized` synchronously — pages should render a "Redirecting…"
// placeholder while `!authorized` is true, to avoid flashing page content to
// a user who's about to be kicked out.
export function useRequireRole(allowed: UserRole[], onDenied = "/") {
  const { session, loading } = useSession();
  const role = session?.profile?.role;
  const authorized =
    !loading &&
    !!session &&
    !!session.profile &&
    (allowed.length === 0 || (role !== undefined && allowed.includes(role)));

  useEffect(() => {
    if (loading) return;
    if (!session) {
      window.location.href = "/login";
      return;
    }
    if (session.profile && allowed.length > 0 && !allowed.includes(session.profile.role)) {
      window.location.href = onDenied;
    }
  }, [session, loading, allowed.join(","), onDenied]);
  return { session, loading, authorized };
}
