<!--
  The Floor 1 EAP node model: three entity types and the two relations between them.
  Data-model work only. No renderer, 2D UI, 3D UI, Grafana, telemetry, Node-RED,
  database, Manufacturing Command Center or Operator Andon change belongs to it.
-->

# Floor 1 EAP Node Model

Status: **hardened and canonical. 331 → 210 → 171, with 170 of 210 cells still
carrying no CAD handle.**

Continues from `45e7514` and `0a1b69c`. The reconciliation produced three counts; this
model keeps them apart as first-class entities instead of one blended number, and the
private JSON is now the data contract the renderer phase reads. A contract check runs in
pre-commit and fails on any attempt to blend the levels or to fill a null handle.

## A. The three entity types

| Entity | Count | What one row is | Source of truth |
|---|---:|---|---|
| `CAD_CANDIDATE` | 331 | one machine-shaped INSERT in the Floor 1 drawing, placed by its transformed body | the CAD drawing |
| `EAP_LAYOUT_CELL` | 210 | one independently coloured cell the operational layout draws | the layout reference image |
| `MACHINE_UNIT` | 171 | one independent operational machine or station | the layout's own grouping structure |

They are never interchangeable. A CAD candidate is a drawing object, an EAP cell is a
screen object, a machine unit is a thing on the floor. The counts differ because the
three sources draw the plant at three different granularities, not because any of them
is wrong.

## B. The two relations

```
CAD_CANDIDATE  ──many-to-one──▶  EAP_LAYOUT_CELL  ──one-to-one or aggregated──▶  MACHINE_UNIT
     331                              210                                            171
```

`CAD_CANDIDATE → EAP_LAYOUT_CELL` is many-to-one and is **not** assumed to be 1:1
anywhere. Where it happens to be 1:1 the model says so explicitly and says on what
evidence.

`EAP_LAYOUT_CELL → MACHINE_UNIT` decomposes exactly, and the two decompositions are
different sums over the same population:

```
171 machine units   = 160 single-cell units  +  11 aggregated station units
210 EAP cells       = 160 cells in single-cell units
                    +  48 cells inside the 11 aggregated stations
                    +   2 cells attached to no machine unit
```

A cell attached to no unit is **not** a machine unit. The two unattached cells are
counted in the 210 and in neither term of the 171. That is the whole reason the two
sums are stated separately.

## C. Reconciliation

| Relation | Count |
|---|---:|
| CAD → EAP direct | 40 |
| CAD → EAP set-level (1:1 within a zone, identity undetermined) | 121 |
| CAD → EAP many-to-one | 121 |
| CAD with no EAP cell (duplicate, CAD-only, unresolved) | 49 |
| **CAD candidates total** | **331** |
| EAP → machine unit, one-to-one | 160 |
| EAP → machine unit, aggregated into a station | 11 stations over 48 cells |
| EAP cells attached to no machine unit | 2 |
| **EAP cells total** | **210** |
| EAP cell mapping state: DIRECT | 40 |
| EAP cell mapping state: SET_LEVEL | 0 |
| EAP cell mapping state: AMBIGUOUS | 170 |
| EAP cell mapping state: UNASSIGNED | 0 |
| EAP cell unit state: ATTACHED | 208 |
| EAP cell unit state: UNASSIGNED | 2 |

Set-level and many-to-one both landing on 121 is a coincidence of this floor, not a
shared derivation: 121 set-level is 161 confirmed candidates minus the 40 grid
instances, 121 many-to-one is the sub-component population.

### The state vocabulary, and why it has two axes

A cell carries two independent states. Collapsing them into one field is what produced
the earlier confusion, so the contract keeps them apart.

**`mapping_state` — how the cell relates to the CAD.**

| State | Cells | Meaning |
|---|---:|---|
| `DIRECT` | 40 | one named CAD instance is bound to this cell |
| `SET_LEVEL` | 0 | the exact CAD subset serving the cell is known *and ordered*, so the instance follows from the ordering |
| `AMBIGUOUS` | 170 | the cell belongs to a linked CAD zone or set, but nothing picks the instance out of that set |
| `UNASSIGNED` | 0 | the cell belongs to no CAD zone at all |

