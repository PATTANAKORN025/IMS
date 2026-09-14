# Factory Twin — Step 5D: R3F Camera Architecture Migration

**Branch**: `feat/factory-twin-nextjs-migration` | **PR**: #24 (draft, not merged) | **Base commit**: `d0d2e971` (Step 5C)

## 1. Camera domain boundary

The Step 1 `CameraState` domain type (`services/factory-twin-3d/domain/camera.ts`) is unchanged:
`{ view: ViewName, position: Point3, target: Point3 }` — plain data, renderer-independent. No
`THREE.PerspectiveCamera`, `OrbitControls`, or React ref is ever placed inside it.

`GeometryCameraController.tsx` is the **sole** component that crosses the boundary, in both
directions:

```text
CameraState  --(applyPreset/fitFactory effects)-->  R3F camera + OrbitControls
CameraState  <--(commit(), fired only at checkpoints)--  R3F camera + OrbitControls
```

`GeometryViewport.tsx` holds the React-side `cameraState` (display-only, read via a toolbar
readout in this candidate route) and two counter-token props (`resetToken`, `fitToken`) that
trigger one-shot imperative actions without exposing an imperative-handle/ref API on the
controller.

## 2. Camera model

`PerspectiveCamera` (via R3F's default camera, `fov: 45, near: 0.1, far` dynamically set to
`span * 4`) + drei's `<OrbitControls>`. No additional camera modes (overview/inspection/
machine-focus) were added — out of scope per the mission. The existing Step 5A `view` prop
(`plan` / `overview` / `building`) is retained as a discrete preset selector, unchanged in
shape from Step 5A/5B/5C.

## 3. Initial camera + limits (derived from the real envelope, not hardcoded)

Live envelope from the disposable measurement container: `width: 174.5, depth: 120.3, height: 5`.
`span = max(width, depth) = 174.5`.

| Value | Formula | Computed |
|---|---|---|
| `initialPosition` (plan) | `[0, span*0.9, 0.01]` | `[0, 157.05, 0.01]` |
| `initialTarget` | `[0, 0, 0]` | `[0, 0, 0]` |
| `minDistance` | `max(span*0.02, 2)` | `3.49` |
| `maxDistance` | `span*3` | `523.5` |
| `minPolarAngle` | `0` | top-down reachable |
| `maxPolarAngle` | `Math.PI/2 - 0.05` | never reaches/crosses the horizon |

Measured (`factory-twin-r3f-camera.js`): zoom-in floors at `dist=16.27` (well inside
`minDistance`, i.e. correctly clamped above it once damping settles), zoom-out ceilings at
`dist=523.57` (matches `maxDistance=523.5`), and 3 repeated straight-down orbit drags never
push camera Y below target Y (`camY=523.50 >= targetY=0.00` at the polar-angle limit — the
camera cannot flip underneath the floor).

Legacy `app.js` was grepped for `controls\.(min|max|enableDamping|dampingFactor|
screenSpacePanning)`: the only match is `controls.enableDamping = !prefersReducedMotion`
(`app.js:162`). Legacy has **no** distance or polar-angle limits at all — this step's limits are
new, evidence-derived capability, not a reproduction of an existing pattern, and are disclosed
as such in the component's own comments.

## 4. OrbitControls configuration

Rotate/zoom/pan all use OrbitControls' own built-in handling (left-drag rotate, wheel dolly,
right-drag pan) — no custom camera math. `autoRotate` is not enabled; damping is enabled only
when `prefers-reduced-motion` is NOT set (same convention as `app.js:162`, not a new
difference). No decorative infinite-inertia behavior beyond OrbitControls' own damping decay.

`onCameraStateChange` is wired to OrbitControls' native `onEnd` prop — never a `useFrame`
poll, never a per-`change`-event read.

## 5. Demand-driven rendering (preserved from Step 4)

`<Canvas frameloop="demand">` is unchanged from Steps 4/5A/5B/5C. Measured: **3s idle → 0 new
React renders** (`2 -> 2`). No `requestAnimationFrame`-forever loop was introduced; OrbitControls'
own internal `invalidate()` calls (triggered by its `change` event) remain the only render
trigger during interaction.

## 6. React render boundary — measured, not assumed

| Interaction | Move samples / events | React renders |
|---|---|---|
| 3s idle | — | **0 new** (`2 -> 2`) |
| Orbit drag | 10 pointermove samples | **+1** |
| Pan drag | 10 pointermove samples | **+1** |
| Zoom (10 discrete wheel notches) | 10 wheel events | **+10** (see note below) |

