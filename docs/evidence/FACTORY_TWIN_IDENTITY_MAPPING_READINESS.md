# Factory Twin — Step 6D: Machine Identity Mapping / Data Readiness Gate

Determines whether a trustworthy machine/device identity mapping can be established between
`/api/state`'s source devices and the Factory Twin's 431 physical assets. A data-readiness
gate, not an implementation step: zero application/database/nginx/Grafana changes
(`git diff --stat` confirmed empty for all of them), live operational state stays
disconnected.

## 1. Mapping candidate inventory

Every identity relationship found repository-wide, read in full, not guessed:

| Source | Source ID | Factory Twin ID | Evidence | Confidence |
|---|---|---|---|---|
| `private/floor1-asset-mapping.json` (FT-14) | — | — | File exists, `{"mappings":[]}` — 0 records, verified live this step | **UNMAPPED** (0 entries — no candidate to classify) |
| `public.devices` (`device_type='ldi', enabled=true`) | `LDI-01`..`LDI-10`, `LDI-A01`, `LDI-A02`, `LDI-B07`, `ldi-a03`..`ldi-a06`, `ldi-b01`..`ldi-b06` (23 rows, re-queried live this step) | — | A device REGISTRY, not an asset-mapping table — it asserts a device exists and is enabled, nothing about which CAD asset (if any) it occupies | **UNMAPPED** for every row — a registry entry is not itself a relationship to a Twin `asset_id` |
| `lib/mes-import.js` | — | — | A real, tested identity-import BOUNDARY for "a future structured export from the external manufacturing system" — never invoked by any running code path (re-confirmed: no caller in `server.js`, grep-verified) | **UNMAPPED** — produces no candidates, none exist to import |
| `lib/eap-map.js` (EAP cells) | 210 cell ids | — | A SEPARATE namespace (EAP schematic cells, not physical CAD assets) — every cell's own wire contract states `status: 'UNKNOWN'`, `status_reason: 'no authoritative IMS mapping exists for this cell'` | **N/A to this audit** — not a Factory Twin asset candidate at all, a different identity space entirely (Step 6B's own scoping) |
| Node-RED flows (`nodered_data/flows/*.json`) | — | — | `ldi_ingestion.json`/`ldi_simulator.json`/`ldi_alarm_simulator.json` — none contains an asset-id-to-device-id lookup table (grep-confirmed: 0 hits for `asset_id` in any flow file) | **UNMAPPED** — no candidate relationship present |
| Grafana dashboard JSON (`monitoring/grafana/dashboards/**`) | — | — | References to `eqp_id`/`device_id` are query variables and panel bindings, not an identity-assertion source — no dashboard asserts "this CAD asset is this device" | **N/A** — not an identity source, a presentation layer over the same LDI data already inventoried in Step 6B |
| `lib/wire.js` (`projectEquipment`) | — | — | Reads `ims_device_id` FROM the mapping engine's own resolved output (`mappingLib.resolveMapping`) — it is a CONSUMER of the mapping, not a source of one | **N/A** — not an independent candidate, downstream of FT-14 |

**Zero repository sources assert a real asset_id ↔ device_id relationship.** This matches, and
is not contradicted by, Step 6B's own audit — this step searched specifically for identity
RELATIONSHIPS (not operational-state sources generally) and found the same result from a
different angle.

## 2. Mapping rules applied

Only `private/floor1-asset-mapping.json`'s own `CONFIRMED` lifecycle status, validated by the
existing, unmodified legacy engine (`services/factory-twin-3d/lib/mapping.js`'s
`validateMappings()`), counts as `CONFIRMED` for this audit. Verified this step, not assumed:

```
$ node -e "console.log(require('./services/factory-twin-3d/lib/mapping').validateMappings(
    JSON.parse(require('fs').readFileSync('services/factory-twin-3d/private/floor1-asset-mapping.json')).mappings
  ))"
{ ok: true, errors: [], counts: { total: 0, unresolved: 0, confirmed: 0, conflicting: 0, deprecated: 0 } }
```

No name similarity, coordinate, floor-position, ordering, visual-similarity, or inferred-
machine-number matching was performed or considered anywhere in this audit — `lib/mapping.js`'s
own header explicitly documents these as "deliberately NOT provided, because each is a way of
manufacturing identity that would look like data afterwards," and this step adds nothing that
contradicts that.

## 3. Mapping coverage

```
total_factory_twin_assets = 431   (re-verified live via /api/floor-geometry, non-duplicate equipment)
confirmed                 = 0
ambiguous                 = 0
unmapped                  = 431
duplicates                = 0
invalid                   = 0
coverage_percent          = 0 / 431 = 0.0%
```

