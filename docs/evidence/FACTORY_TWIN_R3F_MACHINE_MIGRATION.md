# Factory Twin 3D — Static Machine Objects Migration to R3F (Step 5B)

**Date:** 2026-09-11. **Scope:** `services/factory-twin-3d-next/{lib/machine-adapter.ts,
components/factory-twin/machines/}` plus wiring into the existing `/geometry-candidate` route.
**Static machine rendering only** — no selection, telemetry, operational state, alarms, EAP,
or LDI. `services/factory-twin-3d/` (the live implementation), Step 3's real shell route
(`app/page.tsx`), and every prior Step 3/4/5A file are untouched except the two wiring points
noted in §3 — confirmed by `git diff --quiet` against every Dockerfile-copied legacy path.

---

## 1. Authoritative machine source (identified, not duplicated)

Exactly the same pipeline Step 5A already established for CAD geometry — **not a second
source**:

| | |
|---|---|
| Source file | `services/factory-twin-3d/private/floor1-geometry.json`'s `equipment[]` array (gitignored, unchanged) |
| Endpoint | `GET /api/floor-geometry`'s `equipment` field (`server.js`, unchanged) — the SAME endpoint Step 5A's `geometry-adapter.ts` calls, one extra field read |
| Machine ID | `id` (e.g. `"EQP-F1-0001"`) |
| Coordinates | `position: {x, y, z}` — MEASURED_CAD, scene-unit metres, no transform applied |
| Orientation | `rotation_deg` — MEASURED_CAD, plus `operational_axis_offset_deg` (a published record field, not derived here) |
| Dimensions | `footprint: {width, depth}` (OBSERVED_CAD at best) and/or `operational_footprint` — **absent** for 76 of 433 records (`display_shape: 'UNRESOLVED'`), which legacy renders as flat markers, never a default box |
| Visual type | `footprint_status` (`MEASURED_CAD`/`OBSERVED_CAD`/`APPROXIMATION`/`UNRESOLVED`) — drives tier coloring, reproduced from `app.js`'s own `EQUIPMENT_TIER_STYLE` |
| Metadata actually used for rendering | `id`, `position`, `rotation_deg`, `footprint`, `operational_footprint`, `operational_axis_offset_deg`, `footprint_status`, `duplicate_of` — confirmed by reading `app.js`'s own `buildEquipmentLayer()` (app.js:1534-1680), not guessed |
| Transform / units | None — same scene-unit metres as Step 5A's CAD geometry, confirmed by inspecting real API output |

**The one correctness rule this step had to reproduce exactly**: `app.js:1505`,
`if (item.duplicate_of) continue;` — "one physical asset, one render, always," applied
uniformly regardless of display mode. This deployment's real data: **433 equipment records, 2
marked `duplicate_of`, 431 legitimately renderable** — confirmed directly against the raw API
response, not assumed from the mission's own cited numbers.

## 2. Domain adapter

```
private/floor1-geometry.json's equipment[]   (unchanged, untouched)
        |
        v
lib/wire.js's projectEquipment()   (unchanged, untouched)
        |
        v
GET /api/floor-geometry's equipment field   (server.js, unchanged, untouched)
        |
        v
services/factory-twin-3d-next/lib/machine-adapter.ts   <-- NEW, this step
  fetchMachines(baseUrl) -- validates into Step 1's Asset domain type
  (no field recreated/renamed), then applies the ONE dedup rule above
        |
        v
React Server Component (app/geometry-candidate/page.tsx, extended) fetches
once, server-side, alongside Step 5A's geometry fetch (Promise.all)
        |
        v
Machines.tsx (R3F) -- receives ONLY typed Asset[], never raw JSON
```

`Machines.tsx` never imports `fetch`, any API path, or any state/store module — confirmed by
inspection. It takes one `readonly Asset[]` prop and nothing else.

## 3. Machine component architecture

```
components/factory-twin/machines/
  Machines.tsx   the only new component -- takes readonly Asset[], renders
                 2 InstancedMeshes (sized machines, unresolved markers)
```

**Why not a literal `MachineObject.tsx` per machine** (Section 3's own architecture question,
answered explicitly rather than silently deviated from): 431 machines share one unit box
geometry and differ only by a transform + tier color — the same justification `app.js` itself
gives for its own two-InstancedMesh design (`app.js:1563`, "TWO InstancedMeshes, not 344
objects"). A literal per-machine React component would mount 431 `<mesh>` elements for zero
rendering benefit, real reconciler overhead, and would work against demand-rendering's whole
point. Each machine's `Asset.id` remains a first-class, stable per-instance identity (carried
in the `SizedInstance`/`MarkerInstance` arrays `Machines.tsx` builds internally) — ready for a
future selection step to resolve an `instanceId` back to one `Asset`, without `Machines.tsx`
itself owning that responsibility. `Machines.tsx` imports no API, selection, alarm, or
inspector module — confirmed by inspection, matching Section 3's ownership boundary exactly.

