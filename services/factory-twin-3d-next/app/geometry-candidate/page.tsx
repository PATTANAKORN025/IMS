import { fetchFactoryGeometry } from '@/lib/geometry-adapter';
import { fetchMachines } from '@/lib/machine-adapter';
import GeometryViewport from '@/components/factory-twin/geometry/GeometryViewport';

/**
 * Step 5A (CAD geometry) + Step 5B (static machines) candidate route --
 * /factory-twin-3d/geometry-candidate, NOT the production /factory-twin-3d/
 * route (app/page.tsx, Step 3's shell, untouched). Server Component:
 * fetches the SAME authoritative data the legacy app renders, server-side,
 * from a running factory-twin-3d instance (FACTORY_TWIN_API_BASE,
 * defaulting to the disposable measurement container this engagement has
 * used throughout). No telemetry/alarm/selection data or logic exists
 * here -- Step 5B's explicit boundary; machines are static, unselectable.
 */
export default async function GeometryCandidatePage() {
  const baseUrl = process.env.FACTORY_TWIN_API_BASE || 'http://localhost:4196';
  const [geometry, machines] = await Promise.all([fetchFactoryGeometry(baseUrl), fetchMachines(baseUrl)]);

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-bg p-3">
      <h1 className="mb-2 shrink-0 text-sm font-semibold text-text-primary">
        Factory Twin — Geometry + Static Machines Candidate (Step 5A+5B) — no telemetry, alarms,
        or selection
      </h1>
      <p className="mb-2 shrink-0 text-xs text-text-secondary">
        Source: {baseUrl}/api/floor-geometry — {geometry.walls.length} walls,{' '}
        {geometry.columns.length} columns, {geometry.openings.length} openings,{' '}
        {geometry.zones.length} functional zones, {machines.length} machines
      </p>
      <GeometryViewport geometry={geometry} machines={machines} />
    </main>
  );
}
