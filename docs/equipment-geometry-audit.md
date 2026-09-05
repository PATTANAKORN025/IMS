<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../README.md"><img src="assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="README.md"><img src="assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Floor 1 Equipment Geometry — Audit

How every machine's position, size and orientation is obtained from the CAD,
what was wrong with the previous pass, what the reconciliation measures, and
what is still unresolved.

> [!IMPORTANT]
> This document contains **no facility geometry**. No coordinate, layer name,
> block name or machine identity appears here. What is documented is method,
> measurement and limitation. The drawing, the extracted documents and the
> measurement reference are private, host-local and gitignored.

---

The shape an operator actually sees is derived from this measurement and is
documented separately: [equipment-display-geometry.md](equipment-display-geometry.md),
and the operational footprint the operator view is drawn from — body axis,
filtering rules, containment proof and acceptance audit — in
[equipment-operational-footprint-v2.md](equipment-operational-footprint-v2.md).

---

## 1. What the previous pass did, and the three faults in it

Machines in this drawing are **placed, not traced**: an `INSERT` entity records
where a block goes and the `BLOCK` it names holds the geometry that insertion
stamps down. The previous pass read that correctly for **position and
rotation**, and then took the **footprint** from the block definition's
bounding box, measured in the block's own coordinates.

Three faults, none of which was visible from inside the model — a wrong box is
still a box, and every existing check stayed green:

| # | Fault | Scale of it |
|---|---|---|
| 1 | The `INSERT` **scale** was never read | 966 inserts in the drawing carry one; **130** of the equipment candidates do, and **120 of those are mirrors** (negative scale). A mirror is not a cosmetic difference: it moves the geometry to the other side of the insertion point. |
| 2 | **Nested** blocks were not expanded | **65** candidates reference a block containing further inserts, nested up to **6** deep. That geometry was missing from the extent entirely. |
| 3 | A **bounding box is not a footprint** | It includes the block's dimension chains, its centrelines and its labels, and it is measured on the drawing's axes rather than the machine's. |

A fourth fault was in the fallback rather than the measurement: where the box
failed its gate, an extent was **approximated** from modelspace line-work
bounded by neighbour spacing. That produced 123 records carrying a bound that
looked like a measurement. It is gone: these machines are placed, so their
geometry is in the block definition and there is nothing to approximate.

---

## 2. Method

`scripts/extract-floor1-equipment.js`, one streaming pass over the DXF.

### 2.1 The transform chain

```
p_world = R(rot) · diag(sx, sy) · (p_block − base) + insertion
```

composed through every nesting level as a **matrix product**:

```
T_total = T_parent × T_child
```

Never a product of bounding boxes. A box product is not even wrong at one
level — it is right until something rotates, and then it silently inflates.

The maths lives in `scripts/lib/cad-blocks.js` and is covered by **39 unit
tests** that need no drawing: base-point subtraction, rotation, uniform and
mirrored scale, mirror detection by determinant, three-level composition,
associativity, oriented extent, minimum-area fit, shape classification,
extent-preserving simplification, convex intersection under either winding, and
the display-rectangle derivation at seven angles and under mirroring.

### 2.2 Why a hull, and why that loses nothing

An affine transform maps a convex hull to the convex hull of the image. So each
block is hulled **once**, in its own coordinates, and the hull is transformed
per instance. Extent along any axis is fully determined by the hull, so the
oriented footprint measured off the transformed hull is the same number as one
measured off all ~300,000 transformed strokes. This is what makes a single pass
over a 412 MB file enough, and it is exact rather than an approximation.

### 2.3 What counts as the machine, and what is annotation

Classified deterministically, by structural evidence from the file format
first and by layer-name convention second:

| Class | Rule | Effect |
|---|---|---|
| Annotation | Entity **type**: `TEXT`, `MTEXT`, `ATTDEF`, `ATTRIB`, `DIMENSION`, leaders, tolerances | Excluded |
| Dimensioning / centrelines | Layer **name**: `Defpoints`, dimension and centreline conventions, including CJK forms | Excluded — **subtractively only** |
| Hatch | Entity type `HATCH` | Excluded, and this one is load-bearing: a hatch carries seed and pattern points under the same group codes as geometry. Reading them inflated one block from 36 m to 122 m during the audit. |
| Physical machine geometry | Everything else | Measured |

The layer filter is **subtractive only and may never empty a block**. Thirteen
blocks on this floor draw their entire body on a layer named for dimensions or
centrelines; on those the layer name is not evidence of anything, and the
geometry is kept. Across the whole floor the filter shrinks **26** blocks, by at
most **227 mm**.

### 2.4 Orientation, extent and shape

- **Extent** is measured on the machine's **own axes** — the angle the CAD
  turned it to — not on the drawing's axes.
- A **minimum-area box** is fitted to the hull independently, as a second
  reading of orientation. It is reported as a residual and is **never** used to
  re-angle a machine.
