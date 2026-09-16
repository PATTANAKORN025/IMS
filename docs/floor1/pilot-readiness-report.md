# Floor 1 Pilot Evidence Readiness Boundary

Phase 10B. Defines the clean boundary between the Floor 1 evidence workflow
(`services/factory-twin-3d/lib/floor1-evidence-validator.js`, Phase 10A) and
the existing global identity-mapping readiness engine
(`services/factory-twin-3d-next/lib/identity-mapping-readiness.ts`, Step 6D).
Neither engine is modified by this document or this phase. Read-only report
plus one new deterministic test harness (`tests/unit/floor1-pilot-readiness-report.test.js`).

## 1. The exact semantic mismatch

Floor 1 evidence-intake validator (`floor1-evidence-validator.js`) derives a
6-value `mappingStatus` per evidence record, reusing Step 6E's own
`MappingLifecycle` vocabulary (`canonical-identity.ts:186`) unchanged:

```
UNMAPPED, CANDIDATE, CONFIRMED, AMBIGUOUS, RETIRED, INVALID
```

The global readiness engine's `MappingCandidate.confidence` type
(`identity-mapping-readiness.ts:23`) is a DIFFERENT, narrower union:

```
MappingConfidence = 'CONFIRMED' | 'AMBIGUOUS' | 'UNMAPPED' | 'INVALID'
```

Four values. No `CANDIDATE`. No `RETIRED`. This is not an oversight in
either file — `identity-mapping-readiness.ts` was written (Step 6D) before
Floor 1's own richer lifecycle existed, and was never asked to model a
staging state. `canonical-identity.ts:168-173` already documents this same
gap for its own, separate 4-state legacy comparison
(`lib/mapping.js`'s `unresolved/confirmed/conflicting/deprecated`).

Phase 10A's own adapter (`tests/unit/floor1-evidence-readiness-adapter.test.js`,
`toMappingCandidate`) resolved this the only honest way available without
touching the global engine: a Floor 1 `CANDIDATE` reads to the global engine
as `UNMAPPED` (not yet counted toward coverage). `RETIRED` is not yet
exercised by that adapter and would read the same way — a `RETIRED` record
carries no coverage-relevant claim either. This phase keeps that same
adapter behavior; it does not add a new one. The two engines are allowed to
disagree in vocabulary richness. They are not allowed to disagree about
which relationships are CONFIRMED — CONFIRMED is the one status both
vocabularies share exactly, and it is the only one that ever affects
`identity-mapping-readiness.ts`'s coverage math or `lib/mapping.js`'s own
`eligibility()`.

## 2. Three separate dimensions

This phase's mission is to keep these three dimensions from ever
collapsing into one number. Each is real, each is independently computed,
none is inferred from either of the other two.

### Evidence status

What the evidence ITSELF looks like — how much of it exists and whether it
agrees with itself. Phase 9C's vocabulary, unchanged:

```
NO_EVIDENCE          -- nothing submitted for this asset
PARTIAL_EVIDENCE      -- some fields resolved, not the full identity chain
GOOD_EVIDENCE          -- full chain, full provenance, no conflict
CONFLICTING_EVIDENCE  -- two or more sources disagree
```

Tracked today per pilot asset in `docs/floor1/pilot-intake-status.csv`'s
own `evidence_quality` column. All 10 rows currently read `NO_EVIDENCE` —
unchanged by this phase.

### Mapping lifecycle

What that evidence, once assessed against `docs/floor1/evidence-intake-contract.md`'s
promotion policy, resolves the RELATIONSHIP to. Floor 1's own 6-state
vocabulary (§1 above), computed per-record by
`floor1-evidence-validator.js`'s `validateEvidenceRecord()`. Not a synonym
for evidence status — `GOOD_EVIDENCE` does not imply `CONFIRMED` unless the
full identity chain, provenance, reviewer and timestamp are all present at
once, and `PARTIAL_EVIDENCE` can still be real, recordable evidence
(`CANDIDATE`), never silently promoted.

### Global readiness

Whether THIS DEPLOYMENT, taken as a whole, is ready to trust its mapping
set for production operational-state display. `identity-mapping-readiness.ts`'s
own 3-value `ReadinessDecision`:

```
NOT_READY, PARTIALLY_READY, READY
```

Computed by the real, unmodified `computeReadinessDecision()` — never
re-implemented, never hand-simulated. A record's mapping lifecycle being
`CONFIRMED` is necessary for this dimension to move at all, but coverage
count, anomaly count, simulator-only status and an explicitly agreed
coverage target all also gate it (`identity-mapping-readiness.ts:195-203`).
100% coverage of a small pilot slice does not, by itself, produce `READY` —
demonstrated already in Phase 10A's own adapter test ("stage 3") and
reconfirmed by this phase's own harness (§4 below, scenario E).

**These three dimensions are never collapsed.** A CSV column, a lifecycle
value and a readiness decision each answer a different question; conflating
any two of them is exactly the failure mode this phase exists to prevent.

## 3. Pilot promotion matrix