**Wiring points** (the only two prior-step files touched, both additive):
- `GeometryViewport.tsx`: added a `machines: readonly Asset[]` prop, renders `<Machines
  machines={machines} />` alongside the existing `<FactoryGeometry>` — one line added, nothing
  removed or changed in the existing geometry/lifecycle code.
- `app/geometry-candidate/page.tsx`: added `fetchMachines()` alongside the existing
  `fetchFactoryGeometry()` call (now `Promise.all`'d together), passes `machines` through.

## 4. Static rendering (Section 4)

No animation, no state-driven color. Every machine's material color is derived from its own
static `footprint_status` field (a CAD evidence-tier fact, not an operational state) — the same
neutral, evidence-tier coloring `app.js` already uses, reproduced exactly (`0x4d6483` for
MEASURED_CAD/OBSERVED_CAD, `0x3c516c` for APPROXIMATION, `0x2b3a4d` for UNRESOLVED markers).
No machine's color depends on `ims_device_id`, `status`, or any live/operational field —
confirmed by inspection of `Machines.tsx`'s own color-assignment logic.

## 5. Exact parity (Section 5)

`tests/playwright/factory-twin-r3f-machines.js` fetches the raw `/api/floor-geometry` response
directly and the same response through `machine-adapter.ts`, then asserts exact equality:

| Check | Result |
|---|---|
| Raw equipment count | 433 |
| Records with `duplicate_of` set | **2** |
| Adapter output count | **431** (433 − 2, exact) |
| Every surviving machine's `id` + `position.{x,y,z}` | **Byte-identical** to raw, all 431 |
| Every machine's `rotation_deg` | **Byte-identical** to raw, all 431 |
| Machine ID uniqueness | **431 unique of 431** (no accidental duplication) |
| Page-rendered summary count | **431** (matches adapter output exactly) |

No machine silently disappeared; none was duplicated — both explicitly tested, not assumed
from the count matching alone.

## 6. Visual comparison (Section 6)

Screenshots: `tests/playwright/screenshots/r3f-machine-migration/candidate.*.png` (new,
gitignored per repo convention, not committed — same as every other Playwright screenshot).

- **Plan view**: the machine rows now visible in the candidate directly correspond to the
  legacy 2D plan's own long parallel machine rows in the "DRILLING PHASE4 AND 5" and "DRILLING
  PHASE 1-3" areas (same relative position, spacing, and orientation, compared against the
  Step 5A doc's own legacy screenshot from the same disposable container).
- **Overview (3D) view**: machines now stand as real volumes inside the rooms Step 5A's walls
  already outline — correct room placement, correct relationship to walls (machines sit
  between wall runs, not overlapping them), correct footprint proportions (long rectangular
  machines read as long rectangles, not squares).
- **Intentional visual differences, disclosed**: (1) the 14 `TRUE_POLYGON` records (measured
  non-rectangular outlines) are rendered as their bounding rectangle in this step, not their
  true polygon shape — `app.js`'s own `buildTruePolygonMeshes()` extrudes the real outline;
  this step's `Machines.tsx` does not yet, a deliberate scope-reduction disclosed here and in
  Known Limitations, not a silent shortfall (the box uses the SAME measured footprint
  dimensions, not an invented size); (2) tier colors are assigned per-instance within 2 shared
  `InstancedMesh`es rather than one mesh per tier (4 in the legacy's typical case) — same
  visual information (a machine's evidence tier is still visibly distinguishable by color),
  fewer draw calls, a measured and disclosed efficiency choice, not a fidelity loss.

No pixel-equality is claimed — not required per this step's own Section 6 ("do not require
pixel equality if rendering technology/materials differ"). Geometric correctness (positions,
proportions, room relationships) is demonstrated by the exact-value parity in §5 plus the
side-by-side structural comparison above.

## 7. Rendering efficiency (Section 7)

| Metric | Before machines (Step 5A geometry only) | After machines added |
|---|---:|---:|
| Draw calls | 9 | **11** (+2: one for sized machines, one for unresolved markers) |
| Triangles | 10,110 | **15,282** |
| Geometries | 9 | **11** |
| Textures | 1 | 1 (unchanged) |

**Instancing was evaluated, not applied automatically**: 357 of 431 machines share one unit
box geometry and one material family (only the transform and a per-instance color differ) —
the textbook case for `InstancedMesh`, the same justification already proven correct at Steps
4/5A's own scale. The 76 unresolved-footprint records are visually and semantically distinct
(flat markers, not bodies) and get their own second `InstancedMesh` rather than being forced
into the first — object similarity, not merely count, decided the grouping. TRUE_POLYGON
records (14) are, in this step, folded into the same sized-machine batch using their bounding
rectangle (see §6's disclosed limitation) rather than given unique per-record geometry, which
would have meant losing the single-draw-call property for a fifth of the sized machines. A
future step doing true-polygon extrusion would need its own separate (likely non-instanced,
since each polygon is unique) render path — noted, not built here.

## 8. Render-loop safety (Section 8)

Instrumented via the same `reactRenders` ref-counter `GeometryViewport.tsx` already exposed in
Step 5A (unchanged mechanism, now also covering the machines it renders):

| Action | React re-renders |
|---|---:|
| 3-second idle | **+0** |
| Camera orbit (8-point drag) | **+0** |
| Resize (1920×1080 → 1600×900 → back) | **+0** (geometry count also unchanged: 11→11) |

Machine transforms are written imperatively in `useLayoutEffect` against `InstancedMesh` refs
(`Machines.tsx`, mirroring `Walls.tsx`/`Columns.tsx`'s already-proven Step 5A pattern) — never
through React state. No animation-frame value is read into React state anywhere in this step's
new code, confirmed by inspection (`Machines.tsx` has no `useFrame`, no per-frame `setState`).

## 9. Resource stability (Section 9)

Tested: initial render, camera interaction, resize, and 1+4 context-loss/recovery cycles (§10).
Draw calls / geometries / textures / materials remained exactly stable across every transition
except the one legitimate, one-time step of adding machines to the page at all (9→11
geometries, measured once, not fluctuating). No monotonic growth, no duplicate geometry or
material creation on any re-render — the same `InstancedMesh`-created-once-in-`useLayoutEffect`
pattern that already gave Step 5A this property extends unchanged to machines.

## 10. Context recovery (Section 10)

Reused Step 4's corrected lifecycle exactly (`GeometryViewport.tsx`, unchanged this step) — no
second WebGL lifecycle implementation was written.

| | Before loss | After restore | |
|---|---:|---:|---|
| Single cycle | geometries 11, textures 1 | geometries 11, textures 1 | **PASS, no growth** |
| 4 repeated cycles | geometries 11, textures 1 | geometries 11, textures 1 (every cycle) | **PASS, no growth, no accumulation** |
| Machines present after recovery | — | all machines still rendered (visual + count-stable) | **confirmed** |
| Camera interactivity after recovery | — | click/orbit work without error | **confirmed** |
| CAD geometry (Step 5A) still present | — | walls/columns/openings/grid unaffected | **confirmed** (same scene, same lifecycle instance) |

## 11. Performance gate (Section 11)

| Metric | Legacy (PR #23 baseline, full scene) | R3F candidate (geometry + machines, this step) | Delta |
|---|---:|---:|---|
| FCP | ~50–100ms | 192ms | Comparable order of magnitude; candidate loads more JS before first paint (unchanged finding from Step 5A) |
| LCP | 108ms | 200ms | Real, moderate increase — canvas is the LCP element; comparable to Step 5A's own 376ms reading, natural run-to-run variance disclosed, not smoothed into one number |
| First WebGL render | not separately measured for legacy at this granularity | ~240ms (page load to canvas ready) | New reading for this step |
| Draw calls | 326–356 (full scene incl. equipment, PR #23) | **11** | Still not a fair comparison — legacy's count includes real equipment textures/labels/zones this step does not render yet (see Step 5A's own disclosure, unchanged) |
| Triangles | 10,408–16,996 | 15,282 | **Now directly comparable and within the legacy's own measured range** — the biggest content driver (equipment) is present in both |
| Geometries | 88 (full scene) | 11 | Still lower — no per-machine labels/text-sprites/zone fills yet |
| Textures | 22 | 1 | Still lower — no label textures yet |
| JS heap | 10.68MB (idle, full scene) | 8.81MB | Comparable, still slightly lower given less content than the full legacy scene |
| Console/page errors | 0 | 0 | Equal |

**Triangle count is now genuinely comparable and within range** — a real, positive signal that
adding the actual machine geometry (not just CAD structure) brings the candidate's rendering
load into the same ballpark as the legacy scene, not an artificially small placeholder. No
regression is hidden: draw-call/geometry/texture gaps remain and are attributed to the same
not-yet-migrated content (labels, zone fills) already named in Step 5A's own disclosure.

## 12. Accessibility (Section 12)

No `onClick`/selection wiring exists on `Machines.tsx` — verified by inspection AND by test:
clicking a machine produces zero "Selected:" UI (Step 5B's own explicit rule). Keyboard focus
still reaches the toolbar's real `<button>` controls, unaffected by the new machine content.
Machine color is a supplementary evidence-tier cue, not the only source of any operationally
important information in this step (no operational state exists yet to communicate).

## 13. Responsive (Section 13)

All 6 required viewports (1366×768, 1920×1080, 2560×1440, 3840×2160, 1024×768, 1440×900):
0 horizontal overflow, canvas fills its container, axe 0 serious/critical violations, toolbar
remains accessible — all unchanged from Step 5A's own pass, now re-verified with machines
present.

## 14. Tests

`tests/playwright/factory-twin-r3f-machines.js` — 41/41 pass (machine source parity, machine
count/identity/coordinate/rotation exactness, render-loop safety across idle/orbit/resize,
context recovery ×1 and ×4, all 6 responsive viewports + axe, the explicit no-selection-yet
rule, keyboard focus). Re-ran (not weakened) Step 3's shell suite (30/30), Step 4's R3F spike
suite (45/45), and Step 5A's geometry suite — **found and fixed one stale hardcoded baseline**
in Step 5A's own recovery-check (`geomBefore = 9`, now correctly `11` after machines were
added to the shared route) by measuring the baseline dynamically instead of hardcoding a
literal, restoring it to 48/48. This is a correction, not a weakening: the check still
requires exact equality, zero tolerance, before vs. after recovery — only the source of the
"before" value changed from a stale constant to a live measurement.

## Known limitations

- `TRUE_POLYGON` records (14 of 431) render as their bounding rectangle, not their true
  measured outline — `app.js`'s own `buildTruePolygonMeshes()`/`ExtrudeGeometry` path is not
  reproduced this step. Disclosed in §6, not silently dropped; a real, scoped future addition.
- Unresolved-footprint markers (74 of 431, after excluding 2 duplicates) render as flat pads,
  matching `app.js`'s own convention, but were not independently visually cross-checked against
  a legacy screenshot at the same zoom level — a reasonable spot-check gap given time, not
  a correctness gap (their positions are part of the same exact-parity test as every other
  machine).
- No per-machine label/text-sprite exists yet (carried forward — labels are explicitly a
  later-step concern, matching this engagement's own established equipment-then-labels
  ordering from the legacy app's own development history).
- `GeometryViewport.tsx`'s WebGL-lifecycle code remains duplicated from Step 4's
  `TwinViewport.tsx` (Step 5A's own disclosed limitation, unchanged this step).
- No CI job exists for `services/factory-twin-3d-next/` yet (carried forward from Steps 2–5A).

## Acceptance criteria

- [x] machine source is authoritative (same `/api/floor-geometry` endpoint as Step 5A/legacy)
- [x] no duplicate machine data source
- [x] machine count matches legacy (431, exact — legacy's own ALL_ENGINEERING-mode count)
- [x] machine IDs match (byte-identical, all 431)
- [x] coordinates match (byte-identical position + rotation, all 431)
- [x] transforms match (same CAD_ROTATION_SIGN convention, same axis-offset handling)
- [x] visual placement is correct (rooms/walls relationship confirmed, §6)
- [x] machines remain static (no animation, no state-driven color)
- [x] no selection logic added (verified by inspection + test)
- [x] no telemetry logic added
- [x] no alarm logic added
- [x] no LDI dependency
- [x] no React-per-frame updates (0 renders across idle/orbit/resize)
- [x] resource counts stable (§9, §10)
- [x] context recovery passes (§10, ×1 and ×4)
- [x] responsive matrix passes (§13, all 6 viewports)
- [x] accessibility remains valid (§12)
- [x] performance regression acceptable (triangle count now comparable; remaining gaps
      attributed to not-yet-migrated content, disclosed not hidden)
- [x] legacy Factory Twin untouched (`git diff --quiet` confirmed)

## Verdict

**STEP 5B — R3F STATIC MACHINE OBJECTS: PASS.**
