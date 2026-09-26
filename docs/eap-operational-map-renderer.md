<!--
  The Floor 1 EAP operational map: what it renders, where the geometry comes
  from, and what it deliberately refuses to draw. Renderer phase only. Grafana,
  Node-RED, TimescaleDB, the PostgreSQL schema, telemetry, the Manufacturing
  Command Center and the Operator Andon are untouched by this work.
-->

# Floor 1 EAP Operational Map — Renderer

Status: **built. 210 cells drawn, 2 instanced batches, 3 draw calls, 2 geometries.**

Continues from `7304849`. The node model was the data contract; this is the first
thing that reads it.

## A. What changed, and why the old source was wrong for this

The twin's existing renderer derives its node list from the physical CAD equipment
pipeline — 344 equipment records, 270 measured rectangles, 74 unresolved. That pipeline
answers a real question, *where is the plant's equipment, measured from the drawing*,
and it answers it well. It is the wrong answer for an operational map, because the floor
does not work from the drawing; it works from the EAP layout, which draws 210 cells
grouped into 171 machine units.

So the map reads `/api/eap-map`, which projects the EAP node model. The physical
pipeline is untouched and still drives the existing twin view. The 331 CAD candidates
never reach a client at all: they are forensic evidence behind the wire boundary.

```
RAW CAD → PHYSICAL MODEL → EAP MODEL → EAP CELL GEOMETRY → 2D EAP RENDERER → 3D DERIVED
```

## B. The geometry the map draws, and the frame it draws it in

The node model at `7304849` carried a position for 40 of 210 cells — the 8 × 5 grid,
the only cells bound to a named CAD instance. The other 170 had no geometry at all, so
the renderer phase had to produce an **EAP cell geometry** layer first. That is the
stage the pipeline above names, and it is now built.

Each of the 210 cells has one measured rectangle, taken from the reference layout: the
colour pass measures a column of cells as a strip, the strip is cut at the rows that are
dark right across it, and the number of cells per column comes from the labels
transcribed by inspection. 198 cells are measured that way. The remaining 12 are drawn
unlit — 7 in PP, 3 in bonding, 2 in oxide — so they carry no fill to measure and were
measured from their dim border instead, and flagged `LOW` geometry confidence. The
measurement was checked by drawing all 210 rectangles back over the reference image.

Those rectangles live in the **EAP layout frame**, and the frame is explicit about what
it is not:

| Property | Value |
|---|---|
| Frame | `EAP_LAYOUT_FRAME` |
| Metric | **no** |
| Axes | x right, z down, origin at the centre of the drawn factory boundary |
| Scale | the drawn factory boundary, scaled so its width equals the floor width the CAD envelope states |
| Extent | 174.5 × 89.3 |
| Warning | the reference compresses vertical distances against horizontal ones by about 1.46 |

That anisotropy is why the frame is not metric and why the payload carries the warning
on every response. This frame must never be used to measure a machine, a clearance or a
distance on the floor. Nothing was inferred from neighbour spacing, zone width, screen
size or a machine number, and no physical machine dimension was derived from a pixel.

The 40 cells with a named CAD instance additionally carry `cad_placement` — that
instance's real-world millimetre position, its rotation, and the note that it came from
the transformed body position rather than the INSERT origin. That field is evidence. The
map does not draw it, and the contract check fails if a cell that is not `DIRECT`
acquires one.

## C. One footprint, two views

There is no independent 3D geometry and no second set of 3D dimensions.

```
        EAP footprint  { x, z, rotation_deg, width, depth }
                 │
        ┌────────┴────────┐
        ▼                 ▼
   2D map (ortho)    3D box (perspective)
   height 0.02       height 2.2, PRESENTATION_ONLY
```

Switching view swaps the camera and the extrusion height. Everything else — position,
rotation, width, depth — is the same number read from the same field. The browser
regression asserts this directly: it reads the instance matrices in both views and
requires that only the height differs.

Height is a viewing constant. No authoritative CAD height exists for any cell, the model
carries none, the wire carries none, and `height_state` is `PRESENTATION_ONLY`
everywhere.

## D. What the map renders

All 210 cells, every time. 170 of them have an unresolved CAD identity, and every one is
drawn at full size in its correct place, with a small marker on its north-west corner.
An unresolved identity is a fact about the evidence, not a reason to drop a machine off
an operations screen.

| Representation | Cells | Meaning |
|---|---:|---|
| Light rectangle | 40 | a named CAD instance backs this cell |
| Mid rectangle | 168 | the cell is placed and grouped; its CAD instance is unresolved |
| Dim rectangle | 2 | drawn but attached to no machine unit |
| Corner marker | 170 | identity-confidence marker on every unresolved cell |

The 11 aggregated stations stay stations. `DHD001` (4 cells), `CCL001` (6), `CCL002` (7),
`DEOX01` (3), `XRY001` (5), `XRY002` (5), `BND001` (3), `BWN001` (3), `BWN002` (4),
`BWN003` (2) and `PRS` (6) are drawn as their member cells and reported as one unit;
`DLM` and `LTK` remain separate units. Nothing is exploded into invented individual
machines and nothing is merged without the evidence the layout itself draws.

