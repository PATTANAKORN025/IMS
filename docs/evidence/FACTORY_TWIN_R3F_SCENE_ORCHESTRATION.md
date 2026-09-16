# Factory Twin — Step 5F: R3F Scene Orchestration & WebGL Lifecycle Integration

Scope: integrate Geometry (5A), Machines (5B), Selection (5C), Camera (5D), Layers/Reference
(5E) into one deterministic scene orchestration boundary and one WebGL lifecycle owner, on the
isolated `/factory-twin-3d/geometry-candidate` route only. No telemetry/alarms/RCA/inspector/
EAP-LDI state migrated. Legacy `/factory-twin-3d/`, `app.js`, `eap.js` untouched
(`git diff --quiet` confirmed clean against `services/factory-twin-3d/` at commit time).

## 1. Single orchestration boundary

One explicit composition point, `GeometryScene.tsx` (new), mounted by `GeometryViewport.tsx`
inside its `<Canvas>`:

```
GeometryViewport   (Canvas mount + WebGL lifecycle owner + toolbar, outside <Canvas>)
    -> GeometryScene   (pure composition, inside <Canvas>, owns no lifecycle state)
        -> FactoryGeometry, StructuralGrid, Machines, Reference, GeometryCameraController
```

`GeometryScene` reads/writes nothing WebGL-context-related — no `webglcontextlost`/
`webglcontextrestored` listeners, no `forceContextLoss`/`forceContextRestore` calls. It receives
every piece of state (`layers`, `selectedId`, `view`, `resetToken`, `fitToken`,
`onCameraStateChange`, `onControllerMount`, `readStatsRef`) as plain props from
`GeometryViewport` and composes the five scene components plus lighting. Individual scene
components (`FactoryGeometry`, `Machines`, `Reference`, `GeometryCameraController`) do not
independently manage global WebGL lifecycle — none of them touch `renderer.info`,
`forceContextLoss/Restore`, or add their own context-loss listeners.

Layer visibility (Step 5E) is unchanged: exactly one crossing point per layer, a
`<group visible={layers.<id>}>` wrapper, now living inside `GeometryScene` rather than inline in
`GeometryViewport`'s own JSX — a relocation, not a behavior change.

## 2. Single WebGL lifecycle

`GeometryViewport.tsx` is the sole owner. One state machine, unchanged mechanism from Step 4/5A:
`READY -> LOST -> RESTORING -> REBUILDING -> VERIFYING -> RECOVERED`, driven by
`renderer.forceContextLoss()`/`forceContextRestore()` and the real
`webglcontextlost`/`webglcontextrestored` DOM events on `gl.domElement`, attached exactly once
in `handleCreated`. Geometry, Machines, Reference, and the camera controller do not implement
their own recovery — grep confirms `forceContextLoss`/`forceContextRestore`/
`webglcontextlost` appear nowhere under `components/factory-twin/geometry/` or
`components/factory-twin/machines/` outside `GeometryViewport.tsx` itself.

**Known, disclosed, pre-existing duplication (not introduced by this step):** the separate,
disposable `/r3f-spike` route's `TwinViewport.tsx` (Step 4) still owns its own independent
copy of this same lifecycle pattern. That duplication predates Step 5A and was already listed
as a deferred cleanup item in the architecture gap audit; Step 5F does not touch `/r3f-spike`
and does not add a second implementation within the `geometry-candidate` route itself, which is
what this step's own hard rule ("don't duplicate WebGL lifecycle implementations") governs.

**Direct, measured proof of "no duplicate lifecycle/controls" instrumentation** (not assumed):
`GeometryViewport` now tracks `controllerMounts` (incremented once by
`GeometryCameraController`'s own mount-only effect — fires once, never on re-render, since
`invalidate()` repaints the existing R3F tree rather than remounting it), `contextLost`, and
`contextRestored` counters, displayed live in the toolbar and asserted throughout the test
suite below. Across every single-cycle recovery, every scenario in the 9-item matrix, the
repeated-4-cycle test, and the 3-iteration stress loop, `controllerMounts` stayed at exactly 1
and `contextLost`/`contextRestored` incremented exactly 1:1 with triggered events — never
duplicated.

## 3. Context loss test matrix (9 scenarios)

