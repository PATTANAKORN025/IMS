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
| Equipment positions | 224 | MEASURED_CAD | CAD `INSERT` records: insertion point and rotation stated by the drawing |
| Equipment extents | 63 of 224 | OBSERVED_CAD | Block bounding box, gated on machine scale and non-overlap |
| Equipment extents withheld | 161 of 224 | UNRESOLVED | Block box measures a service envelope rather than the machine body |
| Equipment height | — | BLOCKED | A plan view carries no equipment elevation |
| Raster equipment slots | 243 | SUPERSEDED | Retained in the private document, served nowhere, drawn nowhere |
| Monitored devices | 23 | NOT DRAWN | Live telemetry is real; no device has an established position, so none is placed on the floor |
| Physical mappings | 0 | BLOCKED | No authoritative record relates the namespaces |
| Functional zones (rendered) | 17 | OBSERVED_CAD | Area-layer boundaries accepted against printed areas |
| Functional zones (withheld) | 20 | WITHHELD | Failed area validation or party to an unresolved conflict |
| Interior walls | 866 runs | MEASURED_CAD plan | Face pairing, collinear merging and corner closure from the CAD; thickness measured between drawn faces |
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

## 0.4 Wall assembly, and the removal of every invented position

### Walls are assembled, not dumped

The drawing splits one physical wall into many face segments — at every column,
tee and detail it passes. Rendered raw, a wall reads as dashes.

| Step | Rule | Result |
|---|---|---|
| Pair faces | Parallel, 50–600 mm apart, ≥60% overlap | 931 faces paired; thickness is the measured gap |
| Merge runs | Same axis, centreline within 1 mm, thickness within 5 mm, gap ≤ 120 mm | 866 runs |
| Close corners | Extend an end only where a perpendicular wall actually crosses, by ≤ half its thickness | 380 corners |

The 120 mm merge gap is deliberately far below a door leaf, so **an opening is
never bridged**. Connectivity is **measured and published, not asserted**:
71.3% of run ends meet another run. A free end is usually a real doorway or a
wall stopping at a column, so the figure is reported rather than "fixed".

Faces the extractor could not pair, and that are at least 2 m long, are kept as
**lines with no thickness**. They appear in the 2D plan, where they are real
drawn geometry, and are **never extruded** — a thickness nobody measured is
exactly what must not be invented.

**They did not appear until 2026-09-03.** The extractor wrote them, the
renderer drew them, the documentation above described them — and the wire
projection never carried the field, so `geometry.wall_lines` arrived at the
browser as `undefined` and `buildWallLines()` returned on an empty list every
time. Every plan this service served was missing 211 of the drawing's wall runs,
and nothing in the code, the tests or this document said so, because each half
was individually correct.

Two things now make it visible rather than merely fixed. The wire shape carries
**no thickness field at all** — not null, not zero — so an unpaired face cannot
be extruded downstream even by accident, and the evidence panel counts these
faces on their own row instead of adding them to the 866 walls. Folding a
weaker claim into a stronger total is how a measurement gets invented.

### What is still wrong with the wall model

Connectivity is 71.3% and 1,392 of 2,323 faces are unpaired, and neither figure
is a rendering problem. Reconstructed as a graph — 866 centrelines plus the 211
kept faces, split at every crossing and snapped at 100 mm — the wall model
produces 1,649 nodes, 1,348 edges and **1,055 dangling endpoints**. It closes
39 regions, of which **the largest is 25 m² and only 3 reach the size of the
smallest labelled area on the floor (9 m²), against 37 labelled areas in the
drawing**. No room closes.

The building envelope is deliberately left out of that graph. Adding it would
close one 14,000 m² region and make the wall model look far better connected
than it is.

That is the reason room boundaries do not come from walls. Four properties of
the extraction produce it, and all four are in the extractor, not the drawing:

| Property | Effect | Measured cost |
|---|---|---|
| Only paired faces become walls | 1,392 faces produce no wall | the largest cause |
| Unpaired faces below 2 m are dropped | 1,181 short runs are lost, and short runs are what close corners | large |
| Merge gap 120 mm, corner closure ≤ half a thickness | fragments that meet across a column do not join | moderate |
| Only axis-aligned segments are kept (`dx < 1` or `dy < 1` mm) | any angled wall is discarded | **small — see below** |

**The axis-alignment limit is not the main cause, and this ordering is
corrected.** Counted off the raw reference, the wall-role layers carry 8,227
segments, of which 1,775 (21.6 %) are not axis-aligned — but only **61** of
those reach 2 m, and **52 of the 61 are on the structural layer**, which also
carries column outlines and 28 mm detail rectangles. Supporting angled segments
would therefore add tens of segments, not hundreds of walls, and would draw
column chamfers as walls unless that layer is separated first.

The real work is face pairing and retention, and separating the structural
layer's three kinds of content: wall faces, column outlines, and hatch detail
whose median segment is 250 mm. That is **open, not blocked** — the drawing is
on this host and every figure here was measured by reading it. An earlier
version of this section recorded the DXF as unavailable; that was wrong, and
the correction matters because it was the stated reason the wall model had not
been improved.

It is deliberately not attempted in the same pass as the room work. A wall
model rebuilt in a hurry on a layer that mixes walls with columns would put
invented walls on the floor, which is the failure this whole reconstruction
exists to avoid.

