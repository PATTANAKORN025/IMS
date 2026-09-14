/**
 * Step 6E: canonical equipment/asset identity contract. Solves the
 * master-data gap Step 6D's own audit named as the exact blocker (no
 * authoritative CAD-asset-to-device relationship exists anywhere in this
 * repository) by giving that relationship a typed shape to be expressed
 * in, WITHOUT inventing one -- this file defines vocabulary and pure
 * validation, it asserts zero real relationships of its own.
 *
 * Grounded in vocabulary that already exists in this codebase, not
 * invented from nothing: `services/factory-twin-3d/lib/mapping.js`'s own
 * header already names three separate namespaces (`asset_id`,
 * `ims_device_id`, `mes_machine_id`) and explicitly refuses to collapse
 * them. This file keeps that discipline and extends it with two concepts
 * that namespace set does not yet distinguish: a PHYSICAL unit (which can
 * be replaced without changing the CAD position it occupies) and the
 * SOURCE SYSTEM a relationship's evidence came from (useful once more
 * than one external system could plausibly report on the same asset).
 *
 * Single file, deliberately -- same `requireTs()` single-file
 * transpilation constraint `operational-source-adapter.ts` and
 * `identity-mapping-readiness.ts` both already document
 * (`tests/unit/lib/require-ts.js`).
 */

// ---------------------------------------------------------------------
// 1. Five distinct identity namespaces (Section 1) -- branded string
//    types so TypeScript itself refuses to let one stand in for another
//    by accident (a plain `string` cannot be assigned to any of these
//    without going through the constructor below).
// ---------------------------------------------------------------------

declare const BRAND: unique symbol;
type Branded<T extends string, B extends string> = T & { readonly [BRAND]: B };

/** The Factory Twin's own visual/CAD identity -- Step 1's `Asset.id`
 *  (`EQP-F<n>-nnnn` / `PHYS-F<n>-nnnn`). A CAD POSITION, stable across
 *  physical hardware replacement (Section 5). */
export type FactoryTwinAssetId = Branded<string, 'FactoryTwinAssetId'>;

/** A LOGICAL unit of equipment as the manufacturing system understands
 *  it -- matches `lib/mapping.js`'s own `mes_machine_id` namespace
 *  exactly (a machine in the external manufacturing system). May group
 *  several PhysicalAssets (a production line's stations) under one
 *  logical identity. */
export type EquipmentId = Branded<string, 'EquipmentId'>;

/** A specific PHYSICAL unit occupying a CAD position -- NEW to this
 *  repository's vocabulary (not present in `lib/mapping.js`'s 3-namespace
 *  model). Exists specifically to answer Section 5's own question: when
 *  a physical machine is replaced, the FactoryTwinAssetId (the position)
 *  and the EquipmentId (the logical unit) both stay the same, but this
 *  id changes -- see `PhysicalAssetRecord` below for the replacement
 *  chain this enables. */
export type PhysicalAssetId = Branded<string, 'PhysicalAssetId'>;

/** A real monitored/controlled device -- matches `lib/mapping.js`'s own
 *  `ims_device_id` namespace exactly, and Step 6C's own `device_id`
 *  (`/api/state`'s own identity field). */
export type DeviceId = Branded<string, 'DeviceId'>;

/** WHICH external system a relationship's evidence came from (e.g.
 *  `"LDI"`, a future `"MES-SAP"`, a future `"PLC-GATEWAY-1"`) -- NEW to
 *  this repository's vocabulary, distinct from the device id itself.
 *  Exists because a real deployment could plausibly have more than one
 *  system capable of reporting on the same physical asset (a PLC gateway
 *  AND an MES both watching the same line) -- provenance needs to say
 *  which one actually asserted a given relationship. */
export type SourceSystemId = Branded<string, 'SourceSystemId'>;

/** The ONLY sanctioned way to produce a branded id -- a thin, explicit
 *  cast, never a positional/derived guess. Each constructor exists so a
 *  caller cannot accidentally pass an `EquipmentId` where a `DeviceId`
 *  was expected; TypeScript's own structural typing would otherwise
 *  treat two branded-but-differently-branded strings as incompatible at
 *  the call site, which is the entire point. */