- **Shape** is decided by how much of its own oriented box the hull fills:
  `rectangle` / `rotated_rectangle` (≥97%), `polygon` (few-sided), otherwise
  `irregular`. Nothing is rounded up to a rectangle for visual consistency.

---

## 3. Inventory

| | Count |
|---|---:|
| `INSERT` entities in the drawing | 1,828 |
| …inside the floor envelope | 1,396 |
| …on an equipment layer | 365 |
| …drawing furniture excluded (scale figures, north arrows) | 21 |
| **Equipment candidates** | **344** |
| Distinct block definitions referenced (with nesting) | 442 |
| Block definitions missing | 0 |
| Recursion-guard hits | 0 |

The equipment **layer set is unchanged** from the previous pass — this work is
about the accuracy of the geometry, not about widening the census. Inserts on
every other layer are counted and reported, never silently dropped.

### Transforms actually present

| | Count |
|---|---:|
| Scaled inserts | 130 |
| …of which mirrors (negative scale) | 120 |
| Candidates whose block nests further inserts | 65 |
| Deepest nesting followed | 6 |

Distinct scales in the candidate population: identity, mirror-in-x, **0.64**,
and **1000**. None is clamped. The ×1000 cases are seven inserts of one block
that draws a single tiny mark; even at ×1000 the result is below machine scale,
so they resolve to a position with **no extent claimed** rather than to a
plausible-looking box.

---

## 4. Results

| Metric | Before | After |
|---|---:|---:|
| Candidates | 224 | **344** |
| Position measured (`MEASURED_CAD`) | 224 | **344** |
| Position within 1 mm of the CAD | 224 | **344** |
| Rotation measured | 224 | **344** |
| Rotation within 0.01° | 224 | **344** |
| Footprint **measured** | 63 (block box) | **270** |
| Footprint **approximated** | 123 | **0** |
| Footprint **unresolved** | 38 | **74** |
| Scale read | **no** | 130 inserts, 120 of them mirrors |
| Nested geometry included | **no** | 65 candidates |
| Shape reported | no | 57 rectangles, 17 polygons, 196 irregular |
| Measured outline served | no | **213** machines |
| Mapped to IMS | 0 | **0** (unchanged, and deliberately) |

Measured footprint areas run from 0.66 m² to 229 m², median **10.3 m²**.
29 block families repeat three or more times.

### Room relationship

Against the 32 authoritative room polygons, which are **not modified**:

| | Count |
|---|---:|
| Wholly inside one room | 192 |
| Crossing a room boundary | 70 |
| Outside every room polygon | 19 |
| Room known by centre only (no extent) | 63 |

A machine that crosses a boundary is **flagged, never moved**. The test is run
on the outline the model serves, so the flag means what an operator sees.

### Machines that measure past the envelope

Eight records sit outside the column-cap envelope, by at most **0.735 m** —
seven small units in a row against one exterior wall, and one machine 0.32 m
past another. They are **declared** (`outside_envelope`, `envelope_overhang_m`)
rather than clamped, and the geometry validator accepts a declared overhang only
up to 2 m, so a frame error — which would put machines tens of metres out —
still fails.

---

## 5. Reconciliation

`tests/lint/floor1-cad-reconciliation.js` compares **three** sources, not two:

| Source | What it is |
|---|---|
| the **model** | the private geometry document, canonical metres — what the API serves from |
| the **measurement** | `floor1-equipment-reference.json`, floor-local millimetres, written by the extractor **before** the canonical transform |
| the **bundle** | an older, independent extraction of the same drawing's `INSERT` records |

The measurement checks everything downstream of it — the frame, the rounding,
the outline simplification, the record assembly. The bundle checks the
measurement's own anchor against a second reading of the CAD, which is what
stops the pair from being self-consistently wrong.

| Metric | Result |
|---|---:|
| Machines reconciled | **344 of 344** |
| Position ≤ 1 mm | **344** |
| Position ≤ 5 mm | **344** |
| Worst position residual | **0.678 mm** |
| Insertion point vs the independent extraction, worst | **0.661 mm** |
| Rotation ≤ 0.01° | **344** (worst 0.0000°) |
| Width residual ≤ 1 mm | **270 of 270** |
| Depth residual ≤ 1 mm | **270 of 270** |
| Footprint overlap with the measured hull | min **97.0%**, median **99.7%** of the union |
| Worst false positive (floor claimed, not measured) | **3.0%** |
| Worst false negative (measured, not claimed) | **1.8%** |
| Worst served vertex off the measured hull | **0.62 mm** |
| Fitted-vs-stated rotation, median | **0.006°** |
| Unresolved | **74** |
| Approximation-only | **0** |

Two of these deserve their own note.

**The overlap is not 1.0 because the served outline is capped at 16 vertices.**
Simplification drops slivers. It may not drop **extent**: the vertices the
oriented box touches are protected, so the served outline and the served
width/depth are two statements of one measurement rather than two numbers that
disagree by up to 286 mm — which is what an unprotected simplification produced
and what the browser regression caught.

