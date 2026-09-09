# FT-24.6 Phases 1-5 — EAP Operational Map Spec

This phase's own instruction was to define a canonical EAP object model
(Factory/Floor/Zone/Room/Area/Station/Equipment/Position/OperationalState),
build a CAD physical shell, normalize EAP positioning, add an operational
overlay, and build the UI. **The audit (Phase 0, `EAP_ARCHITECTURE_AUDIT.md`)
found all five already built, tested, and documented across five prior
phases.** This document maps the requested canonical concepts onto what is
real and already implemented, rather than redefining a second model next
to the existing one -- which this phase's own Phase 2/6 instructions
("use existing CAD-derived geometry," "do not simply add more code")
explicitly favor.

## Canonical concept mapping

| Requested concept | Real implementation | Where |
|---|---|---|
| Factory | Implicit (one deployment, one facility) -- no separate entity exists or is needed; nothing in this system spans multiple factories today | -- |
| Floor | `floor1-eap-node-model.json` is Floor-1-scoped; `lib/floors.js`'s catalogue is the multi-floor extension point, shared with the physical twin | `lib/floors.js`, `server.js`'s `requestedFloor()` |
| Zone | `zone_id`/`zone_caption`/`process_group` per cell, aggregated into zone outline records | `lib/eap-map.js`'s `zoneOutlines()`/`zoneOutlinesInner()` |
| Room | **Does not exist, and is not fabricated.** The model has no room polygon data; zone outlines are explicitly labelled "bounding extent of the cells in this zone; not a room boundary" (`lib/eap-map.js:277`). Inventing a room polygon here would put a wall on the map the drawing never drew -- exactly what this phase's own "do not fabricate" instruction forbids. |
| Area | Same concept as Zone in this model -- `process_group` is the area-level grouping (e.g. "DF INNER", "SM") | `projectCell()`'s `process` field |
| Station | `machine_units[]` with `aggregation_type: AGGREGATED_STATION` -- a group of cells the reference layout draws as one operational unit | `lib/eap-map.js`'s `projectUnit()` |
| Equipment | `eap_cells[]` -- 210 cells, each either `DIRECT`-mapped to one CAD instance or `SET_LEVEL`/`LAYOUT_ONLY` | `lib/eap-map.js`'s `projectCell()` |
| Position | Split in two, deliberately never merged: `footprint` (always present, `EAP_LAYOUT_FRAME`, schematic) and `world_footprint` (present only for DIRECT/STRUCTURAL evidence, `FLOOR1_WORLD_M`, real metres) | `projectFootprint()`, `projectWorldFootprint()` |
| OperationalState | `status: 'UNKNOWN'` (real, honest, always) plus an explicitly-labelled SIMULATED overlay for demo purposes only | `lib/eap-map.js:175` (real); `eap.js`'s `simulatedStateFor()` (simulated) |

**Identity is separate from position, which is separate from state** --
this phase's own explicit requirement. `mapping_state`/`cad_evidence`
(identity) is one set of fields, `footprint`/`world_footprint` (geometry)
is another, `status`/`reference_status_drawn` (state) is a third; none of
`lib/eap-map.js`'s functions conflates them, and `tests/unit/eap-map-wire.test.js`
has dedicated assertions per axis ("a CAD world position does not imply
CAD identity," "SET_LEVEL does not imply an individual machine location,"
etc.).

**No `ldi_machine_id` exists anywhere in this model**, satisfying this
phase's own "do not add ldi_machine_id unless authoritative mapping
exists" instruction by construction -- there is no authoritative mapping,
and the model has no field that could carry a fabricated one.

## Phase 2 — CAD physical shell

Satisfied by reuse, not redraw: `GET /api/floor-geometry` (the physical
twin's existing, unchanged endpoint) supplies the envelope/walls/columns;
`lib/eap-map.js`'s `loadEnvelope()` reads the SAME private file purely for
its half-width/half-depth constants, and `eap.js` fetches the SAME
endpoint to draw the real floor plan under the schematic in AUTO/WORLD
mode. No CAD geometry was redrawn or modified this phase, per this
phase's own instruction.

## Phase 3 — EAP positioning

Already satisfied, `docs/eap-floor1-spatial-registration.md`'s own
measured result: 40 cells DIRECT/STRUCTURAL (real CAD world coordinates),
167 SET_LEVEL (a zone region, not an individual position), 3 neither. No
survey-grade claim is made for the 167 -- their `spatial_evidence` field
says `SET_LEVEL` explicitly, and `lib/eap-map.js`'s own
`POSITION_APPROXIMATION`-equivalent metadata is the `geometry_confidence`/
`measurement`/`provenance` fields on every `EAP_LAYOUT_FRAME` footprint
(`projectFootprint()`, line 90) -- `provenance: 'REFERENCE_LAYOUT'` states
plainly that the coordinate came from the reference image, not a survey.

## Phase 4 — operational overlay

Satisfied: `status` (real) and `footprint`/`world_footprint` (geometry)
are computed by entirely separate functions in `lib/eap-map.js`
(`projectCell()`'s status block never reads footprint data or vice versa),
and the client's `paintStates()` (eap.js:446) is the ONLY function that
translates a state into a rendered colour -- geometry-building
(`buildMap()`, `build()`) never touches colour. `equipment.state = RUN`
(this phase's own example) is exactly the shape `simulatedStateFor()`
returns (a key into the shared `OPERATIONAL_STATUS` legend), demonstrated
live via the header's Simulation toggle.

## Phase 5 — EAP UI

Present and tested (`tests/playwright/eap-map-regression.js`, section 13,
all 4 target viewports, re-run this session):

- Floor selector: shared with the physical twin (`lib/floors.js`); hidden
  with <2 floors deployed, per the same "one floor is not a choice"
  discipline the physical twin already applies.
- Zone labels, room^H^H^Hzone/process labels: drawn per-frame by
  `drawLabels()` (eap.js:621), text pulled from the reference layout's own
  labels where legible.
- Equipment/station representation: instanced cell meshes, 2D and 3D view
  toggle (`setView()`), AUTO/WORLD/EAP mode toggle (`setMode()`).
- Operational state visualization: colour-coded mesh instances via
  `paintStates()`, real-state UNKNOWN always disclosed, SIMULATED overlay
  clearly labelled and toggleable.
- Legend: the aside's own "Legend"/"Simulated status" sections, real
  swatches for every DIRECT/schematic/unassigned distinction.
- Selected-object state: `#inspector` (click a cell or zone), full field
  dump via `renderCellInspector()`/`renderZoneInspector()`.
- Hover/focus affordance: `pointermove` sets `hovered`/`hoveredZone` and
  repaints; **this session found and fixed** a real focus-affordance gap
  on the `<aside>` region itself (see `EAP_VALIDATION.md`) -- the
  cell/zone-picking canvas remains mouse/touch-only, disclosed as a known
  gap for a future phase, not fixed this phase (a keyboard-navigable
  210-cell picker is a real UI feature addition, not a scoped accessibility
  fix, and this phase's own instruction was not to begin a large UI
  redesign).
- Concise status summary: the header's `#headline` (`X cells · Y on the
  real floor, Z spatially unresolved · N machine units`) and the aside's
  Population table.

No dashboard clutter was added or found: the page is a single canvas plus
one context-sensitive aside, matching this phase's own "avoid dashboard
clutter" instruction.
