import { fetchFactoryGeometry } from '@/lib/geometry-adapter';
import { fetchMachines } from '@/lib/machine-adapter';
import { fetchReferenceOverlay } from '@/lib/reference-adapter';
import { BackendFetchError } from '@/lib/backend-fetch';
import { log } from '@/lib/log';
import GeometryViewport from '@/components/factory-twin/geometry/GeometryViewport';

const ROUTE = 'geometry-candidate';
const OPERATION = 'fetch-geometry-machines-reference';

// Phase 12D: this route always needs a live per-request backend call
// (cache: 'no-store' in every adapter) -- it was never meant to be
// statically generated at build time. Explicit, rather than left to
// Next.js's own "Dynamic Server Usage" detection: that detection works by
// throwing a special internal error from fetch() during a static-generation
// attempt, which this file's own try/catch below would otherwise catch and
// replace with a generic Error, breaking the framework's bailout and
// failing `next build` outright (confirmed: this surfaced exactly that way
// before this line was added). Declaring the route dynamic up front removes
// the ambiguity entirely, so the try/catch below only ever sees real
// runtime fetch failures.
export const dynamic = 'force-dynamic';

/**
 * Step 5A (CAD geometry) + Step 5B (static machines) + Step 5C (selection/
 * picking) + Step 5D (camera) + Step 5E (layers/reference) candidate route
 * -- /factory-twin-3d/geometry-candidate, NOT the production
 * /factory-twin-3d/ route (app/page.tsx, Step 3's shell, untouched).
 * Server Component: fetches the SAME authoritative data the legacy app
 * renders, server-side, from a running factory-twin-3d instance
 * (FACTORY_TWIN_API_BASE, defaulting to the disposable measurement
 * container this engagement has used throughout). No telemetry/alarm/
 * operational-state data or logic exists here -- Step 5C's explicit
 * boundary; a machine can be selected (identity only), never inspected.
 *
 * Step 5E fetches the reference overlay eagerly, alongside geometry/
 * machines, rather than lazily on first toggle the way app.js's own
 * `ensureRawCad()` does (app.js:1358) -- a disclosed divergence (see
 * FACTORY_TWIN_R3F_LAYER_ARCHITECTURE.md's "Known limitations"), not a
 * silent one: this step's own mission is about visibility architecture
 * (toggling must not rebuild geometry), not fetch-timing, and ~9.4k
 * already-small line segments cost nothing extra server-side. The
 * `reference` LAYER still defaults to OFF (`DEFAULT_LAYER_STATE`,
 * layer.ts), matching legacy's own default -- only the FETCH timing
 * differs, never the default visibility.
 */
export default async function GeometryCandidatePage() {
  const baseUrl = process.env.FACTORY_TWIN_API_BASE || 'http://localhost:4196';
  const startedAt = Date.now();

  // Phase 12D: the audit's own finding -- three server fetches with no
  // try/catch and no error.tsx, so a backend failure fell straight through
  // to Next.js's unstyled default error page. Every failure path here is
  // logged server-side with its real classification, THEN re-thrown as a
  // short, scrubbed Error whose message is only the BackendFetchError kind
  // (or 'VALIDATION_ERROR'/'UNKNOWN_ERROR') -- never the backend URL,
  // status text, or stack, which stay in the server log line only. This is
  // defense in depth on top of (not a replacement for) Next.js's own
  // production behaviour of stripping thrown-error messages before they
  // reach the client at all -- see app/geometry-candidate/error.tsx's own
  // header comment for why the boundary still never reads error.message.
  let geometry: Awaited<ReturnType<typeof fetchFactoryGeometry>>;
  let machines: Awaited<ReturnType<typeof fetchMachines>>;
  let reference: Awaited<ReturnType<typeof fetchReferenceOverlay>>;
  try {
    [geometry, machines] = await Promise.all([fetchFactoryGeometry(baseUrl), fetchMachines(baseUrl)]);
    reference = await fetchReferenceOverlay(baseUrl, geometry.envelope);
  } catch (err) {
    const kind = err instanceof BackendFetchError ? err.kind : 'UNKNOWN';
    const failureCategory = err instanceof BackendFetchError
      ? ({ TIMEOUT: 'timeout', NETWORK: 'network', HTTP_ERROR: 'http_error', MALFORMED_RESPONSE: 'malformed_response' } as const)[err.kind]
      : 'unknown_error';
    log({
      route: ROUTE,
      operation: OPERATION,
      failureCategory,
      durationMs: Date.now() - startedAt,
      // Server-side only -- never reaches the client, see the re-throw below.
      detail: err instanceof Error ? err.message : String(err),
    });
    throw new Error(kind === 'UNKNOWN' ? 'UNKNOWN_ERROR' : kind);
  }

  log({ route: ROUTE, operation: OPERATION, durationMs: Date.now() - startedAt });

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-bg p-3">
      <h1 className="mb-2 shrink-0 text-sm font-semibold text-text-primary">
        Factory Twin — Geometry + Machines + Selection + Camera + Layers Candidate (Step
        5A+5B+5C+5D+5E) — no telemetry, alarms, or inspector
      </h1>
      <p className="mb-2 shrink-0 text-xs text-text-secondary">
        Source: {baseUrl}/api/floor-geometry — {geometry.walls.length} walls,{' '}
        {geometry.columns.length} columns, {geometry.openings.length} openings,{' '}
        {geometry.zones.length} functional zones, {machines.length} machines,{' '}
        {reference.roles.reduce((n, r) => n + r.segments.length, 0)} reference CAD segments
      </p>
      <GeometryViewport geometry={geometry} machines={machines} reference={reference} />
    </main>
  );
}