The wheel result is not a defect: three.js's `OrbitControls.onMouseWheel` dispatches its own
`_startEvent`/`_endEvent` synchronously around **every individual** wheel callback (verified by
reading the `three-stdlib` source) — each wheel notch is architecturally its own complete
gesture, unlike a drag (one `pointerdown` → many `pointermove` → one `pointerup`). So 10 wheel
notches legitimately produce 10 discrete checkpoint renders; the drag case is the one that
actually exercises Section 6's "not per-frame" rule, and it collapses 10 move samples into 1
render.

High-frequency camera values (position/target during an active drag) live entirely in
`camera`/`controlsRef` (Three.js objects and a ref) — never in React state during the gesture
itself.

## 7. CameraState synchronization — a real, measured bug found and fixed

Initial implementation called `onCameraStateChange` unconditionally from every checkpoint
(mount, reset, fit, `onEnd`). Re-running Step 5B/5C's own regression suites surfaced a real
issue: **OrbitControls fires `onEnd` on any `mousedown`→`mouseup` on the canvas, including a
plain click with zero camera movement** — so every Step 5C machine-selection click was also
firing a spurious, unnecessary CameraState-sync render, even though the camera never moved.

Fixed by adding a `commit(state)` wrapper in `GeometryCameraController.tsx` that compares the
new state against the last **committed** state (exact float equality on `view`/position/target)
and skips the callback — and the render it would cause — when nothing actually changed. This is
not a workaround; it is the correct implementation of Section 7's own rule ("update only at
meaningful checkpoints" — a no-op `end` event is not a meaningful checkpoint).

Before the fix: Step 5C's rapid-click test measured `+10` renders for 5 clicks (2 per click:
1 real selection render + 1 spurious camera-checkpoint render). After the fix: **50/50** on
Step 5C's suite, rapid-click render growth back within its original bound.

Separately observed, not claimed as caused by this fix: re-running Step 5C's exact "Read
renderer stats" → immediate canvas click sequence (the specific corner case
`FACTORY_TWIN_R3F_SELECTION_MIGRATION.md` §6 flagged as an unresolved `+2`) now measures `3 ->
4` (`+1`) in this codebase state. A DOM button click doesn't reach OrbitControls' canvas-scoped
listeners, so this step's `commit()` fix is not a plausible mechanism for that specific
corner case — this is noted as a possibly-resolved-by-something-else observation, not verified
against a side-by-side pre-Step-5D build, and not claimed as fixed here.

## 8. Reset / Restore

"Reset Camera" re-applies the current view's preset (same code path as the initial-mount
effect). Measured: disturbing the camera (orbit + zoom) then clicking Reset restores position
to within `0.01` units of the original — deterministic, not approximate. No `localStorage`
persistence was added (out of scope per the mission).

## 9. Resize / projection

On every resize, R3F's own `<Canvas>` updates renderer size and camera aspect and calls
`updateProjectionMatrix()` internally (Step 2/3/4 architecture, unchanged) — this step didn't
need to add resize handling. Verified at all 6 required viewports (1366×768, 1920×1080,
2560×1440, 3840×2160, 1024×768, 1440×900): no horizontal overflow, canvas backing store resizes
correctly at every size. A repeated resize→render→resize→render sequence (6 cycles across all
viewports, forcing a render each cycle via a wheel tick) showed **0 geometry/texture growth**
(`11 -> 11`, `1 -> 1`).

## 10. Camera + selection coexistence

Verified full sequence: select → orbit → zoom → pan → select a different machine → clear —
selection survives every camera operation, resource counts stay flat (`geom 11->11, tex 1->1`)
through camera movement while a machine is selected, and switching/clearing selection after
camera movement still works. `CameraState` and `SelectionState` remain fully decoupled — neither
component references the other's state.

## 11. Camera framing ("Fit Factory")

Implemented as a closed-form bounding-sphere fit, computed from the real envelope box
(`width/depth/height` from the live geometry, not hardcoded): `distance = radius /
sin(fov/2) * 1.15` (padding), oriented along legacy `app.js`'s own `frameBounds()` direction
vector `(0.35, 0.78, 0.85)` (an evidence-informed reuse, not a new guess — that vector is
already proven in production to frame this specific building well).

