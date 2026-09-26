<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../README.md"><img src="assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="README.md"><img src="assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Floor 1 Equipment — Operational Footprint v2

The operator-facing footprint: how it is derived, what it is allowed to change,
what it provably does not change, and where the accuracy of a rectangle stops
being a software problem and becomes a property of the drawing.

> [!IMPORTANT]
> This document contains **no facility geometry**. No coordinate, layer name,
> block name, machine identity or drawing content appears here — only counts,
> distributions and rules.

Companion documents:
[equipment-geometry-audit.md](equipment-geometry-audit.md) (how the physical
measurement is obtained) and
[equipment-display-geometry.md](equipment-display-geometry.md) (the display
vocabulary and the label, colour and overlap policy).

---

## 1. Why v1 was not enough

v1 drew every resolved machine as one oriented rectangle measured on the
**INSERT rotation** — the angle the drawing states for the block reference.
That is the right axis to *reconcile* on, because it is the angle the CAD
asserts. It is not always the axis the machine's **body** lies on: a block can
draw its body at a fixed angle inside its own definition and then be placed by
an INSERT at 0°. Measured on the INSERT axis, such a machine reports a box
larger than the machine in both directions.

Measured cost of v1 across the 270 resolved machines: median +20.5 %, p90
+31.6 %, p95 +44.0 %, worst +65.1 % of area claimed beyond the measured
geometry, with 119 machines above +30 %.

v2 changes **one thing**: the axis the same measured geometry is measured on,
plus the centre that measurement produces. It changes no position, no rotation
and no physical dimension — see §5, which proves that with residuals.

---

## 2. Architecture

```
RAW CAD
  → CAD TRANSFORM        composed INSERT chain, nesting, scale, mirror
  → PHYSICAL EQUIPMENT MODEL   hull of the block's own physical geometry
  → PHYSICAL RECONCILIATION    served record vs the measurement, in CAD mm
  → OPERATIONAL FOOTPRINT      the same hull, measured on the body axis
  → 2D EAP  /  3D BOX          one instanced batch, one shared geometry
```

Each stage reads the stage above and adds fields; none rewrites one. The
physical model remains the engineering reference and is what the reconciliation
compares against. The operational footprint is a **measurement of the same
geometry on a different axis**, never a new geometry.

---

## 3. Derivation rules

For each machine, in order:

1. **Resolve the block** and expand every nested INSERT as a composed matrix
   product — never a product of bounding boxes.
2. **Filter** non-machine geometry by CAD structure (§4).
3. **Hull** the retained geometry. An affine map sends a convex hull to the
   hull of the image, so each block is hulled once in its own coordinates and
   the hull is transformed per instance.
4. **Body axis.** Fit a minimum-area rectangle to the hull and fold its angle
   against the INSERT rotation into a signed quarter-turn offset
   (`axisOffset`, half-open on ±45°). The fold must be **signed**: an unsigned
   fold turns half the machines the wrong way, and a machine turned the wrong
   way measures *larger*.
5. **Vote per (block, handing).** The offset is a property of the block, not of
   the instance, so instances of one block with one handing vote on it. A
   mirror negates the block-local body angle, so mirrored and unmirrored
   instances are separate groups, and instances below machine scale do not
   vote. Measured agreement: 84 groups, worst disagreement between instances of
   one group **3.332°**, 23 groups off-axis at all.
6. **Bound it.** Beyond ±5° the block's geometry is saying something the INSERT
   does not. The offset is **not applied**: the CAD rotation is preserved and
   the record carries `orientation_geometry_mismatch`. 8 machines are flagged
   this way; 0 flagged machines were turned.
7. **Measure** the oriented extent of the hull on `rotation_deg + offset`. That
   extent's width, depth **and centre** are the operational footprint.

### Orientation preference order

| Rank | Source | Used |
|---|---|---|
| 1 | Canonical CAD INSERT rotation | always the base angle |
| 2 | Block-local physical geometry orientation | as a bounded offset, 138 machines |
| 3 | Minimum-area rectangle orientation alone | never used as an override |

