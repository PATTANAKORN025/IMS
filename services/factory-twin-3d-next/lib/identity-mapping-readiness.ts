/**
 * Step 6D: identity-mapping readiness gate for the physical Factory Twin's
 * 431 assets. Complements, never replaces, the legacy engine that already
 * validates individual mapping records with authority
 * (`services/factory-twin-3d/lib/mapping.js`'s `validateMappings()` --
 * already rejects duplicate `ims_device_id`/`mes_machine_id` claims,
 * unprovenanced confirmations, and malformed namespaces, fail-closed for
 * the WHOLE file on any single bad record). This module does not
 * re-implement that logic; it operates one level up, on the READINESS
 * QUESTION a mapping-quality report answers: given some set of candidate
 * relationships (however sourced), is this deployment ready to trust them
 * for production operational-state display?
 *
 * Single file, deliberately -- same `requireTs()` single-file
 * transpilation constraint `operational-source-adapter.ts`'s own header
 * documents (`tests/unit/lib/require-ts.js`).
 */

// ---------------------------------------------------------------------
// 1. Mapping candidate shape (Section 1's own table columns).
// ---------------------------------------------------------------------

export type MappingConfidence = 'CONFIRMED' | 'AMBIGUOUS' | 'UNMAPPED' | 'INVALID';

export interface MappingCandidate {
  /** Where this candidate relationship was found, e.g. "FT-14
   *  private/floor1-asset-mapping.json". */
  readonly source: string;
  /** The source-side identifier (a `device_id`), or `null` for a
   *  Factory Twin asset with no candidate relationship at all. */
  readonly sourceId: string | null;
  /** The Factory Twin `Asset.id`, or `null` for a source device with no
   *  candidate relationship at all. */
  readonly factoryTwinId: string | null;
  readonly evidence: string;
  readonly confidence: MappingConfidence;
}

// ---------------------------------------------------------------------
// 2. Coverage (Section 3) -- exact formula the spec names:
//    coverage = confirmed / total_factory_twin_assets
// ---------------------------------------------------------------------

export interface MappingCoverageCounts {
  readonly totalFactoryTwinAssets: number;
  readonly confirmed: number;
  readonly ambiguous: number;
  readonly unmapped: number;
  readonly duplicates: number;
  readonly invalid: number;
  readonly coveragePercent: number;
}

export function computeCoverageCounts(
  totalFactoryTwinAssets: number,
  candidates: readonly MappingCandidate[],
): MappingCoverageCounts {
  const confirmed = candidates.filter((c) => c.confidence === 'CONFIRMED').length;
  const ambiguous = candidates.filter((c) => c.confidence === 'AMBIGUOUS').length;
  const invalid = candidates.filter((c) => c.confidence === 'INVALID').length;

  const bySourceCount = new Map<string, number>();
  const byTargetCount = new Map<string, number>();
  for (const c of candidates) {
    if (c.confidence !== 'CONFIRMED') continue;
    if (c.sourceId) bySourceCount.set(c.sourceId, (bySourceCount.get(c.sourceId) ?? 0) + 1);
    if (c.factoryTwinId) byTargetCount.set(c.factoryTwinId, (byTargetCount.get(c.factoryTwinId) ?? 0) + 1);
  }
  const duplicates = [...bySourceCount.values()].filter((n) => n > 1).length
    + [...byTargetCount.values()].filter((n) => n > 1).length;

  return {
    totalFactoryTwinAssets,
    confirmed,
    ambiguous,
    unmapped: Math.max(totalFactoryTwinAssets - confirmed, 0),
    duplicates,
    invalid,
    coveragePercent: totalFactoryTwinAssets === 0 ? 0 : (confirmed / totalFactoryTwinAssets) * 100,
  };
}

// ---------------------------------------------------------------------
// 3. Bidirectional validation (Section 4) -- both directions, every
//    anomaly kind the spec names.
// ---------------------------------------------------------------------

export type AnomalyKind =
  | 'ONE_SOURCE_MULTIPLE_MACHINES'
  | 'ONE_MACHINE_MULTIPLE_SOURCES'
  | 'DUPLICATE_MAPPING'
  | 'ORPHAN_SOURCE'
  | 'ORPHAN_ASSET';

export interface Anomaly {
  readonly kind: AnomalyKind;
  readonly detail: string;
}

/**
 * Only `CONFIRMED` candidates with BOTH a `sourceId` and a `factoryTwinId`
 * participate -- an `AMBIGUOUS`/`UNMAPPED`/`INVALID` candidate is not a
 * relationship this function treats as asserted in either direction. This
 * mirrors `lib/mapping.js`'s own rule: only `confirmed` is ever eligible
 * for anything identity-dependent (`eligibility()`, mapping.js:261-264).
 */
