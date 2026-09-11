# Factory Twin — Step 5E: R3F Layer / Reference Architecture Migration

**Branch**: `feat/factory-twin-nextjs-migration` | **PR**: #24 (draft, not merged) | **Base commit**: `b31e9b0c` (Step 5D)

## 1. Layer model

`services/factory-twin-3d/domain/layer.ts` (new, type-only, mirrors the existing `camera.ts`/
`selection.ts` domain-extraction pattern):

```ts
export type LayerId = 'geometry' | 'machines' | 'grid' | 'reference';
export interface LayerState {
  readonly geometry: boolean;
  readonly machines: boolean;
  readonly grid: boolean;
  readonly reference: boolean;
}
export const DEFAULT_LAYER_STATE: LayerState = { geometry: true, machines: true, grid: true, reference: false };
```

Not an invented business layer set: legacy `app.js` has a real layer model (`app.js:485-534`,
`layers.structural/functional/operational/reference` plus nested sublayers). This migration's
own rendered scene composes exactly four independently-toggleable pieces as of Step 5D —
factory shell + openings (`geometry`, legacy's `structural` minus its grid sublayer), the
surveyed structural grid (`grid`, legacy nests it under `structural.shell`, split out here
because it already renders as its own component), equipment (`machines`, legacy's
`operational`), and the raw CAD line-work overlay (`reference`, legacy's `reference`, off by
default — same convention, `app.js:499`). Legacy's `functional` (zone) layer and its other
sublayers have no rendered component in this candidate yet, so no toggle was added for them —
adding one would promise a capability that does not exist, the same reasoning `app.js:500-503`
itself gives for deleting its own empty `TELEMETRY` layer.

`LayerState` is separate from `CameraState` and `SelectionState` — no field of one appears in
another, and no component reads across them.

## 2. Reference source

`/api/floor-raw-cad` (`server.js:1631`) — the same served endpoint legacy's own
`ensureRawCad()`/`buildRawCad()` use (`app.js:1296-1364`). No second geometry source, no
re-parsing of CAD. `lib/reference-adapter.ts` (new) fetches it and reproduces `app.js`'s own
`cadToTwin()` transform exactly (`app.js:577-579`: `x = xMm/1000 - halfWidth, z = -(yMm/1000 -
halfDepth)`), placed relative to the already-fetched, already-validated `FactoryGeometryData`
envelope — never a separately-derived bound, never a second coordinate system. Malformed roles
(segment count not a multiple of 4, or any non-finite coordinate) are withheld entirely, the
same all-or-nothing rule `app.js:1322` and `app.js:1334` apply, not silently truncated.

Live measurement against the disposable container: 13 roles, 9,416 line segments total
(`area-annotation`, `area-boundaries`, `column-caps`, `columns`, `doors`,
`openings-airshower`, `partitions`, `structure`, `structure-sections`, `walls-cleanroom`,
`walls-interior`, `walls-movable`, `windows`).

**Disclosed divergence from legacy**: `app.js`'s `ensureRawCad()` fetches the reference lazily,
only on first toggle (`app.js:1358`, explicitly to avoid charging every operator for a
diagnostic nobody opened). This step fetches it eagerly, server-side, alongside geometry/
machines (`app/geometry-candidate/page.tsx`). This is a deliberate, disclosed choice, not an
oversight: this step's mission is about visibility architecture (toggling must not rebuild
geometry), not fetch-timing, and 9,416 already-small line segments cost nothing measurable
server-side. The `reference` layer still **defaults to OFF**, matching legacy exactly — only
the fetch timing differs, never the default visibility.

## 3. Component architecture

```text
UI checkbox (GeometryViewport.tsx toolbar)
    -> setLayers() (React state, LayerState)
    -> <group visible={layers.<id>}> wrapping each layer's component tree
    -> R3F sets Object3D.visible in place (no unmount, no remount)
```

No button anywhere calls `.visible = x` on a Three.js ref directly (grep-verified against this
step's own source at authoring time) — every toggle flows through `LayerState`, one crossing
point (the `<group visible>` wrapper), the same one-crossing-point shape `GeometryCameraController.tsx`
already established for `CameraState` in Step 5D.

`StructuralGrid` was moved out of `FactoryGeometry.tsx`'s bundle (it composed
Floor+StructuralGrid+Walls+Columns+Openings as one unit through Step 5D) to
`GeometryViewport.tsx`'s own scene composition, so `grid` can toggle independently of
`geometry` — the mission's own suggested 4-layer model lists them separately, and they can no
longer share one non-decomposable group. `FactoryGeometry.tsx`'s remaining children
(Floor/Walls/Columns/Openings) are unchanged, still built once, never torn down on a toggle.

## 4. A real bug found and fixed: raycasting ignores `Object3D.visible`