The canonical rotation is never replaced. There is exactly one rotation
convention in the codebase (`twinBoxCorners` / `CAD_ROTATION_SIGN`); the
validator, the reconciliation and the browser regression all measure against
that one helper and none reimplements it.

### Why the footprint carries a centre delta

One hull measured on two axes has **two extent centres**. The physical extent
centre (INSERT axis) is the machine's `position`. The operational extent centre
(body axis) is a different point — up to 209.7 mm away on the machines that
were re-measured, and up to 1472.9 mm on the six with an excluded enclosure.

Drawing the operational **size** at the physical **centre** cuts measured
geometry away: on this floor it left up to 161 mm of measured machine outside
the drawn rectangle on 52 machines. So the record publishes the delta:

```json
"operational_footprint": { "width": …, "depth": …, "offset_x": …, "offset_z": … }
```

The delta is a **relative** measurement. It cannot place anything on its own,
it is zero for every machine measured on its INSERT axis, and it is rejected on
the wire if it is not two finite numbers or if it exceeds half the machine's own
diagonal — a delta longer than the machine is a move, not a measurement. The
validator additionally rejects a delta on a record that re-measured nothing
(no body-axis offset and no excluded enclosure).

`position` itself is never written back. Everything that reads a machine's
location — the inspector, the coordinate snapshots, the reconciliation, the
regression's "nothing moved" checks — reads `position`.

---

## 4. Filtering rules

Every rule is **deterministic, block-aware, layer-aware and entity-type-aware**.
No rule exists because it made a rectangle smaller.

| Rule | CAD evidence | Why it is not machine body | Effect |
|---|---|---|---|
| Annotation entity types excluded | TEXT, MTEXT, ATTDEF/ATTRIB, DIMENSION and leaders carry no body geometry | a dimension chain measures the machine, it is not the machine | 344 records measured with annotation entities already removed |
| Drafting layers excluded by name class | dimension, centreline and Defpoints layers | drafting aids | 26 blocks shrank, by at most 227.4 mm; **subtractive only** — 13 blocks draw their whole body on such a layer and were kept whole rather than emptied |
| HATCH excluded | a HATCH carries seed and pattern points under the same group codes as geometry | fill over a boundary that is already drawn | reading them inflated one block from 36 m to 122 m; a machine outlined *only* by hatch would be missed, and that is the accepted false-negative risk |
| Enclosure exclusion (structural) | one `(layer, entity-type)` group whose hull **contains every point** of all the others and is **≥ 3×** their area, with a polygon still remaining | a group drawn around the whole machine is an envelope, not the body | 6 machines, all instances of one block |

The enclosure rule is **containment and scale**, not "whichever group shrinks
the box most". At most one group can satisfy it, the test is on the geometry's
structure rather than on the outcome, and every affected record declares
`operational_excludes_enclosure` so the exclusion is visible in the inspector
and exempted explicitly in the containment proof.

**False-positive risk.** The enclosure rule would wrongly exclude a machine
whose real body is drawn as one large outline with small detail inside it. The
3× area ratio plus full containment makes that unlikely but not impossible; the
6 affected records are flagged rather than silently trusted, and confirming what
that block's outer group represents needs an authoritative answer from the
drawing's owner. **Blocked, not guessed.**

**Rejected filtering.** An "oracle" that removes whichever geometry group
shrinks the rectangle most would reach ≈0.9 % median area excess. It is not
implemented: selecting geometry *because* it improves the metric is exactly the
manipulation this work is forbidden to do, and selecting it by layer name would
require authoritative knowledge of what those layers draw, which does not exist
here.

---

## 5. Physical truth: residuals

The extractor at the previous commit was re-run against the same drawing into a
scratch directory, and every physical field of the two documents was compared
record by record.

