# Factory Twin — Step 6C: Typed Real Operational-State Adapter

Establishes a typed adapter architecture for the real `/api/state` source Step 6B audited
(`docs/evidence/FACTORY_TWIN_OPERATIONAL_SOURCE_AUDIT.md`) — **without enabling it as
production operational truth**. Nothing in `components/factory-twin/**` or `app/**` imports
the new module (grep-verified below). Step 6A's own `resolveReal()` (always `UNAVAILABLE`) is
untouched. Legacy `/factory-twin-3d/`, EAP, LDI, Grafana, nginx, database schema:
`git diff --stat` confirmed empty for all of them.

## 1. Existing source contract — `/api/state`

Read in full (`services/factory-twin-3d/server.js:435-588`), not guessed, and verified live
against the running production container (`docker exec ims-factory-twin-3d`):

- **Request**: `GET /api/state`, no parameters, no body.
- **Response**: `{ machines: ApiOperationalStateRecord[], queried_at: string }`.
- **Machine identity field**: `device_id` — a source `device_id` (e.g. `"LDI-01"`), **not** a
  Twin CAD `asset_id`. No field in this response is a Twin asset identity.
- **State field**: `state` (0-3, numeric) + `machine_state` (string label,
  `RUN`/`IDLE`/`DOWN`/`UNDEFINED` only — `STATE_CODE_TO_MACHINE_STATE`, server.js:524-529).
- **Timestamps**: `last_seen` (ISO 8601, or `null`) per record; `queried_at` (ISO 8601) at the
  top level.
