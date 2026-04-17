"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

const roleRoute: Record<string, string> = {
  admin: "/admin",
  inspector: "/capture",
  bank_officer: "/dashboard",
  supervisor: "/dashboard",
};

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center text-slate-500">
          Loading…
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const initialError = params?.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    initialError ? decodeURIComponent(initialError) : null
  );
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [resendNotice, setResendNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setUnconfirmed(false);
    setResendNotice(null);

    const supabase = createClient();
    const { data, error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
    if (signInErr || !data.user) {
      const msg = signInErr?.message ?? "Login failed";
      // Supabase emits "Email not confirmed" for unconfirmed signups
      if (/email.*not confirmed/i.test(msg)) {
        setUnconfirmed(true);
        setError("Your email isn't confirmed yet. Check your inbox or resend below.");
      } else {
        setError(msg);
      }
      setBusy(false);
      return;
    }

    // Fetch profile for role-based routing
    const { data: profile } = await supabase
      .from("users")
      .select("role")
      .eq("id", data.user.id)
      .maybeSingle();

    if (!profile) {
      // Signed in but no profile — finish signup
      router.replace("/complete-signup");
      return;
    }
    const dest = params?.get("next") ?? roleRoute[profile.role] ?? "/";
    router.replace(dest);
  }

  async function googleSignIn() {
    setError(null);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  async function resendConfirmation() {
    setResendBusy(true);
    setResendNotice(null);
    const supabase = createClient();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setResendBusy(false);
    if (error) {
      setError(error.message);
    } else {
      setResendNotice("Confirmation email sent. Check your inbox.");
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Tasdiq</h1>
          <p className="text-slate-400 text-sm mt-1">Sign in to continue</p>
        </div>

        <button
          onClick={googleSignIn}
          className="w-full flex items-center justify-center gap-3 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 px-4 py-2.5 text-sm font-medium transition"
        >
          <GoogleIcon />
          Continue with Google
        </button>

        <div className="relative text-center text-xs text-slate-500">
          <div className="absolute inset-0 top-1/2 border-t border-slate-800" />
          <span className="relative bg-slate-950 px-3">or use email</span>
        </div>

        <form
          onSubmit={submit}
          className="space-y-4 rounded-xl border border-slate-700 bg-slate-900/60 p-6"
        >
          <div>
            <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">Email</label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
          </div>
          {error && (
            <div className="rounded border border-rose-700/50 bg-rose-900/20 px-3 py-2 text-sm text-rose-300">
              {error}
              {unconfirmed && email && (
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={resendConfirmation}
                    disabled={resendBusy}
                    className="underline text-rose-200 disabled:opacity-50"
                  >
                    {resendBusy ? "Sending…" : "Resend confirmation email"}
                  </button>
                </div>
              )}
            </div>
          )}
          {resendNotice && (
            <div className="rounded border border-emerald-700/50 bg-emerald-900/20 px-3 py-2 text-sm text-emerald-300">
              {resendNotice}
            </div>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-brand hover:bg-brand/90 px-4 py-2 text-sm font-semibold text-brand-fg disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <div className="text-center text-sm text-slate-400 space-x-4">
          <Link href="/signup" className="hover:text-slate-200">
            Create a new organization
          </Link>
          <span className="text-slate-600">·</span>
          <Link href="/" className="hover:text-slate-200">
            ← back
          </Link>
        </div>
      </div>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.4H42V20H24v8h11.3C33.8 32.4 29.3 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.8 6.4 29.1 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5c10.8 0 19.5-8.7 19.5-19.5 0-1.3-.1-2.4-.4-3.6z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.1l6.6 4.8c1.8-3.6 5.5-6.1 9.7-6.1 2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C31.9 6.4 27.3 4.5 22.2 4.5c-7.6 0-14.1 4.3-17.3 10.6l1.4-1z"
      />
      <path
        fill="#4CAF50"
        d="M24 43.5c5.1 0 9.7-1.9 13.1-5l-6.1-5c-2 1.4-4.4 2.2-7 2.2-5.3 0-9.8-3.1-11.7-7.5l-6.5 5c3 6 9.3 10.3 18.2 10.3z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.4H42V20H24v8h11.3c-.9 2.5-2.6 4.6-4.8 6l6.1 5c4.2-3.9 6.9-9.7 6.9-16.4 0-1.3-.1-2.4-.4-3.6z"
      />
    </svg>
  );
}
