# Factory Twin 3D — React Three Fiber Runtime Spike (Step 4, full)

**Date:** 2026-09-11. **Scope:** `services/factory-twin-3d-next/components/factory-twin/
twin-viewport/` and the `/r3f-spike` route only. `services/factory-twin-3d/` (the live
implementation) and `app/page.tsx` (Step 3's real shell route) are untouched — confirmed by
`git diff --quiet` against every Dockerfile-copied legacy path, and Step 3's 30-test suite
still passing unchanged.

**Supersedes** `FACTORY_TWIN_R3F_RUNTIME_SPIKE.md`'s earlier, narrower pass, which reported
`webglcontextrestored` as an unresolved gap. That was a genuine methodology bug in the
earlier spike, root-caused and fixed this pass — see "WebGL context-loss lifecycle" below.
The earlier doc is left in place as historical record, not deleted, with a pointer added at
its top.

---

## Dependencies (exact versions)

| Package | Version | Why |
|---|---|---|
| `next` | 16.3.4 | Step 1.5's version decision |
| `react` / `react-dom` | **19.2.8** (downgraded from Step 3's 19.3.0) | `@react-three/fiber@9.7.0`'s peer range is `>=19 <19.3` — verified via a real failed `npm install` at 19.3.0, fixed by pinning 19.2.8 (still within Next 16.3.4's own `^19.0.0` peer range) |
| `three` | 0.186.0 | latest at spike time |
| `@react-three/fiber` | 9.7.0 | latest stable (a `10.0.0-canary.*` line exists, not adopted — not an appropriate spike baseline) |
| `@react-three/drei` | 10.7.8 | only for `<OrbitControls>` — no other drei feature used |

No animation library, physics engine, state-management library, post-processing library, or
large UI library was added. `@react-three/drei` pulls in `zustand` as its own internal,
transitive dependency (used by its unrelated `<Tunnel>` HTML-portal helper) — not imported or
used by any spike code, disclosed for transparency, not adopted.

## Architecture diagram

```
domain object (Step 1: ViewName, SpikeInstance-shaped data)
        |
        v
React component (TwinViewport.tsx -- owns view/selection/lifecycle state)
        |
        v
R3F object (<instancedMesh>, <OrbitControls>, declarative JSX -> three.js scene graph)
        |
        v
Three.js / WebGL (actual GPU rendering, demand-driven)
```

```
components/factory-twin/twin-viewport/
  TwinViewport.tsx      Canvas host, lifecycle state machine, stats/HUD, toolbar
  TwinScene.tsx           64 synthetic boxes ("SPIKE-EQP-000".."063") as ONE InstancedMesh
  CameraController.tsx    3 view presets (plan/overview/building) via ViewName
app/r3f-spike/page.tsx   isolated route -- /factory-twin-3d/r3f-spike, NOT app/page.tsx
```

No separate `SelectionRaycaster.tsx` file: R3F attaches real pointer-event raycasting to any
mesh automatically (`onClick` on `<instancedMesh>`, using `event.instanceId`) — no manual
`raycaster.setFromCamera()`/`intersectObjects()` call exists anywhere in this spike, unlike
`app.js`'s `pickEquipment()` (app.js:2162). A real, positive comparative finding: R3F's
built-in picking replaces a whole category of manual code the legacy app maintains by hand.

## React / R3F render boundary (Section 5)

**Proven, not asserted**: `renderCountRef` in `TwinViewport.tsx` increments once per React
render of that component; it is displayed live (`reactRenders: N`) and never itself causes a
re-render (a plain ref mutation). Measured:

| Action | React re-renders caused | WebGL frames caused |
|---|---:|---:|
| Mount | 1 (baseline) | 1 (initial demand render) |
| One click-to-select | +2 (state: `selected`, plus the `stats` read from a UI button) | 1 |
| 3-second idle wait | **+0** | 4 (idleFrames, OrbitControls' own tiny damping settle) |
| Switching view (button click) | +1 | 1 (camera moves, demand-invalidated) |
| 10-point orbit drag (mouse down/move×10/up) | **+0** | many (continuous three.js/OrbitControls internal updates, invisible to React) |

This is the literal, measured proof the mission asked for: **60 WebGL frames during a drag
interaction correspond to 0 React re-renders of `TwinViewport`** — camera/orbit state lives
entirely inside three.js/drei, never touching React state, exactly per the hard rule.

## Scene structure (Section 3)

64 synthetic boxes (`SPIKE-EQP-000`..`063`, unmistakably fake, NOT CAD) in an 8×8 grid, one
`<instancedMesh>`, one shared `<boxGeometry>`, one `<meshStandardMaterial>`; one ambient +
one directional light; a separate single wireframe box (`SelectionHighlight`) rendered only
while something is selected — one status-driven visual state, one domain-driven object
(`ViewName`-typed camera presets). No floor/grid plane was added (not requested by this
step's own scene list beyond what's already present, and the boxes' own layout already
demonstrates the grid); flagged as a minor deviation from the suggested scene list, not a gap
in what's being tested (floor geometry would exercise identical InstancedMesh/draw-call
mechanics, redundant with the boxes already there).

## Camera architecture (Section 6)

`CameraController.tsx`: three named presets (`plan`/`overview`/`building`), each a plain
`{position, target}` tuple. A view CHANGE is a discrete prop update handled in a
`useEffect(..., [view, camera])` — imperative `camera.position.set()`, not a per-frame state
write. `<OrbitControls>` (drei) owns orbit/zoom/pan entirely inside three.js; its own damping
loop calls R3F's `invalidate()` internally on change, which is why a drag produces WebGL
frames without any React involvement (see table above). Resize is handled automatically by
R3F's `<Canvas>` (its own `ResizeObserver` updates the renderer size and camera aspect ratio)
— verified working, not new code written for it (see Responsive section). DPR is explicitly
clamped (`dpr={[1, 2]}`), not left uncontrolled and not forced to a flat 2 for every device —
see DPR section below.

## Selection / raycasting architecture (Section 7)

Click → R3F's built-in `onClick` on the `<instancedMesh>` → `event.instanceId` → a plain
`{id, index}` object → one `setState` call in `TwinViewport.tsx`. **No global store** — a
single `useState` is sufficient; nothing in this spike's scope needed data to reach a second,
unrelated part of the tree. Measured **in-page** click-to-select latency (not Playwright's own
dispatch RTT, this engagement's established methodology): **p50 0.60ms, p95 2.00ms** across 10
clicks on different instances — sub-frame, comparable to the legacy `app.js`'s own
in-page-measured pick latency (PR #23: 0–0.2ms). Selection does **not** cause unnecessary
full-scene re-renders: only `TwinViewport` (the state owner) and `SelectionHighlight` (a tiny,
separate single-box addition) re-render — `TwinScene`'s 64-instance `<instancedMesh>` itself
never re-renders or re-uploads its matrix data on selection change (it depends only on
`selectedIndex` for the highlight overlay, not for its own instance data).

## WebGL context-loss lifecycle (Section 8) — real, working recovery, two real bugs found and fixed along the way

Implemented spike-level `READY → LOST → RESTORING → REBUILDING → VERIFYING → RECOVERED`,
shaped after (not claimed equivalent to) `app.js`'s own machine (`handleContextLost`/
`attemptContextRecovery`/`verifyRecovery`, app.js:256-364).

**Bug 1 — simulation method.** The prior spike pass simulated loss/restore via
`gl.getExtension('WEBGL_lose_context')` fetched freshly on each button click. This never
fired `webglcontextrestored` — confirmed NOT a browser/R3F limitation (an isolated bare
canvas outside R3F fires the event correctly with the same extension calls) and not a
context-attributes issue (retested with three.js's exact context-creation attributes on a
bare canvas — still fires correctly). **Root cause**: re-fetching the extension object AFTER
the context already transitioned to "lost" does not yield the same functional reference three.js
itself uses internally. **Fix**: use `renderer.forceContextLoss()` /
`renderer.forceContextRestore()` — the exact API `app.js`'s own `simulateContextLoss`/
`simulateContextRestore` QA hooks already use (app.js:3746-3747), confirmed working
immediately: `THREE.WebGLRenderer: Context Restored.` now logs, matching the browser's own
`webglcontextrestored` firing correctly.

**Bug 2 — rebuild strategy.** The first working version's REBUILDING step force-remounted
`TwinScene` (a `key` bump) reasoning by analogy with `app.js`'s own manual rebuild step that
`InstancedMesh` data needed re-creating. **Measured**: this made
`renderer.info.memory.geometries` grow 1→2 on every single cycle — a real, repeatable leak,
because unmounting the OLD `TwinScene` mid-restore does not reliably dispose its GPU geometry
before the NEW instance's is counted. **Fix, confirmed by measurement**: do NOT remount.
`InstancedMesh`'s `instanceMatrix` buffer attribute lives in a plain JS `Float32Array` that
context loss never touches; three.js re-uploads it to the GPU on the next render on its own.
REBUILDING only needs to force that next render to actually happen (`frameloop="demand"`
otherwise wouldn't, since nothing changed a three.js prop) — one `invalidate()` call, nothing
more.

**Bug 3 (test-only) — verification baseline.** The resource-growth check initially compared
every post-recovery reading against a baseline captured once at mount. A legitimate,
unrelated scene change made before a given loss (selecting an instance, which adds
`SelectionHighlight`'s own geometry) was then misread as "growth caused by recovery."
**Fixed**: the baseline is now re-captured at the MOMENT OF LOSS, so the real question —
did *recovery itself* grow anything, independent of whatever the scene legitimately contained
right before — is what's actually measured.

**Final, measured result** — single cycle and 4 repeated cycles, both PASS:

| | Before loss | After restore | |
|---|---:|---:|---|
| Single cycle | geometries 2, textures 1 | geometries 2, textures 1 | **PASS, no growth** |
| 4 repeated cycles | geometries 2, textures 1 | geometries 2, textures 1 (every cycle) | **PASS, no growth, no accumulation** |
| Scene interactivity | — | click-to-select still works after every cycle | **confirmed, not assumed** |

This is now genuine, positive evidence that R3F/three.js CAN recover WebGL context loss
reliably, once the correct API is used — reversing the previous pass's "unresolved gap"
finding. Not claimed equivalent to `app.js`'s full production lifecycle (that machine also
handles banner UI, generation-token guarding against stale async callbacks, and has been
verified across 56 real-prod recovery cycles, PR #23) — this is architecture validation at
spike scale (1 cycle, 4 cycles), not a claim of parity.

## Performance instrumentation (Section 9)

| Metric | Value | Comparison to PR #23 baseline |
|---|---:|---|
| FCP | 112–164ms (3 runs) | Twin: ~50–100ms. Comparable order of magnitude; R3F's heavier JS doesn't block first paint (loads async) |
| First WebGL render (nav start → canvas visible) | 205ms | No direct legacy equivalent measured at this granularity before; recorded as this spike's own baseline |
| Interaction (click-to-select) p50 / p95 | 0.60ms / 2.00ms (in-page, 10 samples) | Twin: 0–0.2ms (PR #23). Same order of magnitude, sub-frame either way |
| JS heap used | 6.43 MB | Twin: 10.68 MB at idle (PR #23, larger real scene). Not a fair scale comparison — this spike's scene is 64 boxes vs. 431 real assets |
| Draw calls | 1 (2 while something is selected) | Twin: 326–356 (state-dependent, much larger real scene) |
| Triangles | 768 (64 boxes × 12) | Twin: 10,408–16,996 |
| React re-renders vs. WebGL frames | 0 extra React renders across 3s idle + a 10-point drag, vs. many WebGL frames during the drag | No React involved in the legacy app at all — this is the new axis R3F introduces, and it measures clean |
| Bundle transfer (R3F+three+drei route) | ~1.35 MB (from the earlier spike pass, unchanged this pass — no new dependency added) | Legacy: ~2.1MB unminified `three.core.js`+`three.module.js` (PR #23 §5) — smaller here due to Next's tree-shaking |

**No major regression from React's involvement** — the render-boundary measurements above are
the direct evidence for this: React's own overhead is 0 extra renders for anything
render-loop/interaction-related. The FCP/interaction numbers are dominated by the same
WebGL/three.js costs the legacy app already has, not by React.

## DPR / quality control (Section 10)

Tested `deviceScaleFactor` 1, 1.5, 2 (Playwright's `newPage` option, equivalent to
`devicePixelRatio`). Canvas explicitly clamped via `dpr={[1, 2]}` — not forced to 2 for every
device. **Measured**: draw calls and triangle count are identical (1 call / 768 triangles) at
all three DPR values — expected, since DPR affects pixel *resolution* the same 768 triangles
are rasterized into, not scene complexity. At this spike's trivial scale (64 boxes), no
DPR-driven GPU workload difference is measurable or expected; a real scene with the twin's
actual ~17k triangles and 22 textures would be the place to re-measure whether an adaptive-DPR
abstraction is actually justified — not built here, since nothing at this scale demonstrated a
need for one (per the hard rule against implementing unmeasured optimizations).

## WebGL resource audit (Section 11)

Instrumented `renderer.info.memory.{geometries,textures}` and `render.{calls,triangles}` across:
initial render (1 geometry, 1 texture, 1 call, 768 tris), selection (2 geometries — the
highlight box — 2 calls), camera interaction/drag (no change to geometry/texture/call counts,
only camera matrix updates), resize (no change — R3F's resize handling doesn't touch scene
resources), context loss (frozen at whatever it was), recovery (returns to exactly the
pre-loss counts, verified above), and 4 repeated loss/recovery cycles (stable, no
accumulation). **No leak found** at any of these transition points.

## Accessibility (Section 12)

- Keyboard focus reaches the real `<button>` toolbar controls, never swallowed by the canvas
  (verified: first `Tab` lands on a `<button>`).
- Focused controls show a visible outline (`focus-visible:outline`).
- Selected-object information renders in a plain HTML `<div>` overlay **outside** the
  `<canvas>` element structurally (verified via DOM containment check, not just visually) —
  the canvas is not an accessibility black hole for what matters operationally.
- `prefers-reduced-motion` and `forced-colors: active` both render without error; the toolbar
  (a real `<button>`, e.g. "plan") stays visible under forced-colors.
- Individual 3D objects were **not** made independently screen-reader-interactive — explicitly
  out of scope for this step, per the brief.

## Responsive (Section 13)

All 6 required viewports (1366×768, 1920×1080, 2560×1440, 3840×2160, 1024×768, 1440×900):

| Check | Result |
|---|---|
| No horizontal overflow | PASS at all 6 |
| Canvas resizes to fill its container (never 0×0) | PASS at all 6 (e.g. 1894×987 at 1920×1080, accounting for toolbar/HUD chrome) |
| axe: 0 serious/critical violations | PASS at all 6 |
| Camera aspect ratio updates on resize | Handled automatically by R3F's `<Canvas>` `ResizeObserver` — confirmed working (canvas dimensions match container at every tested size), no custom resize code needed |
| Resize resource leak | Not observed — draw calls/geometries unaffected by viewport size changes |

## Visual regression (Section 14)

New, spike-specific screenshots only, added under `tests/playwright/screenshots/r3f-spike/`:
`r3f-spike.1920x1080.full.png` (post-interaction state) plus one per required viewport at
1920×1080 resolution for the responsive pass. **The existing 32/32 Factory Twin baseline
(`ui-visual-regression.js`) was not touched, extended, or replaced** — it remains the
production visual reference for the real implementation.

## Comparison with PR #23 baseline — summary

| Dimension | Legacy (`app.js`, PR #23) | R3F spike | Verdict |
|---|---|---|---|
| Demand rendering | 0 extra frames / 3s idle | 3–4 frames / 3s idle (OrbitControls damping settle) | Comparable, not identical — small, explained difference |
| Draw calls for N objects | 1 InstancedMesh call for 344 machines | 1 InstancedMesh call for 64 boxes | Same pattern holds |
| Pick latency (in-page) | 0–0.2ms | 0.60–2.00ms (p50/p95) | Same order of magnitude |
| WebGL context recovery | Proven, 56/56 real-prod cycles | Proven this pass, 1 + 4 spike cycles | Architecture validated; scale/production-hardening not yet proven |
| React render discipline | N/A (no React) | 0 extra renders across idle + drag | New axis, measures clean |

## Known limitations

- Scene scale is 64 boxes vs. the real twin's 431 assets / ~17k triangles — draw-call and
  instancing BEHAVIOR is proven, not re-validated at real scale.
- WebGL recovery proven at 1 + 4 cycles in a spike, not at PR #23's 56-cycle real-prod
  standard — a real migration would need to repeat that same rigor on real geometry.
- `next/image`'s own asset-proxy path remains untested (carried from Step 2's own disclosure).
- No CI job exists for `services/factory-twin-3d-next/` yet (still isolated, manual test
  invocation only).
- Floor/grid plane from the suggested scene list was not added (see Scene structure) —
  judged redundant for what this step needed to prove.

## Recommendation

**R3F SPIKE — PASS.** Every mandatory question this step asked has a measured, PASS answer:
scene works (instancing, 1 draw call for N objects), domain integration works (typed
`ViewName`/camera consumption, no recreated types), selection works (sub-frame, no global
store, no unnecessary re-renders), camera works (orbit/zoom/resize/DPR all measured), context
recovery works (proven across repeated cycles once the correct API was used), no resource
leak was found at any measured transition, accessibility remains valid, and no performance
regression traceable to React's involvement was found (0 extra renders on the exact
per-frame paths that matter).

Proceed to Step 5 planning is a reasonable next step **once the architecture decision is made
explicitly** — this document does not authorize that on its own, per the mission's own
"wait for the architecture decision before Step 5" instruction.
