/**
 * Step 6C: typed adapter for the REAL `/api/state` source discovered and
 * audited in Step 6B (`docs/evidence/FACTORY_TWIN_OPERATIONAL_SOURCE_AUDIT.md`).
 * Establishes the architecture for future real telemetry WITHOUT enabling
 * it -- nothing in `components/factory-twin/**` or `app/**` imports this
 * file (grep-verifiable), and no caller anywhere wires its output into
 * the renderer this step. `Step 6A`'s own `resolveReal()` (always
 * `UNAVAILABLE`) stays exactly as it was; this file does not touch it.
 *
 * ARCHITECTURE (this step's own diagram, restated):
 *
 *   /api/state -> ApiOperationalStateResponse (DTO)
 *     -> ApiOperationalStateSource.fetch() (validates, fails closed)
 *     -> adaptOperationalState() (identity-gated, never guesses a mapping)
 *     -> OperationalStateResolution per Twin asset (Step 1's own domain
 *        shape, the SAME type Step 6A's simulated adapter already
 *        produces -- one canonical output shape for both real and
 *        simulated paths, matching `operational-state-adapters.js`'s own
 *        "one canonical output shape" convention)
 *     -> (a future presentation layer, NOT built this step) -> R3F
 *
 * SINGLE FILE, DELIBERATELY: this repo's plain `node some.test.js` unit
 * test convention (`tests/unit/lib/require-ts.js`) transpiles ONE file at
 * a time with no cross-file module resolution -- the same reason Step 1's
 * `domain/*.ts` files keep every cross-file reference `import type` only
 * (erased by `ts.transpileModule`, never emitted as a runtime `require`).
 * This file goes one step further and has no sibling `.ts` file to
 * cross-import at runtime at all: the one small piece of runtime data it
 * needs (the 8-state vocabulary, for "is this an unrecognised state"
 * detection) is reproduced here exactly, the same "reproduced, not
 * imported" precedent Step 6A's own `hashString()` already set for
 * exactly this constraint.
 */

import type { MachineStateCode } from '@twin-domain/machine-state';
import type { OperationalStateResolution, StateSourceQuality, SourceType } from '@twin-domain/data-quality';

// ---------------------------------------------------------------------
// 1. API DTO -- exact shape of GET /api/state's response
//    (server.js:544-588's queryDeviceState() + the route handler, read in
//    full and reproduced field-for-field, not guessed; verified live
//    against the running production container, Step 6B/6C evidence).
// ---------------------------------------------------------------------

export interface ApiAlarmSummary {
  readonly count: number;
  readonly owner: string | null;
  readonly elapsed: string | null;
  readonly related_log_id: string | null;
  /** BIGINT column, serialized as a numeric STRING by the pg driver --
   *  never widened to `number` here (would silently lose precision on a
   *  large enough value; not assumed safe merely because today's values
   *  fit in one). */
  readonly logdate_ms: string | null;
}

export interface ApiOperationalStateRecord {
  readonly device_id: string;
  /** 0-3 today (`STATE_CODE_TO_MACHINE_STATE`, server.js:524-529) --
   *  typed as `number`, not a literal union: the API itself does not
   *  guarantee only these 4 values forever, and this DTO must reflect
   *  what the endpoint actually promises, not what it happens to send
   *  today. */
  readonly state: number;
  /** NOT narrowed to `MachineStateCode` at the DTO layer -- an
   *  unrecognised string must survive parsing so the ADAPTER (not the
   *  DTO) decides what an unknown value means (Section 10's "unknown
   *  state" case), never silently rejected or coerced here. */
  readonly machine_state: string;
  readonly state_label: string;
  readonly state_color: string;
  readonly board_no: number | null;
  readonly total_board: number | null;
  readonly mo: string | null;
  readonly factory: string | null;
  readonly has_data: boolean;
  readonly is_stale: boolean;
  /** ISO 8601, or null when `has_data` is false -- verified live. */
  readonly last_seen: string | null;
  readonly alarm: ApiAlarmSummary | null;
}

export interface ApiOperationalStateResponse {
  readonly machines: readonly ApiOperationalStateRecord[];
  readonly queried_at: string;
}

