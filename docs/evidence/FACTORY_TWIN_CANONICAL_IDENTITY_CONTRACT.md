# Factory Twin — Step 6E: Canonical Equipment Identity & Master-Data Contract

Establishes a typed identity contract and readiness workflow for the master-data gap Step 6D's
own audit named as the exact blocker (no authoritative CAD-asset-to-device relationship exists
anywhere in this repository) — a vocabulary and validation layer, not a mapping. Zero real
relationships are asserted by this step; the 0/431 result is unchanged, re-verified, not
re-derived from anything new. No live operational state connected. Legacy Factory Twin, EAP,
LDI, Grafana, nginx, database: `git diff --stat` confirmed empty for all of them.

## 1. Identity concepts

Five distinct namespaces, grounded in vocabulary that already exists in this codebase rather
than invented from nothing — `services/factory-twin-3d/lib/mapping.js`'s own header already
names three (`asset_id`, `ims_device_id`, `mes_machine_id`) and explicitly refuses to collapse
them. This contract keeps that discipline and adds two concepts that 3-namespace model does not
yet distinguish:

| Type | What it identifies | Existing analog | New? |
|---|---|---|---|
| `FactoryTwinAssetId` | A CAD **position** — the Twin's own visual identity | `Asset.id` (Step 1), `asset_id` (`lib/mapping.js`) | No — reused exactly |
| `EquipmentId` | A **logical** unit as the manufacturing system understands it | `mes_machine_id` (`lib/mapping.js`) | No — reused exactly |
| `PhysicalAssetId` | A specific **physical unit** occupying a CAD position | — | **Yes** — see §5 |
| `DeviceId` | A real monitored/controlled device | `ims_device_id` (`lib/mapping.js`), `device_id` (`/api/state`, Step 6C) | No — reused exactly |
| `SourceSystemId` | WHICH external system asserted a relationship | — | **Yes** — see §3 |

Implemented as TypeScript branded types (`services/factory-twin-3d-next/lib/canonical-identity.ts`)
— a plain `string` cannot be assigned to any of them without going through an explicit
constructor (`asFactoryTwinAssetId()`, etc.), so a future caller cannot accidentally pass an
`EquipmentId` where a `DeviceId` was expected. This is a compile-time guarantee (`npm run
typecheck`), disclosed as such — at runtime the values are plain strings, same as they are
today.

## 2. Identity relationship

```
FactoryTwinAsset
      |
   Equipment          (KNOWN | UNKNOWN, independently)
      |
PhysicalAsset          (KNOWN | UNKNOWN, independently)
      |
   Device              (KNOWN | UNKNOWN, independently)
      |
SourceSystem           (KNOWN | UNKNOWN, independently)
```

