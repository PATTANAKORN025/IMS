/**
 * THREE DISTINCT quality/status vocabularies exist in this codebase today,
 * plus MachineStateCode as a fourth, orthogonal axis. This file's main job
 * is keeping all of them separate -- conflating any two is exactly the
 * "NO_DATA = DOWN" / "UNAVAILABLE = DOWN" mistake this extraction was asked
 * to prevent, and the current source already goes out of its way to keep
 * them apart (see the file headers cited below). None of the four below
 * ever collapse into one another:
 *
 * 1. MachineStateCode (machine-state.ts) -- is a machine RUN/DOWN/IDLE/etc?
 *    Answered independently of whether the record mapping to it is trusted.
 * 2. MappingStatus (this file)          -- is this CAD asset linked to a
 *    real IMS device at all? (lib/wire.js's projectEquipment `status`
 *    field; lib/contracts.js's AssetMappingStatus)
 * 3. IdentityLifecycle (this file)      -- FT-14's mapping-RECORD lifecycle,
 *    richer than MappingStatus: a CONFLICTING or DEPRECATED mapping still
 *    reads as UNMAPPED at the MappingStatus level, on purpose (see
 *    lib/wire.js's comment on `identity_status`) -- the record's own
 *    history is preserved for an inspector even though the simple
 *    mapped/unmapped answer discards it.
 * 4. StateSourceQuality (this file)     -- EAP-only: is THIS cell's
 *    operational-state resolution a real observation, a deliberate
 *    simulation, or genuinely absent, and why? (public/
 *    operational-state-adapters.js). Has no equivalent on the physical
 *    twin side: /api/state never simulates, so this axis does not apply to
 *    Asset/Machine at all.
 */

/**
 * wire.js's live `status` field on a projected equipment record. Only
 * UNMAPPED and IMS_CONNECTED are reachable today -- VERIFIED_PHYSICAL is
 * listed (per lib/contracts.js's AssetMappingStatus) for a real, specific
 * asset confirmed to occupy a slot without IMS telemetry (e.g. a manual
 * survey); no instance of it exists in this repo's data yet. Never set
 * VERIFIED_PHYSICAL without a real source, the same discipline
 * machine-state.ts's `backed` flag enforces for OFF/INITIAL/PM/STOP.
 */
export type MappingStatus = 'UNMAPPED' | 'VERIFIED_PHYSICAL' | 'IMS_CONNECTED';

export const MAPPING_STATUS_REACHABLE: readonly MappingStatus[] = ['UNMAPPED', 'IMS_CONNECTED'];

/**
 * FT-14 identity-mapping lifecycle (lib/wire.js's ALLOWED_MAPPING_LIFECYCLE,
 * sourced from lib/mapping.js's MappingStatus -- an unrelated, differently-
 * named enum in that file; renamed IdentityLifecycle here specifically to
 * avoid colliding with this file's own MappingStatus above).
 */
export type IdentityLifecycle = 'unresolved' | 'confirmed' | 'conflicting' | 'deprecated';

/** EAP-only per-cell state-resolution quality (operational-state-adapters.js). */
export type StateSourceQuality = 'VALID' | 'STALE' | 'NO_DATA' | 'UNAVAILABLE' | 'SIMULATION';

export type SourceType = 'REAL' | 'SIMULATED';

/** The canonical shape both EAP adapters (Real/Simulated) return, per
 *  operational-state-adapters.js's own header comment. */
export interface OperationalStateResolution {
  readonly object_id: string | null;
  readonly state: string | null;
  readonly source_type: SourceType;
  readonly quality: StateSourceQuality;
  readonly observed_at: string | null;
  readonly reason: string;
}