// ---------------------------------------------------------------------
// 2. DTO validator -- fails closed on any structural mismatch. Hand-
//    rolled, matching this codebase's existing convention (`wire.js`'s
//    `fromEnum()`, `mapping.js`'s `validateMappings()`) rather than
//    adding a schema-validation dependency for one endpoint.
// ---------------------------------------------------------------------

export type ParseResult =
  | { readonly ok: true; readonly data: ApiOperationalStateResponse }
  | { readonly ok: false; readonly error: string };

function isNullableString(v: unknown): v is string | null {
  return v === null || typeof v === 'string';
}
function isNullableNumber(v: unknown): v is number | null {
  return v === null || typeof v === 'number';
}

/** `undefined` return signals "invalid" (distinct from `null`, a valid
 *  "no alarm" answer) without needing a third result type. */
function parseAlarm(raw: unknown): ApiAlarmSummary | null | undefined {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'object') return undefined;
  const a = raw as Record<string, unknown>;
  if (
    typeof a.count !== 'number'
    || !isNullableString(a.owner)
    || !isNullableString(a.elapsed)
    || !isNullableString(a.related_log_id)
    || !isNullableString(a.logdate_ms)
  ) return undefined;
  return {
    count: a.count, owner: a.owner, elapsed: a.elapsed,
    related_log_id: a.related_log_id, logdate_ms: a.logdate_ms,
  };
}

function parseRecord(raw: unknown, index: number): { ok: true; record: ApiOperationalStateRecord } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: `machines[${index}] is not an object` };
  const r = raw as Record<string, unknown>;
  if (typeof r.device_id !== 'string' || r.device_id.length === 0) return { ok: false, error: `machines[${index}].device_id missing/invalid` };
  if (typeof r.state !== 'number') return { ok: false, error: `machines[${index}].state missing/invalid` };
  if (typeof r.machine_state !== 'string') return { ok: false, error: `machines[${index}].machine_state missing/invalid` };
  if (typeof r.state_label !== 'string') return { ok: false, error: `machines[${index}].state_label missing/invalid` };
  if (typeof r.state_color !== 'string') return { ok: false, error: `machines[${index}].state_color missing/invalid` };
  if (!isNullableNumber(r.board_no)) return { ok: false, error: `machines[${index}].board_no invalid` };
  if (!isNullableNumber(r.total_board)) return { ok: false, error: `machines[${index}].total_board invalid` };
  if (!isNullableString(r.mo)) return { ok: false, error: `machines[${index}].mo invalid` };
  if (!isNullableString(r.factory)) return { ok: false, error: `machines[${index}].factory invalid` };
  if (typeof r.has_data !== 'boolean') return { ok: false, error: `machines[${index}].has_data missing/invalid` };
  if (typeof r.is_stale !== 'boolean') return { ok: false, error: `machines[${index}].is_stale missing/invalid` };
  if (!isNullableString(r.last_seen)) return { ok: false, error: `machines[${index}].last_seen invalid` };
  const alarm = parseAlarm(r.alarm);
  if (alarm === undefined) return { ok: false, error: `machines[${index}].alarm invalid` };
  return {
    ok: true,
    record: {
      device_id: r.device_id, state: r.state, machine_state: r.machine_state,
      state_label: r.state_label, state_color: r.state_color,
      board_no: r.board_no, total_board: r.total_board, mo: r.mo, factory: r.factory,
      has_data: r.has_data, is_stale: r.is_stale, last_seen: r.last_seen, alarm,
    },
  };
}

export function parseApiOperationalStateResponse(raw: unknown): ParseResult {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'response is not an object' };
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.machines)) return { ok: false, error: '"machines" is not an array' };
  if (typeof r.queried_at !== 'string') return { ok: false, error: '"queried_at" missing/invalid' };
  const records: ApiOperationalStateRecord[] = [];
  for (let i = 0; i < r.machines.length; i += 1) {
    const parsed = parseRecord(r.machines[i], i);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    records.push(parsed.record);
  }
  return { ok: true, data: { machines: records, queried_at: r.queried_at } };
}

// ---------------------------------------------------------------------
// 3. Source -- fetches and validates. Fails closed (throws) on network
//    error, non-2xx status, invalid JSON, or schema mismatch. The caller
//    (`adaptOperationalState`, below) is the ONE place a failed fetch
//    becomes `UNAVAILABLE`, never `DOWN` (Section 7).
// ---------------------------------------------------------------------