Each link carries its own `{ status: 'KNOWN'|'UNKNOWN', id: T | null }` — never a nullable
string alone (Section 2's own rule: "do not use nullable strings without semantic meaning").
`isValidIdentityChain()` enforces the status/id pair stays consistent (`KNOWN` requires a
non-null id, `UNKNOWN` requires a null one) — a link that disagrees with itself is flagged
`INVALID_LINK`, not silently accepted.

Equipment can legitimately be `KNOWN` while PhysicalAsset/Device stay `UNKNOWN` — a logical
equipment identity may be asserted before its physical/device evidence exists. One-to-many is
supported where valid: a `PRODUCTION_LINE`'s multiple `PHYSICAL_STATION`/`PHYSICAL_COMPONENT`
children (already a real concept in `lib/mapping.js`'s own asset namespace, e.g.
`EQP-F1-0002-C01`) can share one logical `EquipmentId` while each keeps its own distinct
`FactoryTwinAssetId`.

## 3. Provenance

Required only for `CONFIRMED` (Section 3's own rule — "only where these concepts are actually
supported"):

```ts
interface Provenance {
  category: 'AUTHORITATIVE_REGISTRY' | 'APPROVED_CONFIGURATION' | 'MES' | 'SCADA'
          | 'PLC_OPC_UA_GATEWAY' | 'VENDOR_DEVICE_REGISTRY' | 'MANUAL_APPROVED_MAPPING';
  source: string;
  sourceRecordId: string;
  verifiedAt: string;   // ISO-8601
  verifiedBy: string;   // a person or an approved process name
  confidence: 'high' | 'medium' | 'low';
}
```

All 7 categories are, by definition, authoritative — an inferred relationship (name similarity,
position, ordering) never receives a `Provenance` object at all and therefore never reaches
`CONFIRMED`. `SourceSystemId` (§1) and `Provenance.source` are related but distinct: the former
identifies WHICH system in a relationship chain, the latter records the EVIDENCE that a
specific relationship is correct — a deployment could have `sourceSystem: KNOWN` (a device
genuinely comes from system X) while still lacking `Provenance` (nobody has verified THIS
specific device-to-asset pairing yet) — `SOURCE_MISMATCH` anomaly detection (§9) exists
specifically for the inverse case: a device declared without any source system at all.

## 4. Mapping lifecycle

Six states, explicitly reconciled against `lib/mapping.js`'s own 4-state `MappingStatus`
(which remains the ONLY engine that gates real production eligibility — this table is a
documentation/design-layer vocabulary, not a replacement):

| This contract | `lib/mapping.js`'s `MappingStatus` | Meaning |
|---|---|---|
| `UNMAPPED` | `unresolved` | No relationship asserted — the default |
| `CANDIDATE` | *(none)* | **New**: a proposed, unreviewed relationship — `lib/mapping.js` has no staging state at all |
| `CONFIRMED` | `confirmed` | Authoritative, provenanced |
| `AMBIGUOUS` | `conflicting` | Two or more records disagree, never auto-resolved |
| `RETIRED` | `deprecated` | Was confirmed once, superseded |
| `INVALID` | *(none)* | Fails structural validation entirely — same concept Step 6D's own `MappingConfidence` already uses |

`isProductionEligible(chain)` enforces Section 4's own hard rule literally: `CANDIDATE ->
production REAL` and `AMBIGUOUS -> production REAL` are impossible by construction — the
function returns `true` for exactly one condition, `lifecycle === 'CONFIRMED' && provenance !==
null`, verified for every other lifecycle value in the unit suite (§9).

## 5. Identity stability

| Identifier | Immutable? | Represents | Notes |
|---|---|---|---|
| `FactoryTwinAssetId` | Yes, by construction | A CAD **position** | Derived from the CAD file's own handles (`lib/wire.js`), unchanged across this entire migration's own repeated measurements (Steps 5A-6D all re-observed the same 431 non-duplicate ids) |
| `EquipmentId` | Expected stable | **Logical** equipment | An MES-level concept; this repository has none populated today (0 real `mes_machine_id` values exist) |
| `PhysicalAssetId` | **Deliberately NOT immutable** | A specific **physical unit** | The whole reason this type exists (§1) — `PhysicalAssetRecord.replacesPhysicalAssetId` models a replacement chain explicitly, so swapping the physical machine at a CAD position never has to touch `FactoryTwinAssetId` or `EquipmentId` |
| `DeviceId` | Stable while the device is in service | A real monitored device | Verified stable across repeated live `/api/state` calls (Steps 6B-6D); restart-level stability is schema-based inference (a persisted `devices` table row), disclosed as such, not directly observed via an actual container restart |
| `SourceSystemId` | Stable per system | Provenance attribution | Not yet populated anywhere (no real relationship exists to attribute) |

**The goal this section exists for**: when a physical machine is replaced, only
`PhysicalAssetId` changes. `FactoryTwinAssetId` (the CAD position) and `EquipmentId` (the
logical unit) both stay exactly as they were — a future integration reading `PhysicalAssetId`
as if it were the stable key would be the exact bug class this separation prevents.

## 6. Current dataset — measured, not manufactured

```
Factory Twin assets  = 431   (re-verified live, /api/floor-geometry, non-duplicate equipment)
confirmed mappings   = 0     (private/floor1-asset-mapping.json: {"mappings":[]}, re-verified live)
candidate mappings   = 0     (no real evidence exists to stage as a candidate)
ambiguous            = 0     (measured: 0 conflicting records in the real mapping file)
unmapped             = 431   (every asset, by omission)
```

Unchanged from Step 6D — re-derived independently this step via `computeCanonicalCoverage()`
against the same real, live FT-14 file content, not copy-pasted from the prior doc. Production
state remains `REAL -> UNAVAILABLE` (Step 6A/6C's own adapter, unmodified this step).

## 7. Readiness gate

`computeCanonicalReadiness()` is stricter than Step 6D's own `computeReadinessDecision()` on
purpose: `PARTIALLY_READY` is reachable ONLY when an explicit `partiallyReadyPolicy: true` flag
is supplied — a stand-in for Section 7's own words, "explicitly supported by a future product
policy." Without it, the function can only ever answer `READY` or `NOT_READY`, never a silent
middle ground. `READY` additionally requires, all simultaneously:

- an authoritative mapping source exists (`authoritativeSourceExists: true` — currently `false`,
  matches Step 6B/6C's own finding that the deployment's data mode is simulator-fed)
- every `productionEnabledAssetIds` entry has a `CONFIRMED` + provenanced chain
- zero anomalies of any kind from `validateIdentityChains()` (no ORPHAN-style noise-filtering
  in this vocabulary, unlike Step 6D's own anomaly set — any anomaly here blocks readiness)

Run against the real current state (0 chains, `authoritativeSourceExists: false`):
**`NOT_READY`** — the expected, unforced result Section 7 itself names.

## 8. Future integration contract

```
CanonicalIdentity  ->  OperationalSourceAdapter  ->  MachineStateRecord
```

`CanonicalIdentityResolver.resolve(factoryTwinAssetId): IdentityChain` is the typed interface a
future adapter would consume. `unmappedChain()` is the explicit, honest fallback — every link
`UNKNOWN`, `lifecycle: 'UNMAPPED'` — for any asset with no real chain record. **The
`device_id === machine.id` shortcut is impossible by construction**: nothing in this contract
computes a `DeviceId` from a `FactoryTwinAssetId` (or vice versa) by string equality, position,
or any derivation at all — a chain's `device` link is either an explicit `KNOWN` entry backed by
real evidence, or `UNKNOWN`. Step 6C's own `adaptOperationalState()` already independently
proves this discipline (it requires an explicit `ConfirmedDeviceMapping` parameter, re-verified
unchanged this step) — this contract gives that same discipline a canonical, richer vocabulary
for a future step to build the actual resolver against, without inventing the resolver itself.

### Illustrative example (NOT a real mapping — clearly labeled, not written to any production file)

```ts
// ILLUSTRATIVE ONLY -- demonstrates the shape a real CONFIRMED chain
// would have. No such chain exists in this deployment. Never written to
// private/floor1-asset-mapping.json or any other production file.
const illustrativeExample: IdentityChain = {
  factoryTwinAssetId: asFactoryTwinAssetId('EQP-F1-EXAMPLE'),
  equipment: { status: 'KNOWN', id: asEquipmentId('EXAMPLE-MES-MACHINE-001') },
  physicalAsset: { status: 'KNOWN', id: asPhysicalAssetId('EXAMPLE-PHYS-UNIT-A') },
  device: { status: 'KNOWN', id: asDeviceId('EXAMPLE-DEVICE-01') },
  sourceSystem: { status: 'KNOWN', id: asSourceSystemId('EXAMPLE-MES-SYSTEM') },
  lifecycle: 'CONFIRMED',
  provenance: {
    category: 'MANUAL_APPROVED_MAPPING',
    source: 'example approval workflow',
    sourceRecordId: 'EXAMPLE-TICKET-0001',
    verifiedAt: '2026-01-01T00:00:00.000Z',
    verifiedBy: 'example approver',
    confidence: 'high',
  },
};
```

## 9. Validation utilities & tests

`services/factory-twin-3d-next/lib/canonical-identity.ts` — pure, zero React/R3F dependency
(grep-verified: not imported by anything under `components/` or `app/`). `validateIdentityChains()`
detects every anomaly kind Section 9 names: `DUPLICATE_IDENTITY`, `DUPLICATE_DEVICE`,
`AMBIGUOUS_RELATIONSHIP`, `MISSING_PROVENANCE`, `RETIRED_IDENTITY_STILL_ELIGIBLE` (a guard
against a future bug in `isProductionEligible` itself, not a reachable real state given that
function's own logic — kept as an explicit, testable invariant anyway), `SOURCE_MISMATCH`,
`BIDIRECTIONAL_MISMATCH`, `INVALID_LINK`.

`tests/unit/factory-twin-canonical-identity.test.js` — 24 assertions, 24 passed. One test per
named anomaly kind, 4 production-eligibility cases (CANDIDATE/AMBIGUOUS/CONFIRMED-with-
provenance/CONFIRMED-without), 2 coverage cases (real 0/431 baseline + a mixed-lifecycle
fixture), 6 readiness-decision cases (real current state, no-authoritative-source override,
anomaly override, full READY path, partial coverage without policy → `NOT_READY`, partial
coverage with explicit policy → `PARTIALLY_READY`).

Existing suites re-run, zero assertions changed:

| Suite | Result |
|-------|--------|
| `factory-twin-operational-source.test.js` (Step 6C) | 27 passed |
| `factory-twin-identity-mapping.test.js` (Step 6D) | 20 passed |
| `factory-twin-mapping.test.js` (legacy `lib/mapping.js`) | 36 passed |
| `factory-twin-domain.test.js` (Step 1) | 15 passed |
| `factory-twin-wire.test.js` (legacy `lib/wire.js`) | 96 passed |
| `factory-twin-telemetry.test.js` (FT-15 physical overlay) | 29 passed |

`npm run typecheck` (services/factory-twin-3d-next) clean. `git diff --stat` empty for
`services/factory-twin-3d/`, `database/`, `postgres/`, `proxy/`, `monitoring/grafana/`.

## Acceptance criteria

- [x] Logical equipment separated from physical asset (`EquipmentId` vs `PhysicalAssetId`, §1)
- [x] Physical asset separated from source device (`PhysicalAssetId` vs `DeviceId`, §1)
- [x] Factory Twin asset identity remains distinct (`FactoryTwinAssetId`, §1)
- [x] Provenance model exists, required only for CONFIRMED (§3)
- [x] Mapping lifecycle exists, reconciled against the real legacy engine (§4)
- [x] Readiness gate is deterministic, PARTIALLY_READY explicitly gated (§7)
- [x] Current 0/431 remains unchanged, re-verified live (§6)
- [x] No fabricated mapping (§6, §10's own illustrative-only example)
- [x] No live telemetry enabled (production adapter untouched)
- [x] Tests pass (24/24 new + 6 existing suites re-run clean)
- [x] Legacy Factory Twin untouched (`git diff --stat` empty)

## Verdict

**CANONICAL IDENTITY CONTRACT — ESTABLISHED.**
**IDENTITY MAPPING — NOT READY (unchanged). Coverage: 0.0% (0/431).**

The master-data gap now has a typed vocabulary to be closed in, distinct from a mapping that
closes it — this step defines the shape, asserts none of the content.
