/**
 * The raw CAD reference overlay -- the drawing's own line-work, served
 * separately from the reconstructed floor geometry (`/api/floor-raw-cad`,
 * server.js:1631) so it can be compared against the reconstruction rather
 * than trusted as part of it. Diagnostic only, off by default
 * (see layer.ts). One role per CAD layer role (e.g. `walls-interior`,
 * `structure`), each a flat list of line segments already in scene-unit
 * metres -- the SAME coordinate system every other domain geometry type
 * uses (Envelope/Wall/Column/...), never a second one. The mm->metre,
 * CAD-to-twin transform happens once, in the adapter that produces this
 * type (mirrors app.js's own cadToTwin(), app.js:577-579) -- this type
 * itself never carries raw millimetre CAD units.
 */

export interface ReferenceSegment {
  readonly x1: number;
  readonly z1: number;
  readonly x2: number;
  readonly z2: number;
}

export interface ReferenceRole {
  readonly id: string;
  readonly segments: readonly ReferenceSegment[];
}

export interface ReferenceOverlay {
  readonly available: boolean;
  readonly roles: readonly ReferenceRole[];
}