export interface OperationalStateSource {
  fetch(): Promise<ApiOperationalStateResponse>;
}

/** Minimal shape this module needs from `fetch`, so a test can inject a
 *  stub without depending on a real global `fetch` signature. */
export type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export class ApiOperationalStateSource implements OperationalStateSource {
  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: FetchLike = (globalThis.fetch as unknown) as FetchLike,
  ) {}

  async fetch(): Promise<ApiOperationalStateResponse> {
    const res = await this.fetchImpl(`${this.baseUrl}/api/state`);
    if (!res.ok) throw new Error(`/api/state responded ${res.status}`);
    let raw: unknown;
    try {
      raw = await res.json();
    } catch {
      throw new Error('/api/state response was not valid JSON');
    }
    const parsed = parseApiOperationalStateResponse(raw);
    if (!parsed.ok) throw new Error(`/api/state schema mismatch: ${parsed.error}`);
    return parsed.data;
  }
}

// ---------------------------------------------------------------------
// 4. Simulator detection (Section 5).
// ---------------------------------------------------------------------

export type SourceQuality = 'REAL' | 'SIMULATED' | 'UNKNOWN';

export interface SourceQualityHint {
  /** Out-of-band knowledge the caller supplies about this deployment's
   *  data mode (e.g. mirroring `LDI_SIMULATOR_ENABLED`) -- `/api/state`'s
   *  own JSON carries no explicit "is this simulated" flag, confirmed by
   *  reading `server.js`'s route handler in full (Step 6B). This is the
   *  only TRUSTWORTHY signal; everything else is a heuristic. */
  readonly declared?: SourceQuality;
}

/**
 * Detection order: (1) an explicit declared hint, always wins. (2) A
 * weak, DISCLOSED heuristic: `almsim_gen` (Node-RED) prefixes a
 * simulated alarm's `related_log_id` with `"SIM-"` (verified live against
 * the real production container, Step 6B/6C evidence). Presence proves
 * `SIMULATED`; ABSENCE PROVES NOTHING (most records carry no active
 * alarm at all, real or simulated) -- so absence resolves to `UNKNOWN`,
 * never `REAL`. "Never silently presented as live" (Section 5) means
 * `UNKNOWN`, not `REAL`, is the only safe default when no signal exists.
 */
export function detectSourceQuality(
  records: readonly ApiOperationalStateRecord[],
  hint?: SourceQualityHint,
): SourceQuality {
  if (hint?.declared) return hint.declared;
  const hasSimSignature = records.some(
    (r) => typeof r.alarm?.related_log_id === 'string' && r.alarm.related_log_id.startsWith('SIM-'),
  );
  return hasSimSignature ? 'SIMULATED' : 'UNKNOWN';
}

// ---------------------------------------------------------------------
// 5. Identity mapping gate (Section 4's own "most important rule").
//    ONLY explicit, caller-supplied CONFIRMED entries are ever consulted
//    -- never array position, alphabetical/positional order, fuzzy name
//    matching, nearest coordinate, or machine-number guessing. As of
//    Step 6B, the real value of this map in this deployment is EMPTY
//    (`private/floor1-asset-mapping.json` has 0 CONFIRMED entries) --
//    this module does not read that file itself (keeps it pure and
//    testable without touching the legacy service's filesystem); a
//    caller wiring this up for real would read it the same way
//    `server.js`'s `loadPrivateAssetMapping()` already does, filtered to
//    CONFIRMED entries only, and pass the result in here.
// ---------------------------------------------------------------------

export interface ConfirmedDeviceMapping {
  /** Twin `Asset.id` -> source `device_id`. Every entry here must trace
   *  to real evidence (FT-14's own CONFIRMED lifecycle) -- this module
   *  trusts the caller on that; it does not (and cannot) re-verify
   *  evidence itself. It only refuses to ever INVENT an entry that is
   *  not present. */
  readonly assetIdToDeviceId: ReadonlyMap<string, string>;
}

export const EMPTY_MAPPING: ConfirmedDeviceMapping = { assetIdToDeviceId: new Map() };

export type SourceFetchResult =
  | { readonly ok: true; readonly response: ApiOperationalStateResponse }
  | { readonly ok: false; readonly reason: string };