`SET_LEVEL` is declared and currently empty. Several zones have a *closed* set — zone A
is 4 candidates against 4 cells, zone C is 41 against 41 — but a closed set is not an
ordered one, and without an ordering rule the bijection cannot name which candidate is
which. Only the 8 × 5 grid supplies that ordering, and it is `DIRECT`.

`UNMATCHED` is deliberately **not** in the vocabulary. A cell whose zone or set
relationship is known is `AMBIGUOUS`; calling it unmatched would understate what is
actually known about it.

**`unit_state` — whether the cell attaches to a machine unit.** `ATTACHED` 208,
`UNASSIGNED` 2. This axis says nothing about CAD, and the CAD axis says nothing about
units. The two unattached cells are `AMBIGUOUS` on the CAD axis and `UNASSIGNED` on the
unit axis at the same time.

On the candidate side, 121 candidates are `MANY_TO_ONE`: in six zones several of them
collapse onto one cell. That collapse is proved at zone level and not per cell, which is
exactly why the receiving cells are `AMBIGUOUS` rather than `MANY_TO_ONE` — marking them
otherwise would claim a per-cell assignment nobody has.

## D. Zone table

| Zone | Layout cells | CAD candidates | Machine units | CAD deficit | Cells with no unit |
|---|---:|---:|---:|---:|---:|
| A. DRILLING HOLD | 4 | 5 | 1 | 0 | 0 |
| B. DRILLING (upper left) | 103 | 102 | 103 | 1 | 0 |
| C. DRILLING (central vertical) | 41 | 44 | 41 | 0 | 0 |
| D. CUTTING | 13 | 33 | 2 | 0 | 0 |
| D2. Post-cut pair | 2 | 5 | 2 | 0 | 0 |
| E. DE-OXIDE | 3 | 4 | 1 | 0 | 0 |
| F. LASER DRILLING | 5 | 2 | 5 | 3 | 0 |
| G. XRY | 10 | 16 | 2 | 0 | 0 |
| H. BONDING | 3 | 16 | 1 | 0 | 0 |
| I. OXIDE | 11 | 7 | 3 | 4 | 2 |
| J. AUTO LAY UP | 8 | 48 | 3 | 0 | 0 |
| K. PP | 7 | 5 | 7 | 2 | 0 |
| **TOTAL** | **210** | **287** | **171** | **10** | **2** |

44 further CAD candidates sit in five zones the layout never draws; they belong to no
EAP cell and are counted in the 49 above. 287 + 44 = 331.

**CAD deficit** is the number of cells in a zone for which the zone simply has no
candidate left — the layout draws more machines there than the drawing does. It is
reported per zone rather than pinned to a named cell, because nothing identifies which
cell goes short. Zone I's deficit of 4 counts against all 11 cells; two of those are the
unlit, unlabelled cells, so the deficit against the 9 legible cells is 2.

## E. Machine units: every aggregation and its evidence

160 cells are their own machine unit. 48 more collapse into 11 stations, and 2 attach
to none. Every
merge below is justified by structure the layout itself draws — a printed line label or
a containment relationship — never by similarity, proximity or convenience.

| Unit | Zone | Cells | Structural evidence |
|---|---|---:|---|
| DHD001 | A | 4 | one labelled column; the four cells share a single station label printed beside the column and none carries its own |
| CCL001 | D | 6 | the row carries its own line label printed to its left |
| CCL002 | D | 7 | the row carries its own line label printed to its left |
| DEOX01 | E | 3 | one column under one zone caption, drawn as a load / process / unload sequence with no per-cell line label |
| XRY001 | G | 5 | the column carries its own line label printed vertically beneath it |
| XRY002 | G | 5 | the column carries its own line label printed vertically beneath it |
| BND001 | H | 3 | a single three-cell row drawn as one strip |
| BWN001 | I | 3 | the column carries its own line label printed vertically beside it |
| BWN002 | I | 4 | the column carries its own line label printed vertically beside it |
| BWN003 | I | 2 | the column carries its own line label printed vertically beside it |
| PRS | J | 6 | the five press cells sit directly on top of the PRS bar and share its width |