| Residual | Records | Result |
|---|---:|---|
| Position (x, y, z) | 344 | **0** |
| Insertion point | 344 | **0** |
| Rotation | 344 | **0°** |
| Measured footprint width / depth | 270 | **0** |
| Measured outline vertices | 213 outlines | **0** |
| Measurement-reference hull (CAD mm) | 344 | **0 mm** |
| Measurement-reference box (CAD mm) | 344 | **0 mm** |
| Mirror flag / scale / footprint shape class | 344 | **0 changes** |

Nothing was moved, turned, resized, or reclassified. The operational fields are
**additions**.

---

## 6. Containment proof

The rectangle is regenerated exactly as the renderer generates it — from
`position` + published delta, at `rotation_deg` + published offset, with the
published width and depth — converted back into the CAD's own millimetre frame,
and every vertex of the **full measured hull** is tested against it.

| Result | Value |
|---|---|
| Resolved machines checked | 270 |
| Excluded-enclosure records (declared exception) | 6 |
| Containment pass | **264 / 264 = 100 %** at a 1 mm tolerance |
| Worst vertex outside | **0.654 mm** (millimetre rounding of the served size and delta) |
| Rectangles serving less area than their own minimum-area rectangle | 63, worst shortfall **0.054 %** — the same rounding |
| Rectangles larger than the physical extent | **0** |
| Rectangles tighter than the physical extent | 68 |

No retained geometry belongs to another machine: the hull is built from **one
block reference's own** entity set, expanded through its own nesting chain. A
block that draws more than one machine is not measured at all — it is
`UNRESOLVED` with its CAD-stated position kept.

### Neighbours, columns, rooms — reported, never resolved

| Relationship | Count |
|---|---|
| Machine rectangles sharing floor with another | 1139 pairs, worst overlap 160.0 m² |
| Rectangle over a structural column | 232 overlaps across 110 machines, worst 1.0 m² |
| Machines inside one room | 192 |
| Machines crossing a room boundary | 70 |
| Machines outside every room boundary | 19 |
| Unresolved (no extent to place in a room) | 63 |

Every one of these is where the drawing puts it. Nothing is nudged, snapped,
centred or separated. An overlap is a fact about the drawing (or about a
convex hull over a non-convex machine), and moving a machine to hide it would
destroy the only evidence that it exists.

---

## 7. Area quality — and the limit

Ratio of the drawn rectangle's area to the area of the geometry it is drawn
around, over the 264 machines without a declared enclosure exclusion:

| Measure | Physical extent (v1 axis) | Operational rectangle (v2) | Minimum-area rectangle (best any rectangle can do) |
|---|---:|---:|---:|
| Median | +16.9 % | **+16.9 %** | +16.9 % |
| p90 | +31.6 % | **+31.2 %** | +31.2 % |
| p95 | +31.6 % | **+31.2 %** | +31.2 % |
| Worst | +65.1 % | **+65.1 %** | +60.5 % |

Against the geometry each record actually publishes (i.e. including the six
enclosure exclusions), across all 270 rectangles: **median +14.3 %, p95
+31.2 %, worst +65.1 %.**

Share of machines within a target: **30.7 % within 10 %**, **53.0 % within
20 %**, **96.6 % within 35 %**.

### The target of ≤10 % median is not reachable — and this is why

The third column above is the decisive measurement. `minAreaRect` returns the
smallest-area rectangle of **any** orientation that contains a convex hull; it
was cross-checked against an exhaustive 0.01° sweep (3.8033 m² swept vs
3.8031 m² fitted). Its median is **+16.9 %**.

So for this equipment set, on this drawing, **no rectangle at any angle and any
centre can do better than ≈17 % median without cutting measured geometry away.**
The remaining excess is not an orientation error and not a filtering error: it
is the difference between a rectangle and the shape of these machines. Many of
them are L-shaped, tapered or chamfered, and a rectangle around an L claims the
empty corner by definition.

Three things could move the number, and all three need evidence this repository
does not have:

