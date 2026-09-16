# Floor 1 Confirmed Mapping Acquisition Plan

Read-only planning document. Determines exactly what real evidence is required to move any of
the current 431 assets from `UNMAPPED` toward `CONFIRMED`. No runtime/application change, no
fabricated value, no live operational state — `main`, PR #22, legacy Factory Twin, the Next.js
service runtime, R3F renderer, nginx, Grafana, database schema, and GitHub Actions billing are
all untouched (`git diff --stat` confirmed empty for all of them). Coverage remains exactly
0/431 = 0.0%, re-verified live, not assumed carried over from Step 7/6D/6E.

## 1-3. Required fields, availability, gaps — per asset

Reuses the exact 15-field schema `docs/evidence/FLOOR1_MASTER_DATA_REGISTRY.md` already
established (Step 7), reframed here around what CONFIRMED status specifically requires:

| Field | Required for CONFIRMED? | Available today | Gap |
|---|---|---|---|
| `factoryTwinAssetId` | Yes — the key every mapping is keyed on | **431/431** (`/api/floor-geometry`) | None |
| Spatial data (position/orientation/footprint/zone) | Context only, not itself identity evidence | **431/431**, varying confidence (Step 7: 269 high / 88 medium / 74 low) | None — already CAD-authoritative |
| `equipment ID` (logical, `mes_machine_id`) | Optional — `lib/mapping.js` accepts a CONFIRMED record with EITHER `ims_device_id` OR `mes_machine_id` (or both) | **0/431** | No MES integrated anywhere in this repository (Step 6B/7) |
| `physical asset ID` (Step 6E's `PhysicalAssetId`) | Not required by the legacy engine; recommended by Step 6E's own canonical model for replacement tracking | **0/431** | No source populates it — a NEW concept this migration introduced, not yet backed by any real registry |
| `device ID` (`ims_device_id`) | Yes, at least one of this or `mes_machine_id` | **0/431** | No confirmed device correspondence exists (Step 6B/6D/6E/7, re-verified this step) |
| `source system` (Step 6E's `SourceSystemId`) | Recommended, not required by the legacy engine | **0/431** | Same — nothing to attribute a source to yet |
| Provenance (`source`, `source_record`, `verified_at`, `verified_by`, `confidence`) | **Required for CONFIRMED** — `lib/mapping.js` rejects a `confirmed` record missing any of `source`/`source_record`/`verified_at` | **0/431** | No evidence has ever been recorded |

**7 of 7 identity-specific fields are 0/431** — spatial data and the Twin's own id are the only
fields with real coverage, matching Step 7's own finding exactly, re-verified live this step
(not carried over as an assumption).

## Real sample — 3 of 431, showing the exact current shape (no value fabricated)

| Factory Twin Asset | Spatial Data | Equipment ID | Physical Asset ID | Device ID | Source System | Evidence | Status |
|---|---|---|---|---|---|---|---|
| `EQP-F1-0001` | position (62.96, 0, -40.72), rot 0°, `MEASURED_CAD`, confidence `medium`, zone `FZ-F1-0005` | — | — | — | — | — | `UNMAPPED` |
| `EQP-F1-0002` | position (79.05, 0, -46.92), rot 180°, `UNRESOLVED` footprint, zone `FZ-F1-0014` | — | — | — | — | — | `UNMAPPED` |
| `EQP-F1-0025` | position (72.79, 0, -45.19), rot 0°, `UNRESOLVED` footprint, `OUTSIDE_ROOM` | — | — | — | — | — | `UNMAPPED` |

Every one of the 431 rows follows this exact shape today — identity columns uniformly empty,
`UNMAPPED` — an aggregate table, not a 431-row dump repeating the same "—" 2,585 times (7
identity columns × 431 rows), for the same reason Step 7's own registry made the same choice.

## 4. Authoritative source per missing field

| Missing field | Candidate authoritative source(s) | Current status of each |
|---|---|---|
| `device ID` | An approved registry, MES, SCADA, PLC/OPC-UA gateway, vendor device registry, or a manually-approved site record (this step's own allowed provenance categories, matching Step 6E's `ProvenanceCategory`) | **None integrated.** The `devices` table (23 real rows, Step 6B/6D) is a device REGISTRY, not identity evidence — it asserts a device exists, never which CAD asset it occupies (Step 7's own finding, re-confirmed). |
| `equipment ID` (logical) | An MES export (`lib/mes-import.js` is a real, tested, never-wired import BOUNDARY built for exactly this — Step 6B's own audit) | **No real export exists.** `mes-import.js`'s own header: "no real export exists yet." |
| `physical asset ID` | A physical asset register (nameplate/serial tracking) OR a site survey that separately records the physical unit occupying a CAD position | **No such register exists in this repository.** Would need to be created by whoever owns physical floor inventory — outside this migration's own scope. |
| `source system` | Declared alongside whichever of the above actually supplies a `device ID`/`equipment ID` | Follows from the same gap — nothing to attribute yet. |
| Provenance | Whoever performs the verification (a named person or an approved process) | N/A until a candidate relationship exists to verify. |

**The one authoritative path this repository already has real, tested code for** is
`lib/mes-import.js` → `private/floor1-asset-mapping.json`. It requires a real MES export file
this repository has never received — not a code gap, a data-supply gap, matching Step 6B's own
audit conclusion exactly.

## 5. Evidence / provenance requirements

Unchanged from the real, unmodified `lib/mapping.js` engine (re-read this step, not assumed):
a `confirmed` record MUST carry `source`, `source_record`, and a valid ISO-8601 `verified_at`,
and MUST assert at least one of `ims_device_id`/`mes_machine_id` — enforced by
`validateMappings()`, which fails the WHOLE file closed (not just the one bad record) if any
requirement is missing. Step 6E's own `Provenance.category` (7 enumerated categories, §3 of
`FACTORY_TWIN_CANONICAL_IDENTITY_CONTRACT.md`) additionally recommends recording WHICH kind of
source it was and a `confidence` grade — richer than the legacy engine strictly requires, never
contradicting it.

## 6. Verification workflow (proposed, not implemented)

```
1. PROPOSE   -- a candidate asset_id <-> device_id (and/or mes_machine_id) relationship is
                identified from a real source (site survey, MES export, vendor registry).
                Lifecycle: UNMAPPED -> CANDIDATE. No production effect at this stage.
2. EVIDENCE  -- the proposer attaches source/source_record/verified_at/verified_by/confidence.
                A CANDIDATE with no attached evidence never advances (Section 4's own rule,
                Step 6E: "Do NOT allow CANDIDATE -> production REAL").
3. REVIEW    -- a second party (not the proposer) checks the evidence actually supports the
                claim -- this step is a PROCESS control this plan recommends, not something
                any code in this repository currently enforces or could enforce automatically.
4. PROMOTE   -- on review approval, lifecycle: CANDIDATE -> CONFIRMED. Two independent records
                confirming the SAME device (or the same asset) is not a "pick" -- lib/mapping.js
                already fails the whole file closed on this (re-verified, Step 7's own tests).
5. RETIRE    -- if a physical device is later replaced or a mapping is found stale:
                lifecycle: CONFIRMED -> RETIRED (Step 6E's own model). A RETIRED record is
                NEVER production-eligible again (`isProductionEligible()`, re-verified unit-
                tested, Step 6E) -- a fresh CANDIDATE/CONFIRMED cycle is required for the
                replacement, matching Section 5's own goal (a physical swap must never silently
                inherit the old mapping's trust).
```

## 7. Mapping approval states

Reuses Step 6E's own 6-state lifecycle exactly, no new vocabulary introduced this step:

```
UNMAPPED   -- no relationship asserted (431/431 today)
CANDIDATE  -- proposed, evidence not yet reviewed/approved
CONFIRMED  -- reviewed, provenanced, production-eligible
AMBIGUOUS  -- two or more sources disagree, never auto-resolved
RETIRED    -- was CONFIRMED once, superseded (a physical replacement, most commonly)
INVALID    -- fails structural validation entirely
```

`isProductionEligible()` (Step 6E, re-verified this step by reading the unmodified source, not
re-running new tests — no application code changed) admits exactly one combination:
`lifecycle === 'CONFIRMED' && provenance !== null`.

## 8. How a confirmed mapping enters `private/floor1-asset-mapping.json`

The file's own canonical shape (`{"mappings": PhysicalIdentityMapping[]}`,
`lib/mapping.js`'s own JSDoc) is unchanged and requires no new code to accept real entries —
`server.js`'s `loadPrivateAssetMapping()` already reads it, validates it via
`validateMappings()`, and fails closed (every asset `UNRESOLVED`) on any structural problem.
Writing the file is a data-operations action (whoever owns the private, gitignored
production copy of this file edits it, following the workflow in §6) — not a code change this
migration performs, and not something this plan's own read-only scope attempts.

## 9. How `/api/state` will consume the mapping later

Unchanged, already built (Step 6C), still unwired (re-verified: zero importers under
`components/`/`app/`, same as every prior step): `ConfirmedDeviceMapping.assetIdToDeviceId`
(a `ReadonlyMap<FactoryTwinAssetId, DeviceId>`) is the ONLY identity input
`adaptOperationalState()` accepts — built by a future caller from the real, validated FT-14
file's own `CONFIRMED` entries (filtered exactly the way `server.js`'s
`loadPrivateAssetMapping()`/`/api/physical-overlay` already do), never guessed. Each Twin
asset resolves independently through this map — no all-or-nothing coupling, which is exactly
what makes §10's partial rollout safe.

## 10. How partial rollout works safely

Architecturally already proven, not merely planned: `adaptOperationalState()` resolves EVERY
asset independently by looking it up in `assetIdToDeviceId` (Step 6C's own per-asset loop,
unit-tested). An asset with a real, confirmed entry resolves through the source normally; an
asset with NO entry resolves to `NO_DATA` — never `UNAVAILABLE`, never `DOWN`, never blocked by
some OTHER asset's mapping state. A future rollout can therefore confirm 1 asset, or 10, or all
431, and every unconfirmed asset in the same deployment keeps reading exactly as honest as it
does today. Step 6D/6E's own readiness functions already encode the SAME
distinction one level up: `computeReadinessDecision()`/`computeCanonicalReadiness()` can answer
`PARTIALLY_READY` for a subset of `productionEnabledAssetIds` while the rest stay `NOT_READY`
— re-verified this step by re-reading (not re-running new tests against) the unmodified Step
6D/6E source.

## Validation performed this step (read-only)

```
$ curl -s http://localhost:4196/api/floor-geometry | ... # re-verified: 431 assets, 0 mapped
$ node -e "require('./services/factory-twin-3d/lib/mapping').validateMappings(...)"
  { ok: true, counts: { total: 0, confirmed: 0, ... } }   # re-verified: FT-14 file still empty
$ git diff --stat -- services/factory-twin-3d/ database/ postgres/ proxy/ monitoring/grafana/ \
    services/factory-twin-3d-next/
  (empty)
```

No new test file was needed — this plan cites and re-verifies Steps 6C/6D/6E/7's own already-
tested code and data, and adds no new runtime logic of its own to test.

## Acceptance

- [x] Required fields per asset documented (§1-3)
- [x] Available vs. missing fields quantified, live-reverified (§1-3)
- [x] Authoritative source named per gap (§4)
- [x] Evidence/provenance requirements stated, matching the real unmodified engine (§5)
- [x] Verification workflow proposed (§6)
- [x] Mapping approval states — reused, not reinvented (§7)
- [x] Path into `private/floor1-asset-mapping.json` documented (§8)
- [x] Future `/api/state` consumption path documented (§9)
- [x] Safe partial rollout explained, architecturally grounded not asserted (§10)
- [x] Coverage remains 0/431 = 0.0%, re-verified live
- [x] No fabricated value anywhere in this document
- [x] No runtime/application/database/nginx/Grafana/CI change

## Verdict

**FLOOR 1 CONFIRMED MAPPING ACQUISITION PLAN — DOCUMENTED.**
**Coverage: 0.0% (0/431), unchanged.**

The path from 0/431 to any real coverage runs through data this migration cannot generate for
itself: a real device registry correspondence, a real MES export, or a real site survey — each
already named as the exact blocker in Step 6B/6D/6E/7, restated here as a concrete acquisition
plan rather than a repeated audit finding.
