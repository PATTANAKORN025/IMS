/**
 * One CAD equipment record, exactly as lib/wire.js's projectEquipment()
 * serves it over /api/floor-geometry -- this IS the live domain shape the
 * physical twin renders. Every field here has a corresponding line in
 * wire.js's projectEquipment (lib/wire.js:607-760); nothing is invented.
 *
 * lib/contracts.js's FactoryMachinePlacement/PhysicalSlot/AssetMappingStatus
 * (VERIFIED_PHYSICAL branch) describe a SUPERSEDED synthetic-grid
 * architecture (`computePlacements()`), confirmed by repo-wide grep to have
 * zero live callers -- server.js only imports MachineState and
 * MACHINE_STATE_THEME from that file (server.js:8). They are deliberately
 * NOT modeled here; see docs/evidence/FACTORY_TWIN_DOMAIN_MODEL.md.
 *
 * CAD IS AUTHORITATIVE. Nothing in this type or any adapter built on it may
 * alter position, rotation, footprint or zone_id.
 */

import type { Point2, Point3, Footprint } from './spatial';
import type { GeometryStatus, GeometryConfidence } from './geometry';
import type { MappingStatus, IdentityLifecycle } from './data-quality';

export type FootprintStatus = 'MEASURED_CAD' | 'OBSERVED_CAD' | 'APPROXIMATION' | 'UNRESOLVED';
export type FootprintSource = 'cad_block_geometry' | 'cad_block_extent' | 'CAD_CORRELATED';
export type FootprintShape = 'rectangle' | 'rotated_rectangle' | 'polygon' | 'irregular' | 'unresolved';
export type DisplayShape = 'OPERATIONAL_RECTANGLE' | 'UNRESOLVED';
export type DisplayRepresentation = 'OPERATIONAL_RECTANGLE' | 'TRUE_POLYGON';
export type DisplaySource = 'filtered_physical_footprint';
export type MappingConfidence = 'high' | 'medium' | 'low' | 'unknown';
export type HeightStatus = 'measured' | 'derived' | 'unknown';
export type ZoneMembershipStatus =
  | 'INSIDE_ROOM' | 'CROSSES_ROOM_BOUNDARY' | 'OUTSIDE_ROOM'
  | 'ROOM_BY_CENTRE_ONLY' | 'UNRESOLVED';
/** PRIMARY = found by the main insertion-point pipeline; RECOVERED = found
 *  only by the additive outside-envelope recovery pass. See wire.js's
 *  `evidence_tier` comment -- never inferred from id range or handle. */
export type EvidenceTier = 'PRIMARY' | 'RECOVERED';

export interface Asset {
  readonly id: string;
  readonly position: Point3;
  /** Degrees, as CAD records them; wrapped into [0,360) only if out of
   *  range, otherwise passed through untouched (wire.js:660-665). */
  readonly rotation_deg: number | null;
  readonly footprint: Footprint | null;
  /** fromEnum()-derived (lib/wire.js:237-239) -- null whenever the private
   *  record's own field is missing or fails the allow-list, independent of
   *  whether `footprint` itself is populated. Caught by
   *  tests/unit/factory-twin-domain.test.js against wire.js's real output;
   *  do not assume any fromEnum()-derived field below is guaranteed
   *  non-null just because a sibling field is populated. */
  readonly footprint_status: FootprintStatus | null;
  readonly footprint_source: FootprintSource | null;
  readonly footprint_shape: FootprintShape | null;
  readonly footprint_polygon: readonly Point2[] | null;
  /** What the renderer draws, as a CLASS, never geometry itself. */
  readonly display_shape: DisplayShape | null;
  readonly display_representation: DisplayRepresentation | null;
  readonly display_source: DisplaySource | null;
  readonly operational_footprint: Footprint | null;
  readonly operational_axis_offset_deg: number | null;
  readonly orientation_geometry_mismatch: boolean;
  readonly operational_excludes_enclosure: boolean;
  readonly display_area_error: number | null;
  readonly overlaps_neighbour: boolean;
  readonly mirrored: boolean;
  readonly geometry_status: GeometryStatus | null;
  readonly confidence: GeometryConfidence | null;
  readonly source: string | null;
  readonly height_status: HeightStatus | null;
  readonly zone_id: string | null;
  readonly zone_status: ZoneMembershipStatus | null;
  /** Real device_id if mapped and eligible, else null -- never derived
   *  from position/numbering/proximity. */
  readonly ims_device_id: string | null;
  /** Back-compat two-value projection of identity_status below -- a
   *  CONFLICTING or DEPRECATED mapping reads exactly like
   *  UNMAPPED_TO_IMS here, on purpose (wire.js:720-728). Never an
   *  independent source of truth. */
  readonly mapping_status: 'MAPPED_TO_IMS' | 'UNMAPPED_TO_IMS';
  readonly status: MappingStatus;
  /** FT-14 audit trail: the real lifecycle value, never collapsed. */
  readonly identity_status: IdentityLifecycle;
  readonly evidence_source: string | null;
  readonly evidence_source_record: string | null;
  readonly evidence_verified_at: string | null;
  readonly evidence_confidence: MappingConfidence;
  /** The one field FT-15 (telemetry) must check before doing anything
   *  identity-dependent -- never re-derive eligibility from
   *  ims_device_id truthiness. */
  readonly live_status_eligible: boolean;
  readonly alarm_eligible: boolean;
  readonly drill_down_eligible: boolean;
  /** id of the other record proven to be the same physical asset drawn
   *  twice in the CAD -- a fact, not a claim about which is primary. */
  readonly duplicate_of: string | null;
  readonly evidence_tier: EvidenceTier;
}

/**
 * An Asset known to be IMS-connected -- the only Assets a live
 * MachineStateCode (machine-state.ts) can ever legitimately be joined to.
 * operational-status.js's statusForAsset() already enforces this at
 * runtime (an id with no live_status_eligible mapping is UNMAPPED, never
 * assigned a machine state); isMachine() below is the same rule as a type
 * guard.
 */
export interface Machine extends Asset {
  readonly ims_device_id: string;
  readonly live_status_eligible: true;
}

export function isMachine(asset: Asset): asset is Machine {
  return asset.live_status_eligible === true && typeof asset.ims_device_id === 'string';
}
