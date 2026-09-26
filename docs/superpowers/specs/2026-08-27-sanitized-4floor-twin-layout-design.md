<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../../README.md"><img src="../../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../README.md"><img src="../../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Sanitized Four-Floor Factory Layout — Architecture Addendum

> Status: DESIGN ONLY. Not approved for implementation. No code, no migration, no schema change has been made for this. Extends `2026-08-17-3d-factory-digital-twin-design.md` §3/§4 — it does not replace or contradict that document, and does not implement its still-proposed `factory_layout_hierarchy`/`device_3d_placement` tables (confirmed not yet created anywhere in this repo).

## 0. Why this is sanitized, not real

Real architectural floor plans exist as a private reference outside this repo (never committed — see `.gitignore`). This document was authored **without opening those files**: a four-floor stacked layout is a generic, well-understood building pattern that needs no facility-specific detail to design, and not reading the source files at all is a smaller exposure surface than reading them and trusting redaction. Nothing below encodes a real dimension, coordinate, machine count, machine location, or floor identity. Every constant is either a round industry-standard default or explicitly marked as a placeholder the operator fills in later, per the same `is_simulated` discipline §4 of the parent doc already established.

If real floor-assignment or floor-footprint data is ever supplied, it goes through the same simulated-to-real migration path §5 of the parent doc already defines (`UPDATE ... SET is_simulated = FALSE, source = 'cad_import' | 'manual_survey'`) — this document adds nothing new to that mechanism, it only extends the schema/rendering it already describes to cover floors.

## 1. Scale convention: what "1:300" means here

1:300 is a print/drawing scale (1 drawing unit = 300 real-world units) — it has no direct meaning inside a Three.js scene, which has no paper size. Translated into the existing renderer's convention (1 scene unit ≈ 1 meter, per `ZONE_SPACING_X = 18` / `MACHINE_SPACING_Y = 8` in `services/factory-twin-3d/server.js`, i.e. zones ~18m apart): **1:300 is honored as a coarseness contract, not a literal transform.** Concretely:

- Every floor footprint is a rectangle whose aspect ratio is rounded to the nearest **0.25** increment (e.g. 1.5:1, 1.75:1, 2:1 — never an exact measured ratio).
- Absolute floor size is a fixed config constant (`FLOOR_WIDTH = 60`, `FLOOR_DEPTH = 40`, arbitrary round scene units), identical across all four floors unless a real footprint difference is later confirmed — not derived from any real square footage.
- No dimension in this document or its eventual implementation is traceable back to a real measurement. Rounding to a quarter-unit ratio and fixing absolute size to a round constant are both one-way: you cannot recover the real floor plan from them.

## 2. Floor stacking model

Four floors, stacked bottom-up on the Z axis, generic industrial floor-to-floor height:

```
FLOOR_HEIGHT = 6          // scene units (~generic industrial storey height; not a real measurement)
pos_z(floor_index) = floor_index * FLOOR_HEIGHT     // floor_index: 0=ground .. 3=top
```

This is an extension of §4's existing `pos_z DOUBLE PRECISION NOT NULL DEFAULT 0` column in the proposed `device_3d_placement` table — today every real device implicitly has `floor_index = 0` (single flat cluster, matching what the live `devices.location` data actually supports: zone names only, no floor field). Nothing here changes that; it only gives the schema room to place a device on floor 1-3 once a real floor assignment exists.

## 3. Schema addendum (extends parent §3, still proposed — not created)

```sql
-- ADDENDUM to public.factory_layout_hierarchy (2026-08-17 doc §3), not yet created.
-- Adds a numeric stacking key alongside the existing free-text floor_name,
-- since "Floor 3" as text has no defined stacking order on its own.
ALTER TABLE public.factory_layout_hierarchy
  ADD COLUMN floor_index INTEGER;   -- 0=ground .. 3=top; NULL until a real floor is known

-- Generic, non-identifying floor labels -- placeholders, not real building
-- floor names. Swap for real names only if the business explicitly wants
-- real building nomenclature exposed in the UI; otherwise these are fine
-- to ship as-is indefinitely.
-- ('Floor 1', 0), ('Floor 2', 1), ('Floor 3', 2), ('Floor 4', 3)
```

`floor_index` stays `NULL` for every row until a real device-to-floor mapping is supplied (facilities survey, asset register, or manual entry — same three sourcing paths §17 of the parent doc lists for x/y, extended to floor). No device in the live `devices` table is auto-assigned a floor by this document: doing so would be inventing facility data this repo has explicit standing instructions never to fabricate.

## 4. Renderer addendum

- Add a floor-shell mesh per floor index (a flat translucent plate at `pos_z = floor_index * FLOOR_HEIGHT`, sized `FLOOR_WIDTH × FLOOR_DEPTH` from §1) purely as a visual reference plane — not a machine, not clickable, no real geometry.
- A floor selector (show all / isolate one floor) is additive UI, independent of §1-3; not designed further here since it has no dependency on real data and can be built the same day floor-shell rendering is.
- Machines with `floor_index IS NULL` render on the ground shell (`floor_index = 0`) with the same `is_simulated: true` / "SIMULATED LAYOUT" banner convention §4 of the parent doc already mandates — never silently defaulted without the visual disclosure.

## 5. What remains an operator/data decision (not fabricated here)

| Item | Status |
|---|---|
| Real floor-to-device assignment | Not sourced. No column populated by this document. |
| Real floor footprint proportions | Not sourced. §1's rounded-ratio placeholders used until supplied. |
| Real floor names (if different from "Floor 1..4") | Business decision — generic labels ship until told otherwise. |
| Whether to build the floor-shell renderer now vs. wait for real per-device floor data | Engineering judgment, not exercised in this document — see closing note below. |

## 6. Implementation recommendation

**Not implemented in this pass.** The prerequisite tables this addendum extends (`factory_layout_hierarchy`, `device_3d_placement`) are themselves still only proposed — confirmed via live inspection of `services/factory-twin-3d/server.js`, which computes placement in-memory from `devices.location` and explicitly documents "no `device_3d_placement` table" as a deliberate, disclosed choice. Building floor-stacking on top of a table that doesn't exist would be scaffolding ahead of its own foundation. The one concrete, justified, zero-risk action taken alongside this document was adding `Apex3Layout/` to `.gitignore`, closing a real accidental-commit exposure that existed independently of this design work.

When the base tables from the parent doc are approved and created, this addendum's `floor_index` column and floor-shell renderer are a same-size follow-on to that work, not a separate project.
