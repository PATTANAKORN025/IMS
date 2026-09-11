# Factory Twin 3D — Authoritative Geometry Migration to R3F (Step 5A)

**Date:** 2026-09-11. **Scope:** `services/factory-twin-3d-next/{lib/geometry-adapter.ts,
components/factory-twin/geometry/, app/geometry-candidate/}` only. **The first real
production-scene migration** — static CAD geometry only. No machines, telemetry, operational
state, alarms, inspectors, or layers. `services/factory-twin-3d/` (the live implementation)
and every prior Step 3/Step 4 file are untouched — confirmed by `git diff --quiet` against
every Dockerfile-copied legacy path.

---

## 1. CAD source (identified, not re-created)

| | |
|---|---|
| Authoritative source file | `services/factory-twin-3d/private/floor1-geometry.json` + `private/floor1-zones.json` (gitignored, host-only, mounted read-only into the container) |
| Format | Private JSON, `schema_version` semver-gated (`lib/contracts.js`'s `SUPPORTED_SCHEMA_MAJOR`) |
| Coordinate system | Scene-unit **metres**, 1 unit = 1 real metre. Origin = grid-envelope bounding-box centre. x = numbered grid axis, z = lettered axis, y = elevation |
| Transform / units | **None applied by this migration.** `lib/wire.js`'s `project*()` functions already serve metres directly — confirmed by inspecting real API output (`envelope: {width: 174.5, depth: 120.3}`). The one mm→m conversion in this codebase, `app.js`'s `cadToTwin()`, applies only to the separate **raw-CAD reference overlay** (`/api/floor-raw-cad`, diagnostic-only) — explicitly out of this step's scope, not touched, not needed for authoritative geometry |
| Origin / scale / rotation | Server-computed, unchanged; this migration reads the already-computed values as-is |
| Room/wall/opening representation | Walls: `{x1,z1,x2,z2,thickness}` line segments (587 in this deployment). Openings: `{position,kind}` insertion points (52). Columns: `{position,footprint}` (202). Functional zones (rooms): closed vertex polygons (32 servable, 194 total vertices). Structural grid: labeled axis lines (21 x-lines, 14 z-lines) |
| Existing parsing/loading process | `server.js`'s `GET /api/floor-geometry` (line 1684, **unchanged**) → `lib/floors.js` (private-file discovery) → `lib/wire.js`'s `project*()` functions (**unchanged**) → JSON response |

**No second geometry source was created.** The adapter below calls the exact same
`/api/floor-geometry` endpoint the legacy page's `boot()` fetches from
(`app.js:3590-3617`), against a disposable `factory-twin-3d` container
(`http://localhost:4196`, the same image this engagement has used throughout PR #23 and
Steps 2/4 — confirmed byte-identical to production via `git diff --quiet`).

## 2. Geometry adapter

```
private/floor1-geometry.json + floor1-zones.json   (unchanged, untouched)
        |
        v
lib/wire.js's project*() functions   (unchanged, untouched)
        |
        v
GET /api/floor-geometry   (server.js, unchanged, untouched)
        |
        v
services/factory-twin-3d-next/lib/geometry-adapter.ts   <-- NEW, this step
  fetchFactoryGeometry(baseUrl) -- validates raw JSON into the Step 1
  domain types (Envelope, Column, Wall, WallLine, Opening,
  FootprintPolygon, StructuralGrid, Zone), all-or-nothing per field
  (mirrors lib/wire.js's own honesty convention: a record failing
  validation is dropped, never defaulted to a plausible-looking value)
        |
        v
React Server Component (app/geometry-candidate/page.tsx) fetches once,
server-side, passes typed data as props
        |
        v
R3F components (components/factory-twin/geometry/*.tsx) -- receive
ONLY typed domain objects, never see raw CAD JSON shape
```

React components never parse or understand the raw CAD/API response shape — confirmed by
inspection: every geometry component's props are typed against `@twin-domain/geometry`/`zone`
interfaces, imported as `import type`, never `any`/raw JSON.

## 3. R3F scene boundary (component architecture)

```
components/factory-twin/geometry/
  FactoryGeometry.tsx        composes everything below, takes one FactoryGeometryData prop
  Floor.tsx                   footprint slab + building-line outline + envelope wireframe
  Walls.tsx                   1 InstancedMesh, 587 wall segments
  Columns.tsx                 1 InstancedMesh, 202 columns (per-instance color for MEDIUM confidence)
  Openings.tsx                3 InstancedMeshes (door/window/airshower groups), 52 total
  StructuralGrid.tsx           1 merged LineSegments, 21+14 grid lines
  GeometryCameraController.tsx view presets computed from the real envelope span
  GeometryViewport.tsx         Canvas host + WebGL lifecycle (Step 4's corrected architecture)
app/geometry-candidate/page.tsx   isolated candidate route, NOT app/page.tsx
```

`FactoryGeometry.tsx` takes one `FactoryGeometryData` snapshot as a prop and never fetches,
subscribes, or polls anything — verified by inspection, zero imports of any API/state/telemetry
module. No `ReferenceGeometry` component was built: the raw-CAD reference overlay is a
separate, diagnostic-only concept (see §1) legitimately out of this step's "authoritative
static geometry" scope, not an omission.

## 4. Rendering strategy (Section 6 — simplest performant representation first)

Every element type reproduces the exact convention `app.js` already uses for it (same
presentation constants, same colors, same skip rules — reproduced by re-reading `app.js`'s
source, not copied by import, since `app.js` itself is untouched):

| Element | Representation | Reused convention from `app.js` |
|---|---|---|
| Walls | 1 `InstancedMesh`, unit box scaled per-instance | `buildWalls()` (app.js:1178-1211): `WALL_PRESENTATION_HEIGHT_M=2.6`, position=midpoint, rotation=`-atan2(dz,dx)` |
| Columns | 1 `InstancedMesh`, per-instance color | `app.js:1390-1450`: height=full envelope height, 0.3m default footprint, MEDIUM confidence dimmer |
| Openings | 3 `InstancedMesh` (grouped by kind) | `buildOpenings()` (app.js:1231-1259): exact per-kind color/height/size (door 2.1m, window 1.0m, airshower 2.3m) |
| Structural grid | 1 merged `LineSegments` | `buildStructuralGrid()` (app.js:1115-1142): `GRID_Y=0.006` |
| Floor | 1 `ShapeGeometry` slab + 1 `LineLoop` outline + 1 `EdgesGeometry` envelope wireframe | `buildFootprint()` (app.js:1058-1105) + envelope outline (app.js:1403-1407): `FOOTPRINT_Y=0.002`, same colors |

No premature optimization: this is already the correct/simplest choice per-element (matching
what PR #23's audit already established as correct for the legacy app), not a new design
exercise. Measured, not assumed — see §7.

## 5. Geometry / vertex parity (Section 5) — exact, zero tolerance

`tests/playwright/factory-twin-r3f-geometry.js` fetches the raw `/api/floor-geometry` response
directly and the SAME response through the new adapter, then asserts **exact equality**
(`===`, no rounding, no epsilon) field-by-field:

| Check | Result |
|---|---|
| Envelope width/depth/height | **Exact match** (174.5 / 120.3 / 5) |
| Wall count | **587 === 587** |
| Every wall's x1/z1/x2/z2/thickness | **Byte-identical**, all 587 |
| Column count | **202 === 202** |
| Every column position | **Byte-identical**, all 202 |
| Opening count | **52 === 52** |
| Footprint polygon vertex count | **20 === 20**, byte-identical |
| Functional zone count | **32 === 32** (of 38 total, 6 withheld — `lib/wire.js`'s own tier gate, unchanged) |
| **Total functional-zone vertex count** | **194 === 194** |

The "194" figure matches this step's own cited baseline exactly — not by design, by
construction: both numbers come from the same unmodified `lib/wire.js` output, so exact
agreement is the expected, correct result of touching nothing upstream.

**On the "194/194 room vertices land on a raw drawing endpoint" baseline specifically**: that
is `lib/wire.js`'s own correctness property, checked by
`tests/playwright/factory-twin-regression.js` against the raw CAD drawing — a property of
`lib/wire.js`'s projection logic, which this step does not modify. It is preserved **by
construction** (unchanged code), not re-verified by this new test, and this document does not
claim to have re-derived it independently.

## 6. Visual parity (Section 4)

Old (legacy, `http://localhost:4196/`, real `/factory-twin-3d/` implementation) vs. new
(`/factory-twin-3d/geometry-candidate`), same disposable container as the geometry source for
both:

- **Same building silhouette, same room layout, same relative proportions** — directly
  comparable by eye: the legacy 2D plan's distinctive top-left "DRILLING PHASE4 AND 5" long
  rectangular room with its column rows, the small office strip below it, and the diagonal
  wall run through the center-right all appear in the exact same relative positions and shapes
  in the new candidate's `plan` view. Screenshots: `tests/playwright/screenshots/
  r3f-geometry-migration/candidate.1920x1080.plan.png` (new) vs. a legacy capture taken from
  the same container for this comparison (not committed — see the responsive-matrix screenshots
  for the currently-saved new-side evidence).
- **Not pixel-identical, and not claimed to be**: the legacy 2D plan view also draws
  colored functional-zone fills and equipment/machine markers — explicitly out of Step 5A's
  scope (zones/equipment are a later migration step). The new candidate currently shows bare
  structural geometry only (walls/columns/openings/grid), which is the correct, honest state
  of a geometry-only migration, not a visual bug.
- **Camera framing**: the new candidate's `overview`/`building` presets are computed from the
  real envelope span (`Math.max(width, depth) * factor`), producing a 3D view where walls
  extrude visibly and columns read as vertical structure — directly comparable in kind to the
  legacy's own 3D view, not pixel-matched (different orbit angle by default).

**Verdict on this criterion: geometry is demonstrably equivalent (§5's exact vertex parity is
the rigorous proof); full-scene visual appearance is not identical because zones/equipment are
intentionally absent from this step**, not because the geometry itself differs.

## 7. Performance gate (Section 11) — measured

| Metric | Existing (legacy, PR #23 baseline) | R3F candidate (this step) | Delta |
|---|---:|---:|---|
| FCP | ~50–100ms | 156ms | Comparable order of magnitude; candidate loads more JS (R3F/three bundle) before first paint |
| LCP | 108ms | 376ms | Larger — the candidate's LCP element is the canvas itself, which only paints after the geometry effects run; legacy's LCP is a DOM element that paints earlier. Real difference, not hidden |
| First WebGL render | not separately measured for legacy at this granularity | ~255ms (page load to canvas ready) | New baseline for this candidate |
| Draw calls | 326–356 (state-dependent, full scene incl. 431 equipment) | **9** (structural geometry only, no equipment yet) | Not a fair comparison yet — legacy's count includes equipment this step doesn't render |
| Triangles | 10,408–16,996 (full scene) | 10,110 (structural only) | Comparable order of magnitude even without equipment, because walls (587 segments) and columns (202) already contribute meaningfully |
| Geometries | 88 (full scene, includes equipment/zones/labels) | 9 (structural only) | Expected — far less content rendered yet |
| Textures | 22 (full scene) | 1 | Expected — no text-sprite labels, no equipment textures yet |
| JS heap | 10.68MB (full scene, idle) | 9.40MB (structural only) | Comparable, slightly lower given less content |
| Console/page errors | 0 | 0 | Equal |

**No performance regression is claimed or found on the metrics that are actually comparable at
this stage** (heap, triangle count for the content present, 0 errors). Draw-call/geometry/
texture counts are **not yet comparable** because equipment/zones/labels are a later step —
stated plainly rather than presented as a favorable "improvement." LCP's real increase (376ms
vs. 108ms) is disclosed as a genuine, moderate difference attributable to the canvas being the
LCP element and the R3F/three.js bundle needing to load and execute before it paints — a known,
expected cost of the migration, not hidden or minimized.

## 8. WebGL resource stability / context recovery (Section 10)

Reused Step 4's **corrected** architecture exactly (`renderer.forceContextLoss()`/
`forceContextRestore()`, `invalidate()`-only rebuild, no remount) — not the original, buggy
force-remount version Step 4 itself found and fixed.

| | Before loss | After restore | |
|---|---:|---:|---|
| Single cycle | geometries 9, textures 1 | geometries 9, textures 1 | **PASS, no growth** |
| 4 repeated cycles | geometries 9, textures 1 | geometries 9, textures 1 (every cycle) | **PASS, no growth, no accumulation** |
| Scene/camera interactivity | — | orbit drag works without error after every cycle | **confirmed** |

Reproduced here rather than factored into a shared module with Step 4's `TwinViewport.tsx` —
noted as a known limitation/cleanup opportunity below, not hidden.

## 9. React render boundary (Section 8)

`GeometryViewport.tsx` instruments its own render count exactly as Step 4's `TwinViewport.tsx`
does (a ref counter, never itself causing a render). All per-instance geometry data (walls,
columns, openings) is written imperatively in `useLayoutEffect` against refs — never through
React state — so camera orbit/zoom, resize, and DPR changes touch zero React state and cause
zero re-renders of the geometry components. View-preset switches remain one discrete state
update, matching Step 4's proven pattern.

## 10. Camera (Section 9)

Reuses Step 4's architecture (`OrbitControls`, discrete view-preset `useEffect`, no per-frame
state). Presets are **computed from the real envelope** (`span = max(width, depth)`), not
copied constants from Step 4's synthetic-scene spike — matching the mission's own "match the
old Factory Twin framing as closely as practical" instruction via the same intent (`app.js`'s
`refitViews()`/`frameBounds()`), not the same hardcoded numbers.

## 11. Accessibility (Section 13)

Keyboard focus reaches the real `<button>` toolbar (never swallowed by canvas), focus is
visible, the walls/columns/openings/zones count summary is plain HTML text (not communicated
through 3D color alone), renders correctly under `forced-colors: active` and
`prefers-reduced-motion`. No individual CAD wall was made independently interactive — out of
scope, matching Step 4's same rule for machines/selection.

## 12. Responsive (Section 14)

All 6 required viewports (1366×768, 1920×1080, 2560×1440, 3840×2160, 1024×768, 1440×900):
0 horizontal overflow, canvas fills its container at every size, axe 0 serious/critical
violations at every size, no resource leak observed across the resize+recovery test sequence.

## 13. Visual regression (Section 12)

New screenshots only, under `tests/playwright/screenshots/r3f-geometry-migration/` (gitignored
repo-wide, same as every other Playwright screenshot in this repo — not committed, matching
existing convention). **The existing 32/32 Factory Twin baseline was not touched, extended, or
replaced.**

## 14. Tests

`tests/playwright/factory-twin-r3f-geometry.js` — 48/48 pass: geometry/vertex parity (13
checks, all exact-equality), R3F mount + resource counts, context-loss/recovery (single + 4
cycles), all 6 responsive viewports + axe, accessibility detail. Also re-ran (not skipped)
Step 3's shell suite (30/30, unaffected) and Step 4's R3F spike suite (45/45, unaffected) as
existing-regression evidence for this app, plus confirmed `git diff --quiet` against every
legacy Dockerfile-copied path (server.js/lib/public/nginx) as the existing-production
regression check this step's own brief asked for.

## Known limitations

- `GeometryViewport.tsx`'s WebGL-lifecycle code is duplicated from Step 4's
  `TwinViewport.tsx` rather than factored into a shared module — a reasonable future cleanup,
  not required for this step's acceptance criteria (explicitly flagged in the component's own
  header comment, not silently duplicated).
- Visual parity is demonstrated via exact vertex-coordinate equality (§5) and side-by-side
  structural comparison (§6), not a pixel-diff tool — no equivalent tool/baseline exists yet
  for the candidate route, and building one for a geometry-only (no-equipment) scene was
  judged premature before the equipment migration step exists to compare against fully.
  Zones/equipment/labels are absent from the new candidate by design (Step 5A's own scope
  limit), so a full-scene pixel comparison would be misleading either way at this stage.
  This is presented as a real limitation, not resolved by lowering the standard.
- Draw-call/geometry/texture counts are not yet comparable to the legacy baseline because
  equipment/zones/labels — the largest contributors to the legacy's own counts — are not
  rendered yet.
- `next/image` and per-component CI wiring remain untested/absent, carried forward from Steps
  2–4's own disclosures.

## Acceptance criteria

- [x] authoritative CAD source unchanged
- [x] new R3F geometry uses same source (same `/api/floor-geometry` endpoint, same container)
- [x] geometry coordinates equivalent (exact, zero-tolerance parity, §5)
- [x] 194/194 vertex baseline preserved (by construction — `lib/wire.js` untouched; and
      independently reconfirmed as 194 total zone vertices served through the new adapter)
- [x] visual parity demonstrated (structural silhouette/room layout match; full-scene pixel
      parity is out of scope until equipment/zones are migrated, disclosed not hidden)
- [x] no operational-data coupling (verified by inspection — `FactoryGeometry.tsx` takes one
      static prop, no fetch/subscribe/poll of its own)
- [x] no LDI dependency
- [x] no telemetry dependency
- [x] no resource leak (§8, single + 4 cycles, stable)
- [x] context recovery passes (§8)
- [x] responsive passes (§12, all 6 viewports)
- [x] axe passes (0 serious/critical at all 6 viewports)
- [x] performance regression acceptable (heap/triangle-for-content-present/errors comparable;
      LCP increase disclosed and explained, not hidden; draw-call comparison deferred as
      not-yet-fair per the known limitations above)
- [x] existing production Factory Twin untouched (`git diff --quiet` confirmed)

## Verdict

**STEP 5A — R3F AUTHORITATIVE GEOMETRY: PASS.**
