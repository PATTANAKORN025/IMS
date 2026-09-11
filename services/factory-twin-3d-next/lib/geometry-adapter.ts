/**
 * CAD source (Section 1 of this step's mission, documented in full in
 * docs/evidence/FACTORY_TWIN_R3F_GEOMETRY_MIGRATION.md):
 *
 *   private/floor1-geometry.json + private/floor1-zones.json (gitignored,
 *   host-only, mounted read-only into the factory-twin-3d container)
 *       -> lib/wire.js's project*() functions (server-side, unchanged)
 *       -> GET /api/floor-geometry (server.js:1684, unchanged)
 *
 * This adapter calls that SAME endpoint -- no second geometry source, no
 * re-parsing of CAD, no coordinate transform (the endpoint already serves
 * scene-unit metres; the only mm->m conversion in this codebase,
 * app.js's cadToTwin(), applies solely to the separate raw-CAD REFERENCE
 * overlay, /api/floor-raw-cad, which is diagnostic-only and out of this
 * step's scope -- see the migration doc). It only VALIDATES the JSON
 * response into the Step 1 domain types (services/factory-twin-3d/domain/
 * geometry.ts, zone.ts) so React components never see a raw CAD shape.
 */

import type { Envelope, Column, Wall, WallLine, Opening, FootprintPolygon, StructuralGrid } from '@twin-domain/geometry';
import type { Zone } from '@twin-domain/zone';

export interface FactoryGeometryData {
  readonly envelope: Envelope;
  readonly footprintPolygon: FootprintPolygon | null;
  readonly grid: StructuralGrid | null;
  readonly columns: readonly Column[];
  readonly walls: readonly Wall[];
  readonly wallLines: readonly WallLine[];
  readonly openings: readonly Opening[];
  readonly zones: readonly Zone[];
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isPoint2(v: unknown): v is { x: number; z: number } {
  return !!v && typeof v === 'object' && isFiniteNumber((v as { x: unknown }).x) && isFiniteNumber((v as { z: unknown }).z);
}

/** Validates one raw envelope object. Withheld (null) rather than passed
 *  through partially -- mirrors lib/wire.js's own projectEnvelope()
 *  all-or-nothing rule. */
function validateEnvelope(raw: unknown): Envelope | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isFiniteNumber(r.width) || !isFiniteNumber(r.depth) || !isFiniteNumber(r.height)) return null;
  return {
    width: r.width,
    depth: r.depth,
    height: r.height,
    clear_height_m: isFiniteNumber(r.clear_height_m) ? r.clear_height_m : null,
  };
}

function validateColumn(raw: unknown): Column | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isPoint2(r.position)) return null;
  const fp = r.footprint as { width?: unknown; depth?: unknown } | null;
  return {
    id: typeof r.id === 'string' ? r.id : null,
    position: r.position,
    footprint: fp && isFiniteNumber(fp.width) && isFiniteNumber(fp.depth) ? { width: fp.width, depth: fp.depth } : null,
    grid_ref: null,
    offset_from_intersection_mm: null,
    confidence: null,
    source: typeof r.source === 'string' ? r.source : null,
    geometry_status: null,
    detector: null,
  };
}

function validateWall(raw: unknown): Wall | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (
    !isFiniteNumber(r.x1) || !isFiniteNumber(r.z1)
    || !isFiniteNumber(r.x2) || !isFiniteNumber(r.z2)
    || !isFiniteNumber(r.thickness) || r.thickness <= 0
  ) {
    return null;
  }
  return {
    id: typeof r.id === 'string' ? r.id : null,
    x1: r.x1, z1: r.z1, x2: r.x2, z2: r.z2,
    thickness: r.thickness,
    source: typeof r.source === 'string' ? r.source : null,
    geometry_status: null,
  };
}

function validateWallLine(raw: unknown): WallLine | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isFiniteNumber(r.x1) || !isFiniteNumber(r.z1) || !isFiniteNumber(r.x2) || !isFiniteNumber(r.z2)) return null;
  return {
    id: typeof r.id === 'string' ? r.id : null,
    x1: r.x1, z1: r.z1, x2: r.x2, z2: r.z2,
    source: typeof r.source === 'string' ? r.source : null,
    geometry_status: null,
  };
}