export function asFactoryTwinAssetId(s: string): FactoryTwinAssetId { return s as FactoryTwinAssetId; }
export function asEquipmentId(s: string): EquipmentId { return s as EquipmentId; }
export function asPhysicalAssetId(s: string): PhysicalAssetId { return s as PhysicalAssetId; }
export function asDeviceId(s: string): DeviceId { return s as DeviceId; }
export function asSourceSystemId(s: string): SourceSystemId { return s as SourceSystemId; }

// ---------------------------------------------------------------------
// 2. Identity relationship chain (Section 2) -- each link independently
//    known or unknown; "not every layer must exist for every asset."
// ---------------------------------------------------------------------

export type LinkStatus = 'KNOWN' | 'UNKNOWN';

export interface IdentityLink<T> {
  readonly status: LinkStatus;
  /** Non-null only when `status === 'KNOWN'` -- enforced by
   *  `isValidLink()` below, not merely by convention. A `null` id with
   *  `status: 'KNOWN'`, or a non-null id with `status: 'UNKNOWN'`, are
   *  both semantically meaningless and treated as INVALID (Section 2's
   *  own "do not use nullable strings without semantic meaning" --
   *  status carries the meaning, the id alone never does). */
  readonly id: T | null;
}

function isValidLink<T>(link: IdentityLink<T>): boolean {
  return (link.status === 'KNOWN') === (link.id !== null);
}

/** One physical unit's own replacement history -- Section 5's "historical
 *  replacement" and "which ID represents physical replacement." A chain
 *  of physical units can occupy the SAME FactoryTwinAssetId over time;
 *  `replacesPhysicalAssetId` points backward to the unit this one
 *  replaced, or `null` for the first known unit at this position. */
export interface PhysicalAssetRecord {
  readonly id: PhysicalAssetId;
  readonly replacesPhysicalAssetId: PhysicalAssetId | null;
  readonly installedAt: string | null;
  readonly retiredAt: string | null;
}

/**
 * The full chain for one Factory Twin asset. `equipment` may legitimately
 * be `KNOWN` while `physicalAsset`/`device` remain `UNKNOWN` (a logical
 * equipment identity can be asserted before its physical/device evidence
 * exists) -- each link is independently gated, never inferred from a
 * sibling link's status.
 */
export interface IdentityChain {
  readonly factoryTwinAssetId: FactoryTwinAssetId;
  readonly equipment: IdentityLink<EquipmentId>;
  readonly physicalAsset: IdentityLink<PhysicalAssetId>;
  readonly device: IdentityLink<DeviceId>;
  readonly sourceSystem: IdentityLink<SourceSystemId>;
  readonly lifecycle: MappingLifecycle;
  readonly provenance: Provenance | null;
}

export function isValidIdentityChain(chain: IdentityChain): boolean {
  return isValidLink(chain.equipment) && isValidLink(chain.physicalAsset)
    && isValidLink(chain.device) && isValidLink(chain.sourceSystem);
}

// ---------------------------------------------------------------------
// 3. Provenance (Section 3) -- required for CONFIRMED, meaningless
//    otherwise (never attached to an inferred/candidate relationship).
// ---------------------------------------------------------------------

export type ProvenanceCategory =
  | 'AUTHORITATIVE_REGISTRY'
  | 'APPROVED_CONFIGURATION'
  | 'MES'
  | 'SCADA'
  | 'PLC_OPC_UA_GATEWAY'
  | 'VENDOR_DEVICE_REGISTRY'
  | 'MANUAL_APPROVED_MAPPING';

export interface Provenance {
  readonly category: ProvenanceCategory;
  readonly source: string;
  readonly sourceRecordId: string;
  readonly verifiedAt: string; // ISO-8601
  readonly verifiedBy: string; // a person or an approved process name
  readonly confidence: 'high' | 'medium' | 'low';
}

