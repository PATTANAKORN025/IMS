<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Factory Twin — Reconstruction Methodology

How the Floor 1 digital twin was built, what it is allowed to claim, and what
it is not.

> [!IMPORTANT]
> This document contains **no facility geometry**. Dimensions, coordinates,
> areas and process names live only in the private, gitignored data files
> described under [Private/public boundary](#privatepublic-boundary). What is
> documented here is method, contract and limitation.

---

## 0. Current state

What the twin holds today, and on what basis. Status words are used strictly:

| Word | Means |
|---|---|
| **CONFIRMED** | Read directly from the source, cross-checked, and agreeing with an independent value. |
| **OBSERVED** | Detected from the drawing and visually verified, but not independently corroborated. |
| **DERIVED** | Computed from confirmed inputs rather than read. |
| **SIMULATED** | Deliberately not real. Present so the system has something to render. |
| **BLOCKED** | Absent because the source does not exist — not because it was skipped. |
| **WITHHELD** | Extracted, but deliberately not served or drawn because it did not pass validation. |

There is deliberately **no INFERRED state**. Inference is not a weaker kind of
evidence that could be labelled and shown with a caveat; it is the thing this
system exists to refuse. A value nobody read, measured or was told is UNKNOWN,
and stays UNKNOWN. The evidence pipeline enforces this by name: proximity,
sequential identifiers, name similarity, grid symmetry, visual similarity,
machine ordering and MES numbering are each rejected as a basis, and an
unrecognised basis is rejected rather than assumed harmless.

| Asset | Count | Status | Evidence |
|---|---:|---|---|
| Envelope | 1 | CONFIRMED | Printed dimension chains on the plan set |
| Floor-to-floor height | 1 | DERIVED | Difference between printed floor levels across four plans |
| Clear height | — | BLOCKED | No section or elevation exists |
| Footprint polygon | 1 | CONFIRMED | Perimeter traced by ink-coverage measurement; area agrees with the printed figure |
| Structural grid | 1 | CONFIRMED | Printed spans; totals match, cross-checked against bubble spacing |
| Structural columns | 202 | MEASURED_CAD | Read from the CAD at their drawn positions; the earlier 120 raster columns were a correct subset, matched within 1 m at 34 mm median |
| Equipment positions | 344 | MEASURED_CAD | CAD `INSERT` records: insertion point, rotation and scale stated by the drawing |
| Equipment extents | 270 of 344 | MEASURED_CAD | The block's own geometry, transformed through the whole INSERT chain — mirror and nesting included — and measured on the machine's own axes |
| Equipment outlines | 213 of 270 | MEASURED_CAD | The measured convex outline, served where the machine is not a box; an outer bound, not a concave outline |
| Equipment extents withheld | 74 of 344 | UNRESOLVED | Below machine scale (73) or a block that draws a region rather than one asset (1). Position kept, no size claimed |
| Equipment height | — | BLOCKED | A plan view carries no equipment elevation |
| Raster equipment slots | 243 | SUPERSEDED | Retained in the private document, served nowhere, drawn nowhere |
| Monitored devices | 23 | NOT DRAWN | Live telemetry is real; no device has an established position, so none is placed on the floor |
| Physical mappings | 0 | BLOCKED | No authoritative record relates the namespaces |
| Rooms (rendered) | 32 | MEASURED_CAD | The drawing's own closed boundaries on the area layer; 27 carry the drawing's own name, 5 are closed but unlabelled |
| Rooms (label only, no boundary) | 6 | UNRESOLVED | The printed area refutes the only containing boundary, or no boundary contains the label |
| Interior walls | 587 runs | MEASURED_CAD plan | Direction-based face pairing, collinear merging and corner closure from the CAD; thickness measured between drawn faces. 10 of them are not axis-aligned |
| Wall height | — | PRESENTATION_ONLY | Declared 2.6 m constant; no elevation exists in the drawing |
| Doors, windows, air showers | 52 | OBSERVED_CAD | Block insertion points on the opening layers |
| Lift pits | 0 | BLOCKED | Symbols merge with adjacent structure |
| MES census | — | BLOCKED | Only source is a low-resolution screenshot |

**Not complete, and not claimed to be.** Four rows are BLOCKED and one is
UNRESOLVED, each on a missing source rather than unfinished work. See
**[Evidence Requirements](FACTORY_TWIN_EVIDENCE_REQUIREMENTS.md)** for what
would unlock them and what a new source is allowed to claim once it arrives,
and **[Visual QA](FACTORY_TWIN_VISUAL_QA.md)** for the current QA and
performance baseline.

Four distinctions carry most of the weight of this document, and collapsing any
one of them produces a specific wrong decision rather than a rounding error:
**Observed ≠ Confirmed. Simulated ≠ Real. Derived ≠ Measured. Unknown ≠
Missing.** The consequences of each are tabulated in the
**[Operator Guide](FACTORY_TWIN_OPERATOR_GUIDE.md)**.

---

## 0.1 The 2026-08-31 re-derivation

The private geometry was **re-derived from scratch** on 2026-08-31. The working
copy of `private/` had been deleted from the tree along with the reference
images; the images were recovered intact from the owner's own storage, the
derived JSON was not, and it had never been committed — by design, since it is
confidential facility geometry.

What exists now is therefore a fresh derivation from the same sheet by the same
method, not a restored file. Two counts came out different, and they are
reported as measured rather than tuned towards the previous figures:

| | Before | Re-derived |
|---|---:|---:|
| Structural columns | 147 | **120** |
| Equipment slots | 242 | **243** |

The schematic transcription changed too: 55 banks and 240 cells against a
previously recorded 38 and 212. All four discrepancies were traced back to the
sheet; the reconciliation is below.

### Count reconciliation

Four counts differ from the ones the lost file recorded. Each was traced back to
the sheet rather than settled by preferring either number. **No value below was
chosen because a detector produced it, and none was chosen to match the previous
implementation.**

| Object | Previous | Current | Source evidence | Root cause | Final | Confidence |
|---|---:|---:|---|---|---:|---|
| Structural columns | 147 | 120 | 190 grid intersections fall inside the traced footprint; 119 carry a solid column square within 1.8 m. A strip audit along grid line 9 found **6 squares, all 6 detected, no misses and no false positives**. All 96 column-sized squares that are *not* on an intersection were inspected individually. | Every off-node square is equipment or plant detail — pumps, tanks, cabinets, sanitary fixtures — not structural. The previous figure is reached only by associating a square within **5.6 m** of an intersection, which is not a column on that line. The previous detector's output no longer exists and cannot be re-examined. | **120** | HIGH |
| Equipment slots | 242 | 243 | Per-colour connected components under the machine-scale filter. **Magenta (48) and red (19) reproduce exactly.** | The whole delta sits in four layers: green −4, yellow −2, blue −2, black +9. Green and yellow are **not equipment layers on this sheet** — inspection of every green component shows dimension text (including the printed `120300` itself), cable runs and small fixture symbols, so the previous green 18 and yellow 9 counted annotation as equipment. Black differs in the dense south-east cluster, which the lost file's own metadata already named as its known limitation. | **243** | MEDIUM |
| Schematic banks | 38 | 55 | 55 rectangles recovered as closed pairs of vertical edges. **Every one was inspected on a contact sheet**: all are equipment banks, none is the legend frame, a title box or a label box, and none overlaps the legend. | Only **one** adjacent, vertically aligned pair exists on the whole drawing, so "the previous pass grouped adjacent columns" cannot account for 38 against 55. The previous transcription was manual and partial — its own record shows 161 of 212 cells left unread. | **55** | HIGH |
| Schematic cells | 212 | 240 | Cells split at each bank's own internal separator lines. Cells-per-bank runs 1–9 and matches the reference bank by bank. | Same as banks: a partial manual transcription against a complete measured one. | **240** | HIGH |

The medium confidence on slots is deliberate. The count is reproducible from a
stated rule, but the rule's machine-scale floor (1.5 m) is a threshold, and
twenty green components sit just under it at 0.4–1.2 m in one dimension. Those
are sub-parts of symbols rather than machines, but the boundary is a judgement
and is recorded as one.

---

**What the re-derivation is checked against.** Every check below comes from the
drawing itself, not from the file it replaced:

| Check | Result |
|---|---|
| Printed X dimension chain, 20 spans | 174,500 mm — equals the sheet's printed total, delta 0 |
| Printed Z dimension chain, 13 spans | 120,300 mm — equals the sheet's printed total, delta 0 |
| Structural grid | 21 × 14, unchanged |
| Pixel calibration, each axis fitted independently | 40.019 and 40.024 mm/px — 0.01 % apart |
| Traced footprint bounding box | 174.48 × 120.27 m against those printed totals |
| Traced footprint area | **14,401 m²** against the sheet's own printed **14,430 m²** (−0.20 %) |
| Geometry validator | 0 errors, 0 warnings |

Gridline positions come from the printed cumulative chain rather than from the
fitted pixel positions. The chain is printed evidence and sums to the printed
total exactly; the pixel fit is a measurement *of* that chain and carries a few
centimetres of residual.

The schematic transcription was rebuilt at the same time and is deliberately
more conservative than the one it replaces — see
[Visual Fidelity](FACTORY_TWIN_VISUAL_FIDELITY.md) for exactly which parts are
measured, which are transcribed by eye, and which are recorded as unread.

The functional-zone file was **not** rebuilt in that pass, and at the time no
zone polygons were deployed at all. They come from the CAD instead — see §0.2.

---

## 0.2 The CAD supersession

The raster reconstruction described in §0.1 has been **superseded as the
primary source** by the AutoCAD drawing the floor plans were produced from.
The full read-only audit of that file is
[Floor 1 DXF Forensic Audit](FLOOR1_DXF_FORENSIC_AUDIT.md).

The CAD **confirmed the raster work rather than overturning it**, which is
worth stating plainly because the opposite was the expected outcome:

| Raster finding | CAD verdict |
|---|---|
| Envelope 174500 x 120300 mm | Exact. The drawing's two largest DIMENSION entities are literally these numbers. |
| Interior bay chain 8500 x8, 17050, 8850 x8 | Exact, to the millimetre. |
| Two Z spans read as 9975 / 10025 | Corrected to 10000 / 10000. The chain still closes on 120300. |
| An extra gridline splitting a bay 2000 / 8000 | Confirmed real, not a tracing artefact. |
| 120 columns | All 120 matched CAD geometry within 1 m, median residual 34 mm, **zero false positives**. |
| 147 columns (the earlier count) | Refuted. |
| Floor level +0.30 | Confirmed: the CAD's own area labels carry it. |

What the CAD added that no raster pass could: **82 further columns** (202
total), **895 interior wall centrelines with measured thickness**, **52
openings**, and **37 labelled process areas**.

### Why the header defines nothing

The drawing declares `$INSUNITS = 0` — no units at all — and its `$EXTMIN`/
`$EXTMAX` are stale by roughly 4.3x in X. The union of all entity bounds is
worse, because modelspace also holds equipment *detail* drawings (part
sections, thread callouts, ~34k SPLINEs) that have nothing to do with the
floor plate.

So neither was used. The extractor measures the column-cap envelope at run
time, checks it against the width and depth the model already declares, and
**aborts if they disagree by more than a millimetre**. Millimetres are
established by geometry — bay spacings of 8500/8850/10000 and an overall
174500 x 120300 admit no other reading — not by the header.

### What the CAD still does not carry

| Item | State |
|---|---|
| Equipment height | **UNKNOWN.** A plan view has no elevation. |
| Wall height | **UNKNOWN.** Drawn at a declared presentation constant, tagged as such. |
| Clear ceiling height | **UNKNOWN.** Not represented. |
| Machine identity | **UNMAPPED.** The CAD carries no IMS `eqp_id`. Still **0 confirmed mappings**. |
| Equipment footprints from CAD | **UNKNOWN.** The machine layer mixes plan and detail geometry; separating them is not yet done, so the 243 raster-derived slots remain the equipment layer. |

### The raw CAD reference

A model checked only against its own output can be self-consistently wrong, and
on this floor one was: a mirrored frame passed every check for as long as the
checks compared the model with itself. So the drawing's own line-work is
extracted separately, with **no** pairing, merging, snapping or classification,
and served as an overlay the reconstruction can be compared against.

| | |
|---|---|
| Source | `scripts/extract-floor1-raw-cad.js` → `private/floor1-raw-cad.json` |
| Carried | **3,673 entities → 9,416 segments** across 12 layer roles |
| Excluded | **215,252 entities across 89 layers** — equipment detail drawings sharing this modelspace |
| Not expanded | **393 block references** — doors, windows and air showers, whose leaves live inside the block |
| Approximated | arcs and polyline bulges flattened to chords at 24 segments per turn |
| Frame | the CAD's own: millimetres, +y up, no reflection. Only the **origin** is rebased, to the envelope corner, because the CAD origin locates the facility |

Layer names are not published. This drawing's layers carry process and vendor
identifiers, so each is mapped to a coarse public **role** (`structure`,
`walls-interior`, `partitions`, `area-boundaries`, …) which is the only label
served and what the layer toggles key on.

**What the reference proves.** Every one of the **194 vertices** of the 32
served rooms coincides, to within 1 mm, with an endpoint of raw line-work on
the drawing's area-boundary layer. That single measurement establishes three
things at once: the polygons came off the right layer, the canonical transform
is the one that maps drawing to model, and no vertex moved between reading and
serving. It is asserted twice by different routes — in
`tests/lint/floor1-cad-reconciliation.js` against the documents, and in the
browser regression against what the renderer actually drew.

### Rooms come from the drawing's own boundaries, not from wall topology

The `00.Area Line` layer carries **32 closed boundaries**, and they are the
authoritative room polygons for this floor. Nothing about a room is inferred
from the wall model — the two are independent, and §0.4 explains why that
matters.

**The defect that hid half of them.** The layer encodes closure two different
ways and the drawing uses both. Nineteen boundaries set the LWPOLYLINE closed
flag and leave the closing edge implicit. Thirteen leave the flag clear and
repeat the first vertex as the last, closing the ring explicitly while
reporting themselves as open. Reading only the flag discarded those thirteen —
and not thirteen arbitrary ones. Every boundary with more than four vertices
closes the second way, so exactly the L-shaped and stepped areas vanished,
including the **4,289 m² drilling hall**, the largest room on the floor. Two of
the thirteen additionally close to within 4×10⁻⁴ mm and 5×10⁻¹⁰ mm rather than
exactly, which is decimal noise in the file's own text, so the closure test
carries a 0.001 mm tolerance: three orders of magnitude above that noise and
five below the smallest edge on the layer.

The rule is `scripts/lib/cad-rings.js` and is tested against fixtures in
`tests/unit/floor1-cad-rings.test.js`, not against the private drawing.

**How a name is bound to a boundary.** Containment alone would be weak, so it
is not the only evidence used. The drawing prints each area's own square
metreage as text — a number the draughtsman computed, not one derived from the
polyline — and the extractor compares it against the polygon it traced. That
comparison is an independent check rather than a tautology.

| Outcome | Count |
|---|---:|
| Closed CAD boundaries on `00.Area Line` | **32** |
| Served as rooms | **32** (one per boundary, no boundary used twice) |
| Named, with the printed area agreeing to within 10 % | **26** |
| Named, agreeing to within 35 % | **1** (traced 1,758.8 m² against a printed 1,580 m²) |
| Closed by the drawing but carrying no label | **5** |
| Labels kept with no polygon | **6** |

The last row is the honest half of the result. Five labels sit inside a larger
area and have no boundary of their own: a 16 m² room whose only containing ring
is the 4,289 m² hall is not a 4,289 m² room, so the printed area *refutes* the
match rather than merely disagreeing with it, and the polygon is retracted. The
name is kept, the geometry is not. One further label — `OFFICE MB INNER` — has
no containing boundary at all.

The five unlabelled boundaries are served with a null name. A room whose
purpose is undefined is not the same as no room, and dropping them would delete
floor area the drawing explicitly draws.

---

## 0.4 Wall assembly

### The drawing does not label its walls

Every difficulty in this section comes from one fact: **the wall layers do not
contain only walls**, and nothing in the file says which line is which.

`00.Wall FCD` is the structural layer, and it carries four different kinds of
thing at once — the building's exterior wall as open line-work, all 216 column
squares, the pile caps, and 96 steel sections. The sections are the problem. A
310 × 675 or 251 × 575 rectangle is a **closed loop** whose two long sides are
parallel, fully overlapping, and 251–500 mm apart, which is indistinguishable
from a wall to any rule that measures geometry alone. Every one of those 96 sits
within 2.5 m of a CAD column.

The property that separates them is not size, position or proximity: **a wall is
drawn as two independent faces; a section is one closed loop.** On the
structural layer a closed loop is structure, and is excluded. On the interior
and partition layers a closed loop is a wall footprint and is kept — the
75 × 2600 and 75 × 5250 loops on the interior layer are real walls, and every
one of them is far from any column.

The drawing also contains **copy-pasted geometry**: entity pairs tracing the
same line at the same place. Left in, they emit two walls where the building has
one — the 23.7 m canted wall came out four times. Faces with identical endpoints
are de-duplicated; 43 entities on this floor.

### Direction, not axis

The previous rule bucketed faces into horizontal and vertical with an **absolute
1 mm test**, which failed twice over:

- a wall drawn 2 mm out of square across 10 m is not axis-aligned by that test
  and was discarded — **89 m of wall on this floor**;
- a wall at 45 or 70 degrees was not representable at all, so the model
  contained **zero** angled walls while the drawing contains **70 m** of them,
  including a 23.7 m canted wall 200 mm thick.

Pairing now works in each face's own direction. That removes both failures and
adds no new tolerance: the half-degree direction bucket **replaces** the 1 mm
axis test rather than joining it.

### The steps

| Step | Rule | Result |
|---|---|---|
| Read faces | Wall layers, ≥500 mm, structural closed loops excluded, duplicates dropped | 1,816 faces, 43 duplicates removed |
| Pair faces | Same direction ±0.5°, 50–600 mm apart, ≥60 % overlap | 639 walls; thickness is the measured gap |
| Merge runs | Same direction, centreline within 1 mm, thickness within 5 mm, gap ≤ 120 mm, **and no opening in the gap** | 587 runs, 52 merged |
| Close corners | Extend an end only where another wall's centreline actually crosses, by ≤ half its thickness, **and not over an opening** | 257 corners, 11.5 m total extension |

Below 500 mm the drawing is detailing — hatch ticks, chamfers, bolt outlines —
and admitting it makes the pairing find walls inside sections: measured,
dropping the floor to 100 mm more than triples the number of closed loops that
pair into a "wall".

### What it measures against the drawing

Two directions, because either alone is meaningless. **Fidelity** asks what
fraction of the wall face the model draws exists in the drawing; a model that
invents walls fails it. **Coverage** asks what fraction of the drawing's
wall-capable line-work the model reproduces; a model that draws nothing fails
it. The raw CAD reference separates structural sections into their own role, so
the denominator is wall-capable line-work rather than every line on a wall
layer.

| | Before | After |
|---|---:|---:|
| Wall runs | 866 | **587** |
| Line-work served (no thickness) | 211 | **512** |
| Model wall face that exists in the drawing | 93.6 % | **99.8 %** |
| …in metres drawn where the CAD draws nothing | 292.1 m | **7.0 m** |
| Drawing's wall line-work reproduced | 84.0 % | **94.2 %** |
| …missing | 1,050.3 m | **383.3 m** |
| Angled walls | **0** | **10** |
| Dangling wall-graph ends | 1,055 | **815** |
| Enclosed regions in the wall graph | 39 | **52** |

The 7.0 m that the drawing does not draw is corner closure and nothing else:
257 extensions totalling 11.5 m of centreline, appearing on two faces each and
bounded by half the crossing wall's thickness. It is the only wall length in the
model that is not a line in the CAD, and it is measured and published rather
than left to be discovered.

Unpaired faces — 512 of them — are kept as **lines with no thickness**. They are
real drawn geometry, they appear in the 2D plan, and they are **never
extruded**. They were previously filtered to 2 m and longer, which discarded
most of the drawing's shorter wall line-work for no reason beyond tidiness;
that filter is gone and the coverage figure above is most of what it bought.

### Openings

**No opening is closed by the model, and that is checked rather than claimed.**

The check that used to accompany this section printed "openings preserved, none
bridged" unconditionally — it verified only that openings lay inside the
envelope. Measured properly, 8 openings do sit inside a wall body. All 8 are
there because **the drawing itself runs both wall faces straight through the
door** and places the door on top as a block; the raw reference has line-work on
both faces at each of those points. The model closed **zero**.

Cutting a real hole would need the door block's own width, which lives inside
the block definition and is not expanded — 393 block references on carried
layers. Until that is done, an opening is a position and a kind, never a gap the
model invented.

### What is still wrong with the wall model

Connectivity is 65.8 % and 538 faces are unpaired. Reconstructed as a graph —
587 centrelines plus the 512 kept faces, split at every crossing and snapped at
100 mm — the wall model produces 1,563 nodes, 1,441 edges and **815 dangling
endpoints**. It closes 52 regions, of which the largest is 17 m² and only 4
reach the size of the smallest labelled area on the floor (9 m²).

The building envelope is deliberately left out of that graph. Adding it would
close one 14,000 m² region and make the wall model look far better connected
than it is.

**Rooms do not depend on any of this.** They come from the drawing's own closed
area boundaries (§0.2), so the wall graph measures the wall model's own quality
rather than being the thing room boundaries are inferred from. Connectivity in
particular is reported, never optimised toward: a free end is usually a real
doorway or a wall stopping at a column.

The remaining gap is face pairing and retention. 538 faces have no parallel
partner within 50–600 mm — typically a wall whose far side is off-layer, or a
face the 500 mm floor cut in half — and each of those is a wall the model
draws as a line and cannot extrude. Closing that means deciding what the
structural layer's remaining open line-work is, entity by entity, and it is not
attempted here: a wall model rebuilt in a hurry on a layer that mixes walls with
columns would put invented walls on the floor.

### Every invented machine position is deleted

The twin previously drew each monitored device as a box on a deterministic
synthetic grid, with a floor plate sized from that grid. All of it is gone:
the `/api/placement` route, the grid computation, the private per-device layout
loader, the zone ordering and spacing constants, the meshes, the labels and the
plate. The route now returns 404, and the regression asserts that.

The reason is the CAD. On a floor read from a drawing, an invented position
next to a measured one is indistinguishable to the eye, and the eye is what a
digital twin is for.

A monitored device with no established position is now **absent from the scene**
and reported as UNMAPPED. Its telemetry is still real and still polled; it
drives the status roll-up and the device list, and it colours no geometry.
**0 confirmed mappings**, so no live status is drawn on any physical asset.

---

## 0.3 Equipment from CAD — measured from the block geometry

The machines that matter are **placed, not drawn**: an `INSERT` entity records
an insertion point, a scale and a rotation, and the `BLOCK` it names holds the
geometry that insertion stamps down. Three earlier passes tried instead to
reconstruct outlines from the **modelspace line-work** on the equipment layer —
97k entities in which detail drawings, plant and machine outlines share one
colour and one set of primitives. On that layer the answer really is
unresolvable, and that negative is why this one reads block definitions.

The pass documented here replaced a bounding-box footprint with the block's own
geometry. The full audit — inventory, transform chain, scale handling,
measured dimensions, reconciliation and limitations — is
[docs/equipment-geometry-audit.md](../equipment-geometry-audit.md). Summarised:

### What was wrong with the box, and what replaced it

| Fault | Scale | Fix |
|---|---|---|
| The INSERT **scale** was never read | 130 candidates carry one; **120 are mirrors** | The scale, mirror included, goes through the same 2×2 matrix as the rotation |
| **Nested** blocks were not expanded | 65 candidates, up to **6** deep | `T_total = T_parent × T_child`, a matrix product, never a product of boxes |
| A bounding box is not a footprint | every record | The block's own geometry, hulled and measured on the machine's own axes |
| Where the box failed, an extent was **approximated** from neighbour spacing | 123 records | Deleted. These machines are placed; there is nothing to approximate |

An affine transform maps a convex hull to the hull of the image, so each block
is hulled **once** in its own coordinates and the hull is transformed per
instance. The oriented extent measured off the transformed hull equals the one
measured off every transformed stroke, which is what makes a single pass over a
412 MB file both sufficient and exact.

Annotation is excluded by entity **type**, drafting aids by layer **name**, and
`HATCH` entirely — a hatch carries seed and pattern points under the same group
codes as geometry, and reading them inflated one block from 36 m to 122 m
during the audit. The layer filter is **subtractive only and may never empty a
block**: thirteen blocks on this floor draw their whole body on a layer named
for dimensions or centrelines.

### What the model now holds

| | Count | Evidence |
|---|---:|---|
| INSERT records inside the floor envelope | 1,396 | — |
| …on an equipment layer, not drawing furniture | **344** | `geometry_status: MEASURED_CAD` for position, rotation and scale |
| …with a measured extent | **270** | `footprint_status: MEASURED_CAD`, `footprint_source: cad_block_geometry` |
| …served with a measured outline as well | **213** | `rectangle` 57, `polygon` 17, `irregular` 196 |
| …with the extent withheld | **74** | `footprint_status: UNRESOLVED`, `footprint: null` |
| Block families | 77 (29 repeating ≥3×) | — |
| Wholly inside one authoritative room | 192 | Room polygons unchanged |
| Crossing a room boundary | 70 | **Flagged, never moved** |

The 74 unresolved extents are **not a defect to be filled in**. 73 measure
smaller than any machine on this floor — fittings and symbols, longest side
112 mm to 1,795 mm — and one block measures 27.7 × 25.5 m, drawing a process
region rather than one asset. Those records carry `footprint: null` and the
renderer draws a small fixed marker. `lib/wire.js` refuses to serve a footprint
for them even if one were added to the private document, and
`tests/lint/floor1-geometry-validator.js` fails the document if one is.

### Known limitations of this pass

- **The served outline is a convex hull** — an outer bound. A concave machine
  is served as the shape that wraps it. Position, rotation and extent are
  exact; the outline is exact only where the machine is convex.
- **No identity.** The CAD names *blocks*, not assets. One block on this floor
  carries attributes and its tags are dimension letters. Every record is
  `UNMAPPED_TO_IMS` and stays that way until an authoritative device record is
  supplied; `mapping_status` is derived from the server's mapping table and
  never from the private record's own claim.
- **Height remains absent.** A plan view carries no equipment elevation.
  `height_status` is `unknown` on every record and the validator rejects any
  other value.
- **`MLINE` is still never read**, on any layer.

### What this supersedes

The 243 raster-derived slots digitised from the scanned schematic are
**retained in the private document and no longer served in any form**. Their
left/right placement, extent and orientation all came from a scan of a print,
which is what made machines look mis-scaled and mis-placed against the CAD.
`wire.projectSlot` is deleted rather than left unused, so re-adding
`slots: wire.projectAll(...)` to the route cannot silently work again.

### Reconciliation

`tests/lint/floor1-cad-reconciliation.js` compares the served model back
against the CAD bundle record by record and reports residuals rather than a
verdict. Current run:

| Residual | Worst | Tolerance |
|---|---:|---:|
| Position | 0.68 mm | 1 mm |
| Insertion point vs an independent extraction | 0.66 mm | 1 mm |
| Extent | under 1 mm on all 270 | 1 mm |
| Rotation | 0.0000° | 0.01° |
| Served outline vertex off the measured hull | 0.62 mm | 1 mm |

344 of 344 records reconcile to the CAD measurement, and their outlines overlap
the measured hull by 97.0% of the union at worst. Three sources are compared,
not two: the served model, the measurement the extractor wrote before the
canonical transform, and an older independent extraction of the same drawing's
INSERT records.

---

## 1. Reconstruction methodology

The twin was reconstructed from a confidential engineering floor plan held
outside the repository. Every geometric object was produced by the same loop:

1. **Characterise the symbol** at native resolution before writing any
   detector — establish what the thing actually looks like on the drawing.
2. **Calibrate thresholds on verified samples**, positive and negative. Every
   detector in this system has its thresholds derived from measurements of
   confirmed instances, never from intuition.
3. **Detect**, using the weakest assumption that works.
4. **Verify visually** at native resolution on a random sample of both
   detections and rejections.
5. **Record rejections** alongside detections. An object that failed
   detection is disclosed, never silently dropped.

Two methodological rules did the most work:

- **Colour separation.** Equipment is drawn on its own colour layers, so a
  detected component is not contaminated by unrelated linework. This is why
  equipment could be recovered where walls could not.
- **Shape tests over connectivity.** Structural symbols frequently touch
  adjacent linework, which defeats connected-component sizing. Testing for a
  symbol's *shape* against an integral image is immune to that, and recovered
  roughly twice as many columns as the connectivity approach.

### What was tried and abandoned

Recording these matters as much as the successes, because each rules out an
approach a future contributor would otherwise retry:

| Approach | Outcome |
|---|---|
| Flood-fill from room labels | **Failed.** Labels merged into one region larger than the whole building. The floor is largely open-plan; there is no closed interior wall network to recover. |
| Flood-fill against the area layer | **Failed.** Area boundaries are interrupted wherever equipment crosses them. Bridging the gaps far enough to close them would have fabricated boundaries. |
| Ray-cast + interior trace against the area layer | **Worked, partially.** Recovered the zones that are genuinely rectangular; zones with complex outlines remain rejected. |
| Connectivity-based structural detection | **Superseded** by the shape test, for the reason above. |

---

## 2. Evidence confidence model

Every digitized object carries a tier. The tiers are about **evidence
quality**, not about how good the result looks.

| Tier | Meaning |
|---|---|
| `HIGH` | Directly and unambiguously observed; where a repeated symbol exists, consistent with it. |
| `MEDIUM` | Observed, but with reduced separability — surrounding clutter, or a shape whose exact boundary is less certain. |
| `LOW` | A candidate that survives detection but whose geometry is not trustworthy. **Retained as metadata; never rendered.** |
| `REJECTED` | Failed validation. No geometry emitted. |
| `UNRESOLVED` | No defensible boundary found. No geometry emitted. |

Two rules are enforced in code, not merely documented:

- **Unvalidated geometry cannot render.** The API re-derives the renderable
  filter rather than trusting the data file's own flag, and the renderer
  applies the same guard again. Neither a hand-edited file nor a client-side
  change alone can promote an unvalidated object into the scene.
- **A conflict is never silently resolved.** Where two candidate boundaries
  contradict each other, both are retained and neither is drawn. Picking the
  one whose area matches better is specifically forbidden — that would be
  using the acceptance test as a generator.

### Printed values are validation, never input

Where the drawing prints an area, that value is used **only** to accept or
reject a boundary that was already traced from linework. No vertex has ever
been placed, moved or scaled to improve agreement with a printed number.

---

## 3. Coordinate system

- Metres. One scene unit is one real metre.
- Origin is the grid-envelope bounding-box centre — a **geometric reference
  only**. There is no survey datum and no geospatial claim.
- `x` follows the numbered structural grid axis, `z` the lettered axis, `y` is
  elevation.

### Height semantics

This distinction is load-bearing and easy to get wrong:

- **Floor-to-floor height is known**, derived from the floor levels printed on
  the building's plan set — consecutive levels differ by a constant interval.
- **Clear height under the slab is not known.** No section or elevation exists
  in any available source. It is recorded as `null` and the validator rejects
  any value supplied without a source.
- **Equipment height is not known.** A plan view carries no equipment
  elevation. The API's fallback is a *rendering default*, which is why slots
  are drawn as low flat pads rather than machine-shaped volumes — the
  silhouette must not imply a height nobody measured.

---

## 4. Object namespace model

Four identifier spaces exist. **They must never be merged without an
authoritative record.**

| Namespace | Origin | Notes |
|---|---|---|
| Geometry slot id | This reconstruction | Geometry only, carries no identity. |
| IMS `device_id` | The monitoring database | Real monitored devices. |
| MES machine id | An external manufacturing system | Prefixed per process group — **not** a flat sequence. |
| Zone id | This reconstruction | Anonymous functional area. |

Proximity, numbering order, and count coincidence are **not** evidence of
identity. A count matching between two namespaces is a coincidence until an
authoritative record says otherwise.

### Layer model

Objects are grouped by the kind of claim they make, and an object belongs to
exactly one layer:

| Layer | Sub-layer | Contains |
|---|---|---|
| `structural` | `shell` | Building envelope, footprint, orientation grid |
| `structural` | `columns` | Structural columns |
| `functional` | — | Validated process/functional areas |
| `operational` | `slots` | Observed equipment positions |
| `operational` | `machines` | Monitored devices at synthetic positions |
| `telemetry` | — | Live device state overlays |

The sub-layer split exists so an operator can separate two different claims
that would otherwise share one toggle: a measured envelope from a detected
column, and an observed position from a simulated device. Runtime detail is in
**[Runtime Architecture](FACTORY_TWIN_ARCHITECTURE.md)**; what each toggle
means to a reader is in the
**[Operator Guide](FACTORY_TWIN_OPERATOR_GUIDE.md)**.

Camera presets are **framing only**. Switching a view never moves an object,
changes a coordinate or alters an evidence state, and the regression suite
proves it by comparing a fixed-precision snapshot of every rendered coordinate
before and after switching.

---

## 5. Private/public boundary

| Where | What |
|---|---|
| **Public (this repository)** | Schemas, loaders, renderers, validators, contracts, methodology. |
| **Private (gitignored, runtime-only)** | All real geometry — envelope, footprint, grid, columns, equipment positions and outlines, zone boundaries. Four documents: `floor1-geometry.json`, `floor1-zones.json`, `floor1-raw-cad.json` (the drawing's own line-work, served as a reference overlay) and `floor1-equipment-reference.json` (the equipment measurement in the CAD's own frame, **never served** — it exists so the model can be checked against what was measured rather than against itself). |
| **Outside the repository entirely** | The source engineering drawing. |

Enforcement is layered, not trusted to `.gitignore` alone:

- The private directory is gitignored and excluded from the Docker build
  context; the service image uses an allowlist `COPY` and never copies it.
- The private directory is **not** served as static content. It was, once —
  that route exposed every file in it to any authenticated user at a guessable
  URL, and was removed. Real geometry now reaches the browser only through the
  shaped API.
- A leak scanner runs over every tracked file in the pre-commit suite.
- All twin routes sit behind the proxy's authentication gate.

---

## 6. Mapping readiness

**No physical-to-device mapping exists, and none has been invented.**

The monitoring database carries no floor, no coordinates, no grid reference
and no machine tag; device locations are sanitized placeholder labels and no
placement or layout table exists. There is therefore nothing to map *from*.

The architecture is nonetheless ready for one: geometry and identity are
stored separately and joined at request time, so an authoritative mapping can
be introduced without touching a single geometry file. Until one exists, every
equipment position reports as unmapped, and the renderer keeps unmapped
positions visually distinct from real devices — an unidentified position must
never read as a confirmed machine.

---

## 7. Known limitations

Stated as **absence of evidence**, not as unfinished implementation. None of
these is blocked on effort; each is blocked on a source that does not exist.

| Not available | Why |
|---|---|
| Authoritative equipment census | The only census source is a low-resolution screenshot of an external system; counting it reliably is not possible. |
| Device-to-position mapping | No authoritative record relates the namespaces. |
| Interior walls | The floor is largely open-plan. The drawing's line work does not enclose, and equipment outlines share the structural layer. |
| Doors and openings | Dependent on interior walls. |
| Lift pits | Their symbols merge with adjacent structure, so they cannot be isolated. |
| Clear ceiling height | No section or elevation exists in any available source. |
| Equipment height | Not present in a plan view. |

The reconstruction is **evidence-backed but incomplete**, and is not claimed
to be otherwise.

---

## 8. Future evidence requirements

See **[Factory Twin — Evidence Requirements](FACTORY_TWIN_EVIDENCE_REQUIREMENTS.md)**
for the prioritized list of sources that would unlock the items above.