Computed via the new `computeCoverageCounts()` (`services/factory-twin-3d-next/lib/
identity-mapping-readiness.ts`), asserted against the REAL, live-read FT-14 file content in
`tests/unit/factory-twin-identity-mapping.test.js` — not a hardcoded assumption. Unchanged from
Step 6B/6C's own measurements of the same underlying fact, re-derived independently this step
and matching exactly, as expected (nothing in this repository has added a mapping since).

## 4. Bidirectional validation

With 0 candidates, `detectBidirectionalAnomalies()` reports every one of the 23 real source
devices as `ORPHAN_SOURCE` and every one of the 431 real Twin assets as `ORPHAN_ASSET` — the
mathematically correct, expected result at 0% coverage, not evidence of a defect (an orphan is
only a genuine anomaly once SOME mappings exist and others don't; the readiness decision
function accordingly does not treat orphan counts as "critical" anomalies on their own — see
§6).

No `ONE_SOURCE_MULTIPLE_MACHINES`, `ONE_MACHINE_MULTIPLE_SOURCES`, or `DUPLICATE_MAPPING`
anomaly exists today, because zero `CONFIRMED` candidates exist for any fan-out to occur
between. All three detection paths are exercised and proven correct against synthetic fixtures
in the unit suite (§9) — this audit does not merely trust the code is correct, it demonstrates
it against constructed cases the real data cannot currently exercise (0 confirmed mappings
means these anomaly kinds are currently unreachable in production, by construction).

The legacy engine's own equivalent, stronger guarantee was also directly exercised, not just
cited: `validateMappings()` correctly REJECTS (fails the whole file closed) both (a) a
`confirmed` record asserted with no `source`/`source_record`/`verified_at` provenance, and (b)
two `confirmed` records both claiming the same `ims_device_id` — both verified live against the
real, unmodified module this step (`tests/unit/factory-twin-identity-mapping.test.js`).

## 5. Identity stability