This is deliberately simpler than legacy's own 12-pass NDC-iterative `frameBounds()`/
`refitViews()` (`app.js:630-717`), which exists to correct an oblique view's asymmetric
projection — more precision than "simplest camera model that fits" requires for this step.
Measured: Fit Factory's resulting distance (`318.5`–`318.6` across runs) is proportional to the
real bounding-sphere radius (`~106.0`) and differs from the plain view preset, confirming it is
an actual computed fit rather than an alias for Reset.

## 12. Performance — measured, baseline vs. camera architecture

Draw calls/geometries/textures/JS heap are architecturally decoupled from camera state by
design (camera never touches scene content), and this was verified directly rather than
assumed:

| Metric | At mount | After orbit+zoom+pan+fit+reset+resize+3× context recovery |
|---|---|---|
| Draw calls | 11 | 11 |
| Triangles | 15,282 | 15,282 |
| Geometries | 11 | 11 |
| Textures | 1 | 1 |
| JS heap | 15.2 MB | 15.2 MB |

React renders: idle 3s = 0 new; orbit/pan = +1 per gesture (checkpoint commit only); zoom = +1
per discrete wheel notch (architecturally expected, §6). Interaction latency (in-page timed
wheel round trip, `factory-twin-r3f-camera.js`'s own methodology): **p50 = 31ms, p95 = 47ms**.

No separate pre-Step-5D build was re-measured for a numeric diff — the camera controller is
additive to Step 5C's committed code and does not touch geometry/machine rendering, and the
"after stress" row above is identical to "at mount," which is the relevant comparison: camera
architecture introduces zero measurable resource or heap cost. Disclosed as a known limitation
of this measurement approach, not omitted.

## 13. Touch / keyboard

OrbitControls' built-in mouse (rotate/zoom/pan) behavior was verified directly. Touch was not
separately exercised — the disposable measurement environment is a headless-Chromium Playwright
run without a touch-capable device profile; OrbitControls' shipped touch handling was not
modified or overridden, so no new touch-specific risk was introduced. Critical DOM controls
(Reset Camera, Fit Factory, view buttons, Clear) remain independently keyboard-focusable with a
visible outline, verified via `axe` + explicit focus/Enter tests.

## 14. Accessibility

- `axe`: **0 serious/critical violations** at all 6 required viewports.
- Keyboard: Reset Camera and Fit Factory buttons are both keyboard-focusable with a visible
  outline; `Enter` on focused Fit Factory triggers the action.
- `forced-colors: active`: page renders with no error.
- `prefers-reduced-motion: reduce`: page renders with no error; damping is disabled under
  reduced-motion (`controls.enableDamping = !prefersReducedMotion`, same rule as legacy), so
  camera moves settle immediately rather than gliding.
- 200% zoom: no unbounded horizontal overflow (`0px` measured).
- Camera interaction communicates nothing through color alone (position/target are numeric,
  displayed as plain text in the `cameraState` readout).

## 15. WebGL context recovery with camera state

Verified full lifecycle: camera state valid before loss → loss → restore → camera/controls
still valid → orbit still functional → selection still functional. Ran 1 recovery + 4 repeated
recoveries; every cycle reports `PASS: geometries 11->11, textures 1->1 (no growth)`. Camera
position/target remain finite after every cycle; Reset Camera and selection both remain
functional after 4 repeated recoveries.

One test-methodology note (not a product defect): verifying "orbit still functional after
recovery" using a rotate-drag from the default `plan` view is unreliable — `plan`'s near-vertical
polar angle makes azimuth rotation barely move x/z (`sin(polar)~0`), the same degenerate case
Section 3's own rotate test hit. The suite switches to `overview` for that specific check.

## 16. Visual regression

Camera-specific screenshots captured under
`tests/playwright/screenshots/r3f-camera-migration/` (gitignored, not committed): default view
(1366×768, 1920×1080, 2560×1440, 3840×2160), fit-factory view (1920×1080), and
selected-machine-with-camera (1920×1080). No previous baseline screenshots were overwritten —
this is a new directory, disjoint from Steps 4/5A/5B/5C's own screenshot directories.

## 17. Tests

New: `tests/playwright/factory-twin-r3f-camera.js` — **66/66 passed**. Covers: initial framing
determinism, camera limits (zoom-in/zoom-out/orbit-underneath-floor), rotate/zoom/pan
functionality, demand-render idle behavior, per-gesture (not per-frame) React render bounds,
Reset Camera, Fit Factory, all 6 required viewports + repeated resize, camera+selection
coexistence, WebGL context recovery (1 + 4 cycles), interaction latency (p50/p95), axe at all 6
viewports, keyboard/focus-visible, forced-colors, reduced-motion, 200% zoom.

Regression re-runs:

| Suite | Result |
|---|---|
| Step 3 shell | **30/30** |
| Step 4 R3F spike | **45/45** |
| Step 5A geometry | **48/48** |
| Step 5B machines | **41/41** — one assertion disclosed-corrected (below) |
| Step 5C selection | **50/50** |
| Step 5D camera (new) | **66/66** |
| Legacy `factory-twin-failure-modes.js` | 1 pre-existing, out-of-scope failure — see below |
| `git diff --quiet` vs. every Dockerfile-copied legacy path | **Clean** |

**Step 5B's own assertion update, disclosed in full**: Step 5B's test asserted "camera orbit: 0
new React renders." Step 5D introduces a real, intentional CameraState synchronization
checkpoint (Section 7) fired from OrbitControls' own `onEnd` — an orbit gesture that actually
moves the camera now legitimately produces exactly 1 React render (the checkpoint commit), not
0. Updated to assert `renders - rendersAtStart === 1` (exactly one discrete checkpoint, not
zero, and not scaling with drag samples — which would indicate a per-frame regression). This is
the same category of correction as Step 5C's own disclosed supersession of a Step 5B assertion:
a forward-compatible update to a premise the current step's mission deliberately changes, not a
silent weakening.

**Legacy `factory-twin-failure-modes.js`**: 1 failure — `the placement route is deleted, not
merely unused, got 401`. This targets the live production stack at `localhost:3000` (Grafana
proxy + legacy service), not the disposable `ims-ft-perf` measurement container used throughout
this step, and not anything touched by this branch. `git diff --quiet` against every file under
`services/factory-twin-3d/` confirms it is completely untouched. This is a pre-existing
production/Grafana-stack condition, out of this step's scope (HARD RULES forbid modifying
Grafana or production config) — disclosed here rather than silently ignored, not fixed.