| Evidence | Mapping status | Eligible for CONFIRMED |
|---|---|---|
| no evidence | UNMAPPED | no |
| spatial only | CANDIDATE\* | no |
| one identity field | CANDIDATE | no |
| partial direct identity | CANDIDATE | no |
| conflicting sources | AMBIGUOUS | no |
| complete direct chain + provenance | CONFIRMED | yes |
| retired physical asset | RETIRED | no |
| invalid record | INVALID | no |

\* Spatial-only evidence (`CAD_POSITION`/`EAP_POSITION`/`GEOMETRY_SIMILARITY`/
`NAME_SIMILARITY`/`NEAREST_ASSET`) with no identity field present classifies
as `UNMAPPED` in the current validator, not `CANDIDATE` — there is no
identity claim to be a candidate FOR. The row is retained here to match
this phase's own requested matrix shape; the actual output is verified in
`tests/unit/floor1-evidence-validator.test.js`'s own "valid spatial-only
record" case.

`CONFIRMED` requires (per `docs/floor1/evidence-intake-contract.md` §3,
reused unchanged):

- FactoryTwinAssetId
- EquipmentId
- PhysicalAssetId
- DeviceId
- SourceSystemId
- source_system
- source_record
- evidence_type
- evidence_location
- provenance
- verified_by
- verified_at
- no identity conflict

**On DeviceId and operational intent.** This phase's own mission text notes
a source can establish `EquipmentId` without `PhysicalAssetId`, and that
`DeviceId` should not be required "merely to establish a logical Equipment
mapping if the real evidence legitimately stops at the Equipment/Physical
Asset boundary." That is a real, defensible position for a FUTURE promotion
policy — a mapping with no device/operational-state intent arguably has no
business needing a `DeviceId` at all. It is not implemented here. The
validator built in Phase 10A (unmodified by this phase, per this phase's
own mission constraint) requires all three identity fields
(`EquipmentId`, `PhysicalAssetId`, `DeviceId`) resolved before
`promotionEligible` is ever true — Phase 10A's own contract (`evidence-intake-contract.md`
§3.7) states this explicitly as the one place that contract is *stricter*
than "any single field is useful evidence." Relaxing that to make `DeviceId`
conditional on operational intent would change validator behavior, which
this phase's own §6/§8 constraints forbid without a separate, explicit
decision. Recorded here as an open policy question for a future phase, not
silently adopted.

## 4. Pilot-scale verification

`tests/unit/floor1-pilot-readiness-report.test.js` exercises scenarios A–I
against the real, unmodified `floor1-evidence-validator.js` and, for the one
scenario where global readiness is meaningfully exercised (E), the real,
unmodified `identity-mapping-readiness.ts`. Results (see that file for the
assertions themselves):

| Scenario | Floor 1 lifecycle outcome | Floor 1 pilot operational readiness | Global readiness (where checked) |
|---|---|---|---|
| A. all 10 UNMAPPED | 10x UNMAPPED | NOT_READY | — |
| B. 1 CANDIDATE + 9 UNMAPPED | 1 CANDIDATE, 9 UNMAPPED | NOT_READY | — |
| C. 9 CANDIDATE + 1 UNMAPPED | 9 CANDIDATE, 1 UNMAPPED | NOT_READY | — |
| D. 10 CANDIDATE | 10x CANDIDATE | NOT_READY | — |
| E. 1 CONFIRMED + 9 UNMAPPED | 1 CONFIRMED, 9 UNMAPPED | NOT_READY (pilot bar is all-10) | PARTIALLY_READY (real engine, no agreed coverage target — never forced READY) |
| F. conflicting source | AMBIGUOUS | NOT_READY | — |
| G. missing provenance | CANDIDATE, not eligible | NOT_READY | — |
| H. missing verifier | CANDIDATE, not eligible | NOT_READY | — |
| I. invalid timestamp | INVALID | NOT_READY | — |

**Floor 1 pilot operational readiness rule** (defined once, in the test
harness itself, as a small pure function local to that file — not added to
any production module): the pilot is ready for operational integration only
when all 10 pilot assets independently resolve to `CONFIRMED`. This is
deliberately the strictest possible bar. It exists only inside the test
harness because this phase's deliverables do not include a new production
library file, and because the correct owner of this decision is a future,
explicit product-policy phase, not something inferred here.

## 5. What this phase does and does not change

Changed: three files, all documentation/tests
(`docs/floor1/pilot-readiness-report.md`, `docs/floor1/pilot-evidence-request.md`,
`tests/unit/floor1-pilot-readiness-report.test.js`).

Unchanged, verified via `git diff --stat`: `floor1-evidence-validator.js`,
`identity-mapping-readiness.ts`, `canonical-identity.ts`, both Factory Twin
services' runtime, `/api/state`, operational-state adapters, database
schema, nginx, Grafana, Node-RED, EAP, CAD, and all 431 Factory Twin assets
and 10 pilot rows in `pilot-intake-status.csv`.

Still true after this phase, unchanged: 0/431 confirmed, 0/10 pilot
confirmed, global readiness `NOT_READY`, 0 fabricated identity.