function validateOpening(raw: unknown): Opening | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isPoint2(r.position) || (r.kind !== 'door' && r.kind !== 'window' && r.kind !== 'airshower')) return null;
  return {
    id: typeof r.id === 'string' ? r.id : null,
    position: r.position,
    kind: r.kind,
    source: typeof r.source === 'string' ? r.source : null,
    geometry_status: null,
  };
}

function validateFootprintPolygon(raw: unknown): FootprintPolygon | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.vertices)) return null;
  const vertices = r.vertices.filter(isPoint2);
  if (vertices.length < 3) return null;
  return { vertices, confidence: null, geometry_status: null };
}

function validateGrid(raw: unknown): StructuralGrid | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const axis = (v: unknown) =>
    Array.isArray(v)
      ? v
          .filter((e) => e && typeof e === 'object' && isFiniteNumber((e as { at: unknown }).at))
          .map((e) => ({ at: (e as { at: number }).at, label: typeof (e as { label?: unknown }).label === 'string' ? (e as { label: string }).label : null }))
      : [];
  const x = axis(r.x);
  const z = axis(r.z);
  if (x.length < 2 || z.length < 2) return null;
  return { x, z, confidence: null };
}

const VALID_ZONE_CONFIDENCE = new Set(['high', 'medium', 'low', 'HIGH', 'MEDIUM', 'LOW']);

function validateZone(raw: unknown): Zone | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const geom = r.geometry as { vertices?: unknown } | null;
  if (!geom || !Array.isArray(geom.vertices)) return null;
  const vertices = geom.vertices.filter(isPoint2);
  // A zone with no valid confidence value is withheld entirely, mirroring
  // lib/wire.js's own projectFunctionalZone() rule (confidence is
  // required, never defaulted to a plausible-looking value).
  if (typeof r.id !== 'string' || vertices.length < 3 || typeof r.confidence !== 'string' || !VALID_ZONE_CONFIDENCE.has(r.confidence)) {
    return null;
  }
  return {
    id: r.id,
    name: typeof r.name === 'string' ? r.name : null,
    confidence: r.confidence as Zone['confidence'],
    status: typeof r.status === 'string' ? r.status : '',
    geometry: { vertices },
  };
}

/**
 * Fetches and validates the SAME authoritative geometry the legacy
 * /factory-twin-3d/ page renders. `baseUrl` points at a running
 * factory-twin-3d instance (e.g. the disposable measurement container
 * this engagement has used throughout, http://localhost:4196) -- never a
 * second copy of the CAD data.
 */
export async function fetchFactoryGeometry(baseUrl: string): Promise<FactoryGeometryData> {
  const res = await fetch(`${baseUrl}/api/floor-geometry`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`fetchFactoryGeometry: ${res.status} ${res.statusText}`);
  const raw = await res.json();

  const envelope = validateEnvelope(raw.envelope);
  if (!envelope) throw new Error('fetchFactoryGeometry: envelope failed validation');

  return {
    envelope,
    footprintPolygon: validateFootprintPolygon(raw.footprint_polygon),
    grid: validateGrid(raw.grid),
    columns: (Array.isArray(raw.columns) ? raw.columns : []).map(validateColumn).filter((v: Column | null): v is Column => v !== null),
    walls: (Array.isArray(raw.walls) ? raw.walls : []).map(validateWall).filter((v: Wall | null): v is Wall => v !== null),
    wallLines: (Array.isArray(raw.wall_lines) ? raw.wall_lines : []).map(validateWallLine).filter((v: WallLine | null): v is WallLine => v !== null),
    openings: (Array.isArray(raw.openings) ? raw.openings : []).map(validateOpening).filter((v: Opening | null): v is Opening => v !== null),
    zones: (Array.isArray(raw.functional_zones) ? raw.functional_zones : []).map(validateZone).filter((v: Zone | null): v is Zone => v !== null),
  };
}
