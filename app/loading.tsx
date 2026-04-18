// Global loading UI. Shows during server-rendering and between
// route navigations. Uses the Tasdiq dark-theme tokens (default).
// Butterfly routes override this via app/(butterfly)/app/loading.tsx.

export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-base">
      <div className="flex items-center gap-3 text-ink-tertiary">
        <span className="inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
        <span className="text-body">Loading…</span>
      </div>
    </div>
  );
}
