"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

// Unified landing page for every Supabase auth-token exchange:
//   - Email-confirmation link (signup flow)
//   - Invitation magic link
//   - Google OAuth redirect
//
// Runs the PKCE code→session exchange in the BROWSER (which is where the
// code-verifier cookie was stored during signup). Once the session is
// established client-side, calls /api/auth/finalize so the server can create
// any missing profile rows and tell us where to go next.

export default function Page() {
  return (
    <Suspense fallback={<Loader />}>
      <Body />
    </Suspense>
  );
}

function Loader({ label = "Completing sign-in…" }: { label?: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center space-y-2">
        <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-slate-500 border-t-brand" />
        <div className="text-sm text-slate-400">{label}</div>
      </div>
    </main>
  );
}

function Body() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Supabase sometimes redirects with ?error / ?error_description directly
      const errorDesc = params?.get("error_description") ?? params?.get("error");
      if (errorDesc) {
        if (!cancelled) router.replace(`/login?error=${encodeURIComponent(errorDesc)}`);
        return;
      }

      const code = params?.get("code");
      if (!code) {
        if (!cancelled) router.replace("/login?error=no_code");
        return;
      }

      const supabase = createClient();
      const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
      if (exErr) {
        if (!cancelled) {
          router.replace(`/login?error=${encodeURIComponent(exErr.message)}`);
        }
        return;
      }

      // Session is now on this browser. Tell the server to finalize the profile.
      try {
        const r = await fetch("/api/auth/finalize", {
          method: "POST",
          credentials: "include",
        });
        const data = await r.json();
        if (!r.ok || !data?.redirect) {
          const msg = data?.error ?? `finalize failed (${r.status})`;
          if (!cancelled) router.replace(`/login?error=${encodeURIComponent(msg)}`);
          return;
        }
        if (!cancelled) router.replace(data.redirect);
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-4">
          <h1 className="text-2xl font-bold">Sign-in failed</h1>
          <p className="text-sm text-rose-300">{error}</p>
          <Link
            href="/login"
            className="inline-block rounded-md bg-brand hover:bg-brand/90 px-4 py-2 text-sm font-semibold text-brand-fg"
          >
            Back to sign in
          </Link>
        </div>
      </main>
    );
  }

  return <Loader />;
}
