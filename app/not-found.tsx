import Link from "next/link";

// Global 404. Rendered whenever a route resolves to nothing, or when an
// RSC calls `notFound()`. Uses Tasdiq dark tokens — Butterfly routes are
// generally protected so a 404 inside /app/* would get redirected by
// middleware before hitting this. This is the fallback.

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-surface-base">
      <div className="max-w-md w-full space-y-6 text-center">
        <div className="text-[80px] font-bold text-ink-muted leading-none tabular-nums">
          404
        </div>
        <h1 className="text-heading-2 text-ink">Page not found</h1>
        <p className="text-body text-ink-tertiary">
          The URL you opened doesn&apos;t match any page in this app. It may have been renamed,
          or the link you followed was incorrect.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Link
            href="/"
            className="rounded-md bg-accent text-[#04130B] px-4 h-10 inline-flex items-center text-body font-medium hover:brightness-110"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
