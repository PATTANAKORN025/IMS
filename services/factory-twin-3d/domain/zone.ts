/**
 * Functional/process zones digitized from the engineering drawing's area
 * layer -- NOT rooms, NOT architectural walls. Floor 1 is largely
 * open-plan: these are open-sided regions delimited by an area layer, so a
 * Zone boundary must never be rendered or interpreted as a wall (same rule
 * lib/contracts.js's FunctionalZone typedef states).
 */

import type { Point2 } from './spatial';
import type { GeometryConfidence } from './geometry';

/**
 * The full tier vocabulary from lib/contracts.js's FunctionalZone typedef --
 * richer than what lib/wire.js's projectFunctionalZone currently puts on
 * the wire. Only HIGH/MEDIUM zones not party to an unresolved CONFLICT get
 * geometry; LOW/REJECTED/UNRESOLVED tiers and both sides of a conflict are
 * withheld as geometry and survive as counts only elsewhere in the system.
 * Listed here in full for the same reason machine-state.ts lists its four
 * unbacked states: a real vocabulary with a currently-narrower reachable
 * subset, not a vocabulary this file is free to shrink.
 */
export type ZoneConfidenceTier = 'HIGH' | 'MEDIUM' | 'LOW' | 'REJECTED' | 'UNRESOLVED';

export const ZONE_TIERS_WITH_GEOMETRY: readonly ZoneConfidenceTier[] = ['HIGH', 'MEDIUM'];

/**
 * One zone as lib/wire.js's projectFunctionalZone actually serves it: id,
 * an optional human-readable name (a label, never an identifier -- the
 * system keys on `id`), the evidence tier, a free-text status token, and
 * the traced polygon. Withheld entirely (never reaches this shape) unless
 * confidence and geometry both survived projection -- see the projector's
 * own header comment.
 */
export interface Zone {
  readonly id: string;
  readonly name: string | null;
  readonly confidence: GeometryConfidence;
  readonly status: string;
  readonly geometry: { readonly vertices: readonly Point2[] };
}
