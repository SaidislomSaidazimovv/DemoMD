"use client";

import { useEffect } from "react";
import Link from "next/link";

// Global error boundary. Rendered when anything inside the tree throws during
// rendering, in an event handler, or in a useEffect. Must be a client
// component. Next auto-wires this file; we only need to default-export a
// component with (error, reset) props.

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface to the dev console so it shows up in Vercel function logs too.
    // eslint-disable-next-line no-console
    console.error("Unhandled app error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-surface-base">
      <div className="max-w-md w-full space-y-6 rounded-lg border border-state-flagged/30 bg-surface-card p-8">
        <div className="space-y-2">
          <div className="text-micro uppercase text-state-flagged">Something went wrong</div>
          <h1 className="text-heading-1 text-ink">Unexpected error</h1>
        </div>
        <p className="text-body text-ink-tertiary">
          The app ran into an error it didn&apos;t know how to handle. The details have been
          logged. You can try again — if the error keeps happening, sign out and back in, or
          reach out to whoever set up this instance.
        </p>
        {error.digest && (
          <div className="rounded-md border border-hairline-subtle bg-surface-subtle px-3 py-2">
            <div className="text-micro uppercase text-ink-muted mb-1">Error ID</div>
            <div className="font-mono text-caption text-ink-secondary break-all">
              {error.digest}
            </div>
          </div>
        )}
        <div className="flex items-center gap-3">
          <button
            onClick={reset}
            className="rounded-md bg-accent text-[#04130B] px-4 h-10 text-body font-medium hover:brightness-110"
          >
            Try again
          </button>
          <Link
            href="/"
            className="text-body text-ink-tertiary hover:text-ink"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