// ---------------------------------------------------------------------
// 4. Mapping lifecycle (Section 4) -- 6 states, EXPLICITLY reconciled
//    against `lib/mapping.js`'s own 4-state `MappingStatus`
//    (unresolved/confirmed/conflicting/deprecated) rather than silently
//    diverging from the engine that actually governs production:
//
//      UNMAPPED  <-> unresolved   (no relationship asserted -- the default)
//      CANDIDATE <-> (none)       (NEW: a proposed, unreviewed relationship
//                                   -- lib/mapping.js has no staging state
//                                   at all; a real future workflow would
//                                   promote CANDIDATE -> CONFIRMED only
//                                   after evidence review, never
//                                   automatically)
//      CONFIRMED <-> confirmed    (authoritative, provenanced)
//      AMBIGUOUS <-> conflicting  (two or more records disagree)
//      RETIRED   <-> deprecated   (was confirmed once, superseded)
//      INVALID   <-> (none)       (fails structural validation entirely
//                                   -- same concept Step 6D's own
//                                   `MappingConfidence` already uses)
//
//    `lib/mapping.js` remains the ONLY engine that gates production
//    eligibility (`eligibility()`, mapping.js:261-264) -- this enum is a
//    documentation/design-layer vocabulary, not a replacement engine.
// ---------------------------------------------------------------------

export type MappingLifecycle = 'UNMAPPED' | 'CANDIDATE' | 'CONFIRMED' | 'AMBIGUOUS' | 'RETIRED' | 'INVALID';

/**
 * Section 4's own hard rule, encoded: CANDIDATE and AMBIGUOUS (and
 * RETIRED/INVALID/UNMAPPED) can NEVER become production-eligible, no
 * matter what provenance they carry. Only CONFIRMED, with a real
 * `Provenance` object present, is eligible -- mirrors `lib/mapping.js`'s
 * own `eligibility()` (only `confirmed` -> true in every dimension,
 * `conflicting`/`deprecated` read exactly like `unresolved`) applied to
 * this file's own richer vocabulary.
 */
export function isProductionEligible(chain: IdentityChain): boolean {
  return chain.lifecycle === 'CONFIRMED' && chain.provenance !== null;
}

// ---------------------------------------------------------------------
// 5. Validation utilities (Section 9) -- pure, no React/R3F dependency.
// ---------------------------------------------------------------------

export type AnomalyKind =
  | 'DUPLICATE_IDENTITY'
  | 'DUPLICATE_DEVICE'
  | 'AMBIGUOUS_RELATIONSHIP'
  | 'MISSING_PROVENANCE'
  | 'RETIRED_IDENTITY_STILL_ELIGIBLE'
  | 'SOURCE_MISMATCH'
  | 'BIDIRECTIONAL_MISMATCH'
  | 'INVALID_LINK';

export interface IdentityAnomaly {
  readonly kind: AnomalyKind;
  readonly factoryTwinAssetId: FactoryTwinAssetId;
  readonly detail: string;
}

/**
 * Validates a full chain SET. Every anomaly kind Section 9 names is
 * detected here:
 *   - DUPLICATE_IDENTITY: two chains claim the same FactoryTwinAssetId
 *   - DUPLICATE_DEVICE: two CONFIRMED chains claim the same DeviceId
 *   - AMBIGUOUS_RELATIONSHIP: a chain's own lifecycle is AMBIGUOUS
 *   - MISSING_PROVENANCE: CONFIRMED with `provenance: null`
 *   - RETIRED_IDENTITY_STILL_ELIGIBLE: RETIRED but `isProductionEligible`
 *     would (incorrectly) read true -- a guard against a future bug in
 *     THIS function, not a real reachable state given the function
 *     above's own logic, kept as an explicit, testable invariant anyway
 *   - SOURCE_MISMATCH: a chain's `device` link is KNOWN but
 *     `sourceSystem` is UNKNOWN (a device with no declared origin system
 *     -- provenance can't be trusted without knowing which system
 *     asserted it)
 *   - BIDIRECTIONAL_MISMATCH: alias for DUPLICATE_DEVICE, reported
 *     additionally under this name for parity with Step 6D's own
 *     anomaly vocabulary (`ONE_MACHINE_MULTIPLE_SOURCES`-shaped), since
 *     this file's chains are already keyed by Twin asset, so the
 *     "reverse" direction (device -> chain) is what needs checking here
 *   - INVALID_LINK: `isValidIdentityChain()` is false for this chain
 */