**An independent check on placement.** 115 of 270 measured outlines touch a
structural column — and the columns come from a *different* extraction of the
same drawing. The worst single case is **6.3% of one outline**, which is what
this figure has to be read by: machines are drawn hard against columns and a
convex outline swallows the corner of one, while a transform error would show as
machines sitting squarely on top of them.

> **Correction.** This was first reported as *1 of 270*. That figure came from a
> polygon intersection that returned nothing: the canonical frame reflects z, so
> a polygon counter-clockwise in the CAD arrives clockwise, and the clip put
> every point outside. Fixed, with unit tests, in `convexIntersection`. See
> [equipment-display-geometry.md §10](equipment-display-geometry.md#10-overlap-and-room-crossings).

### Browser regression

`tests/playwright/factory-twin-regression.js`, **518 assertions, 0 failures**,
including:

- every drawn asset carries the rotation the CAD stated — 344 boxes turned to
  the CAD angle, 0 mismatched, worst 0.000000°
- **the drawn rectangle IS the record** — the four floor-plane corners the
  renderer put on screen, matched both ways against corners generated in Node
  by the one canonical helper (worst 0.001 mm across 270 machines)
- exactly the 270 assets with an extent are drawn with one, and exactly the 74
  without are drawn as markers
- every asset with an extent is drawn at exactly that extent (worst 0.0)
- no drawn asset invents an extent, and no display geometry is served at all
- every CAD asset remains `UNMAPPED` with a null device id

---

## 6. What is served, and what never leaves the host

Served per machine: id, position, rotation, footprint, footprint status/source/
shape, the measured outline, mirrored flag, geometry status, confidence, height
status, zone id, zone status, mapping status, device id.

**Never served:** the CAD layer name, the block name, the entity handle, the
block's family size, the entity counts, the nesting depth, the scale. A layer
or block name in this drawing identifies a vendor or a process. Provenance is
recorded in full in the private document and stays there.

`mapping_status` is derived from the server's mapping table, **never** from the
private record's own claim — a document asserting `MAPPED_TO_IMS` without a
device behind it cannot light a machine up on the map. A unit test asserts this
with a deliberately lying record.

---

## 7. Unresolved, with reasons

| Category | Count | Why |
|---|---:|---|
| `BELOW_MACHINE_SCALE` | 73 | The measured extent is smaller than any machine on this floor — longest side 112 mm to 1,795 mm, median 154 mm. These are fittings, fixings and symbols. The position is kept; no size is claimed. |
| `OFF_MACHINE_AREA` | 1 | One block measures 27.7 × 25.5 m: it draws a process region, not one asset. Extent withheld, position kept. |
| `NO_BLOCK_GEOMETRY` | 0 | — |

Neither category is an error state. A record with an unresolved extent is drawn
as a small, deliberately uniform marker; the renderer never substitutes a
nominal box, and the geometry validator fails the build if an `UNRESOLVED`
record carries a footprint.

**163 machines are flagged as overlapping a neighbour** — 31 pairs where one
outline sits inside another and 432 partial pairs above a quarter of the smaller
outline. They are reported, not resolved by deletion or by moving anything: an
overlap in the drawing is a fact about the drawing. The outlines are convex, so
this is an upper bound on physical interference rather than a collision count —
the hull of an L-shaped machine covers space the machine does not occupy.

> **Correction.** First reported as *23 machines, 19 pairs*, from the same
> empty-intersection defect described above.

---

## 8. Known limitations

1. **The served outline is a convex hull.** It is an outer bound of the machine:
   a C-shaped machine is served as the shape that wraps it. Concavity is lost.
   The extent, the rotation and the position are exact; the outline is exact
   only for convex machines.
2. **Hatch is excluded.** A machine outlined *only* by a hatch boundary and by
   nothing else would be missed. None was found, but nothing checks for it.
3. **`MLINE` is still never read**, on any layer.
4. **Height is not evidence.** A plan carries no elevation. Every block is drawn
   at the same presentation height for exactly that reason, and
   `height_status` stays `unknown`.
5. **No machine identity exists in the CAD.** One block on this floor carries
   attributes and its tags are dimension letters, not an asset name. No
   machine-to-IMS mapping is inferred from position, sequence, name similarity
   or grid symmetry, and none is asserted: every record renders physically and
   none receives live state.
6. **The measurement reference shares a transform library with the extractor.**
   The reconciliation therefore proves the frame, the rounding, the
   simplification and the record assembly — not the transform maths itself,
   which is proven by the unit tests and corroborated by the independent
   insertion-point extraction and by the column check.

---

## 9. Reproducing it

```bash
FLOOR1_DXF=<path to the private DXF> node --max-old-space-size=8192 \
  scripts/extract-floor1-equipment.js

node tests/lint/floor1-geometry-validator.js
node tests/lint/floor1-cad-reconciliation.js
node tests/lint/floor1-orientation.js
node tests/unit/floor1-cad-blocks.test.js
node tests/lint/private-data-leak-scanner.js
```

The extractor refuses to run without the drawing and refuses to write if the
CAD envelope disagrees with the model's declared envelope by more than 50 mm.
