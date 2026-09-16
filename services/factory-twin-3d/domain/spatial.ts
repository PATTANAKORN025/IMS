/**
 * Coordinate primitives shared by every other domain module. Scene-unit
 * metres, matching lib/wire.js's point2()/point3() helpers exactly (a
 * Point3's y defaults to 0 there, never to null -- see wire.js:254-261).
 *
 * These are geometry TYPES only, not a re-derivation of geometry: CAD
 * remains authoritative (see geometry.ts's header). Nothing in this domain
 * layer computes a coordinate; it only names the shape of ones the server
 * already produced.
 */

export interface Point2 {
  readonly x: number;
  readonly z: number;
}

export interface Point3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Footprint {
  readonly width: number;
  readonly depth: number;
}
