/**
 * Server Component -- static header, no interactivity. The legacy
 * /factory-twin-3d/ header (index.html) shows the page title and a
 * production/demo environment indicator; this mirrors that STRUCTURE
 * only. The environment value below is a labeled placeholder, not a real
 * read of any production/demo state -- wiring it to the real signal is
 * explicitly out of scope for Step 3 (UI shell only, no data wiring).
 */
export default function TwinHeader() {
  return (
    <header className="flex h-11 shrink-0 items-center justify-between border-b border-border bg-surface px-4">
      <h1 className="text-sm font-semibold tracking-wide text-text-primary">
        Factory Twin 3D
      </h1>
      <span
        className="rounded-sm border border-border px-2 py-0.5 text-xs text-text-secondary"
        title="Placeholder only -- not wired to a real production/demo signal in Step 3"
      >
        Environment: (placeholder)
      </span>
    </header>
  );
}
