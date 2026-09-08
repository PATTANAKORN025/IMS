<!--
  Can the 210 EAP cells be placed in true CAD world coordinates without
  fabricating identity? Registration analysis only. No renderer redesign, and no
  change to Grafana, Node-RED, TimescaleDB, the PostgreSQL schema, telemetry, the
  Manufacturing Command Center or the Operator Andon.
-->

# Floor 1 EAP Spatial Registration

Status: **measured. 40 cells reach true world coordinates, 167 reach a world region,
3 reach neither. No transform was accepted.**

Continues from `a64a51f`. The renderer draws in `EAP_LAYOUT_FRAME` because that is the
only frame all 210 cells have. This phase asks the next question: how many of them can
be moved into CAD world space on evidence, and the answer is that the layout does not
carry enough geometry to move any cell that identity has not already placed.

## A. Result

| Evidence | Cells | % |
|---|---:|---:|
| DIRECT | 40 | 19.0 |
| STRUCTURAL | 0 | 0.0 |
| SET_LEVEL | 167 | 79.5 |
| LAYOUT_ONLY | 3 | 1.4 |
| **Total** | **210** | **100** |

The four levels are kept apart in the model and are not collapsed:

- **DIRECT** — the cell's CAD instance is known, so its world position is that
  instance's own transformed body position. No transform is involved and the residual
  is zero by construction. These are the 40 grid cells.
- **STRUCTURAL** — identity unresolved, but the CAD set and the EAP set correspond
  through count, geometry, ordering and zone, *and* a fitted transform reproduces that
  pairing. Nothing on this floor reaches this level. Every zone's specific reason is
  recorded below and in the model.
- **SET_LEVEL** — the CAD candidate set corresponds to the EAP set in the same zone,
  but no ordering can be proven. The registration is to a world **region**, not to a
  point, and no cell receives a position.
- **LAYOUT_ONLY** — only the reference-layout position is known.

Coverage did not increase in this phase. That is the measurement, not a shortfall of
effort: the section below shows exactly what was tested and what it returned.

## B. Why no transform was accepted

Three transforms were fitted and all three residuals are recorded in the model.

| Transform | Scale X | Scale Y | Rotation | p50 | p95 | Max | Verdict |
|---|---|---|---|---:|---:|---:|---|
| Global affine, 40 known grid pairs | 0.9522 | 1.3797 | −2.859° | 1 145 mm | 3 059 mm | 4 063 mm | **rejected** |
| X only, grid column centres | 0.9511 | — | 0° | 238 mm | 457 mm | **507 mm** | accepted for x only |
| Y only, grid rows | — | 1.3733 | 0° | 1 102 mm | 3 056 mm | 4 047 mm | **rejected** |

The global affine was fitted on the only 40 pairs anyone can point to — the grid, where
identity is proven — and it still misses those same pairs by 1.15 m at the median and
4.06 m at worst. A transform that cannot reproduce its own anchors has no business
placing a cell whose identity is unknown.

Splitting the residual by axis says why, and the answer is specific and useful:

- **East–west, the layout registers.** The eight grid column centres map onto the CAD
  column centres with a single scale and offset to within **0.51 m over a 29 m span**,
  about 1.7 %. The layout preserves the drawing's east–west structure.
- **North–south, it does not.** The layout draws **28 distinct row positions** where the
  drawing has **10**. Vertical placement inside a column is drafting arrangement, not a
  projection of the floor, and the residual is up to 4.05 m.

That is also where the anisotropy lives. It was measured, not removed: scale x 0.951
against scale y 1.373 on the same fit, a ratio of 0.69 in this direction — the
reciprocal of the ~1.46 the renderer phase reported for the other direction. One axis is
faithful and one is not, so a two-axis transform is not available at any scale factor.

Applying the global affine to the rest of the floor confirms it, using centroids and
extents only so that nothing here can be mistaken for an identity claim:

