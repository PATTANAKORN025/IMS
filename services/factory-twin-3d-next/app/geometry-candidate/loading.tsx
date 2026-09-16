/**
 * Phase 12D: Next.js App Router's own route-segment loading state,
 * distinct from error.tsx -- shown automatically while page.tsx's Server
 * Component is still fetching, never confused with a failure state. No
 * fabricated data, no skeleton pretending to be real geometry -- just an
 * honest "loading" message matching the route's own industrial UI tokens.
 */
export default function GeometryCandidateLoading() {
  return (
    <main className="flex h-dvh flex-col items-center justify-center gap-2 bg-bg p-6 text-center">
      <h1 className="text-sm font-semibold text-text-primary">Factory Twin — loading geometry…</h1>
      <p className="text-xs text-text-secondary">Fetching CAD geometry, machines, and reference overlay from the backend.</p>
    </main>
  );
}