export interface AdaptOperationalStateResult {
  readonly recordsByAssetId: ReadonlyMap<string, OperationalStateResolution>;
  /** Source-wide fact (Section 5) -- deliberately NOT folded into each
   *  record's own `quality` axis (`data-quality.ts`'s own header comment:
   *  keeping independent quality axes apart is the entire point of that
   *  file). A caller MUST treat `quality: 'VALID'` at `sourceQuality:
   *  'UNKNOWN'` as real-SHAPED but NOT confirmed real -- exactly why
   *  Step 6C performs no production enablement regardless of what any
   *  single record's `quality` says. */
  readonly sourceQuality: SourceQuality;
  readonly queriedAt: string | null;
}

/** `machine-state.ts`'s own 8-state vocabulary, reproduced exactly (not
 *  imported -- see this file's header on single-file transpilation).
 *  Parity with `machine-state.ts` is enforced elsewhere
 *  (`tests/unit/factory-twin-domain.test.js`); this constant exists only
 *  so an UNRECOGNISED `machine_state` string can be detected here,
 *  matching `resolveMachineState()`'s own "anything unrecognised ->
 *  UNDEFINED" rule exactly. */
const KNOWN_MACHINE_STATES: readonly string[] = [
  'OFF', 'DOWN', 'IDLE', 'INITIAL', 'PM', 'STOP', 'RUN', 'UNDEFINED',
];

function safeMachineState(raw: string): MachineStateCode {
  return KNOWN_MACHINE_STATES.includes(raw) ? (raw as MachineStateCode) : 'UNDEFINED';
}

/**
 * The one function every future caller uses. Pure: no fetch, no I/O --
 * `sourceResult` is already resolved (by `ApiOperationalStateSource.fetch()`,
 * caught by the caller) before this runs, so this function's own logic is
 * fully unit-testable without a network dependency.
 */
export function adaptOperationalState(
  assetIds: readonly string[],
  mapping: ConfirmedDeviceMapping,
  sourceResult: SourceFetchResult,
  hint?: SourceQualityHint,
): AdaptOperationalStateResult {
  const recordsByAssetId = new Map<string, OperationalStateResolution>();

  if (!sourceResult.ok) {
    // Section 6: source unavailable -> UNAVAILABLE, never DOWN, for
    // every asset -- a source-level fact, unconditional.
    for (const assetId of assetIds) {
      recordsByAssetId.set(assetId, {
        object_id: assetId, state: null, source_type: 'REAL' as SourceType, quality: 'UNAVAILABLE',
        observed_at: null, reason: sourceResult.reason,
      });
    }
    return { recordsByAssetId, sourceQuality: 'UNKNOWN', queriedAt: null };
  }

  const { response } = sourceResult;
  const byDeviceId = new Map(response.machines.map((m) => [m.device_id, m]));
  const sourceQuality = detectSourceQuality(response.machines, hint);

  for (const assetId of assetIds) {
    const deviceId = mapping.assetIdToDeviceId.get(assetId);
    if (deviceId === undefined) {
      // Section 4: no confirmed mapping -- an identity-layer fact, NEVER
      // guessed from position/name/proximity. NO_DATA, not UNAVAILABLE:
      // the source itself is fine, this specific asset simply has no
      // approved link to it yet.
      recordsByAssetId.set(assetId, {
        object_id: assetId, state: null, source_type: 'REAL' as SourceType, quality: 'NO_DATA',
        observed_at: null, reason: 'no confirmed device mapping for this asset',
      });
      continue;
    }
    const record = byDeviceId.get(deviceId);
    if (!record) {
      recordsByAssetId.set(assetId, {
        object_id: assetId, state: null, source_type: 'REAL' as SourceType, quality: 'UNAVAILABLE',
        observed_at: null, reason: `mapped device "${deviceId}" not present in source response`,
      });
      continue;
    }

    const state = safeMachineState(record.machine_state);
    let quality: StateSourceQuality;
    let reason: string;
    if (!record.has_data) {
      quality = 'NO_DATA'; reason = 'source has no fresh row for this device';
    } else if (record.is_stale) {
      // Section 6/7: stale NEVER becomes DOWN. Defensive, adapter-level
      // guarantee independent of STATE_SQL already enforcing the same
      // rule in SQL (Step 6B: server.js's CASE checks has_data/is_stale
      // BEFORE the alarm/DOWN branch) -- even a hypothetically malformed
      // upstream record reporting is_stale=true alongside
      // machine_state='DOWN' still resolves to STALE here, never a
      // quality that reads as a confirmed DOWN.
      quality = 'STALE'; reason = 'source row older than the 5-minute freshness threshold';
    } else if (sourceQuality === 'SIMULATED') {
      quality = 'SIMULATION'; reason = 'source is simulator-fed, not real plant telemetry';
    } else {
      // sourceQuality is 'REAL' (explicitly declared) or 'UNKNOWN' (no
      // signal either way) -- both produce VALID here (the SQL/freshness
      // facts genuinely are fresh+real-shaped), but Section 9's own rule
      // means NOTHING in this codebase may treat this as production
      // truth without ALSO checking the result's top-level
      // `sourceQuality` first (see AdaptOperationalStateResult's own
      // comment).
      quality = 'VALID'; reason = `real observation (sourceQuality: ${sourceQuality})`;
    }

    recordsByAssetId.set(assetId, {
      object_id: assetId,
      state,
      source_type: 'REAL' as SourceType,
      quality,
      observed_at: record.last_seen,
      reason,
    });
  }

  return { recordsByAssetId, sourceQuality, queriedAt: response.queried_at };
}

