/**
 * Structural/architectural geometry types, mirroring lib/wire.js's live
 * projectEnvelope/projectColumn/projectWall/projectWallLine/projectOpening/
 * projectFootprintPolygon/projectGrid output exactly -- these functions are
 * what /api/floor-geometry actually serves and what app.js's buildFloor()
 * actually consumes, not a re-derivation of them.
 *
 * CAD IS AUTHORITATIVE. Nothing in this file or any adapter built on it may
 * alter a coordinate, a room vertex, an offset or a transform. This phase
 * types the existing representation; it does not reinterpret it. Equipment
 * (a distinct concept -- a CAD block that may or may not be IMS-connected)
 * lives in asset.ts, not here; functional zones live in zone.ts.
 */

import type { Point2 } from './spatial';

/** lib/wire.js's ALLOWED_GEOMETRY_STATUS. */
export type GeometryStatus =
  | 'measured' | 'observed' | 'derived' | 'simulated' | 'unknown'
  | 'MEASURED_CAD' | 'OBSERVED_CAD';

/** lib/wire.js's ALLOWED_CONFIDENCE -- deliberately case-duplicated
 *  (lower and UPPER both occur in real private documents; wire.js accepts
 *  both without normalising, so this type does too). */
export type GeometryConfidence = 'high' | 'medium' | 'low' | 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * Bounding-box envelope. `clear_height_m` is carried as `null` deliberately
 * when unmeasured -- see wire.js's projectEnvelope header: "known to be
 * unknown" is a different, true statement from omitting the field.
 */
export interface Envelope {
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly clear_height_m: number | null;
}

export interface Column {
  readonly id: string | null;
  readonly position: Point2;
  readonly footprint: { readonly width: number; readonly depth: number } | null;
  readonly grid_ref: { readonly x: string; readonly z: string } | null;
  readonly offset_from_intersection_mm: number | null;
  readonly confidence: GeometryConfidence | null;
  readonly source: string | null;
  readonly geometry_status: GeometryStatus | null;
  readonly detector: {
    readonly ring_density: number | null;
    readonly interior_density: number | null;
  } | null;
}

/** A wall with a measured thickness -- see projectWall. */
export interface Wall {
  readonly id: string | null;
  readonly x1: number;
  readonly z1: number;
  readonly x2: number;
  readonly z2: number;
  readonly thickness: number;
  readonly source: string | null;
  readonly geometry_status: GeometryStatus | null;
}

/**
 * A drawn wall FACE the extractor could not pair into a measured Wall.
 * Deliberately has NO thickness field -- see wire.js's projectWallLine
 * header: nothing may extrude one. A consumer that wants a wall to
 * extrude must use Wall, never WallLine.
 */
export interface WallLine {
  readonly id: string | null;
  readonly x1: number;
  readonly z1: number;
  readonly x2: number;
  readonly z2: number;
  readonly source: string | null;
  readonly geometry_status: GeometryStatus | null;
}

export type OpeningKind = 'door' | 'window' | 'airshower';

export interface Opening {
  readonly id: string | null;
  readonly position: Point2;
  readonly kind: OpeningKind;
  readonly source: string | null;
  readonly geometry_status: GeometryStatus | null;
}

export interface FootprintPolygon {
  readonly vertices: readonly Point2[];
  readonly confidence: GeometryConfidence | null;
  readonly geometry_status: GeometryStatus | null;
}

export interface GridAxis {
  readonly at: number;
  readonly label: string | null;
}

export interface StructuralGrid {
  readonly x: readonly GridAxis[];
  readonly z: readonly GridAxis[];
  readonly confidence: GeometryConfidence | null;
}