| Zone | Centroid error | Extent error x / y |
|---|---:|---:|
| A | 6.6 m | −3.2 / −8.4 m |
| B (non-grid) | 3.5 m | −9.8 / −0.7 m |
| C | 5.0 m | −10.1 / −8.3 m |
| D | 6.1 m | −5.5 / +1.1 m |
| D2 | 2.5 m | −2.3 / −4.2 m |
| E | 5.0 m | −3.0 / +1.4 m |
| F | 11.0 m | +10.7 / +5.1 m |
| G | 5.2 m | −2.0 / −0.4 m |
| H | 9.4 m | −20.0 / −15.0 m |
| I | 15.1 m | −16.9 / +25.6 m |
| J | 4.2 m | −30.3 / −24.3 m |
| K | 9.5 m | −4.0 / +1.5 m |

Zone-local transforms were then tested where a pairing was even arithmetically possible.
Only two zones have equal populations, and both fail before a fit can run — see zones A
and C below. Nothing was fitted to a pairing that the structure did not support.

## C. Zones

| Zone | EAP | CAD | Registered to a point | Residual | Evidence | Link |
|---|---:|---:|---:|---:|---|---|
| A. DRILLING HOLD | 4 | 5 | 0 | — | SET_LEVEL | HIGH |
| B. DRILLING (upper left) | 103 | 102 | 40 | 0 mm | DIRECT + SET_LEVEL | HIGH |
| C. DRILLING (central vertical) | 41 | 44 | 0 | — | SET_LEVEL | HIGH |
| D. CUTTING | 13 | 33 | 0 | — | SET_LEVEL | HIGH |
| D2. Post-cut pair | 2 | 5 | 0 | — | SET_LEVEL | MEDIUM |
| E. DE-OXIDE | 3 | 4 | 0 | — | SET_LEVEL | MEDIUM |
| F. LASER DRILLING | 5 | 2 | 0 | — | SET_LEVEL | HIGH |
| G. XRY | 10 | 16 | 0 | — | SET_LEVEL | HIGH |
| H. BONDING | 3 | 16 | 0 | — | LAYOUT_ONLY | LOW |
| I. OXIDE | 11 | 7 | 0 | — | SET_LEVEL | MEDIUM |
| J. AUTO LAY UP | 8 | 48 | 0 | — | SET_LEVEL | MEDIUM |
| K. PP | 7 | 5 | 0 | — | SET_LEVEL | HIGH |
| **Total** | **210** | **287** | **40** | | | |

Every zone records why its registration stops where it does:

- **A** — the four CAD bodies stand two by two; the layout draws one column of four, so
  no ordering maps one onto the other.
- **B** — the grid is DIRECT. Outside it, 62 CAD bodies against 63 cells, and the column
  profiles differ: CAD `3,2,8,8,9,8,9,9,6` against EAP `6,8,8,8,9,9,9,6`.
- **C** — the closest call on the floor. Counts match exactly at 41, and both sides carry
  six columns with the same multiset of heights, `{3,6,8,8,8,8}`. But the two smallest
  columns are **transposed east to west**: the drawing has the six-stack west of the
  three-stack, the layout has them the other way round. Column order is therefore not an
  ordering rule in this zone, and an orientation-preserving transform cannot swap them.
  Pairing the two odd columns by their unique heights and the four eights by order would
  have produced 41 world positions; it would also have asserted an ordering that this
  zone's own geometry disproves, so it was not done.
- **D, D2, E, G, J** — CAD is finer than the layout: 33, 5, 4, 16 and 48 candidates
  behind 13, 2, 3, 10 and 8 cells.
- **F, I, K** — CAD is coarser than the layout: 2, 7 and 5 candidates behind 5, 11 and 7
  cells.
- **H** — the CAD zone is unnamed and the link is position-only, which is not enough to
  claim even a set correspondence. Its 3 cells are the only `LAYOUT_ONLY` cells.

Each SET_LEVEL zone carries a `cad_world_region` in the model — the extent and centroid
of that zone's CAD candidate bodies, labelled as a region and explicitly not a position
for any one cell. That is the honest form of what set-level correspondence buys: the
zone is in a known place on the floor; the machines inside it are not individually
placed.

