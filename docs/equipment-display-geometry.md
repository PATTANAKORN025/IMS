<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../README.md"><img src="assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="README.md"><img src="assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Floor 1 Equipment — Display Geometry

Why the shape an operator sees is not the shape the CAD was measured into, how
the one is derived from the other, and what proves that deriving it moved
nothing.

> [!IMPORTANT]
> This document contains **no facility geometry**. No coordinate, layer name,
> block name or machine identity appears here.

See [equipment-geometry-audit.md](equipment-geometry-audit.md) for how the
physical measurement itself is obtained, and
[equipment-operational-footprint-v2.md](equipment-operational-footprint-v2.md)
for the operational footprint the rectangle is now measured from — the body
axis, its centre, the filtering rules and the acceptance audit.

---

## 1. The decision, stated plainly

> **Normal EAP display intentionally represents every resolved equipment asset
> as an oriented rectangle derived from measured CAD center, width, depth and
> rotation. The rectangle is a visualization abstraction, not a claim that the
> source CAD footprint is rectangular.**

The measured footprint is a **convex hull of the block's own geometry** — every
bracket, pipe stub and access step the vendor drew. It is the right answer for
reconciliation: it is what the CAD says, at millimetre residuals. It is the
wrong symbol for an operational map. An operator asks six questions of a floor
plan — where is the machine, how big is it, which way does it face, which area
is it in, is it mapped to IMS, and if so what is it doing — and a 40-vertex
hull answers none of them better than a rectangle does, while competing with
all of them for attention.

So the model holds **two** geometries per machine, and they have different jobs:

| | Physical | Display |
|---|---|---|
| What it is | the measurement | a drawing convention |
| Where it comes from | the CAD block, transformed | the physical record, at draw time |
| Vertices | up to 16 served, full hull kept privately | 4, generated |
| Who draws it | the inspection layer, on request | the renderer, always |
| Who checks against it | the reconciliation | nothing — it is the derived side |
| May it move a machine | it defines where the machine is | **it has nothing to move one with** |

---

## 2. The pipeline, and the rule about it

```
RAW CAD → CAD TRANSFORM → PHYSICAL EQUIPMENT MODEL → PHYSICAL RECONCILIATION
        → OPERATIONAL FOOTPRINT → 2D EAP → 3D DERIVED VIEW
```

One canonical physical model. The renderer has **no geometry of its own**: it
does not re-measure, re-fit or re-place anything, and there is no second
implementation of the transform chain anywhere in the client. The 2D plan and
the 3D view are the **same meshes** seen from different angles, so they cannot
disagree about where a machine is or how large it is.

---

## 3. The display record owns no coordinates

This is the whole design, and it is what makes the acceptance criterion
provable rather than merely tested.

A record's display fields are:

```json
{ "display_shape": "OPERATIONAL_RECTANGLE",
  "display_source": "filtered_physical_footprint",
  "display_area_error": 0.143,
  "operational_footprint": { "width": …, "depth": …, "offset_x": …, "offset_z": … },
  "operational_axis_offset_deg": … }
```

A class, a cost, and a **relative** measurement: a size, an angle offset and a
centre delta. **No absolute centre, no absolute angle, no polygon** — not in the
private document, not on the wire, not in the client. The renderer builds the
rectangle from `position`, `rotation_deg` and those three, and from nothing
else. Every one of the three is zero-able: with a zero offset and a zero delta
the rectangle is the physical extent at the physical centre, which is what most
machines get.

