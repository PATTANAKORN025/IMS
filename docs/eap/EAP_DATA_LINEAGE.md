# FT-24.6 Phase 7 — EAP Data Lineage

Every visible object on the EAP Operational Map, traced SOURCE → TRANSFORM
→ MODEL → API → UI. This synthesizes what five prior phases already
established in detail (cited per stage) into one lineage view; it does not
re-derive their numbers.

## 1. Physical floor shell (walls, columns, envelope)

```
Floor1.dxf (real CAD drawing)
  → CAD extraction (existing physical-twin pipeline, lib/wire.js + build tooling)
  → floor1-geometry.json (private: envelope, walls, columns, zones)
  → GET /api/floor-geometry (server.js, unchanged, shared by BOTH pages)
  → eap.js's `load()` (FLOOR_ENDPOINT fetch, eap.js:38,896-900)
  → drawn as the real floor plan under the EAP schematic, in AUTO/WORLD mode
```

This is the SAME endpoint and the SAME private file the physical Factory
Twin renders from — the EAP map does not have, and does not need, its own
copy of the walls/columns. `lib/eap-map.js`'s `loadEnvelope()` (line 318)
reads the identical file purely to get the envelope's half-width/half-depth
for its own coordinate transform (see §3) — read-only, no mutation, no
second extraction pipeline.

## 2. EAP cells and machine units (the 210/171 population)

```
Reference SCADA/EAP layout image (a snapshot of another system, on the day it was captured)
  → manual/tooled placement + reconciliation against the Floor 1 CAD drawing's
    331 raw machine candidates (docs/eap-operational-node-reconciliation-floor1.md)
  → floor1-eap-node-model.json (private: eap_cells[], machine_units[], cad_candidates[],
    spatial_registration; docs/eap-floor1-node-model.md's own canonical schema)
  → lib/eap-map.js's project() (server.js:1785's route handler)
  → GET /api/eap-map (whitelisted wire projection -- private CAD handles/millimetres/
    block names NEVER cross this boundary, lib/eap-map.js:14-21)
  → eap.js's `load()` (ENDPOINT fetch, eap.js:37,889-894)
  → drawn as instanced cell meshes (2D/3D), zone regions, and the aside's
    Population table/Selection inspector
```

## 3. Cell position (the two-frame split -- this phase's own "no fabricated survey coordinates" requirement, already enforced)

Every cell has an `EAP_LAYOUT_FRAME` footprint (schematic, non-metric,
anisotropic -- `docs/eap-floor1-operational-footprint.md`'s own contract).
**Only** cells with real CAD-backed identity or a residual-tested
structural registration additionally get a `FLOOR1_WORLD_M` footprint:

```
CAD candidate's own measured body + INSERT transform (Floor1.dxf)
  → spatial registration test (docs/eap-floor1-spatial-registration.md:
    40 cells DIRECT/STRUCTURAL, 167 SET_LEVEL/zone-region-only, 3 neither)
  → cad_world_position (CAD_WORLD_MM, private, never crosses the wire)
  → lib/eap-map.js's projectWorldFootprint() (line 348): applies the
    canonical Floor1 transform (x_twin = x_cad/1000 - halfWidth,
    z_twin = -(y_cad/1000 - halfDepth), CAD_ROTATION_SIGN = +1),
    restated from scripts/lib/floor1-frame.js since the service image
    does not carry that module (lib/eap-map.js:304-316)
  → world_footprint field on the wire (FLOOR1_WORLD_M, metres) --
    published ONLY when spatial_evidence is DIRECT or STRUCTURAL
    (worldRenderPermitted(), lib/eap-map.js:58-60)
  → eap.js draws this cell on the real floor plan in AUTO/WORLD mode
```

Every other cell (170 of 210) carries **only** its `EAP_LAYOUT_FRAME`
footprint -- drawn in EAP mode, or reachable through its zone's drawer in
AUTO/WORLD mode, never silently placed on the real floor. **The two frames
are never merged and no transform bridges them** (`lib/eap-map.js:463`,
re-verified this session via `tests/unit/eap-map-wire.test.js`'s own "the
payload names both frames and refuses to bridge them" assertion, still
passing).

## 4. Zone regions (the process-area rectangles)

```
Either: (a) the extent of the CAD candidates a zone's registration entry
  found (spatial_registration.zones[], real CAD measurement, LOW-to-HIGH
  link_confidence) -- lib/eap-map.js's zoneOutlines() (line 210)
Or, as a fallback: (b) the bounding box of the zone's own member cells'
  EAP_LAYOUT_FRAME footprints -- zoneOutlinesInner() (line 241)
  → explicitly labelled 'bounding extent of the cells in this zone; not a
    room boundary' (line 277) -- never an invented room polygon
  → drawn as outline rectangles (solid = registered, dashed = layout-only/
    LOW confidence) in the map, and the aside's zone-drawer summaries
```

## 5. Operational state (RUN/IDLE/DOWN/OFF/INITIAL/PM/STOP)

Two, deliberately separate, sources:

```
5a. REAL status (what the map actually asserts today):
  No authoritative IMS mapping exists for any cell
    → lib/eap-map.js's status field: hardcoded 'UNKNOWN' for every cell
      (line 175), with status_reason stating why
    → eap.js's inspector renders this verbatim -- no colour, no fabricated
      RUN/DOWN
    → the aside's "Status" section states the same fact in prose

5b. SIMULATED status (a rendering demo, explicitly disclosed, never real):
  hashString(cell.cell_id) (eap.js:427, deterministic per cell, no randomness)
    → SIM_STATES = STATUS_ORDER minus OFF (eap.js:424, "a floor mid-shift
      is not powered down")
    → simulatedStateFor() picks one key into OPERATIONAL_STATUS
      (public/operational-status.js -- the SAME 8-state module app.js
      also imports, not a second vocabulary)
    → paintStates() colours the mesh; the header's "Simulation: ON/OFF"
      toggle and the aside's "Simulated status" section both state, in the
      DOM itself, that this never reads from or writes to /api/state,
      TimescaleDB, or Node-RED (eap.html:266-271)
```

**Plant vocabulary preserved exactly** (this phase's own requirement):
RUN/IDLE/DOWN/OFF/INITIAL/PM/STOP are the same 8 states (plus UNDEFINED)
`operational-status.js` already defines for the physical twin -- never
replaced with Normal/Warning/Critical/Offline, never merged.

## 6. What crosses the wire vs. what never does (the privacy boundary itself is part of the lineage)

| Stays private (server-side only) | Crosses the wire |
|---|---|
| CAD handles, block/layer names | Opaque `cell_id`/`zone_id`/`unit_id` strings |
| CAD-world millimetre coordinates | `FLOOR1_WORLD_M` metres, only for DIRECT/STRUCTURAL cells |
| The reference layout's own status colours | `reference_status_drawn: boolean` (a fact about the drawing, not a status) |
| `machine_node_id` | `machine_unit_id` (already an opaque id in the model) |

This is `lib/eap-map.js`'s own explicit whitelist discipline (line 20:
"the projection is a whitelist... so a new private field added upstream
cannot leak through a spread") -- verified this session via
`tests/unit/eap-map-wire.test.js`'s "no CAD handles/millimetres/block
names/machine node ids in the map payload" assertions, all still passing.