- **Freshness behavior**: `has_data`/`is_stale` booleans, computed in SQL from a documented
  5-minute threshold (migration `052-ldi-machine-latest-full-view.sql`) — `has_data=false` or
  `is_stale=true` forces `state=0` (`UNDEFINED`) BEFORE the alarm/`DOWN` branch is even
  evaluated (`STATE_SQL`'s own `CASE` order, read directly).
- **Error behavior**: the route's own `try/catch` returns `500 {"error":"internal error"}` on
  any query failure — fails closed, never a fabricated state. `queryDeviceState([])` short-
  circuits to `[]` when 0 devices are discovered.
- **Simulator/real distinction**: **none exposed in the payload itself.** Confirmed by reading
  the full route handler — no field states whether the underlying row is simulator-generated.
  The only in-payload tell found: a simulator-generated alarm's `related_log_id` is prefixed
  `"SIM-"` by Node-RED's `almsim_gen`, verified live (§5 below) — present only when an alarm
  exists, so its absence proves nothing.

No new API was invented — this step types and wraps the existing endpoint exactly as it
behaves today.

## 2. Typed API DTO

`services/factory-twin-3d-next/lib/operational-source-adapter.ts` — `ApiOperationalStateRecord`
+ `ApiOperationalStateResponse`, reproducing every field of the real response above, with
nullable/optional semantics preserved exactly as observed (never widened to non-null "because
it's normally present"): `board_no`/`total_board`/`mo`/`factory`/`last_seen` are all
`T | null` (confirmed live: all four are `null` together whenever `has_data` is `false`).
`alarm.logdate_ms` stays a `string` (the pg driver serializes the underlying `BIGINT` as a
numeric string — never silently widened to `number`, which could lose precision on a large
enough value). `machine_state` stays an un-narrowed `string` at the DTO layer specifically so
an unrecognised value can reach the adapter rather than being silently rejected or coerced by
the parser.

Real captured sample (live, `docker exec ims-factory-twin-3d`), reproduced verbatim as a test
fixture, not invented:

```json
{
  "device_id": "LDI-01", "state": 3, "machine_state": "DOWN",
  "state_label": "Down", "state_color": "#ef4444",
  "board_no": 69, "total_board": 184, "mo": "MO-459647", "factory": "2",
  "has_data": true, "is_stale": false, "last_seen": "2026-09-14T02:31:06.874Z",
  "alarm": { "count": 1, "owner": "Maintenance", "elapsed": "3m",
             "related_log_id": "SIM-01-1789352838756-31", "logdate_ms": "1789352840681" }
}
```

and, for a discovered-but-dataless device:

```json
{
  "device_id": "LDI-A01", "state": 0, "machine_state": "UNDEFINED",
  "state_label": "Undefined", "state_color": "#94a3b8",
  "board_no": null, "total_board": null, "mo": null, "factory": null,
  "has_data": false, "is_stale": false, "last_seen": null, "alarm": null
}
```

`parseApiOperationalStateResponse()` validates every field's type (hand-rolled, matching this
codebase's existing convention — `wire.js`'s `fromEnum()`, `mapping.js`'s
`validateMappings()` — rather than adding a schema library for one endpoint) and fails closed
(`{ ok: false, error }`) on any structural mismatch, never a silent pass-through of malformed
data.

## 3. Adapter architecture

```
/api/state
   |
ApiOperationalStateResponse (DTO, §2)
   |
ApiOperationalStateSource.fetch()   -- validates, throws on any failure (fail closed)
   |
adaptOperationalState()             -- identity-gated (§4), never guesses
   |
OperationalStateResolution per asset  -- Step 1's own domain shape (data-quality.ts),
   |                                     the SAME type Step 6A's simulated adapter produces
(a future presentation layer, NOT built this step)
   |
R3F
```

`R3F must not call /api/state directly` (Section 8): grep-verified zero importers of
`operational-source-adapter` anywhere under `components/` or `app/`:

```
$ grep -rl "operational-source-adapter" services/factory-twin-3d-next/components services/factory-twin-3d-next/app
(no matches)
```

Everything lives in one file, deliberately: this repo's plain `node some.test.js` unit-test
convention (`tests/unit/lib/require-ts.js`) transpiles ONE file at a time with no cross-file
module resolution — the same reason Step 1's `domain/*.ts` files keep every cross-file
reference `import type` only (erased at transpile, never emitted as a runtime `require`). This
file goes one step further: the one runtime value it needs from elsewhere (the 8-state
vocabulary, for unknown-state detection) is reproduced exactly rather than imported, the same
"reproduced, not imported" precedent Step 6A's own `hashString()` already set for this exact
constraint. Verified directly: `requireTs()` loads the file standalone with no resolution
error.

## 4. Identity mapping gate — the most important rule, enforced literally

`ConfirmedDeviceMapping.assetIdToDeviceId: ReadonlyMap<string, string>` is the ONLY input
`adaptOperationalState()` consults for identity. No array index, no alphabetical/positional
order, no fuzzy name match, no nearest-coordinate, no machine-number guess — grep-confirmed:
the function never reads an array index as an identity, never sorts or compares asset labels,
never touches position/coordinate fields at all (it doesn't even receive them — its signature
is `(assetIds: string[], mapping, sourceResult)`, no geometry in scope). An asset with no
`assetIdToDeviceId` entry resolves to `quality: 'NO_DATA'`, `reason: 'no confirmed device
mapping for this asset'` — never a plausible-looking state.

This module does not read `private/floor1-asset-mapping.json` itself (keeps it pure/testable
without touching the legacy service's filesystem); a real future caller would read it exactly
the way `server.js`'s own `loadPrivateAssetMapping()` already does, filtered to `CONFIRMED`
entries, and pass the result in.

**0/431 verified unchanged**, not artificially preserved — `EMPTY_MAPPING` (the real content of
this deployment's own mapping file, per Step 6B) run through both `adaptOperationalState()`
(431 assets → 431 `NO_DATA` records) and `computeMappingCoverage()` (`confirmed: 0, total: 431,
coveragePercent: 0`), asserted in the unit suite (§7).

## 5. Simulator detection

`detectSourceQuality()`: an explicit `hint.declared` always wins (the only trustworthy signal,
since the payload itself carries none). Absent a hint, the sole heuristic is the `"SIM-"`
`related_log_id` prefix — **verified live against the real production container just now**:

```
detected sourceQuality (no hint, live capture): SIMULATED
```

(The live capture used for this measurement happened to include an active simulator-generated
alarm, so the heuristic correctly fired. A capture with no active alarm at all would correctly
resolve to `UNKNOWN` — absence of the signal proves nothing, and `UNKNOWN`, never `REAL`, is
the safe default per Section 5's own rule. Both branches are covered in the unit suite.)

`sourceQuality` is returned as a **separate, source-wide** field on
`AdaptOperationalStateResult`, deliberately not folded into each record's own `quality` axis
(`data-quality.ts`'s own header comment: keeping independent quality axes apart is the entire
point of that file). A caller must treat `quality: 'VALID'` at `sourceQuality: 'UNKNOWN'` as
real-**shaped** but **not confirmed real** — which is exactly why this step performs no
production enablement regardless of what any single record's `quality` says.

## 6. Freshness — reused, not reinvented

No second timeout was created. `is_stale`/`has_data` are read straight from the API (already
computed against the existing, documented 5-minute threshold, §1) and drive `quality` directly:
`has_data=false → NO_DATA`, `is_stale=true → STALE`. Both are checked BEFORE a record's
`machine_state` is trusted, so even a hypothetically malformed upstream record reporting
`is_stale=true` alongside `machine_state='DOWN'` still resolves to `STALE`, never a quality
that reads as a confirmed `DOWN` — a defensive, adapter-level guarantee independent of
`STATE_SQL` already enforcing the same rule in SQL (§1). Timestamp (`observed_at`) and source
status (`reason`) are both preserved on every record, never dropped.

## 7. Error semantics

| Condition | Result |
|---|---|
| HTTP non-2xx | `ApiOperationalStateSource.fetch()` throws → caller's `SourceFetchResult = { ok: false }` → every asset `UNAVAILABLE` |
| Invalid JSON | Throws `"...not valid JSON"` → same fail-closed path |
| Schema mismatch | `parseApiOperationalStateResponse` fails → `fetch()` throws `"...schema mismatch: ..."` → same fail-closed path |
| Empty `machines: []` | Valid, not an error — 0 records, every requested asset still resolves (`NO_DATA` if unmapped) |
| No confirmed mapping | `NO_DATA` (identity-layer fact, source itself is fine) |
| Mapped device absent from response | `UNAVAILABLE` (that specific device wasn't returned) |
| Stale source row | `STALE` |
| Simulator-detected source | `SIMULATION` |
| Unrecognised `machine_state` string | `UNDEFINED` (mirrors `resolveMachineState()`'s own "anything unrecognised → UNDEFINED" rule exactly) |

**None of these ever produce `DOWN`.** Verified by the unit suite's own dedicated assertions
(§9), not merely by code inspection.

## 8. Mapping coverage metrics

`computeMappingCoverage({ totalMachines, mapping, sourceDeviceIds })` — pure, no I/O:

```
confirmed = 0
total = 431
coveragePercent = 0
unmappedMachines = 431
```

Matches Step 6B's own live-measured finding exactly (`/api/physical-overlay`'s
`counts.confirmed: 0`) — not a coincidence, the same real, empty mapping file. Duplicate
detection verified with a synthetic 2-assets-to-1-device fixture (`duplicateDeviceMappings: 1`,
unit suite).

## 9. Performance

Measured against a REAL, live-captured `/api/state` response (23 machines, 6,071 bytes),
`docker exec ims-factory-twin-3d`, 5 sequential requests, just now — not reused from Step 6B's
own measurement, a fresh one for this step:

```
latencies_ms: [82, 69, 59, 57, 54]
payload size: 6,071 bytes
```

This module's own validation+mapping cost, measured via `measureAdaptPerformance()` against
that same captured payload, mapped against all 431 Twin assets:

```
validationMs: 2
mappingMs: 0
recordCount: 431
payloadBytes: 6071
```

No optimization attempted — this step is discovery/architecture only, per its own instruction.
The network round trip (52-82ms across Step 6B and this step's own fresh measurement) dominates
entirely; the adapter's own parse+map cost is negligible (≤2ms) even at the full 431-asset
scale.

## 10. Security / access boundary

Unchanged from Step 6B's own finding (re-verified, not re-derived): `/api/state` is proxied by
`proxy/nginx.conf:103-107` behind `auth_request /auth-check` (Grafana session cookie). This new
adapter module makes no network call itself in this step — it is never invoked by any running
code path, so it introduces no new network exposure of any kind.

## 11. Why production enablement remains blocked

Unchanged from Step 6B's own conclusion: 0.0% CAD-asset-to-device identity mapping coverage
(§4/§8, re-verified this step, not just cited) and the current deployment's data mode being
simulator-fed (re-confirmed live, §5 — the fresh capture's own alarm carried a `"SIM-"`
`related_log_id`). Neither condition changed between Step 6B and this step, and neither is
something this adapter (or this migration) can fix — both require real evidence-mapping work
and a data-mode switch, outside this migration's scope (Step 6B's own conclusion, restated
here because it still governs this step's own non-enablement).

## 12. Tests

`tests/unit/factory-twin-operational-source.test.js` — 27 assertions, 27 passed. Covers: valid
DTO parsing, 6 distinct schema-mismatch/invalid-input cases (all fail closed), 4
`ApiOperationalStateSource` cases (valid/HTTP-failure/invalid-JSON/schema-mismatch), 3
simulator-detection cases (signature present, absent, explicit hint), 4 identity-mapping-gate
cases (unmapped, mapped, mapped-but-absent, full 431-asset zero-coverage), 2 freshness cases
(no-data, stale-with-a-hypothetically-malformed-DOWN-value), 1 source-failure case (every asset
`UNAVAILABLE`, never `DOWN`), 1 unknown-state case, 2 mapping-coverage cases
(duplicate/no-duplicate), 1 performance-instrumentation sanity case.

Full regression re-run, all green (one Step 4 `/r3f-spike` flake on first run, documented as a
known pre-existing flake since Step 4/5F — re-run clean; this step touched nothing in that
route or its `TwinViewport.tsx`):

| Suite | Result |
|-------|--------|
| `factory-twin-next-shell.js` (Step 3) | 30 passed |
| `factory-twin-r3f-spike.js` (Step 4) | 45 passed (clean re-run) |
| `factory-twin-r3f-machines.js` (Step 5B) | 41 passed |
| `factory-twin-r3f-selection.js` (Step 5C) | 50 passed |
| `factory-twin-r3f-camera.js` (Step 5D) | 66 passed |
| `factory-twin-r3f-layers.js` (Step 5E) | 69 passed |
| `factory-twin-r3f-scene-orchestration.js` (Step 5F) | 76 passed |
| `factory-twin-r3f-operational-state.js` (Step 6A) | 40 passed |
| `factory-twin-operational-source.test.js` (Step 6C, unit) | 27 passed |

`npm run typecheck` (services/factory-twin-3d-next) clean.

## Acceptance criteria

- [x] `/api/state` schema typed exactly (§2)
- [x] Adapter separate from R3F (§3, grep-verified zero importers)
- [x] Simulator source identifiable (§5, verified live)
- [x] No fake identity mapping (§4)
- [x] 0/431 remains 0/431 (§4/§8, re-verified this step)
- [x] Stale never becomes DOWN (§6, defensively guaranteed + tested)
- [x] Errors fail closed (§7, tested)
- [x] `NO_DATA` and `UNAVAILABLE` remain distinct (§7)
- [x] Production behavior unchanged (nothing imports this module)
- [x] All tests pass (27/27 unit + full Playwright regression)
- [x] No legacy Factory Twin changes (`git diff --stat` empty for `services/factory-twin-3d/`)
- [x] No DB/nginx/Grafana changes (`git diff --stat` empty for `database/`, `postgres/`, `proxy/`, `monitoring/grafana/`)

Mapping coverage remains 0% — per this step's own rule, **not a failure**:

## Verdict

**ADAPTER READY — PRODUCTION DATA MAPPING NOT READY.**