export function validateIdentityChains(chains: readonly IdentityChain[]): readonly IdentityAnomaly[] {
  const anomalies: IdentityAnomaly[] = [];

  const seenAsset = new Set<string>();
  const confirmedByDevice = new Map<string, FactoryTwinAssetId[]>();

  for (const chain of chains) {
    const key = chain.factoryTwinAssetId as unknown as string;
    if (seenAsset.has(key)) {
      anomalies.push({ kind: 'DUPLICATE_IDENTITY', factoryTwinAssetId: chain.factoryTwinAssetId, detail: `FactoryTwinAssetId "${key}" appears in more than one chain` });
    }
    seenAsset.add(key);

    if (!isValidIdentityChain(chain)) {
      anomalies.push({ kind: 'INVALID_LINK', factoryTwinAssetId: chain.factoryTwinAssetId, detail: 'a link\'s status/id pair is semantically inconsistent (KNOWN with null id, or UNKNOWN with a non-null id)' });
    }

    if (chain.lifecycle === 'AMBIGUOUS') {
      anomalies.push({ kind: 'AMBIGUOUS_RELATIONSHIP', factoryTwinAssetId: chain.factoryTwinAssetId, detail: 'lifecycle is AMBIGUOUS -- two or more sources disagree, never auto-resolved' });
    }

    if (chain.lifecycle === 'CONFIRMED' && chain.provenance === null) {
      anomalies.push({ kind: 'MISSING_PROVENANCE', factoryTwinAssetId: chain.factoryTwinAssetId, detail: 'CONFIRMED lifecycle with no provenance -- a confirmation nobody owns' });
    }

    if (chain.lifecycle === 'RETIRED' && isProductionEligible(chain)) {
      anomalies.push({ kind: 'RETIRED_IDENTITY_STILL_ELIGIBLE', factoryTwinAssetId: chain.factoryTwinAssetId, detail: 'RETIRED chain incorrectly reads as production-eligible' });
    }

    if (chain.device.status === 'KNOWN' && chain.sourceSystem.status === 'UNKNOWN') {
      anomalies.push({ kind: 'SOURCE_MISMATCH', factoryTwinAssetId: chain.factoryTwinAssetId, detail: 'device is KNOWN but no source system is declared -- provenance cannot be attributed' });
    }

    if (chain.lifecycle === 'CONFIRMED' && chain.device.status === 'KNOWN' && chain.device.id) {
      const deviceKey = chain.device.id as unknown as string;
      if (!confirmedByDevice.has(deviceKey)) confirmedByDevice.set(deviceKey, []);
      confirmedByDevice.get(deviceKey)!.push(chain.factoryTwinAssetId);
    }
  }

  for (const [deviceKey, assetIds] of confirmedByDevice) {
    if (assetIds.length > 1) {
      for (const assetId of assetIds) {
        anomalies.push({ kind: 'DUPLICATE_DEVICE', factoryTwinAssetId: assetId, detail: `device "${deviceKey}" is CONFIRMED on ${assetIds.length} different Twin assets: ${assetIds.join(', ')}` });
        anomalies.push({ kind: 'BIDIRECTIONAL_MISMATCH', factoryTwinAssetId: assetId, detail: `reverse lookup (device -> asset) is ambiguous for "${deviceKey}"` });
      }
    }
  }

  return anomalies;
}

// ---------------------------------------------------------------------
// 6. Mapping coverage (Section 6/9) -- current dataset facts, computed,
//    never manufactured.
// ---------------------------------------------------------------------

export interface CanonicalCoverage {
  readonly totalFactoryTwinAssets: number;
  readonly confirmed: number;
  readonly candidate: number;
  readonly ambiguous: number;
  readonly retired: number;
  readonly invalid: number;
  readonly unmapped: number;
  readonly coveragePercent: number;
}

export function computeCanonicalCoverage(
  totalFactoryTwinAssets: number,
  chains: readonly IdentityChain[],
): CanonicalCoverage {
  const confirmed = chains.filter((c) => c.lifecycle === 'CONFIRMED').length;
  const candidate = chains.filter((c) => c.lifecycle === 'CANDIDATE').length;
  const ambiguous = chains.filter((c) => c.lifecycle === 'AMBIGUOUS').length;
  const retired = chains.filter((c) => c.lifecycle === 'RETIRED').length;
  const invalid = chains.filter((c) => c.lifecycle === 'INVALID').length;
  const explicitlyUnmapped = chains.filter((c) => c.lifecycle === 'UNMAPPED').length;
  const accountedFor = chains.length;
  const unmapped = Math.max(totalFactoryTwinAssets - confirmed, 0);
  return {
    totalFactoryTwinAssets,
    confirmed,
    candidate,
    ambiguous,
    retired,
    invalid,
    // Every asset with no chain record at all is UNMAPPED by omission,
    // same as `explicitlyUnmapped` chains -- both count the same way.
    unmapped: Math.max(unmapped, explicitlyUnmapped, totalFactoryTwinAssets - accountedFor),
    coveragePercent: totalFactoryTwinAssets === 0 ? 0 : (confirmed / totalFactoryTwinAssets) * 100,
  };
}