// ---------------------------------------------------------------------
// 6. Mapping coverage metrics (Section 11) -- pure calculation, no I/O.
// ---------------------------------------------------------------------

export interface MappingCoverageInput {
  readonly totalMachines: number;
  readonly mapping: ConfirmedDeviceMapping;
  readonly sourceDeviceIds: readonly string[];
}

export interface MappingCoverageResult {
  readonly confirmed: number;
  readonly total: number;
  readonly coveragePercent: number;
  readonly unmappedMachines: number;
  readonly unmappedSourceRecords: number;
  readonly duplicateDeviceMappings: number;
}

export function computeMappingCoverage(input: MappingCoverageInput): MappingCoverageResult {
  const { totalMachines, mapping, sourceDeviceIds } = input;
  const confirmed = mapping.assetIdToDeviceId.size;

  const deviceCounts = new Map<string, number>();
  for (const deviceId of mapping.assetIdToDeviceId.values()) {
    deviceCounts.set(deviceId, (deviceCounts.get(deviceId) ?? 0) + 1);
  }
  const duplicateDeviceMappings = [...deviceCounts.values()].filter((n) => n > 1).length;

  const mappedDeviceIds = new Set(mapping.assetIdToDeviceId.values());
  const unmappedSourceRecords = sourceDeviceIds.filter((id) => !mappedDeviceIds.has(id)).length;

  return {
    confirmed,
    total: totalMachines,
    coveragePercent: totalMachines === 0 ? 0 : (confirmed / totalMachines) * 100,
    unmappedMachines: Math.max(totalMachines - confirmed, 0),
    unmappedSourceRecords,
    duplicateDeviceMappings,
  };
}

// ---------------------------------------------------------------------
// 7. Performance instrumentation (Section 12) -- measures THIS module's
//    own validation+mapping cost against an already-fetched response
//    body. Network round-trip time is a separate measurement (taken
//    directly against the real running container, not simulated here --
//    see the evidence doc) since conflating the two would hide which
//    phase actually costs anything, which is exactly what Section 12
//    asks to be able to tell apart.
// ---------------------------------------------------------------------

export interface AdaptPerformanceResult {
  readonly validationMs: number;
  readonly mappingMs: number;
  readonly recordCount: number;
  readonly payloadBytes: number;
}

export function measureAdaptPerformance(
  rawResponseText: string,
  assetIds: readonly string[],
  mapping: ConfirmedDeviceMapping,
): AdaptPerformanceResult {
  const payloadBytes = new TextEncoder().encode(rawResponseText).length;
  const t0 = Date.now();
  const raw: unknown = JSON.parse(rawResponseText);
  const parsed = parseApiOperationalStateResponse(raw);
  const t1 = Date.now();
  const sourceResult: SourceFetchResult = parsed.ok
    ? { ok: true, response: parsed.data }
    : { ok: false, reason: parsed.error };
  const result = adaptOperationalState(assetIds, mapping, sourceResult);
  const t2 = Date.now();
  return {
    validationMs: t1 - t0,
    mappingMs: t2 - t1,
    recordCount: result.recordsByAssetId.size,
    payloadBytes,
  };
}