**Rooms no longer depend on any of this.** They come from the drawing's own
closed area boundaries (§0.2), so the wall graph is now a measure of the wall
model's own quality rather than the thing room boundaries are inferred from.
The metrics above are published by `tests/lint/floor1-cad-reconciliation.js` on
every commit so the gap cannot quietly widen.

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

## 0.3 Equipment from CAD — RESOLVED by block reference

The previous pass reported equipment as UNRESOLVED after three attempts. That
report was accurate about the method it used and wrong about the drawing. All
three attempts tried to reconstruct machine outlines from the **modelspace
line-work** on the equipment layer — 97k entities in which detail drawings,
plant and machine outlines are drawn in the same colour with the same
primitives. On that layer the answer really is unresolvable.

The machines that matter are not drawn there. They are **placed**: an `INSERT`
entity records an insertion point and a rotation, and the `BLOCK` it names
holds the geometry that insertion stamps down. Position and rotation therefore
come out of the CAD exactly, with no tracing and no heuristic.

### What each of the eleven methods found

`scripts/extract-floor1-equipment.js` runs all eleven and records every result,
including the negative ones, into `equipment_extraction.methods_tried` in the
private document. Summarised:

| # | Method | Outcome |
|---|---|---|
| A | INSERT / block reference analysis | **PRODUCTIVE** — this is the pass that resolved equipment. |
| B | Block definition analysis | **PRODUCTIVE for extent**, but weaker than position: a block box measures everything the block draws, service envelopes included. |
| C | Layer-aware extraction | Productive as a filter; not sufficient alone — the dominant equipment layer also carries the detail drawings. |
| D | Closed polyline extraction | Corroborating only. A closed outline on this layer is as likely to be a detail-drawing part as a machine. |
| E | Line-loop reconstruction | Corroborating only. A reconstructed loop cannot be told from a table, a pit or a hatch boundary without an identifier, and none is drawn. |
| F | Oriented connected-component analysis | **NEGATIVE for identification.** This is the method the previous three passes used. It finds shapes, not machines. |
| G | Repeated-pattern detection | **PRODUCTIVE as corroboration** — a footprint repeated across a block family is what lifts a candidate from medium to high confidence. |
| H | Spatial clustering | Productive as an exclusion: it is how free-curve detail regions are kept out of method F. |
| I | Label-to-geometry association | **NOT USED.** The labels that exist are area labels and drafting notes; attaching one to a machine would be a proximity guess. |
| J | Dimensions adjacent to equipment | **NEGATIVE.** No machine in this drawing is dimensioned; the dimension chains measure the structural grid and the envelope. |
| K | Comparison against repeated footprints | **PRODUCTIVE as the gate** — a block box that swallows its neighbour is measuring more than the machine, and its extent is withheld. |

### Evidence intersection

Position and rotation are accepted from **A alone**, because an INSERT record
is a direct CAD statement of both and involves no tracing. Footprint requires
**A and B to agree with K** — the block box must be machine-scale *and* must
not overlap a neighbour by more than a quarter of the smaller footprint — and
is raised to high confidence only when **G** shows the same block placed three
or more times.

### What the model now holds

| | Count | Evidence |
|---|---:|---|
| INSERT records inside the floor envelope | 1,397 | — |
| …on an equipment layer, naming a real block | 345 | — |
| …machine-scale candidates | **224** | `geometry_status: MEASURED_CAD` for position and rotation |
| …with an extent that survived the overlap gate | **63** | `footprint_status: OBSERVED_CAD` |
| …with the extent withheld | **161** | `footprint_status: UNRESOLVED`, `footprint: null` |
| Block families | 56 (17 repeating ≥3×) | — |
| Assigned to a functional zone by containment | 47 | — |

The 161 unresolved extents are **not a defect to be fixed by filling them in**.
A block bounding box that overlaps its neighbour, or whose centre lands off the
floor, is measuring a service envelope or a leader rather than the machine
body. Those records carry `footprint: null`, and the renderer draws a small
fixed marker rather than a box. `lib/wire.js` refuses to serve a footprint for
them even if one were added to the private document, and
`tests/lint/floor1-geometry-validator.js` fails the document if one is.

### Known limitations of this pass

- **Scale factors are not read.** INSERT group codes 41/42 are not carried by
  the CAD bundle, so every extent assumes unit scale. This is exactly why
  footprint is `OBSERVED_CAD` while position is `MEASURED_CAD`: a non-unit
  scale would change an extent without moving an insertion point.
- **No identity.** The CAD names *blocks*, not assets, and a block name is a
  drawing-internal handle shared by every instance. Every record is `UNMAPPED`
  and stays that way until an authoritative device record is supplied.
- **Height remains absent.** A plan view carries no equipment elevation.
  `height_status` is `unknown` on every record, and the validator rejects any
  other value.

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
| Position | 0.62 mm | 1 mm |
| Extent | 0.50 mm | 1 mm |
| Rotation | 0.0000° | 0.01° |

224 of 224 records reconcile to a CAD INSERT.

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
| **Private (gitignored, runtime-only)** | All real geometry — envelope, footprint, grid, columns, equipment positions, zone boundaries. |
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