export function detectBidirectionalAnomalies(
  candidates: readonly MappingCandidate[],
  allSourceIds: readonly string[],
  allFactoryTwinIds: readonly string[],
): readonly Anomaly[] {
  const anomalies: Anomaly[] = [];
  const confirmed = candidates.filter(
    (c): c is MappingCandidate & { sourceId: string; factoryTwinId: string } => (
      c.confidence === 'CONFIRMED' && typeof c.sourceId === 'string' && typeof c.factoryTwinId === 'string'
    ),
  );

  const bySource = new Map<string, string[]>();
  const byTarget = new Map<string, string[]>();
  const seenPair = new Set<string>();

  for (const c of confirmed) {
    const pairKey = `${c.sourceId}::${c.factoryTwinId}`;
    if (seenPair.has(pairKey)) {
      anomalies.push({ kind: 'DUPLICATE_MAPPING', detail: `"${c.sourceId}" -> "${c.factoryTwinId}" asserted more than once` });
    }
    seenPair.add(pairKey);
    if (!bySource.has(c.sourceId)) bySource.set(c.sourceId, []);
    bySource.get(c.sourceId)!.push(c.factoryTwinId);
    if (!byTarget.has(c.factoryTwinId)) byTarget.set(c.factoryTwinId, []);
    byTarget.get(c.factoryTwinId)!.push(c.sourceId);
  }

  for (const [sourceId, targets] of bySource) {
    const distinct = new Set(targets);
    if (distinct.size > 1) {
      anomalies.push({
        kind: 'ONE_SOURCE_MULTIPLE_MACHINES',
        detail: `source "${sourceId}" confirmed to ${distinct.size} different Twin assets: ${[...distinct].join(', ')}`,
      });
    }
  }
  for (const [targetId, sources] of byTarget) {
    const distinct = new Set(sources);
    if (distinct.size > 1) {
      anomalies.push({
        kind: 'ONE_MACHINE_MULTIPLE_SOURCES',
        detail: `Twin asset "${targetId}" confirmed to ${distinct.size} different sources: ${[...distinct].join(', ')}`,
      });
    }
  }

  const mappedSourceIds = new Set(bySource.keys());
  for (const sourceId of allSourceIds) {
    if (!mappedSourceIds.has(sourceId)) {
      anomalies.push({ kind: 'ORPHAN_SOURCE', detail: `source device "${sourceId}" has no confirmed mapping to any Twin asset` });
    }
  }
  const mappedTargetIds = new Set(byTarget.keys());
  for (const factoryTwinId of allFactoryTwinIds) {
    if (!mappedTargetIds.has(factoryTwinId)) {
      anomalies.push({ kind: 'ORPHAN_ASSET', detail: `Twin asset "${factoryTwinId}" has no confirmed mapping to any source device` });
    }
  }

  return anomalies;
}

// ---------------------------------------------------------------------
// 4. Readiness decision (Section 6) -- pure, explicit, never forces READY.
// ---------------------------------------------------------------------

export type ReadinessDecision = 'READY' | 'PARTIALLY_READY' | 'NOT_READY';

export interface ReadinessInput {
  readonly counts: MappingCoverageCounts;
  /** Count of `ONE_SOURCE_MULTIPLE_MACHINES` / `ONE_MACHINE_MULTIPLE_SOURCES`
   *  / `DUPLICATE_MAPPING` anomalies ONLY -- `ORPHAN_SOURCE`/`ORPHAN_ASSET`
   *  are expected and non-blocking at low coverage, not integrity
   *  failures, so they are deliberately excluded from this count (see the
   *  evidence doc for the full, disclosed anomaly list either way). */
  readonly criticalAnomalyCount: number;
  readonly sourceIsSimulatorOnly: boolean;
  /** A coverage percentage some real stakeholder has agreed is sufficient
   *  for production. `undefined` when no such target has ever been
   *  agreed anywhere in this repository (this deployment's own current
   *  state, per this step's own evidence) -- an undefined target can
   *  NEVER produce `READY`, only `PARTIALLY_READY` or `NOT_READY`,
   *  matching Section 6's own "do not force READY" rule literally: this
   *  function cannot invent a target that was never agreed. */
  readonly agreedCoverageTargetPercent?: number;
}

export function computeReadinessDecision(input: ReadinessInput): ReadinessDecision {
  const { counts, criticalAnomalyCount, sourceIsSimulatorOnly, agreedCoverageTargetPercent } = input;
  if (counts.confirmed === 0) return 'NOT_READY';
  if (counts.invalid > 0) return 'NOT_READY';
  if (criticalAnomalyCount > 0) return 'NOT_READY';
  if (sourceIsSimulatorOnly) return 'NOT_READY';
  if (agreedCoverageTargetPercent === undefined) return 'PARTIALLY_READY';
  return counts.coveragePercent >= agreedCoverageTargetPercent ? 'READY' : 'PARTIALLY_READY';
}