All 9 run in `tests/playwright/factory-twin-r3f-scene-orchestration.js`, each against a fresh
page, each verifying: lifecycle reaches `RECOVERED`, geometry present, resource counts never
grow, exactly 1 loss + 1 restore event recorded, camera controller mounted exactly once, and
the scene is interactive after recovery (a known machine, `EQP-F1-0401`, still selects by its
deterministic id).

| # | Scenario | Result |
|---|----------|--------|
| 1 | Loss during idle | PASS |
| 2 | Loss during orbit (completed drag gesture, not mid-gesture) | PASS |
| 3 | Loss after selection | PASS |
| 4 | Loss with machines layer hidden | PASS |
| 5 | Loss with reference layer enabled | PASS |
| 6 | Loss with grid layer disabled | PASS |
| 7 | Loss immediately after resize | PASS |
| 8 | Loss immediately after layer toggle | PASS |
| 9 | Repeated 4-cycle recovery (non-default state: reference on, grid off, machine selected, camera in `overview`) | PASS — all state (layers, selection) and resource parity preserved across all 4 cycles |

## 4. Resource parity

Captured before/after every recovery via `renderer.info`: `geometries`, `textures`,
`programs` (three.js's disclosed proxy for "materials" — there is no direct
`info.memory.materials` counter), draw `calls`, `triangles`. A 3-iteration stress loop
(select -> toggle reference -> orbit -> resize -> lose+recover -> select another -> repeat)
never showed any of `geometries`/`textures`/`programs` exceed their first-iteration value —
`geometries: [24,24,24]`, `textures: [1,1,1]`, `programs: [6,6,6]` — no monotonic growth across
3 full select/toggle/orbit/resize/recover cycles. JS heap was tracked qualitatively across the
matrix and stress loop with no unbounded growth observed.

## 5. Scene rebuild contract

`REBUILDING` does not remount the R3F tree — `invalidate()` alone repaints the existing scene
graph after context restore, the same mechanism established in Step 4 and reused unchanged
through 5A-5E. Consequences, all directly measured rather than assumed:

- No duplicate objects: geometry/texture counts return to their pre-loss baseline, never grow.
- No duplicate event listeners: `contextLost`/`contextRestored` counters increment exactly once
  per triggered event, every scenario, every cycle — a second listener would double-count these.
- No duplicate controls: `controllerMounts` stays at 1 through every scenario and every cycle of
  the repeated-4-cycle and stress-loop tests — `GeometryCameraController`'s `OrbitControls`
  instance is never recreated.
- No stale selection/raycaster references: selection survives every recovery scenario and
  switches cleanly to a different machine afterward, in every test.

## 6. State preservation

`CameraState`, `SelectionState`, and `LayerState` are all plain React state living in
`GeometryViewport`, outside the Canvas-owned R3F tree — context loss/restore never touches
React's component tree or its state, only the WebGL context and the Three.js objects inside it.
Scenario 9 explicitly establishes non-default values for all three (reference layer on, grid
layer off, a machine selected, camera moved to the `overview` preset) before 4 repeated
loss/restore cycles, then verifies every one of them is still correct afterward — this is
direct, not inferred: reading each control's live rendered value, not assuming persistence from
architecture alone.

## 7. A real regression found and fixed during this step's own testing

Adding the `controllerMounts`/`contextLost`/`contextRestored` readout to the toolbar (inline
text, appended after existing content) pushed the toolbar row's `flex-wrap` layout past its
wrap threshold once the "Read renderer stats" readout also populated, shifting the `<Canvas>`
element's on-screen Y position (measured: 158px -> 182px). Every fixed-pixel-coordinate
Playwright test across Steps 5C-5F assumes the canvas's position is constant; the shift broke
Step 5C's regression suite (100% reproduction on "re-clicking the same machine" — the fixed
`HIT_A`/`HIT_B` coordinates no longer landed on the canvas at all).