| Identifier | Stable across API calls? | Stable across process/DB/simulator/container restart? |
|---|---|---|
| `device_id` (`public.devices.device_id`) | **Yes, verified** — 5 sequential `/api/state` calls (Step 6C) and a fresh independent re-query this step both returned the identical 23-row, identically-named device set | **Inferred from schema, not directly observed via an actual restart this step** — `device_id` is a persisted column value inserted by migration files (040's mock registration, plus the real-device rows), not generated at request time or process startup; `refreshDevices()` re-reads the SAME table rows on each refresh cycle rather than re-deriving new ids. This is a real, evidence-based argument, disclosed as inference rather than a live restart test — restarting the production-image container purely to observe this was judged an unnecessary, avoidable production-adjacent action for a data-readiness AUDIT, not something Step 6D's own hard rules require |
| Twin `Asset.id` (`EQP-F<n>-nnnn`) | **Yes, verified** — re-queried `/api/floor-geometry` this step, same 431 non-duplicate ids as every prior step (5A-6C) | **Yes, by construction** — derived deterministically from the private CAD geometry file's own handles (`wire.js`), not regenerated per request; unchanged across this entire multi-week migration's own repeated measurements |

**"Looks deterministic" was not assumed to mean "stable"** (this step's own explicit warning):
Step 6A's own SIMULATED per-asset hash IS deterministic (same input → same output) but is
explicitly NOT a stable identity source — it's a presentation-only stand-in, recomputed fresh
from `asset.id` on every render, carrying no persisted identity of its own. `device_id`, by
contrast, is a genuine persisted database column, which is the actual basis for the stability
claim above — the two are not conflated here.

## 6. Data readiness decision

```
IDENTITY MAPPING — NOT READY
Coverage: 0.0% (0 / 431)
```

Per `computeReadinessDecision()` (§3's counts, `criticalAnomalyCount: 0`,
`sourceIsSimulatorOnly: true`, no `agreedCoverageTargetPercent` ever defined anywhere in this
repository): `confirmed === 0` alone is sufficient to force `NOT_READY` — the source being
simulator-fed today (Step 6B/6C's own finding, unchanged) would independently force the same
result even hypothetically. This is not a forced or padded result: every one of the three
independent `NOT_READY` triggers this step's own rules define is genuinely true right now, and
none was engineered to be true.

**Exact blocker**: no authoritative CAD-asset-to-device relationship exists anywhere in this
repository (§1) — not a validation bug, not a coverage-threshold argument, not an ambiguous-
mapping problem. There is nothing to validate because nothing has been asserted.

## 7. Production semantics — unchanged, re-verified

`REAL source + no mapping → UNAVAILABLE/NO_DATA`, never `DOWN`: unchanged from Step 6C's own
adapter (`resolveReal()` always `UNAVAILABLE`; `adaptOperationalState()`'s own identity gate
resolves an asset with no confirmed mapping to `NO_DATA`, never a guessed state) — re-verified
by re-running Step 6C's own 27-test suite this step (§9), not merely re-asserted from memory.

## 8. Performance

Mapping computation itself, measured against the real 431-asset/0-candidate/23-device scale
(`tests/unit/factory-twin-identity-mapping.test.js`'s own real-scale test): `detectBidirectional
Anomalies()` over 431 assets + 23 devices with 0 candidates completes well under 1ms (no
`setTimeout`/async boundary in the function at all — a synchronous loop over 454 items).
No production integration attempted or needed — this step measures its own new, disconnected
code only.

## 9. Tests

`tests/unit/factory-twin-identity-mapping.test.js` — 20 assertions, 20 passed. Covers: the
REAL 0/431 baseline (against the live FT-14 file, not a stub), a correct confirmed mapping,
duplicate source (`ONE_SOURCE_MULTIPLE_MACHINES`), duplicate target
(`ONE_MACHINE_MULTIPLE_SOURCES`), exact duplicate (`DUPLICATE_MAPPING`), an `AMBIGUOUS`
candidate never counted as confirmed, unmapped source/asset (`ORPHAN_SOURCE`/`ORPHAN_ASSET`,
including the real 23+431-scale case), a combined bidirectional-mismatch fixture, an `INVALID`
candidate never treated as confirmed, two direct exercises of the real legacy
`validateMappings()` engine (missing provenance, duplicate device claim — both genuinely
rejected, not simulated), and four `computeReadinessDecision()` cases (partial coverage with no
target → `PARTIALLY_READY` never `READY`; a critical anomaly forcing `NOT_READY` even at high
coverage; a simulator-only source forcing `NOT_READY` even with confirmed mappings; coverage
meeting an explicitly-supplied agreed target producing `READY` only when a real target exists).

Existing suites re-run, no assertion changed or weakened:

| Suite | Result |
|-------|--------|
| `factory-twin-operational-source.test.js` (Step 6C) | 27 passed |
| `factory-twin-mapping.test.js` (legacy `lib/mapping.js`) | 36 passed |
| `factory-twin-domain.test.js` (Step 1) | 15 passed |
| `factory-twin-wire.test.js` (legacy `lib/wire.js`) | 96 passed |
| `factory-twin-telemetry.test.js` (FT-15 physical overlay) | 29 passed |

`npm run typecheck` (services/factory-twin-3d-next) clean. `git diff --stat` empty for
`services/factory-twin-3d/`, `database/`, `postgres/`, `proxy/`, `monitoring/grafana/`.

## Acceptance criteria

- [x] Every mapping candidate inventoried (§1)
- [x] Authority documented (§2)
- [x] Confirmed-mapping criteria explicit, reused from the existing legacy engine, not
      reinvented (§2)
- [x] Bidirectional integrity checked, both against synthetic fixtures and the real legacy
      engine (§4)
- [x] Duplicate/ambiguous mappings measured (§3/§4)
- [x] Coverage quantified (§3)
- [x] Current 0/431 verified live, still applicable (§1/§3)
- [x] Production behavior unchanged (§7, re-verified via existing test re-run)
- [x] No fake mapping created
- [x] Tests pass (20/20 new + all existing re-run clean)
- [x] Evidence published

## Verdict

**IDENTITY MAPPING — NOT READY**
**Coverage: 0.0% (0 / 431)**

Exact blocker: no authoritative CAD-asset-to-device identity relationship exists anywhere in
this repository today (§1/§6) — a data/evidence gap, not a code or architecture gap. The
adapter built in Step 6C is ready to consume a real mapping the moment one exists; this step's
own job was determining whether one does, and it does not.

---

## Addendum (Step 6E — Canonical Equipment Identity & Master-Data Contract)

Step 6E gave the gap this doc identifies a typed vocabulary to be closed in
(`FactoryTwinAssetId`/`EquipmentId`/`PhysicalAssetId`/`DeviceId`/`SourceSystemId`, an explicit
6-state lifecycle, required provenance for `CONFIRMED`) without asserting any real relationship
— the 0/431 result above is unchanged, independently re-verified against the same live FT-14
file. A stricter readiness function (`computeCanonicalReadiness()`, `PARTIALLY_READY` gated
behind an explicit future-policy flag) reaches the same `NOT_READY` conclusion this doc already
reports. Full detail in `docs/evidence/FACTORY_TWIN_CANONICAL_IDENTITY_CONTRACT.md`.