The first implementation relied solely on the wrapping `<group visible={false}>` to make a
hidden layer non-interactive. Testing this step's own selection-coexistence scenario surfaced a
real bug: **clicking where a machine used to be still selected it after the `machines` layer was
toggled off.** Reading `three/src/core/Raycaster.js` confirms why: `Raycaster.intersectObject`
never checks `Object3D.visible` — only the `WebGLRenderer` skips invisible objects when
drawing. `@react-three/fiber`'s own pointer-event system builds on that same raycaster, so a
hidden `InstancedMesh` was still fully clickable.

Fixed by adding an explicit `interactive` prop to `Machines.tsx` (`GeometryViewport.tsx` passes
`interactive={layers.machines}`); both click handlers now early-return when `!interactive`,
before touching any instance-id lookup — the click then falls through to `onPointerMissed`
(already wired to clear selection), so clicking a hidden machines layer now behaves exactly
like clicking empty floor. Measured before/after: clicking a known machine coordinate with
`machines` OFF returned `No machine selected` (previously incorrectly returned
`Selected machine: EQP-F1-0401`); re-enabling and clicking the same coordinate correctly
re-selects it.

## 5. Resource stability — measured, not assumed

| Sequence | Draw calls | Geometries | Result |
|---|---|---|---|
| Baseline (mount, defaults) | 11 | 11 | — |
| `machines` OFF | 9 | 11 | calls drop, geometries unchanged |
| `machines` ON (restore) | 11 | 11 | calls restored, geometries unchanged |
| `machines` 2 more full on/off cycles | 11 | 11 | 0 growth across cycles |
| `grid` OFF / ON | drop / restore | unchanged both times | — |
| `geometry` OFF / ON | drop / restore | unchanged both times | — |
| `reference` first ON | 24 | 24 | **built once**, lazily, on first use |
| `reference` OFF | 11 | 24 | calls drop, geometry **not disposed** |
| `reference` 3 more on/off cycles | — | 24 | 0 further growth (memoized) |

The `reference` layer's one-time geometry increase (11→24) on its *first* activation is the
correct, disclosed behavior of a `useMemo` building 13 role geometries once from fetched data
— not a per-toggle rebuild. Every subsequent toggle, for every layer, changes draw calls only
(what gets drawn), never geometry/texture counts (what exists).

## 6. React render boundary

Idle 2s: 0 new renders. Each of the 4 layer toggles produces **exactly 1** discrete React
render (verified per-layer, not per-frame, not scaling with anything). Toggle interaction p95
(wall-clock round trip): 92ms.

## 7. Selection coexistence

Verified: select → toggle machines off → toggle factory geometry off/on → re-enable machines →
selection panel still shows the original machine id throughout, with 0 resource growth. Select
a different machine after all of the above switches cleanly; Clear still works.

## 8. Camera coexistence

Verified: orbit (camera moves) → toggle a layer (camera position provably does NOT change) →
Fit Factory (still works with `grid` off / `reference` on) → Reset Camera (still works) →
resize to 1366×768 (no overflow, no resource growth). Camera and layer state remain fully
decoupled — toggling never moves the camera, and no camera operation touches `LayerState`.

## 9. WebGL context recovery restores every layer/selection/camera state

Established a non-default state before loss (`reference` ON, `grid` OFF, a machine selected,
camera moved) and verified after 1 recovery: `reference` still ON, `grid` still OFF, selection
unchanged, camera position/target still finite and valid, geometry/texture counts unchanged
(`PASS: geometries 24->23, textures 1->1` — the `-1` is the WebGL-context-loss-driven renderer
reset accounted for identically to every prior step's own recovery verification, not new
growth). Ran 4 additional repeated cycles: still PASS, layer state and selection both still
correct. Post-recovery, toggling `grid` back on still functions (draw calls increase as
expected) and orbiting still works.

## 10. Accessibility

- `axe`: **0 serious/critical violations** at all 6 required viewports.
- Keyboard: a layer checkbox is focusable with a visible outline; `Space` on the focused
  checkbox toggles the layer (verified via draw-call change — a real control, not decorative).
- Layer controls are real `<fieldset>`/`<legend>`/`<label>`/`<input type="checkbox">` semantic
  HTML (the working keyboard interaction above is the evidence — a `div`/`onClick` facsimile
  would not respond to `Space`).
- `forced-colors: active` / `prefers-reduced-motion: reduce`: page renders with no error.
- 200% zoom: no unbounded horizontal overflow (`0px` measured).

## 11. Visual regression

New screenshots under `tests/playwright/screenshots/r3f-layer-migration/` (gitignored, not
committed), disjoint from every prior step's own screenshot directory, no baseline overwritten:
`all-layers-on`, `machines-off`, `grid-off`, `reference-on`, and
`reference-on-machines-off` (a combination actually reachable through the real toolbar, not an
arbitrary permutation) — all at 1920×1080.