Fix (in `GeometryViewport.tsx`'s toolbar `<div>`): `flex-wrap` -> `flex-nowrap` +
`overflow-x-auto` + `min-w-0`, making the toolbar a single non-wrapping, horizontally
scrollable row whose height (and therefore the canvas's Y position) is invariant to content
length.

That fix alone did not fully resolve a second, separate finding — genuine page-level horizontal
overflow at the 1024x768 viewport (122px) and at 200% zoom — which persisted even with
`min-w-0` in place. Root cause, confirmed by direct DOM measurement (`getBoundingClientRect`,
`getComputedStyle`, walking the ancestor chain): the layers `<fieldset>`'s `<legend
className="sr-only">` is `position: absolute` with no inset properties and no positioned
ancestor, so its containing block escapes all the way to the viewport (the initial containing
block) instead of the fieldset. That let its layout box bypass every intervening
`overflow-hidden`/`overflow-x-auto` clip up the ancestor chain (`main`, the viewport root `div`,
the toolbar `div` itself) and directly inflate `document.documentElement.scrollWidth`, even
though the legend itself is a fully invisible, 1px, `clip-rect`'d element — the CSS overflow
model clips a positioned descendant based on its containing-block chain, not its DOM ancestor
chain, when the two diverge. Fix: `className="relative flex items-center gap-2"` on the
`<fieldset>`, restoring it as the legend's containing block. Both fixes are disclosed inline as
code comments in `GeometryViewport.tsx` for future maintainers, including the incorrect
intermediate hypothesis (`min-w-0` alone) so the real root cause isn't re-discovered from
scratch.

Verified post-fix: `no horizontal overflow @ 1024x768` = 0px (was 122px),
`200% zoom: ... no unbounded horizontal overflow` = 0px, across Step 5B, 5C, 5D, 5E, and this
step's own suite, with no reintroduction of the canvas Y-position shift (Step 5C's fixed-pixel
click suite passes clean).

## 8. Tests

`tests/playwright/factory-twin-r3f-scene-orchestration.js` — 76 assertions, 76 passed:
structural checks (machine count parity, single controller mount at load, 0 pre-trigger events,
0 console errors), the 9-scenario context-loss matrix, the repeated-4-cycle test, and the
3-iteration stress loop.

Full regression re-run, all suites green after both layout fixes, against the same production
(`next build` + standalone `server.js`) build:

| Suite | Result |
|-------|--------|
| `factory-twin-next-shell.js` (Step 3) | 30 passed |
| `factory-twin-r3f-spike.js` (Step 4) | 45 passed |
| `factory-twin-r3f-machines.js` (Step 5B) | 41 passed |
| `factory-twin-r3f-selection.js` (Step 5C) | 50 passed |
| `factory-twin-r3f-camera.js` (Step 5D) | 66 passed |
| `factory-twin-r3f-layers.js` (Step 5E) | 69 passed |
| `factory-twin-r3f-scene-orchestration.js` (Step 5F) | 76 passed |
| `factory-twin-failure-modes.js` (legacy regression) | 1 pre-existing failure (`:3000` placement-route, out of scope, unchanged since Step 5D) |

`git diff --quiet -- services/factory-twin-3d/` confirmed clean — legacy stack untouched.

## Known limitations

- The `/r3f-spike` route's own WebGL lifecycle duplication (Step 4's `TwinViewport.tsx`) is not
  addressed by this step — already a disclosed, deferred cleanup item, unrelated to this step's
  own hard rule about not introducing a *new* duplicate within `geometry-candidate`.
- No operational-state/telemetry/alarm/inspector/RCA/EAP-LDI integration — explicitly out of
  scope per this step's mission and the project's overall migration sequencing.
- The pre-existing `:3000` placement-route legacy failure (unrelated to this step) remains,
  unchanged since Step 5D.

## Acceptance criteria

- [x] Single orchestration boundary (`GeometryScene`), no component independently manages
      global WebGL lifecycle
- [x] Single WebGL lifecycle owner (`GeometryViewport`), one state machine
- [x] All 9 context-loss-matrix scenarios PASS
- [x] Resource parity: no monotonic growth across matrix, 4-cycle repeat, or stress loop
- [x] Scene rebuild contract: no duplicate objects/listeners/controls/stale references
      (measured via `controllerMounts`/`contextLost`/`contextRestored` counters)
- [x] CameraState/SelectionState/LayerState all preserved across repeated recovery
- [x] All prior step suites (3, 4, 5A-5E) remain green
- [x] Legacy Factory Twin untouched (`git diff --quiet` clean)

## Verdict

**STEP 5F — R3F SCENE ORCHESTRATION & WEBGL LIFECYCLE INTEGRATION: PASS**
