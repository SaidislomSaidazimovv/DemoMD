// Butterfly-scoped loading — renders inside the .theme-butterfly shell.
// Overrides the global Tasdiq-dark loading for any /app/* route.

export default function ButterflyLoading() {
  return (
    <div className="theme-butterfly min-h-screen flex items-center justify-center">
      <div className="flex items-center gap-3 text-[color:var(--bf-caption)]">
        <span className="inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
        <span className="text-[15px]">Loading…</span>
      </div>
    </div>
  );
}
