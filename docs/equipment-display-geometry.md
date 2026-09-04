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
physical measurement itself is obtained.

---

## 1. The problem

The measured footprint is a **convex hull of the block's own geometry** —
every bracket, pipe stub and access step the vendor drew. It is the right
answer for reconciliation: it is what the CAD says, at millimetre residuals.
It is the wrong symbol for an operational map. 213 machines carrying 34-vertex
hulls read as noise, and noise on a floor plan is not neutral — it makes a
map harder to act on.

So the model now holds **two** geometries per machine, and they have different
jobs:

| | Physical | Display |
|---|---|---|
| What it is | the measurement | a derived symbol |
| Where it comes from | the CAD block, transformed | the physical geometry, deterministically |
| Vertices | up to 16 served, full hull kept privately | 4 to 12 |
| Who draws it | the inspection layer, on request | the renderer, always |
| Who checks against it | the reconciliation | nothing — it is the derived side |
| May it move a machine | it defines where the machine is | **never** |

---

## 2. The pipeline, and the rule about it

```
RAW CAD → CAD TRANSFORM → PHYSICAL EQUIPMENT MODEL → RECONCILIATION
        → DISPLAY GEOMETRY → 2D EAP → 3D DERIVED VIEW
```

One canonical physical model, one derivation from it. The renderer has **no
geometry of its own**: it does not re-measure, re-fit or re-place anything, and
there is no second implementation of the transform chain anywhere in the client.
The 2D plan and the 3D view are the **same meshes** seen from different angles,
so they cannot disagree about where a machine is or how large it is.

`display_geometry = f(physical_geometry)` is pure, deterministic and unit
tested (`scripts/lib/cad-blocks.js`, `tests/unit/floor1-cad-blocks.test.js`).
No manual coordinate appears anywhere in it.

---

## 3. Classification

Every record carries exactly one class. Assignment is by measured evidence, not
by appearance.

### A — `ORIENTED_RECTANGLE` (57 machines)

The hull fills **≥ 97 %** of its own oriented box. The machine *is* a box, so
it is drawn as one: the measured centre, the measured width and depth, the
measured rotation. Rendered from a **shared, cached box geometry** turned to the
machine's angle — one allocation per distinct size, not one per machine.

### B — `CHAMFERED_RECTANGLE` (46 machines)

A rectangle with its corners cut. The cut is not chosen; it is **solved**. For
the corner at `(+hw, +hd)` in the machine's own frame, a symmetric cut of depth
`d` removes everything with `u + v > (hw + hd) − d`, so the largest cut that
removes **no measured point** is exactly

```
d = (hw + hd) − max(u + v)   over the measured hull
```

— an equality, not a search. Four corners, four cuts, 4 to 8 vertices. Each cut
leaves the box's four extreme ordinates untouched, so **width, depth and centre
survive exactly**. A corner whose cut is under 2 % of the shorter side is left
square rather than given a cosmetic bevel.

Accepted only when the chamfer is within **6 %** of the measured area. That
threshold is where rounded shapes start passing — a 5 × 2 ellipse chamfers to
within 10.8 % of its own area, and an ellipse is not a rectangle with its
corners cut off. Real cut-cornered machines here land under 3 %.

### C — `SIMPLIFIED_POLYGON` (167 machines)

Genuinely not a rectangle. The measured hull is reduced to at most **12**
vertices by repeatedly dropping the vertex whose removal loses the least area —
**except** the vertices the oriented extent is measured to, which are protected.
That protection is the whole reason width, depth and centre survive the
reduction: an unprotected simplification once published a width and an outline
that disagreed by **286 mm**, and the browser regression is what caught it.

### D — `UNRESOLVED` (74 machines)

No measured footprint, so **no display polygon at all**. A uniform marker is
drawn at the CAD-stated position. No dimension is invented, and the wire refuses
to serve a display outline for a record with no footprint even if the private
document grew one.

---

## 4. Tolerances, measured

| | Bound | Measured |
|---|---:|---:|
| Machine moved by derivation | 0 (1 mm publication quantum) | **0 moved**, worst 0.500 mm |
| Machine resized by derivation | 0 (1 mm publication quantum) | **0 resized**, worst 1.075 mm |
| Rectangle width/depth vs measured | exact | worst 1.000 mm |
| Measured outline left uncovered | ≤ 5 % | **2.3 %** |
| Floor claimed beyond the measurement | ≤ 7 % | **6.0 %** |
| Display vertices per machine | 4–12 | mean **9.44**, max **12** |