Zone J's DLM and LTK are drawn as separate bars and stay separate units. Zone B's 103
drills, zone C's 41, zone F's 5 laser cells, zone D2's 2 and zone K's 7 boxes are each
one cell, one unit: the layout gives no grouping to merge on.

Two cells attach to no unit: the two unlit, unlabelled cells in zone I. They are drawn,
so they are real cells; they carry neither a status colour nor a legible label nor a line
label, so there is no evidence for which station they belong to. They are held as
unassigned rather than folded into a neighbour.

## F. The CAD-handle gap, stated plainly

**40 of 210 EAP cells carry a CAD handle. 170 do not.**

| Mapping | Cells | Why |
|---|---:|---|
| DIRECT | 40 | the 8 × 5 grid, linked positionally |
| AMBIGUOUS | 170 | the cell's zone links to CAD, but no evidence assigns a specific candidate |
| UNMATCHED | 0 | every zone links to at least one CAD zone |

The gap has one cause: **the drawing carries no machine numbers.** 2 630 strings were
recovered from it and none matched a machine identifier. Outside the grid, nothing in
the CAD distinguishes one drill from the drill beside it, so no layout number can be
bound to a handle. Filling those 170 fields would require inventing identifiers, which
is prohibited and would be wrong.

Closing the gap needs new evidence from outside these two sources — an asset register, a
tag list, or a drawing revision that carries machine numbers.

## G. Mapping rules actually used

Permitted and used:

- **Zone evidence.** The drawing's area labels against the layout's zone captions.
- **Block family.** Zones A and B share one CAD area zone and were split on family, not
  on position.
- **Transformed physical body.** Every position is the body the block draws, never the
  INSERT origin.
- **Row / column structure.** The 8 × 5 grid's column pairing.
- **Layout visual structure.** Printed line labels and containment, for every merge.
- **Machine labels where they exist.** Layout side only.

Permitted for zone-level registration only, and not used as per-cell proof:

- The affine fit from CAD millimetres to layout pixels (33.6 px mean residual, 1.46
  anisotropy). The layout is a schematic; the fit is good enough to say which room a
  candidate is in and nothing finer.

Not used anywhere:

- arbitrary nearest-neighbour matching
- the affine fit as per-cell proof
- machine-number fabrication
- visual similarity alone
- area optimisation

## H. The three named cases

### FAM-02 — proved, 40 direct links

- CAD: 40 instances at 8 distinct x positions × 5 distinct y positions. The x positions
  fall into four pairs, 3.42 m within a pair and 5.08 m between pairs.
- Layout: 40 cells, machines 105–144, eight columns of five, in four visual column pairs
  at the same spacing ratio.
- Placement used the **transformed body position**. This family's block draws its body
  about 880 m from its own base point with an equal and opposite INSERT offset, so its
  INSERT origins land off the floor entirely and would have lost the whole grid.
- Both grids being 8 × 5 with matching column pairing, and the registration showing no
  mirroring, each layout number is linked to one instance positionally: x ascending →
  columns left to right, y descending → rows top to bottom.

This is the only DIRECT mapping on the floor, and it is geometric, not identifier-based.

### FAM-01 / FAM-03 — 62 candidates against 63 cells

Zone B holds 35 FAM-01 and 27 FAM-03 candidates, 62 in all, against 63 layout cells
(machines 042–104). **Deficit 1, unresolved and left that way.**

The missing machine cannot be identified: the CAD's nine east-west rows in that block
(7, 7, 7, 7, 4, 7, 8, 8, 7) do not line up with the layout's two bands of columns, 34
cells above and 29 below. No candidate was moved, duplicated or invented to close it.
Neither family's ellipse-inflated hull was used as identity — published hulls are 19.08 ×
11.30 m and 19.45 × 11.77 m against measured bodies of roughly 4.63 × 2.13 m and 5.30 ×
2.15 m.

### PP — 7 cells, not 6