## D. What was used as evidence, and what was refused

Used: zone containment, candidate count, row and column structure, repeated pitch,
orientation histograms, body centroids, transformed block geometry, the layout's own
topology, and stable relative ordering where the structure supported it.

Refused: nearest-neighbour matching as identity, manual offsets, screen-space scaling,
invented machine numbers, and dimension inference from neighbour spacing. Where a
pairing was arithmetically available but structurally unsupported — zone C — it was
refused and the reason recorded rather than taken.

Every position is the transformed body position. The grid family's INSERT origins sit
about 880 m off the floor, and using them would have lost the only 40 cells that are
placed at all.

## E. Model fields

Schema `2.2.0` adds, per cell:

| Field | Meaning |
|---|---|
| `spatial_evidence` | `DIRECT` / `STRUCTURAL` / `SET_LEVEL` / `LAYOUT_ONLY` |
| `cad_world_position` | frame, x_mm, y_mm, rotation — present on 40 cells |
| `registration_residual_mm` | 0 on DIRECT, null elsewhere |
| `registration_method` | `CAD_INSTANCE_IDENTITY` / `ZONE_SET_CORRESPONDENCE` / `NONE` |
| `registration_confidence` | `HIGH` / `MEDIUM` / `LOW` |
| `registration_note` | why registration stops, on every non-DIRECT cell |

and, at the top level, `spatial_registration` with the evidence-level definitions, all
three tested transforms and their residuals, `global_transform_valid: false` with its
reason, the anisotropy note, and the per-zone table with each zone's stop reason and
world region.

**`cad_world_position` and `cad_handle` are independent, and the distinction is the
point of this phase.** A cell may hold a world position with no handle when the
registration is structurally justified. On this floor no cell is in that state yet — the
40 that hold a position hold a handle too — but the model can express it, the contract
check enforces the rule in both directions, and the registration writes no handle under
any circumstance.

## F. What would move the number

The blocker is not the layout's resolution; it is that the layout is an arrangement
rather than a projection. Three things would change the answer:

1. **Machine numbers in the CAD.** The drawing carries none. With them, most of the 167
   SET_LEVEL cells become DIRECT immediately.
2. **A zone whose column profile matches in order.** Zone C is one transposed pair away.
   If the drawing owner confirms that the layout swapped those two columns, zone C
   becomes STRUCTURAL and 41 cells gain world positions — but that is the owner's
   statement to make, not something geometry can settle.
3. **An asset register or tag list** binding a layout label to a physical machine.

## G. Validation

Preserved and re-asserted: 331 CAD candidates, 210 EAP cells, 171 machine units,
160 single-cell units and 11 aggregated stations, FAM-02 at 40 instances in 8 × 5,
PP at 7 cells against 5 candidates, and the FAM-01/FAM-03 deficit of 1 still open.

| Check | Result |
|---|---|
| `tests/lint/eap-node-model-contract.js` | 94 assertions, 0 errors |
| `tests/unit/eap-map-wire.test.js` | 15 passed |
| `tests/playwright/eap-map-regression.js` | 82 assertions, 0 failures |
| `tests/playwright/factory-twin-regression.js` | 518 assertions, unchanged |
| Private data leak scan | 0 matches |
| Pre-commit | all checks passed |

The browser regression matters here for one specific reason: `cad_world_position` puts
CAD-world millimetre coordinates onto cell records, and those coordinates would locate
the facility. The wire projection is a whitelist, so they do not cross it, and the
regression greps the served payload for `x_mm` and `y_mm` to prove it.

## H. Scope

Registration analysis and model fields only. The renderer is unchanged and still draws
in `EAP_LAYOUT_FRAME`, which remains correct while 170 of 210 cells have no world
position. No change to Grafana, Node-RED, TimescaleDB, the PostgreSQL schema,
telemetry, the Manufacturing Command Center, the Operator Andon, the 210-cell census, or
any private CAD file.