1. **Layer semantics.** An authoritative statement of what each detail layer in
   these blocks draws would allow further structural filtering. Guessing from
   layer names is forbidden.
2. **A non-rectangular operator symbol.** A convex outline would track the
   machines closely, and was deliberately removed in v1 for legibility. That is
   a UX decision, not a geometry one.
3. **Per-machine confirmation** of the six enclosure exclusions, and of whether
   similar envelopes exist in other blocks.

The target was **not** met, the measurement was **not** manipulated to meet it,
and the blocker is stated as a measured property of the geometry.

---

## 8. Unresolved equipment

| Reason | Count | What it means |
|---|---:|---|
| `BELOW_MACHINE_SCALE` | 73 | the block's measured extent is below the machine-scale gate |
| `OFF_MACHINE_AREA` | 1 | measured area outside the accepted machine-area band |
| **Total** | **74** | |

An unresolved record keeps its **CAD-stated position** and receives **no
invented width or depth**. It is drawn as a small uniform marker that carries no
dimensional claim, and the wire refuses to serve a rectangle for it even if the
private document labels it one.

---

## 9. Renderer architecture

**One representation.** The 2D plan and the 3D view are the same objects seen
from different angles — same centre, same rotation, same width, same depth,
same world scale. There is no screen-space sizing anywhere: a 3.2 m machine is
3.2 m at every zoom, and legibility is handled with level of detail, labels and
selection, never by resizing a machine.

**Height stays unknown.** A plan carries no elevation, so every block is drawn
at one constant presentation height, identical for all machines, and the
inspector says `PRESENTATION_ONLY`. The regression asserts that exactly one
distinct height exists across every sized block: a varying height would read as
data.

**Instancing.** The equipment layer is two `InstancedMesh` batches — one for
machines, one for markers — sharing **one** unit box geometry. Each instance is
a 4×4 matrix: translate to the record's own centre, rotate to its own angle,
scale to its own operational size. A matrix cannot introduce a coordinate; it
can only place the record's. Per-instance metadata (record, tier, index) lives
in `userData`, separate from the geometry.

**Picking.** A ray is cast at the batches and the hit's `instanceId` indexes the
same metadata list, so a pick resolves to exactly one equipment record.

**Measured outlines** — the physical hulls the rectangles were derived from —
are an inspection layer: off by default, drawn as **one** merged object, and
excluded from the normal render path.

---

## 10. Instancing benchmark

Same page, same drawing, same machines. "Before" is the previous per-mesh
renderer; "after" is the instanced one. Headless Chromium, four viewports.

| Metric | Before | After |
|---|---:|---:|
| Equipment scene objects | 344 | **2** |
| Equipment instances drawn | 344 | 344 |
| Scene meshes (whole model) | 579 | **235** |
| Draw calls | 670 | **328** |
| Distinct geometries | 141 | **74** |
| Triangles | 14 536 | 14 536 |

Frame time (ms, p95) and interaction latency (ms, p95):

| Viewport | Frame p50 | Frame p95 | Pan p95 | Zoom p95 | Pick p50 | Pick p95 |
|---|---:|---:|---:|---:|---:|---:|
| 1366×768 | 58.9 → 60.7 | 82.2 → **74.0** | 145 → 156 | 139 → 156 | 0.1 → 0.1 | 0.3 → 0.2 |
| 1920×1080 | 103.5 → 104.1 | 128.4 → 132.3 | 229 → 232 | 277 → 278 | 0.0 → 0.1 | 0.2 → 0.5 |
| 2560×1440 | 186.8 → **169.3** | 238.4 → **195.7** | 458 → 451 | 412 → **347** | 0.1 → 0.1 | 0.3 → 0.3 |
| 3840×2160 | 377.9 → 394.6 | 477.1 → 532.3 | 875 → 1014 | 807 → 846 | 0.1 → 0.2 | 0.3 → 0.5 |

**Honest reading.** Instancing halved the draw calls and cut the equipment
layer from 344 scene objects to 2, and it did **not** produce a reliable frame
time improvement. It cannot: the reported renderer is

