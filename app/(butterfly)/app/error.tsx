"use client";

import { useEffect } from "react";
import Link from "next/link";

// Butterfly-scoped error boundary. Uses the white institutional aesthetic.

export default function ButterflyError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("Butterfly error:", error);
  }, [error]);

  return (
    <div className="theme-butterfly min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-6 rounded-[28px] border border-[color:var(--bf-hair)] bg-[color:var(--bf-bg)] p-10">
        <div>
          <div className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--bf-caption)]">
            Butterfly
          </div>
          <h1 className="mt-3 text-[28px] font-semibold text-[color:var(--bf-ink)] tracking-tight leading-tight">
            Something didn&apos;t load.
          </h1>
        </div>
        <p className="text-[16px] text-[color:var(--bf-muted)] leading-[1.6]">
          The page you were opening hit an error. Your data is safe — the ledger is
          append-only. Try again, or go back to your workspace home.
        </p>
        {error.digest && (
          <div className="rounded-[16px] bg-[color:var(--bf-bg-muted)] p-3">
            <div className="text-[11px] uppercase tracking-[0.14em] text-[color:var(--bf-caption)] mb-1">
              Error reference
            </div>
            <div className="font-mono text-[12px] text-[color:var(--bf-ink)] break-all">
              {error.digest}
            </div>
          </div>
        )}
        <div className="flex items-center gap-3">
          <button
            onClick={reset}
            className="bg-[color:var(--bf-accent)] text-white rounded-full h-11 px-5 text-[15px] font-medium hover:brightness-110"
          >
            Try again
          </button>
          <Link
            href="/app/home"
            className="text-[15px] text-[color:var(--bf-caption)] hover:text-[color:var(--bf-ink)]"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