The layout draws **7** boxes in the PP rack: three in the left column, four in the right.
Their labels are not legible at the reference image's resolution and are recorded as
`UNREADABLE-1..7`. The zone has 5 CAD candidates, so the deficit is 2. The earlier
six-box assumption is not carried forward, and the count was not reduced to make the
floor total reach 209.

## H2. The record shapes, and the check that holds them

Each of the 171 machine units declares:

| Field | Meaning |
|---|---|
| `unit_id` | `MU-F1-nnnn`, stable |
| `zone_id` | one of the twelve operational zones |
| `cell_ids[]` | the EAP cells this unit owns; disjoint across units |
| `aggregation_type` | `SINGLE_CELL` or `AGGREGATED_STATION` |
| `aggregation_evidence` | the drawn structure that proves the merge; required on every station |
| `cad_evidence` | CAD zone ids, candidate count in that zone, handles where any exist, and the relation (`DIRECT` or `ZONE_SET`) |
| `ims_mapping_state` | `NOT_MAPPED` on all 171 |
| `confidence` | `HIGH` / `MEDIUM` / `LOW`, inherited from the zone link |

`ims_mapping_state` is `NOT_MAPPED` everywhere because no authoritative mapping data
exists. A CAD candidate, an EAP cell, a machine unit, an IMS machine and a telemetry
device are five different things, and only the first three are established here.

Each of the 210 cells declares `eap_cell_id`, `layout_label`, `zone_id`, `zone_caption`,
`process_group`, `status_colour_present`, `mapping_state`, `unit_state`,
`machine_unit_id`, `cad_handle`, `machine_node_id`, `block_family`, position and
rotation where a handle exists, `cad_evidence`, `layout_evidence` and `confidence`.

`tests/lint/eap-node-model-contract.js` runs in pre-commit and asserts the model rather
than describing it. It fails on 331/210/171 drifting, on either decomposition not
summing, on `DIRECT` ≠ 40 or `AMBIGUOUS` ≠ 170, on a cell claimed by two units, on a
`cad_handle` that does not resolve to a candidate in the same document, on an
`AMBIGUOUS` cell that has acquired a handle, on a unit missing a required field, on an
aggregation without stated evidence, on the golden case losing any of its measurements,
and on either known discrepancy being quietly closed. On a clone without the private
model it reports SKIP and exits zero.

## I. What this model still does not establish

1. No per-machine CAD identity outside the 40-instance grid.
2. No physical position for 170 of the 210 cells.
3. No IMS or telemetry mapping. CAD candidate ≠ EAP cell ≠ machine unit ≠ IMS machine ≠
   telemetry device, and no mapping data exists to bridge the last two.
4. 11 illegible labels: 7 in PP, 2 in bonding, 2 in oxide.
5. 10 cells across four zones have no CAD candidate available.
6. 44 CAD candidates belong to no EAP cell, including a 31-candidate process area the
   layout never captions.
7. Zone H's CAD link is position-only against an unnamed CAD zone, LOW confidence; its
   16 candidates are the weakest many-to-one group in the model.
8. The layout is one moment in time. Only cell population, labels and grouping were used;
   status colours were not.

## J. Where the data lives

`services/factory-twin-3d/private/floor1-eap-node-model.json`, schema `2.0.0` — private
and gitignored, and the canonical contract for the renderer phase. It opens with a
machine-readable summary:

```json
{
  "cad_candidates": 331,
  "eap_cells": 210,
  "machine_units": 171,
  "direct_cad_eap": 40,
  "ambiguous_eap_cells": 170
}
```

and carries the state vocabulary, the declared invariants, all three entity arrays (331
candidates, 210 cell records, 171 unit records), the per-zone table, the golden case with
its measurements, the two known discrepancies, the 40 grid links, and the affine
registration marked zone-level-only. Coordinates, block names, layer names and drawing
area labels stay out of this report.

## K. Scope

Data model and reconciliation only. The renderer, the 2D UI, the 3D UI, Grafana,
telemetry, Node-RED, the database, the Manufacturing Command Center and the Operator
Andon are unchanged. No geometry was optimised, no candidate deleted to reach 210, and
no cells merged to reach 171.
