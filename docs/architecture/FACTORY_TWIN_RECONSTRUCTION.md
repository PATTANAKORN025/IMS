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
| Structural columns | 120 | OBSERVED | Unfilled square outlines matched to the nearest printed grid intersection within 1.8 m |
| Equipment slots | 243 | OBSERVED | Colour-separated component detection, machine-scale filtered |
| Equipment height | — | BLOCKED | A plan view carries no equipment elevation |
| Monitored devices | 23 | SIMULATED position | Live telemetry is real; position is a synthetic grid |
| Physical mappings | 0 | BLOCKED | No authoritative record relates the namespaces |
| Functional zones (rendered) | 8 | OBSERVED | Area-layer boundaries accepted against printed areas |
| Functional zones (withheld) | 13 | WITHHELD | Failed area validation or party to an unresolved conflict |
| Interior walls | 0 | BLOCKED | Floor is open-plan; no closed wall network exists to recover |
| Doors | 0 | BLOCKED | Dependent on interior walls |
| Lift pits | 0 | BLOCKED | Symbols merge with adjacent structure |
| MES census | — | BLOCKED | Only source is a low-resolution screenshot |

**Not complete, and not claimed to be.** Six rows are BLOCKED, each on a
missing source rather than unfinished work. See
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

The functional-zone file was **not** rebuilt. No zone polygons are deployed, so
the API serves zero functional zones rather than an unvalidated boundary.

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

### Zone boundaries are checked against the drawing's own arithmetic

Each labelled area carries a printed area figure. The extractor traces the
boundary independently and compares. The 17 zones that render agree with the
printed value to within **1%**; two whose traced area disagrees by **37%** and
**163%** are withheld as LOW rather than reconciled, and 18 labels that no
closed boundary contains are kept as UNRESOLVED records with no geometry.

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

## 0.3 Equipment from CAD — attempted, UNRESOLVED

Extracting equipment footprints from the CAD was attempted three ways and
**none produced a trustworthy result**. The attempts are recorded because the
negative result is itself evidence, and because repeating them without knowing
this would be wasted work.

| Method | Result | Why it fails |
|---|---|---|
| Block definition bounding boxes | Rejected | Nested references inflate them beyond use — one common machine block computes to 882 m × 58 m; others to 9 mm. |
| Axis-aligned rectangle reconstruction from line-work | 1 of 243 slots matched | Only 2,042 of 61,311 lines on the machine layer are axis-aligned. The plan equipment is drawn rotated. |
| Connected-component clustering with oriented bounding boxes | 8 of 243 slots matched | Components either merge whole equipment rows or shatter into fragments; 528 of 834 fell outside any plausible machine size. |

What *is* established: the equipment is genuinely there. Every one of the 243
raster-derived slots overlaps real CAD geometry — median 3 entities each, and
**zero slots overlap nothing** — overwhelmingly on the machine layer. The
positions are corroborated; only the per-machine *outline* could not be cut
cleanly out of the surrounding drawing.

The detail drawings are separable, which is what makes a future attempt
worthwhile: SPLINE work concentrates in **19 of 875 five-metre bins**, so the
part sections sitting in this modelspace occupy two tight clusters rather than
being spread through the plan.

**Consequence:** equipment footprints stay **raster-derived and OBSERVED**.
They are not relabelled MEASURED_CAD, because the CAD did not yield them.

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
