"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center text-slate-500">
          Loading…
        </main>
      }
    >
      <VerifyEmailBody />
    </Suspense>
  );
}

function VerifyEmailBody() {
  const params = useSearchParams();
  const email = params?.get("email") ?? "";
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    if (!email) {
      setError("Email missing from URL. Go back to signup and retry.");
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setBusy(false);
    if (err) {
      setError(err.message);
    } else {
      setNotice("Confirmation email sent. Check your inbox (and spam).");
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="text-5xl mb-4">📧</div>
          <h1 className="text-3xl font-bold">Check your email</h1>
          <p className="text-slate-400 text-sm mt-2">
            We sent a confirmation link to{" "}
            <span className="font-mono text-slate-200">{email || "your inbox"}</span>.
          </p>
        </div>

        <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-6 text-sm text-slate-300 space-y-3">
          <p>
            Click the link in the email to activate your account. You won't be able to sign in
            until you confirm.
          </p>
          <p className="text-slate-400">
            Didn't get it? Check your spam folder, or resend below.
          </p>
        </div>

        {notice && (
          <div className="rounded border border-emerald-700/50 bg-emerald-900/20 px-3 py-2 text-sm text-emerald-300">
            {notice}
          </div>
        )}
        {error && (
          <div className="rounded border border-rose-700/50 bg-rose-900/20 px-3 py-2 text-sm text-rose-300">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={resend}
            disabled={busy}
            className="flex-1 rounded-md border border-slate-700 bg-slate-900 hover:bg-slate-800 px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {busy ? "Sending…" : "Resend email"}
          </button>
          <Link
            href="/login"
            className="flex-1 text-center rounded-md bg-brand hover:bg-brand/90 px-4 py-2 text-sm font-semibold text-brand-fg"
          >
            Go to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
