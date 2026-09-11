/**
 * Machine source (Section 1 of this step's mission, full detail in
 * docs/evidence/FACTORY_TWIN_R3F_MACHINE_MIGRATION.md):
 *
 *   Same authoritative pipeline as the CAD geometry (Step 5A):
 *   private/floor1-geometry.json's `equipment[]` array (gitignored)
 *       -> lib/wire.js's projectEquipment() (server.js, unchanged)
 *       -> GET /api/floor-geometry's `equipment` field (unchanged)
 *
 * NOT a second source: the SAME endpoint Step 5A's geometry-adapter.ts
 * already calls. Machine id = `id` (e.g. "EQP-F1-0001"); coordinates and
 * rotation are MEASURED_CAD (position.{x,y,z}, rotation_deg); extent is
 * OBSERVED_CAD at best (footprint/operational_footprint) or entirely
 * absent (UNRESOLVED). No coordinate transform applied -- already
 * scene-unit metres, same as Step 5A's geometry.
 *
 * Validates the raw equipment array into the Step 1 domain's `Asset`
 * type (services/factory-twin-3d/domain/asset.ts) -- no field is
 * recreated or renamed, this is the exact same type Step 1 already
 * built and parity-tested against lib/wire.js's real output.
 */

import type { Asset } from '@twin-domain/asset';

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isPoint3(v: unknown): v is { x: number; y: number; z: number } {
  return (
    !!v && typeof v === 'object'
    && isFiniteNumber((v as { x: unknown }).x)
    && isFiniteNumber((v as { y: unknown }).y)
    && isFiniteNumber((v as { z: unknown }).z)
  );
}

function nullableString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function nullableFootprint(v: unknown): { width: number; depth: number } | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  return isFiniteNumber(r.width) && isFiniteNumber(r.depth) ? { width: r.width, depth: r.depth } : null;
}

/**
 * All-or-nothing per record, mirroring lib/wire.js's own honesty
 * convention: a record missing its id or position is dropped entirely,
 * never defaulted to a plausible-looking placeholder. Every other field
 * is carried through as-given (already validated server-side by
 * projectEquipment()) -- this adapter's job is shaping into the typed
 * domain contract, not re-deriving correctness lib/wire.js already owns.
 */
function validateAsset(raw: unknown): Asset | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !isPoint3(r.position)) return null;

  return {
    id: r.id,
    position: r.position,
    rotation_deg: isFiniteNumber(r.rotation_deg) ? r.rotation_deg : null,
    footprint: nullableFootprint(r.footprint),
    footprint_status: (r.footprint_status as Asset['footprint_status']) ?? null,
    footprint_source: (r.footprint_source as Asset['footprint_source']) ?? null,
    footprint_shape: (r.footprint_shape as Asset['footprint_shape']) ?? null,
    footprint_polygon: Array.isArray(r.footprint_polygon)
      ? r.footprint_polygon.filter((v) => v && typeof v === 'object' && isFiniteNumber((v as { x: unknown }).x) && isFiniteNumber((v as { z: unknown }).z))
      : null,
    display_shape: (r.display_shape as Asset['display_shape']) ?? 'UNRESOLVED',
    display_representation: (r.display_representation as Asset['display_representation']) ?? null,
    display_source: (r.display_source as Asset['display_source']) ?? null,
    operational_footprint: r.operational_footprint && typeof r.operational_footprint === 'object'
      ? nullableFootprint(r.operational_footprint)
      : null,
    operational_axis_offset_deg: isFiniteNumber(r.operational_axis_offset_deg) ? r.operational_axis_offset_deg : null,
    orientation_geometry_mismatch: r.orientation_geometry_mismatch === true,
    operational_excludes_enclosure: r.operational_excludes_enclosure === true,
    display_area_error: isFiniteNumber(r.display_area_error) ? r.display_area_error : null,
    overlaps_neighbour: r.overlaps_neighbour === true,
    mirrored: r.mirrored === true,
    geometry_status: (r.geometry_status as Asset['geometry_status']) ?? null,
    confidence: (r.confidence as Asset['confidence']) ?? null,
    source: nullableString(r.source),
    height_status: (r.height_status as Asset['height_status']) ?? null,
    zone_id: nullableString(r.zone_id),
    zone_status: (r.zone_status as Asset['zone_status']) ?? null,
    ims_device_id: nullableString(r.ims_device_id),
    mapping_status: r.mapping_status === 'MAPPED_TO_IMS' ? 'MAPPED_TO_IMS' : 'UNMAPPED_TO_IMS',
    status: (r.status as Asset['status']) ?? 'UNMAPPED',
    identity_status: (r.identity_status as Asset['identity_status']) ?? 'unresolved',
    evidence_source: nullableString(r.evidence_source),
    evidence_source_record: nullableString(r.evidence_source_record),
    evidence_verified_at: nullableString(r.evidence_verified_at),
    evidence_confidence: (r.evidence_confidence as Asset['evidence_confidence']) ?? 'unknown',
    live_status_eligible: r.live_status_eligible === true,
    alarm_eligible: r.alarm_eligible === true,
    drill_down_eligible: r.drill_down_eligible === true,
    duplicate_of: nullableString(r.duplicate_of),
    evidence_tier: (r.evidence_tier as Asset['evidence_tier']) ?? 'PRIMARY',
  };
}

/**
 * Fetches the SAME /api/floor-geometry response Step 5A's geometry
 * adapter reads, validates `equipment[]` into typed Assets, and applies
 * the ONE dedup rule app.js itself applies uniformly across every
 * display mode (app.js:1505, "one physical asset, one render, always"):
 * a record whose `duplicate_of` is set is never rendered -- its primary
 * counterpart already is. This deployment's real data: 433 equipment
 * records, 2 marked duplicate_of, 431 rendered -- matched exactly by
 * tests/playwright/factory-twin-r3f-machines.js.
 */
export async function fetchMachines(baseUrl: string): Promise<readonly Asset[]> {
  const res = await fetch(`${baseUrl}/api/floor-geometry`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`fetchMachines: ${res.status} ${res.statusText}`);
  const raw = await res.json();
  const equipment = Array.isArray(raw.equipment) ? raw.equipment : [];
  return equipment
    .map(validateAsset)
    .filter((a: Asset | null): a is Asset => a !== null && a.duplicate_of === null);
}