```
ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)
```

— a **software rasteriser**. Frame time in this environment scales with pixel
count, not with draw calls: it roughly quadruples from 1366×768 to 3840×2160
while the triangle count is constant. The p95 targets (≤16.7 / ≤20 / ≤33 ms)
are unreachable under software rasterisation and the numbers above are **not**
a statement about hardware-accelerated behaviour. No GPU timing is reported
because none is measurable here.

What *is* measured and does transfer: fewer draw calls, fewer geometries, one
shared material per tier, constant triangle count, and picking latency at
0.1–0.5 ms p95.

---

## 11. Picking proof

| Check | Result |
|---|---|
| Probe grid (1920×1080, 80 × 45 points) | 3 600 probes, 697 hits |
| Hits landing inside the drawn machine's own projected silhouette | **697 / 697** |
| Hits resolving to more than one equipment record | **0** |
| Pick latency | p50 0.1 ms, p95 0.5 ms |
| Same-point parity with the previous renderer (60 × 34 grid, 2 040 probes) | 1 979 identical |

The 61 differing probes are all at machine edges, and involve machines whose
drawn rectangle legitimately changed in this phase — 68 rectangles are tighter
than the physical box the previous renderer drew, and 81 are re-centred on their
own measured centre. A smaller target catches fewer edge pixels. The
silhouette check above is the decisive one: every pick names the machine whose
drawn body covers the pixel.

The inspector still resolves record id, mapping status, physical evidence and
room from the picked record. No drill-down to a live machine exists, because
**no authoritative physical↔IMS mapping exists**: 344 records, 0 mapped, and
identity is never inferred from position, sequence, name similarity or grid
symmetry.

---

## 12. Test counts

| Suite | Result |
|---|---|
| `tests/unit/floor1-cad-blocks.test.js` | 40 passed, 0 failed |
| `tests/unit/factory-twin-wire.test.js` | 86 passed, 0 failed |
| `tests/lint/floor1-geometry-validator.js` | 0 errors, 0 warnings |
| `tests/lint/floor1-cad-reconciliation.js` | PASSED (all wall, opening and room gates unchanged) |
| `tests/playwright/factory-twin-regression.js` | **518 passed, 0 failed, 0 skipped** |

Wall and room gates, unchanged by this work: 99.8 % wall fidelity, 94.5 %
drawing coverage, 10 angled walls preserved, 0 model-closed openings, 815
dangling ends, 32 rooms, 194/194 room vertices within 1 mm of a raw drawing
endpoint.

Orientation coverage in the unit suites: 0°, 90°, 180°, 270°, 70.2°, −70.2°,
359.99°, mirrored INSERTs against their unmirrored twins, nested blocks, and
positive and negative scale. Corners are verified from the transform basis
vectors read back out of the instance matrix, not from a recovered angle — an
angle recovered with the wrong sign reported errors of exactly twice the true
value once, which is why the basis is read directly.

---

## 13. Known limitations

1. **Median area excess is +16.9 %, not ≤10 %.** Proven unreachable for a
   rectangle on this geometry (§7). Accepted and documented rather than forced.
2. **Six enclosure exclusions need owner confirmation.** The rule is
   structural, but what that block's outer group represents is not stated by
   the drawing.
3. **Eight machines carry `orientation_geometry_mismatch`.** Their block
   geometry disagrees with their INSERT rotation by more than 5°. The CAD
   rotation is preserved and the record is flagged for an engineer.
4. **A machine outlined only by HATCH would be missed.** Accepted
   false-negative, stated in the audit.
5. **Frame time is fill-bound under software rasterisation.** No hardware
   measurement is available in this environment.
6. **Height is not evidence.** No elevation exists in a plan view; every block
   is `PRESENTATION_ONLY`.
7. **No physical↔IMS mapping.** 0 confirmed mappings; no machine shows live
   state, and none may be inferred.