Zone outlines are the bounding extent of the cells in each zone, drawn as thin unfilled
lines and labelled as such in the payload. They are not room boundaries: the model has
no room geometry for this floor, and a wall the drawing never drew has no business
looking like one on an operations screen.

## E. Status semantics

Every cell reports `status: UNKNOWN`.

The reference layout is coloured, and those colours are a snapshot of another system on
the day the image was taken. There is no authoritative mapping from an EAP cell to an
IMS machine, so there is nothing to colour with. The colours are not projected onto the
wire under any name; what is projected is `reference_status_drawn`, a boolean saying
whether the reference drew the cell lit at all — evidence about the reference, not a
machine state. The unit test asserts that no reference status string survives the
projection.

Live status can be shown when an authoritative mapping exists. Until then, `UNKNOWN` is
the honest value.

## F. Performance

Cells are two instanced batches over one shared unit box, not 210 meshes.

| | Value |
|---|---|
| Cells rendered | 210 |
| Instanced batches | 2 (cells, markers) |
| Draw calls | 3 (2 batches + zone lines) |
| Geometries | 2 |
| Triangles | 4 560 |

Measured frame time, headless Chromium at four target viewports:

| View | 1366×768 | 1920×1080 | 2560×1440 | 3840×2160 |
|---|---|---|---|---|
| 2D p50 / p95 | 16.7 / 18.4 ms | 21.4 / 25.9 ms | 39.0 / 47.4 ms | 90.1 / 102 ms |
| 3D p50 / p95 | 16.6 / 17.9 ms | 23.0 / 29.3 ms | 45.8 / 60.0 ms | 95.6 / 118 ms |

Read those numbers with the caveat they deserve. The test host reports
`ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)` — a
software rasteriser. Frame time here scales with pixel count and nothing else: draw
calls, geometry count and triangle count are identical at every resolution, and the time
quadruples as the pixels do. What these figures establish is that the scene is not the
bottleneck. What they cannot establish is frame time on real hardware, and no claim
about that is made.

## G. Interaction

Clicking a cell reports its id, zone, process, machine unit and aggregation, mapping
state, unit state, confidence, CAD evidence, IMS mapping state, status, and footprint
size with its geometry confidence. An unresolved cell says so in words: *the drawing
carries no machine number, so this cell is placed and grouped but not bound to one CAD
instance.*

No raw private CAD data reaches the UI. The projection is a whitelist, and the browser
regression greps the served payload for CAD handles, millimetre coordinates, block
names, layer names and machine node ids, all of which must be absent.

## H. Tests

| Check | Assertions | Where |
|---|---:|---|
| `tests/unit/eap-map-wire.test.js` | 15 | pre-commit |
| `tests/lint/eap-node-model-contract.js` | 75 | pre-commit |
| `tests/playwright/eap-map-regression.js` | 82 | `EAP_URL=… node …` |
| `tests/playwright/factory-twin-regression.js` | 518 | unchanged, still green |

The browser regression pins the golden case in the form it can actually be broken:
40 grid cells, 8 columns, five cells in every column in order, machine numbers 105–144
unbroken with no duplicate, the column pairing preserved as a ratio, and every drawn
position compared against the served footprint so a cell nudged to make the map look
tidier fails. Rows are asserted per column rather than globally, because the reference
does not draw the eight columns row-aligned and a global row count would assert a
regularity the evidence does not have.

It also pins PP at 7 cells with unreadable labels, the 11 aggregations at their locked
sizes, all twelve zone counts, `DIRECT` at 40 and `AMBIGUOUS` at 170, the 2D/3D
footprint identity, and that all 210 cells still draw with no horizontal overflow at
1366×768, 1920×1080, 2560×1440 and 3840×2160.

## I. Limitations

1. **170 of 210 cells have no CAD instance.** The drawing carries no machine numbers.
   The map places and groups those cells; it does not claim to know which drawing object
   each one is.
2. **The frame is schematic.** 1.46 anisotropy. Not for measurement.
3. **12 cells have `LOW` geometry confidence** — measured from a dim border rather than
   a fill, because the reference draws them unlit.
4. **11 labels are unreadable** at the reference image's resolution: 7 in PP, 2 in
   bonding, 2 in oxide. They are shown as drawn cells without a label rather than given
   invented numbers.
5. **No status.** No IMS mapping exists.
6. **Frame time is measured under a software rasteriser** and says nothing about real
   hardware.
7. **Zone outlines are cell extents, not rooms.**
8. **The existing physical twin view is unchanged** and still reads the CAD equipment
   pipeline. The two views answer different questions and are deliberately not merged.

## J. Scope

Renderer and its wire projection only. No change to Grafana, Node-RED, TimescaleDB, the
PostgreSQL schema, telemetry, the Manufacturing Command Center or the Operator Andon. No
change to the locked model counts, the CAD census, or any private CAD file.