Why the delta exists, why it can never move a machine, and what rejects one
that tries, is
[equipment-operational-footprint-v2.md §3](equipment-operational-footprint-v2.md#3-derivation-rules).
`position` and `rotation_deg` are never written back, and every check that asks
"did anything move" reads them, not the drawn rectangle.

Two classes exist and no more:

- **`OPERATIONAL_RECTANGLE`** — 270 machines. An oriented rectangle on the
  machine's own body axis.
- **`UNRESOLVED`** — 74 machines. No measured extent, so no rectangle. A
  uniform marker of a constant size stands at the CAD-stated position and
  carries no dimensional claim. The wire refuses to serve a rectangle for a
  record with no footprint even if the private document labels it one.

### One rotation convention

The canonical frame reflects z, so a machine served at +30° has its own axis at
−30° in (x, z). That sign has been got wrong once already, so there is exactly
one corner generator — `twinBoxCorners` in `scripts/lib/cad-blocks.js` — and
its client counterpart is the single `mesh.rotation.y = CAD_ROTATION_SIGN · θ`
in the renderer. The validator, the reconciliation and the browser regression
all measure against that one helper; none of them reimplements it. Unit tests
cover 0°, 90°, 180°, 270°, 70.2°, −70.2° and 359.99°, a very large machine, a
machine near the 600 mm size floor, and a mirrored INSERT against its
un-mirrored twin.

---

## 4. The proof that drawing rectangles changed zero positions

Measured on the current build, at three independent layers.

| Assertion | Where | Result |
|---|---|---|
| Machines moved | validator, reconciliation, browser | **0 of 344** |
| Physical position / rotation / dimension residual vs the previous build | regenerated document, field by field | **0** |
| Machines resized | validator, reconciliation | **0 of 270**, worst 0.000 mm |
| Rotations changed | reconciliation | **0 of 344**, worst 0.0000° |
| Drawn centre vs served position | browser, on the mesh | **0 m**, 344 assets |
| Drawn corners vs generated corners | browser vs Node | worst **0.001 mm**, 270 machines |
| Drawn extent vs served width/depth | browser, on the mesh | worst **0.00e+0 m**, 270 boxes |
| Display geometry on the wire | browser, on the payload | **0 records** |
| Unresolved acquiring an extent | wire, validator, reconciliation, browser | **0** |

The corner check is the strongest of these: it takes the four floor-plane
corners the renderer actually put on screen — read out of the mesh's own world
matrix, so the rotation convention comes from the renderer and not from the
test — and matches them **both ways** against corners generated in Node by the
canonical helper from the served record. Neither a swapped corner nor a
collapsed one can pass it. The residual is 0.001 mm, which is the micrometre
rounding the probe itself applies.

---

## 5. The cost of the abstraction, published per record

A rectangle covers floor the machine does not occupy. This is not an error and
it is not hidden: it is the price of the decision in §1, it is measured, and it
travels with every record as `display_area_error` —
`(box area − measured area) / measured area`.

| | Value |
|---|---:|
| Median rectangle | **+14.3 %** more floor than the geometry it is drawn around |
| p90 | +31.2 % |
| p95 | +31.2 % |
| Worst | **+65.1 %** |
| Rectangles claiming more than 30 % | 113 of 270 |
| Measured geometry left outside the rectangle | **0.654 mm** worst |

The sign can only be positive: an oriented box **contains** the hull it was
measured from, so a rectangle can never cut inside a machine. The 0.04 %
uncovered is the millimetre publication quantum of the served outline poking
past its own box, not a rectangle clipping a machine.

A rectangle cannot go below this without cutting measured geometry away: the
minimum-area rectangle of the same hulls has the same median. See
[equipment-operational-footprint-v2.md §7](equipment-operational-footprint-v2.md#7-area-quality--and-the-limit).

The reconciliation gates both the worst (limit 70 %) and the **median** (limit
20 %), so this price cannot grow unnoticed — which matters, because it is
exactly the number that would move if the extraction started measuring
something larger than a machine.

An operator who needs the truth switches on **Measured outlines** and sees it.
The inspector states it per machine, in words, on the record.

---

## 6. What this replaced, and why

The previous pass derived a simpler *outline* per machine: 57
`ORIENTED_RECTANGLE`, 46 `CHAMFERED_RECTANGLE` (corner cuts solved by the
equality `d = (hw + hd) − max(u + v)` over the hull), 167 `SIMPLIFIED_POLYGON`
(≤ 12 vertices with the extent's support vertices protected). It was faithful:
mean 9.44 vertices against 40 measured, worst 6.0 % claimed, worst 3.9 %
dropped.

It was also **three shapes where one would do**, and the fidelity bought
nothing an operator uses. Four consequences of dropping it:

1. **A shape class no longer varies with a machine's drafting.** Two identical
   machines drawn by two vendors could land in two different display classes;
   an operator reading the map has no way to know that difference is about the
   drawing rather than about the machine.
2. **The display layer stopped owning coordinates.** Simplified outlines were
   real polygons in world space — the thing that could, in principle, drift.
   Now there is nothing to drift.
3. **Simplification defects became impossible rather than tested.** An
   unprotected vertex reduction once published a width and an outline that
   disagreed by 286 mm. That whole failure mode is gone with the code.
4. **The renderer draws 67 cached boxes instead of 213 extrusions.**

What was lost is honest to state: the map no longer shows that a machine has a
cut corner or an L-shaped body. That information is in the record, in the
inspector, and in the inspection layer — and it is now the *only* place it is,
which is a clearer contract than having a half-faithful version of it on the
operator map.

---

## 7. Inspection

Layer **Measured outlines**, off by default. Every measured outline as
line-work, **one merged object and one draw call** for all 213 of them — this
is a diagnostic layer and an operator's frame budget should not pay 213 draw
calls for something switched off.

The inspector adds, per machine: the measured outline class, what it is drawn
as, the share of floor the rectangle claims beyond the measurement, the handing
(mirrored or as drawn), the room relationship, and whether its outline shares
floor with a neighbour. Provenance — source file, layer, block name, entity
handle, transform chain — stays in the private document and is never served.

---

## 8. Labels

An **HTML overlay**, deliberately not geometry. A label drawn in the scene is a
thing on the floor, and an operator should never have to work out whether a
rectangle is a machine or a caption. The overlay cannot intercept a click, so
picking still goes to the canvas underneath.

Level of detail, not a global switch:

| Zoom | Shown |
|---|---|
| Building / full floor | nothing, unless a machine is selected |
| Intermediate (≥ 46 px across) | the model id, largest first, at most 40 |
| Close (≥ 190 px across) | the id and the measured size |
| Selected, at any zoom | the id and the measured size |

Nothing about a machine changes with zoom — world dimensions are untouched.
Only whether its name is legible does. There is no machine *type* to show: the
CAD names blocks, not assets.

---

## 9. Colour

Geometry colour encodes **no** physical classification. Every resolved machine
is the same neutral slate rectangle; an unresolved marker is dimmer and more
transparent, which is the resolved/unresolved distinction the model is required
to make visible and not a classification of the machine.

No machine is green, amber or red. Operational colour is reserved for
IMS-backed state, and **0 machines are mapped to IMS**, so every machine's
status is `UNKNOWN` and looks like it. A CAD asset will take operational colour
on the day an authoritative mapping exists and not before.

---

## 10. Overlap and room crossings

Machines are **never moved** — not to resolve an overlap, not to centre one in
a room, not to align one to a wall, and not to snap one to a grid. Both facts
are detected, recorded on the record, surfaced in the inspector, and left
there. There is no glyph on the map: 163 of 270 machines carrying a warning is
not a warning.

**A previously reported figure was wrong.** An earlier pass reported *23*
overlapping machines and *1 of 270* machines touching a structural column. Both
came from a polygon intersection that silently returned nothing:

- the canonical frame reflects z, so a polygon that is counter-clockwise in the
  CAD arrives **clockwise**; the Sutherland–Hodgman clip put every point outside
  and returned an empty intersection — two shapes lying exactly on top of each
  other reported as not touching at all
- a convex outline published at millimetre resolution can come back with a
  one-millimetre **reflex turn** where three vertices were nearly collinear, and
  clipping by a slightly concave polygon cuts away regions that belong in the
  answer

Both are fixed in `convexIntersection` (the clip is rebuilt as a
counter-clockwise convex hull) and both have unit tests. Corrected figures:

| | Reported | Actual |
|---|---:|---:|
| Machines whose outline overlaps a neighbour | 23 | **163** |
| Overlapping pairs (partial / one inside another) | 14 / 5 | **432 / 31** |
| Machines whose outline touches a column | 1 of 270 | **115 of 270** |
| Machines crossing a room boundary | 70 | 70 |

These are **upper bounds on physical interference, not collision counts**. The
outlines are convex: the hull of an L- or U-shaped machine covers space the
machine does not occupy, so a small cabinet standing in the crook of a large
machine registers as fully contained by it. The worst single column overlap is
**6.3 % of one outline**, and only 3 pairs have centres closer than 0.5 m —
a systematic placement error would look nothing like that.

Note that these are measured on the **outlines**, not on the display
rectangles. A rectangle covering 20 % more floor would report more contact
still; the QA metric stays on the measurement, where it means something.

---

## 11. 3D

Derived from the same record and nothing else: the operational centre, the
operational rotation, the operational width and depth, extruded. The 2D symbol
and the 3D box are the same instances, so they cannot disagree. Height is **not in evidence** — a
plan carries no elevation — so every machine is extruded to the same declared
presentation constant, `height_status` stays `unknown`, and the regression
asserts that exactly one height exists across every drawn block. A varying
height would look like data.

---

## 12. Performance

The renderer never builds a mesh from any outline. Measured at 1920 × 1080, in
CI, under a software rasteriser:

| | Before (chamfer/polygon pass) | After |
|---|---:|---:|
| Distinct equipment geometries | 310 total in scene | **67** for 344 machines |
| Equipment geometry vertices | 25,224 extruded | **1,608** (shared boxes) |
| Polygon vertices served for drawing | 2,321 | **0** |
| Triangles | 20,388 | **14,536** |
| Scene geometries | 310 | **141** |
| Draw calls | 670 | **328** |
| Equipment scene objects | 344 | **2** |
| Measured outlines drawn, by default | 0 | **0** (1 draw call when switched on) |
| Boot to first drawn machine | — | **~1.2 s** |

Instancing is now implemented: the 344 machines are two `InstancedMesh` batches
sharing one unit box, and picking still resolves each ray to exactly one record
through the hit's `instanceId`. It halved the draw calls and did **not** improve
frame time, because the CI renderer is a software rasteriser and frame time
there is bound by pixel count, not by draw calls. The measured numbers, both
what improved and what did not, are in
[equipment-operational-footprint-v2.md §10](equipment-operational-footprint-v2.md#10-instancing-benchmark).

---

## 13. Known limitations

1. **The measurement itself is a convex hull**, so the outline is already an
   outer bound of a concave machine. The rectangle is an outer bound of that.
   Both are published; neither is presented as the machine's true perimeter.
2. **A rectangle claims a median 14.3 % and up to 65.1 % more floor** than the
   measurement, and no rectangle can claim less without cutting measured
   geometry away. Bounded, gated, published per record, visible in the inspector,
   and switchable against the truth in one click.
3. **No machine type is drawn**, because the CAD names blocks, not assets. The
   label carries the model id and nothing that came out of the drawing.
4. **Overlap and column contact are measured on convex outlines** and
   over-report contact, as above.
5. **0 machines are mapped to IMS.** Every machine's status is `UNKNOWN`, and
   no status colour is drawn on any of them.
