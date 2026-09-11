import { fetchFactoryGeometry } from '@/lib/geometry-adapter';
import GeometryViewport from '@/components/factory-twin/geometry/GeometryViewport';

/**
 * Step 5A candidate route -- /factory-twin-3d/geometry-candidate, NOT the
 * production /factory-twin-3d/ route (app/page.tsx, Step 3's shell,
 * untouched). Server Component: fetches the SAME authoritative geometry
 * the legacy app renders, server-side, from a running factory-twin-3d
 * instance (FACTORY_TWIN_API_BASE, defaulting to the disposable
 * measurement container this engagement has used throughout). No
 * machine/telemetry/alarm data is fetched or rendered here -- Step 5A's
 * explicit boundary.
 */
export default async function GeometryCandidatePage() {
  const baseUrl = process.env.FACTORY_TWIN_API_BASE || 'http://localhost:4196';
  const geometry = await fetchFactoryGeometry(baseUrl);

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-bg p-3">
      <h1 className="mb-2 shrink-0 text-sm font-semibold text-text-primary">
        Factory Twin — Geometry Migration Candidate (Step 5A) — static CAD geometry only, no
        machines/telemetry/alarms
      </h1>
      <p className="mb-2 shrink-0 text-xs text-text-secondary">
        Source: {baseUrl}/api/floor-geometry — {geometry.walls.length} walls,{' '}
        {geometry.columns.length} columns, {geometry.openings.length} openings,{' '}
        {geometry.zones.length} functional zones
      </p>
      <GeometryViewport geometry={geometry} />
    </main>
  );
}