// ---------------------------------------------------------------------
// 7. Readiness gate (Section 7) -- stricter than Step 6D's own
//    `computeReadinessDecision` on purpose: PARTIALLY_READY is reachable
//    ONLY when an explicit `partiallyReadyPolicy` flag is supplied (a
//    stand-in for "explicitly supported by a future product policy" --
//    Section 7's own words). Without it, this function can only ever
//    answer READY or NOT_READY, never a silent middle ground.
// ---------------------------------------------------------------------

export type CanonicalReadiness = 'READY' | 'PARTIALLY_READY' | 'NOT_READY';

export interface CanonicalReadinessInput {
  readonly chains: readonly IdentityChain[];
  readonly totalFactoryTwinAssets: number;
  /** Every asset this deployment intends to show live state for. A
   *  chain not in this set is not required to be CONFIRMED for READY --
   *  "every production-enabled asset" (Section 7), not literally every
   *  Twin asset that exists. */
  readonly productionEnabledAssetIds: readonly FactoryTwinAssetId[];
  readonly authoritativeSourceExists: boolean;
  /** Explicit opt-in only -- see this section's own header comment. */
  readonly partiallyReadyPolicy?: boolean;
}

export function computeCanonicalReadiness(input: CanonicalReadinessInput): CanonicalReadiness {
  const { chains, productionEnabledAssetIds, authoritativeSourceExists, partiallyReadyPolicy } = input;

  if (!authoritativeSourceExists) return 'NOT_READY';

  // Every anomaly kind `validateIdentityChains` produces is critical by
  // construction -- unlike Step 6D's own `detectBidirectionalAnomalies`,
  // this vocabulary has no ORPHAN_*-style "expected at low coverage"
  // noise to filter out, so any anomaly at all blocks readiness.
  const anomalies = validateIdentityChains(chains);
  if (anomalies.length > 0) return 'NOT_READY';

  const chainByAsset = new Map(chains.map((c) => [c.factoryTwinAssetId as unknown as string, c]));
  let allProductionEnabledConfirmed = true;
  let anyProductionEnabledConfirmed = false;
  for (const assetId of productionEnabledAssetIds) {
    const chain = chainByAsset.get(assetId as unknown as string);
    const eligible = chain ? isProductionEligible(chain) : false;
    if (eligible) anyProductionEnabledConfirmed = true;
    else allProductionEnabledConfirmed = false;
  }

  if (productionEnabledAssetIds.length > 0 && allProductionEnabledConfirmed) return 'READY';
  if (partiallyReadyPolicy === true && anyProductionEnabledConfirmed) return 'PARTIALLY_READY';
  return 'NOT_READY';
}

// ---------------------------------------------------------------------
// 8. Future integration contract (Section 8) -- a typed resolver
//    interface a future adapter would consume, never `device_id ===
//    machine.id`.
// ---------------------------------------------------------------------

export interface CanonicalIdentityResolver {
  /** Resolves ONE Factory Twin asset to its full chain. Returns a chain
   *  with every link `UNKNOWN` and `lifecycle: 'UNMAPPED'` for any asset
   *  with no real chain record -- never guessed, never derived from
   *  `factoryTwinAssetId` equaling a device id by coincidence. */
  resolve(factoryTwinAssetId: FactoryTwinAssetId): IdentityChain;
}

export function unmappedChain(factoryTwinAssetId: FactoryTwinAssetId): IdentityChain {
  return {
    factoryTwinAssetId,
    equipment: { status: 'UNKNOWN', id: null },
    physicalAsset: { status: 'UNKNOWN', id: null },
    device: { status: 'UNKNOWN', id: null },
    sourceSystem: { status: 'UNKNOWN', id: null },
    lifecycle: 'UNMAPPED',
    provenance: null,
  };
}
