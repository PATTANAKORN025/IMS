# Floor 1 Data Acquisition Pack

A production-grade package for obtaining the real-world evidence the Factory Twin's identity
mapping currently lacks — 0 of 431 assets have a `CONFIRMED` device/equipment correspondence
today (`docs/evidence/FACTORY_TWIN_IDENTITY_MAPPING_READINESS.md`, re-verified live when this
pack was built). This pack does not close that gap itself — it cannot; the gap is a real-world
evidence gap, not a code gap (`docs/evidence/FLOOR1_CONFIRMED_MAPPING_ACQUISITION_PLAN.md`'s own
conclusion) — it gives whoever DOES have access to that evidence a concrete, structured way to
record it correctly.

## Contents

| File | Purpose |
|---|---|
| `floor1-data-collection-guide.md` | Field-by-field guide: what each column means, what counts as real evidence, what does not, the mapping-status vocabulary, the rules that must never be violated. Read this first. |
| `equipment-registry-template.csv` | One row per Factory Twin asset — **all 431**, real, pre-seeded with the CAD data this repository already has (`factory_twin_asset_id`, `zone`, `spatial_status`), every identity column intentionally blank, `mapping_status` uniformly `UNMAPPED`. |
| `mapping-evidence-template.csv` | One row per identity CLAIM (not per asset) — starts with a single clearly-labeled example row only; real rows are added as evidence is actually collected. |
| `unresolved-assets.md` | The 76 of 431 assets with no measurable CAD footprint — real, live list, with handling guidance specific to them (their position is still real, their extent is not). |
| `README.md` | This file. |

## How to use this pack

1. Read `floor1-data-collection-guide.md` in full before touching either CSV.
2. Work through `equipment-registry-template.csv` asset by asset, filling in identity columns
   ONLY from real, observed, or authoritatively-sourced evidence (nameplates, a real MES/PLC/
   SCADA export, a real device registry cross-check, an approved manual site record).
3. For every non-trivial identity claim, add a corresponding row to
   `mapping-evidence-template.csv` recording exactly how it was verified.
4. A separate, human review step (not automated by this pack) checks the evidence and promotes
   `CANDIDATE` rows to `CONFIRMED` — see `docs/evidence/
   FLOOR1_CONFIRMED_MAPPING_ACQUISITION_PLAN.md`'s own §6 workflow.
5. Only reviewed, provenanced `CONFIRMED` entries are ever eligible to enter
   `private/floor1-asset-mapping.json` — this pack's own templates never write to that file
   directly.

## Prioritized pilot list — 10 assets, spatial evidence only

**These are NOT claimed to be real machine identities.** Every field below is real CAD geometry
data already in this repository (`/api/floor-geometry`, live-verified when this pack was
built) — nothing about WHAT equipment occupies these positions is known or asserted. This list
exists only to prioritize WHERE a site surveyor should start: these 10 (of 47 candidates
meeting the same bar, out of 431 total) have the cleanest, least-ambiguous CAD records in the
entire dataset — high geometric confidence, a real measured footprint, no overlap with a
neighboring footprint, no orientation-authoring mismatch, inside a real CAD room — making them
the easiest positions to walk up to and confirm without any spatial ambiguity getting in the
way of the identity question.

Selection criteria (all real, all measured, none inferred): `footprint_status` ∈
{`MEASURED_CAD`, `OBSERVED_CAD`}, `confidence = high`, `evidence_tier = PRIMARY`,
`zone_status = INSIDE_ROOM`, `overlaps_neighbour = false`, `orientation_geometry_mismatch =
false`, `mirrored = false`.

| # | Factory Twin Asset | Zone | Position (x, z) | Rotation | Footprint (w × d, m) |
|---|---|---|---|---|---|
| 1 | `EQP-F1-0030` | `FZ-F1-0004` | 67.55, -21.38 | 270° | 1.21 × 1.54 |
| 2 | `EQP-F1-0062` | `FZ-F1-0016` | 55.17, 18.53 | 0° | 1.31 × 2.09 |
| 3 | `EQP-F1-0075` | `FZ-F1-0036` | 54.98, 14.44 | 90° | 1.21 × 1.69 |
| 4 | `EQP-F1-0076` | `FZ-F1-0036` | 54.99, 9.63 | 90° | 1.81 × 1.69 |
| 5 | `EQP-F1-0077` | `FZ-F1-0036` | 54.99, 0.26 | 90° | 1.81 × 1.69 |
| 6 | `EQP-F1-0092` | `FZ-F1-0016` | 58.05, 18.53 | 0° | 1.31 × 2.09 |
| 7 | `EQP-F1-0108` | `FZ-F1-0016` | 48.85, 18.53 | 0° | 1.31 × 2.09 |
| 8 | `EQP-F1-0109` | `FZ-F1-0006` | 73.53, -10.61 | 90° | 1.21 × 1.47 |
| 9 | `EQP-F1-0124` | `FZ-F1-0003` | 16.91, 43.75 | 0° | 1.62 × 1.56 |
| 10 | `EQP-F1-0125` | `FZ-F1-0003` | 19.76, 43.72 | 0° | 4.07 × 1.65 |

47 assets total met this bar (of 431) — these 10 are simply the first 47 in the dataset's own
order, not further ranked by any additional criterion; re-running the same live query would
reproduce the same 47, in the same order, deterministically.

## Validation performed building this pack

```
$ curl -s http://<host>/api/floor-geometry | ... # 431 non-duplicate assets, 0 mapped, re-verified
$ wc -l equipment-registry-template.csv           # 432 (1 header + 431 real asset rows)
$ node -e "require('./services/factory-twin-3d/lib/mapping').validateMappings([])"
  { ok: true, counts: { total: 0, confirmed: 0, ... } }
$ git diff --stat -- services/ database/ postgres/ proxy/ monitoring/grafana/
  (empty)
```

## What this pack explicitly does not do

- Does not fabricate any equipment name, type, serial number, manufacturer, model, device id,
  or MES/PLC/SCADA identifier — every such field in `equipment-registry-template.csv` is blank.
- Does not change the 0/431 confirmed-mapping baseline.
- Does not modify application code, the database, nginx, Grafana, legacy Factory Twin, PR #22,
  or `main`.
- Does not connect live operational state or add rendering features.