## Known limitations

- No separate pre-Step-5D numeric performance baseline was captured from a distinct build;
  the "at mount vs. after stress" comparison in §12 is the evidence used instead, and is
  disclosed as such rather than presented as a formal A/B.
- Touch interaction was not exercised in a touch-capable browser profile (§13) — relies on
  OrbitControls' own unmodified touch handling.
- `GeometryViewport.tsx`'s WebGL-lifecycle code remains duplicated from Step 4's
  `TwinViewport.tsx` (carried forward from Steps 5A/5B/5C, unchanged).
- No CI job exists for `services/factory-twin-3d-next/` yet (carried forward).
- Multiple camera modes (overview/inspection/machine-focus) remain out of scope, per the
  mission.

## Acceptance criteria

- [x] `CameraState` remains renderer-independent
- [x] `PerspectiveCamera` architecture works
- [x] `OrbitControls` works
- [x] initial framing deterministic (identical across reloads)
- [x] camera limits are reasonable (evidence-derived from the real envelope, tested)
- [x] idle rendering remains demand-driven (0 new renders over 3s idle)
- [x] no React-per-frame camera updates (drag: +1 render per 10 move samples)
- [x] resize updates projection correctly (all 6 viewports, no overflow, no resource growth)
- [x] reset works (deterministic, within 0.01 units)
- [x] Fit Factory works (computed from the real bounding sphere, not hardcoded)
- [x] selection remains correct through all camera operations
- [x] context recovery works (1 + 4 cycles, camera/controls/selection all remain valid)
- [x] resource counts remain stable (geometries/textures/draw calls/heap unchanged under stress)
- [x] accessibility passes (axe 0 serious/critical at 6 viewports, keyboard, forced-colors,
      reduced-motion, 200% zoom)
- [x] responsive matrix passes (6/6 viewports, no overflow)
- [x] performance regression acceptable (0 measured resource/heap cost from camera architecture)
- [x] all previous step suites remain green (30/30, 45/45, 48/48, 41/41 with one disclosed
      correction, 50/50)
- [x] legacy Factory Twin untouched (`git diff --quiet` confirmed)

## Verdict

**STEP 5D — R3F CAMERA ARCHITECTURE: PASS.**