The millimetre in the first three rows is not slack. Coordinates are published
in metres to three decimals, so an extent measured back off two published
vertices differs from a separately published width by half a millimetre at each
end and by nothing else.

`display_area_error` is signed and travels with every record:
`(display area − measured area) / measured area`. Rectangles and chamfers
**contain** the hull, so theirs is ≥ 0; simplified polygons only drop slivers,
so theirs is ≤ 0. Worst claimed **+6.0 %**, worst dropped **−3.9 %**.

---

## 5. What is preserved, and what enforces it

| Preserved | Enforced by |
|---|---|
| `position` | display shapes carry **no centre of their own** — every one is built around the record's own position |
| `rotation_deg` | display shapes carry **no angle of their own** — the machine's own axes are the frame each is built in |
| `footprint.width` / `.depth` | the support vertices of the oriented extent are protected from every reduction |
| the measured outline | kept in the record, drawn by the inspection layer, used by the reconciliation |
| CAD provenance | private, unchanged, never served |
| room polygons, walls, IMS mapping | untouched by this pass |

Three independent layers check it: the geometry validator (per record, in the
document), the CAD reconciliation (residuals, against the measurement written
before the canonical transform), and the browser regression (against the mesh
the renderer actually drew).

---

## 6. Inspection

Layer **Measured outlines**, off by default. Every measured outline as
line-work, **one merged object and one draw call** for all 213 of them — this
is a diagnostic layer and an operator's frame budget should not pay 213 draw
calls for something switched off.

The inspector adds, per machine: the measured outline class, the drawn display
class, the handing (mirrored or as drawn), the room relationship, and whether
its outline shares floor with a neighbour. Provenance — source file, layer,
block name, entity handle, transform chain — stays in the private document and
is never served.

---

## 7. Labels

An **HTML overlay**, deliberately not geometry. A label drawn in the scene is a
thing on the floor, and an operator should never have to work out whether a
rectangle is a machine or a caption. The overlay cannot intercept a click, so
picking still goes to the canvas underneath.

Level of detail, not a global switch: a caption appears only when the machine it
names is at least **46 px** across on screen, at most **40** are shown at once
(largest first), and the measured size is added only above **190 px**. Nothing
about the machine changes with zoom — world dimensions are untouched. Only
whether its name is legible does.

---

## 8. Overlap, and a correction

Machines are **never moved** to resolve an overlap. Overlap is detected,
recorded on the record (`overlaps_neighbour`), surfaced in the inspector, and
left there.

**A previously reported figure was wrong.** The last pass reported *23*
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

These are **upper bounds on physical interference, not collision counts**. The
outlines are convex: the hull of an L- or U-shaped machine covers space the
machine does not occupy, so a small cabinet standing in the crook of a large
machine registers as fully contained by it. The worst single column overlap is
**6.3 % of one outline**, and only 3 pairs have centres closer than 0.5 m —
a systematic placement error would look nothing like that.

No warning glyph is drawn on the map. 163 of 270 machines carrying a warning is
not a warning; the flag is in the inspector and in the reconciliation output,
where it can be read against its cause.

---

## 9. 3D

Derived from the same records and nothing else: physical centre, physical
rotation, physical width and depth, display outline extruded. Height is **not
in evidence** — a plan carries no elevation — so every machine is extruded to
the same declared presentation constant and `height_status` stays `unknown`.
A varying height would look like data.

---

## 10. Performance

The renderer never builds a mesh from the measured outline.

| | Before | After |
|---|---:|---:|
| Extruded outline vertices (213 machines) | 36,648 | **25,224** |
| Polygon vertices served for drawing | 3,283 | **2,321** |
| Display rectangles drawn from a shared cached box | 0 | **57** |
| Measured outlines drawn, by default | — | **0** (1 draw call when switched on) |

Measured at 1920 × 1080: 670 draw calls, 20,388 triangles, 310 geometries, 27
cached geometries and 8 cached materials, boot ~5.2 s under a software
rasteriser in CI.

---

## 11. Known limitations

1. **The measurement itself is a convex hull**, so both geometries are outer
   bounds of a concave machine. Display simplification does not add that error;
   it inherits it.
2. **A chamfer can claim up to 6 % more floor** than the measurement, and a
   simplified polygon can drop up to 3.9 % of it. Both are bounded, measured and
   published per record.
3. **No machine type is drawn.** The CAD names blocks, not assets, so the label
   carries the model id and the class — never a vendor's name.
4. **Overlap is measured on convex outlines** and over-reports contact, as above.