## 12. Performance

| Metric | All layers on (default) | Reference on (13 extra role geometries) |
|---|---|---|
| Draw calls | 11 | 24 |
| Triangles | 15,282 | 15,282 (reference is line-only, no triangles) |
| Geometries | 11 | 24 |
| Textures | 1 | 1 |
| JS heap | 23.1 MB | 23.1 MB (no measurable growth) |

Frame-time/long-frame profiling was not separately instrumented beyond the render-count and
draw-call evidence above — see Known limitations.

## 13. Tests

New: `tests/playwright/factory-twin-r3f-layers.js` — **69/69 passed**. Covers: typed layer
defaults, per-layer resource-stability toggling (including the reference layer's build-once
behavior), React render count per toggle, toggle interaction latency, selection coexistence,
camera coexistence, WebGL recovery (1 + 4 cycles) restoring layer/selection/camera state, axe at
all 6 viewports, keyboard/focus-visible/forced-colors/reduced-motion/200%-zoom, and visual
regression screenshots.

Regression re-runs, all green, zero assertions weakened:

| Suite | Result |
|---|---|
| Step 3 shell | **30/30** |
| Step 4 R3F spike | **45/45** |
| Step 5A geometry | **48/48** |
| Step 5B machines | **41/41** |
| Step 5C selection | **50/50** |
| Step 5D camera | **66/66** |
| Step 5E layers (new) | **69/69** |
| Legacy `factory-twin-failure-modes.js` | 1 pre-existing, out-of-scope failure (unchanged from Step 5D) |
| `git diff --quiet` vs. every Dockerfile-copied legacy path | **Clean** |

**Legacy `factory-twin-failure-modes.js`**: the same single, pre-existing failure already
disclosed in Step 5D's own evidence doc (`the placement route is deleted, not merely unused,
got 401`) — targets the live production stack at `localhost:3000`, not this branch's disposable
measurement container, and not anything this step touched. `git diff --quiet` against every
file under `services/factory-twin-3d/` confirms it remains completely untouched (this step's
two new files there, `domain/layer.ts` and `domain/reference.ts`, are untracked additions to
the established type-only `domain/` extraction convention — the same pattern `camera.ts`/
`selection.ts` already use — never a modification to `app.js`/`eap.js`/any runtime file).

## Known limitations

- The reference overlay is fetched eagerly rather than lazily on first toggle (§2) — a
  disclosed, deliberate divergence from legacy's own optimization, not an oversight. Default
  visibility still matches legacy (`reference` off by default).
- Frame-time (ms/frame) and long-frame counts were not separately instrumented for this step;
  render-count and draw-call evidence (§5, §6) stand in as the measured proxy. A dedicated
  frame-timing probe (as used in Step 4's own spike) would be a reasonable future addition, not
  required for this step's own acceptance criteria.
- Legacy's `functional` (zone) layer has no toggle in this candidate — no rendered component
  exists for it yet in this migration, so a toggle would control nothing (§1).
- `GeometryViewport.tsx`'s WebGL-lifecycle code remains duplicated from Step 4's
  `TwinViewport.tsx` (carried forward unchanged since Step 5A).
- No CI job exists for `services/factory-twin-3d-next/` yet (carried forward).

## Acceptance criteria

- [x] layer state is typed (`LayerState`, `services/factory-twin-3d/domain/layer.ts`)
- [x] UI does not directly manipulate arbitrary scene objects (single `<group visible>`
      crossing point per layer, grep-verified, no `ref.current.visible =` anywhere)
- [x] toggles do not rebuild geometry (measured: geometry/texture counts unchanged across every
      toggle cycle for every layer; the reference layer's one-time first-activation build is
      disclosed, not a per-toggle rebuild)
- [x] resources remain stable (draw calls change as expected; geometries/textures/heap do not)
- [x] selection remains correct through every layer toggle combination (tested)
- [x] camera remains correct through layer toggles, fit, reset, resize (tested)
- [x] context recovery restores layer state (1 + 4 cycles, layer/selection/camera all verified)
- [x] responsive passes (6/6 viewports, no overflow)
- [x] accessibility passes (axe 0 serious/critical at 6 viewports, keyboard, forced-colors,
      reduced-motion, 200% zoom)
- [x] visual regression passes (5 new screenshots, no baseline overwritten)
- [x] all prior phases remain green (30/30, 45/45, 48/48, 41/41, 50/50, 66/66)
- [x] legacy Factory Twin remains untouched (`git diff --quiet` confirmed; two new domain
      type-only files follow the established `camera.ts`/`selection.ts` extraction convention)

## Verdict

**STEP 5E — R3F LAYER / REFERENCE ARCHITECTURE: PASS.**
