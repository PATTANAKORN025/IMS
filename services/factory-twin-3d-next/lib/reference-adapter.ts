/**
 * CAD source: `/api/floor-raw-cad` (server.js:1631) -- the SAME served
 * endpoint legacy's `ensureRawCad()`/`buildRawCad()` use (app.js:1296-1364).
 * No second geometry source, no re-parsing of CAD. The endpoint serves raw
 * millimetre CAD coordinates (`coordinate_system: CAD_MM_Y_UP_FLOOR_LOCAL`);
 * this adapter applies the SAME transform app.js's own `cadToTwin()`
 * applies (app.js:577-579: `x = xMm/1000 - halfWidth, z = -(yMm/1000 -
 * halfDepth)`) so the result lands in the identical scene-unit coordinate
 * system every other domain geometry type already uses -- never a second
 * coordinate system, per this step's own hard rule.
 */

import type { Envelope } from '@twin-domain/geometry';
import type { ReferenceOverlay, ReferenceRole, ReferenceSegment } from '@twin-domain/reference';

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** app.js's cadToTwin(), reproduced exactly (app.js:577-579). */
function cadToTwin(xMm: number, yMm: number, halfWidth: number, halfDepth: number): { x: number; z: number } {
  return { x: xMm / 1000 - halfWidth, z: -(yMm / 1000 - halfDepth) };
}

/**
 * A role whose segment array is not a whole number of segments is not a
 * shorter role, it is a broken one -- same rule app.js:1322 applies,
 * reproduced here rather than silently truncated.
 */
function validateRole(raw: unknown, halfWidth: number, halfDepth: number): ReferenceRole | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string') return null;
  const seg = Array.isArray(r.segments) ? r.segments : [];
  if (seg.length === 0 || seg.length % 4 !== 0) return null;

  const segments: ReferenceSegment[] = [];
  for (let i = 0; i < seg.length; i += 4) {
    const x1Mm = seg[i];
    const z1Mm = seg[i + 1];
    const x2Mm = seg[i + 2];
    const z2Mm = seg[i + 3];
    if (!isFiniteNumber(x1Mm) || !isFiniteNumber(z1Mm) || !isFiniteNumber(x2Mm) || !isFiniteNumber(z2Mm)) {
      // Same all-or-nothing rule as app.js:1334 (`if (bad) continue`) --
      // one malformed segment withholds the whole role, not just that pair.
      return null;
    }
    const p1 = cadToTwin(x1Mm, z1Mm, halfWidth, halfDepth);
    const p2 = cadToTwin(x2Mm, z2Mm, halfWidth, halfDepth);
    segments.push({ x1: p1.x, z1: p1.z, x2: p2.x, z2: p2.z });
  }
  return { id: r.id, segments };
}

/**
 * Fetches and validates the SAME authoritative raw-CAD reference the
 * legacy app renders. `envelope` is the already-fetched, already-validated
 * factory geometry's own envelope -- the transform is placed relative to
 * the measured building, exactly as app.js places it relative to its own
 * `buildingBounds` (app.js:1311-1312), never a separately-derived bound.
 */
export async function fetchReferenceOverlay(baseUrl: string, envelope: Envelope): Promise<ReferenceOverlay> {
  const res = await fetch(`${baseUrl}/api/floor-raw-cad`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`fetchReferenceOverlay: ${res.status} ${res.statusText}`);
  const raw = await res.json();

  if (raw.available !== true) return { available: false, roles: [] };

  const halfWidth = envelope.width / 2;
  const halfDepth = envelope.depth / 2;
  const roles = (Array.isArray(raw.roles) ? raw.roles : [])
    .map((r: unknown) => validateRole(r, halfWidth, halfDepth))
    .filter((v: ReferenceRole | null): v is ReferenceRole => v !== null);

  return { available: roles.length > 0, roles };
}
