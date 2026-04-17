"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center text-slate-500">
          Loading…
        </main>
      }
    >
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const initialError = params?.get("error") ?? null;

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const supabase = createClient();
    const { data, error: signUpErr } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          full_name: fullName,
          pending_org_name: orgName,
          pending_org_slug: orgSlug,
        },
      },
    });

    if (signUpErr) {
      setError(signUpErr.message);
      setBusy(false);
      return;
    }

    // If email confirmation is enabled (expected), no session is returned.
    if (!data.session) {
      router.replace(`/verify-email?email=${encodeURIComponent(email)}`);
      return;
    }

    // Edge case: confirmation disabled in Supabase dashboard — user is already signed in.
    // Call complete-signup to create org + profile now.
    try {
      const r = await fetch("/api/auth/complete-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ fullName, orgName, orgSlug }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? "org creation failed");
      router.replace("/admin");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  function suggestSlug(name: string) {
    const s = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50);
    if (!orgSlug) setOrgSlug(s);
  }

  async function googleSignIn() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold">Create your organization</h1>
          <p className="text-slate-400 text-sm mt-1">
            You'll be the admin. Invite your team once you're in.
          </p>
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
          <Field label="Your full name">
            <input required value={fullName} onChange={(e) => setFullName(e.target.value)} className="input" />
          </Field>
          <Field label="Your email">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="you@yourbank.com"
            />
          </Field>
          <Field label="Password (≥ 8 chars)">
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
            />
          </Field>
          <hr className="border-slate-800" />
          <Field label="Bank / organization name">
            <input
              required
              value={orgName}
              onChange={(e) => {
                setOrgName(e.target.value);
                suggestSlug(e.target.value);
              }}
              className="input"
            />
          </Field>
          <Field label="URL slug (a-z, 0-9, dashes)">
            <input
              required
              pattern="[a-z0-9\-]{3,50}"
              value={orgSlug}
              onChange={(e) => setOrgSlug(e.target.value)}
              className="input font-mono"
            />
            <p className="mt-1 text-xs text-slate-500">Used in URLs. Cannot be changed later.</p>
          </Field>

          {error && (
            <div className="rounded border border-rose-700/50 bg-rose-900/20 px-3 py-2 text-sm text-rose-300">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-brand hover:bg-brand/90 px-4 py-2 text-sm font-semibold text-brand-fg disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create organization"}
          </button>
          <p className="text-xs text-slate-500">
            We'll send a confirmation link to your email. You must click it before you can sign in.
          </p>
        </form>

        <div className="text-center text-sm text-slate-400">
          <Link href="/login" className="hover:text-slate-200">
            Already have an account? Sign in
          </Link>
        </div>
      </div>

      <style jsx>{`
        :global(.input) {
          width: 100%;
          border-radius: 0.375rem;
          border: 1px solid rgb(51 65 85);
          background: rgb(2 6 23);
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
        }
        :global(.input:focus) {
          outline: none;
          box-shadow: 0 0 0 2px rgb(15 118 110);
        }
      `}</style>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wide text-slate-400 mb-1">{label}</label>
      {children}
    </div>
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
