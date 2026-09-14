# Floor 1 EAP Reconciliation

Step 7. For every EAP equipment reference (210 schematic cells, `/api/eap-map`), determines its
relationship to CAD and to the Factory Twin's own 431 assets — read-only, EAP untouched
(`git diff --stat` confirmed empty for `services/factory-twin-3d/public/eap.js`,
`lib/eap-map.js`, `public/operational-state-adapters.js`). Per this step's own authority model:
**EAP alone creates no device mapping** — verified true below, not merely asserted.

## What EAP actually is, measured live

`/api/eap-map` — 210 cells, 12 EAP process zones (`A` "DRILLING HOLD" through `K` "PP"), 171
`machine_units` (160 single-cell + 11 aggregated multi-cell stations). A schematic REFERENCE
LAYOUT of the production line's process stages — its own zone taxonomy (12 letter-coded process
zones) is entirely separate from CAD's 19 `FZ-F1-nnnn` functional zones; nothing in this
repository declares a correspondence between the two taxonomies as a whole, only per-cell,
below.

## Corresponding CAD asset — per cell, measured

```
mapping_state: { AMBIGUOUS: 170, DIRECT: 40 }
cad_evidence.relation: { ZONE_SET: 170, DIRECT: 40 }
cells_with_a_cad_instance: 40
cells_live_status_eligible: 0   <-- ALL 210, including the 40 DIRECT cells
```

Two distinct relation strengths exist, and neither is an identity mapping:

- **170 cells: `ZONE_SET`** — a cell is linked to a CAD functional zone (`cad_zone_ids`,
  e.g. `["FZ-F1-0001"]`) holding multiple CAD candidates (`cad_candidates_in_zone`, e.g. `5`).
  The cell's own `rule` field states plainly: *"zone linkage only; the drawing carries no
  machine number, so no instance identity exists for this cell."* This is an AREA
  correspondence, never a specific-asset correspondence — it cannot answer "which one of the 5
  CAD assets in this zone is this EAP cell," and the source code does not claim it can.

- **40 cells: `DIRECT`** — a specific CAD drawing instance IS identified, via a documented,
  systematic rule (e.g. cell `EAP-F1-0005`'s own `rule`: *"positional link inside the 8x5 grid,
  x ascending to columns left to right and y descending to rows top to bottom"*) — a real,
  disclosed, repeatable GEOMETRIC correspondence method, high `registration_confidence`. This is
  genuine spatial evidence, not name-guessing, not ad-hoc coordinate proximity — it is a
  documented grid-registration rule the EAP layout itself was built against.

**Neither relation strength ever names which CAD `asset_id` (Twin `Asset.id`) a cell
corresponds to.** `lib/eap-map.js:153-157`, verbatim: *"The handle itself stays private -- it is
an index into the drawing, and the drawing is not something the normal UI is allowed to
browse."* Even for the 40 `DIRECT` cells, the actual CAD instance handle is a private,
deliberately-withheld value — this registry could not populate an "EAP reference" column on the
master-data registry (§1 of `FLOOR1_MASTER_DATA_REGISTRY.md`) even for those 40, not because
the data doesn't exist internally, but because no route this migration can call exposes it.

## Zone/room agreement

CAD functional zones (`FZ-F1-nnnn`, 19 distinct) and EAP process zones (`A`-`K`, 12 distinct)
use different granularities and different naming entirely — no 1:1 correspondence is declared
or derivable from either system's own data. The only bridge that exists is the per-cell
`cad_zone_ids` link (§ above), itself only a "this cell's process area overlaps this CAD zone"
fact, not a zone-taxonomy equivalence.

## Naming / type / spatial agreement

- **Naming**: EAP's `reference_label` (e.g. `"105"`, `"ULD"`) is the reference layout's own
  printed label, passed through unchanged — `lib/eap-map.js`'s own comment: *"Where the
  reference is illegible the model says so, and that string is passed through unchanged rather
  than replaced with a guess or a machine number."* No CAD asset carries an equivalent "name"
  field to compare against (`FLOOR1_MASTER_DATA_REGISTRY.md`'s own finding: `equipment name` is
  0/431 populated on the Twin side) — naming agreement cannot be evaluated because one side of
  the comparison does not exist.
- **Type**: Same gap — `Asset` carries no equipment-type field; `EAP`'s `process` field
  (e.g. `"DRILLING"`) has nothing on the Twin side to reconcile against.
- **Spatial**: Evaluated above via `mapping_state`/`cad_evidence` — 40/210 cells have real,
  documented spatial correspondence; 170/210 have zone-level correspondence only.

## Identity evidence

**None.** `cells_live_status_eligible: 0` of 210 — every single EAP cell, including all 40 with
a `DIRECT` CAD spatial link, carries `status: "UNKNOWN"`, `status_reason: "no authoritative IMS
mapping exists for this cell"`, matching Step 6B's own EAP-side audit exactly
(`docs/eap/EAP_OPERATIONAL_SOURCE_AUDIT.md`), re-confirmed live this step, not merely re-cited.

## Verdict

**EAP alone creates no device mapping — verified, not merely asserted per this step's own hard
rule.** EAP provides real, valuable, disclosed SPATIAL reference at two different strengths
(zone-level for 170 cells, instance-level for 40), but zero IDENTITY evidence for any of the
431 Twin assets, and the one internal linkage that could theoretically bridge EAP's 40 DIRECT
cells to a specific CAD `asset_id` is deliberately inaccessible to any client, by the existing
system's own design. EAP reconciliation changes nothing about the 0/431 identity-mapping result
— it was never a candidate identity source, and this step confirms that conclusively rather
than by omission.
