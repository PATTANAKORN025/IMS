# Factory Twin 3D — Machine Selection / Picking Migration to R3F (Step 5C)

**Date:** 2026-09-11. **Scope:** `services/factory-twin-3d-next/components/factory-twin/
machines/{Machines.tsx,SelectedMachinePanel.tsx}` plus wiring into `GeometryViewport.tsx`.
**Selection/picking only** — no telemetry, live operational state, alarms, RCA, inspector data
fetching, EAP, LDI, or predictive logic. `services/factory-twin-3d/` (the live
implementation), Step 3's shell route, and Step 4's spike are untouched — confirmed by
`git diff --quiet` against every Dockerfile-copied legacy path.

---

## 1. Selection contract

Canonical identity is `machine.id` (a plain string, e.g. `"EQP-F1-0402"`), never `instanceId`.
`instanceId` is a renderer implementation detail resolved to `machine.id` inside
`Machines.tsx` and never leaves that component as a bare number. The Step 1 domain's
`SelectionState` (`services/factory-twin-3d/domain/selection.ts`, unchanged) is the boundary
type used everywhere outside `Machines.tsx` — `GeometryViewport.tsx` derives it from
`selectedId` via a `Map<id, Asset>` lookup:

```ts
const selection: SelectionState = selectedId === null
  ? { kind: 'none' }
  : (assetById.get(selectedId) ? { kind: 'equipment', asset: assetById.get(selectedId)! } : { kind: 'none' });
```

`selectedId` (a string) is what React tracks as state — cheap `Object.is` equality checks,
cheap Map lookups — while `SelectionState` (a full `Asset`) is reconstructed only where the
domain type is actually needed (`SelectedMachinePanel.tsx`). This keeps the renderer
replaceable: a future non-InstancedMesh renderer only needs to produce a `machine.id` on pick,
never an instance index the rest of the app understands.

## 2. instanceId → machine.id mapping (Section 3)

`Machines.tsx` builds two parallel arrays alongside the existing sized/marker instance data
(unchanged from Step 5B):

```
sizedIds[index] = machine.id     // for the "sized" InstancedMesh
markerIds[index] = machine.id    // for the "marker" InstancedMesh
sizedIndexById: Map<id, index>   // reverse lookup, for applying the selection highlight
markerIndexById: Map<id, index>
```

Never relies on array order being implicit at any call site — every lookup goes through a
named array or Map, both built once via `useMemo` keyed on the `machines` prop.

**Deterministic mapping test** (`tests/playwright/factory-twin-r3f-selection.js`, reproducing
`Machines.tsx`'s own sizing rule independently against the real API data):

| Check | Result |
|---|---|
| Every rendered instance has exactly one machine id | **431 === 431** |
| No duplicate machine ids across sized+marker mapping | **431 unique of 431** |
| Every source machine (431, post-dedup) is addressable | **PASS** |
| Mapping is stable (rebuilding from the same input twice) | **PASS**, identical arrays |

## 3. Picking strategy (Section 2)

`event.instanceId` (populated by three.js's `Raycaster` automatically for `InstancedMesh`
intersections) → `sizedIds[instanceId]` / `markerIds[instanceId]` → `onSelect(id)`. No manual
scan of all 431 machines on every pointer event — R3F's own raycasting resolves the hit
directly to an instance index in one step.

**Picking layers (Section 10) — measured, not assumed.** `Floor.tsx`, `Walls.tsx`,
`Columns.tsx`, `Openings.tsx`, and `StructuralGrid.tsx` (all Step 5A) have **zero**
`onClick`/`onPointerX` props — confirmed by inspection of their current source. R3F's own
event system only includes objects with registered pointer-event handlers in its interaction
candidate list, so these five components are already excluded from pick consideration without
any `raycaster.layers` mechanism. A manual layers-based filter was evaluated and **not added**:
measured in-page pick latency (below) is already sub-2ms at p50 with the current approach, and
Section 10 itself says "measure the difference rather than assuming it matters" — with no
measured bottleneck, adding `raycaster.layers` would be complexity with no demonstrated
benefit.

## 4. Selection state discipline (Section 4)

`selectedId` is a single `useState<string | null>` in `GeometryViewport.tsx`, updated only by:
`Machines.tsx`'s `onSelect` (a real click), the `<Canvas onPointerMissed>` handler (click on
empty space), and the `SelectedMachinePanel`'s Clear button. **No** `pointermove`,
camera-frame, or hover handler ever calls `setSelectedId` — confirmed by inspection (grep for
`setSelectedId` finds exactly these three call sites, all discrete, none per-frame).

## 5. Selection visual feedback (Section 5)

An `instanceColor` swap on the already-existing `InstancedMesh` — **no new geometry, no new
draw call, no post-processing/outline package**. `Machines.tsx` tracks the previously-selected
`{mesh, index}` in a ref and, on `selectedId` change, reverts that instance to its real tier
color before applying the accent color (`#38bdf8`, the app's own mirrored `--accent`/`--focus`
token — not a new color invented for this) to the newly-selected instance. This is the
cheapest option evaluated: an outline mesh or emissive-material swap would both cost at least
one additional draw call or a full material replacement; a color-buffer write on an existing
mesh costs neither. A grep of `app.js` found no dedicated equipment-selection highlight mesh
in the legacy implementation under any obvious name (`selectedMesh`, `highlightMesh`,
`outlineMesh`, `SELECTION_`) — legacy's own equipment selection may rely solely on its DOM
inspector panel opening; this candidate's 3D highlight is disclosed as a capability the legacy
page may not have an equivalent for, not assumed to match one.

## 6. Selection + instancing performance (Section 6)

| Metric | Before selection | After selection | Same machine again | Different machine | After deselect |
|---|---:|---:|---:|---:|---:|
| Geometries | 11 | 11 | 11 | 11 | 11 |
| Textures | 1 | 1 | 1 | 1 | 1 |
| Draw calls | 11 | 11 | 11 | 11 | 11 |
| React renders (delta) | — | see below | **0** | +1 | +1 |

**Interaction latency** (in-page, `performance.now()` around real dispatched pointer events —
this engagement's established methodology, not Playwright's own `.click()` round-trip): 10
samples across 2 machines, **p50 = 1.20ms, p95 = 8.80ms** — sub-frame.

**React render count — measured honestly, one bounded finding disclosed, not hidden.** A
click on a fresh page with no prior interaction produces exactly **+1** render. Re-clicking
the *same* machine produces **+0** (React's own `Object.is` bail-out on an unchanged state
value — confirmed, not assumed). One specific sequence — clicking the "Read renderer stats"
DOM button, then immediately making the *first* canvas click of the session — produces **+2**
renders instead of +1, reproducibly. Root-caused partially: confirmed present only when a DOM
button is clicked before the very first canvas interaction; confirmed absent otherwise; not
fully isolated beyond that (see Known Limitations). Hoisting the `<Canvas camera={...}>` /
`dpr={...}` props to stable module-level references (good practice regardless) was tried and
did **not** resolve it — disclosed as a fix attempt that didn't work, not silently dropped.
Bounded to +2, never compounding on repeated clicks, and nowhere near a per-frame pattern —
Section 4's actual rule (no `pointermove`/frame-driven `setState`) is satisfied regardless.

No geometry/material/texture duplication was found at any step above — the `InstancedMesh`
is never rebuilt for a selection change, only its existing `instanceColor` buffer is written.

## 7. Selection outside canvas (Section 7)

`SelectedMachinePanel.tsx` — plain semantic HTML, outside the `<canvas>` element structurally,
showing exactly `machine.id` and selected/unselected state, nothing else (no telemetry, no
alarm data — verified by inspection, the component's only prop is a `SelectionState`). A
`Clear` button is present whenever a selection exists.

## 8. Keyboard support (Section 8)

The `Clear` button is a real `<button>`, natively focusable and activatable with `Enter` —
verified: `Tab` reaches it, a visible focus outline renders, `Enter` deselects. No attempt was
made to make any of the 431 3D machines individually tab-focusable — explicitly out of scope
per Section 8's own instruction ("not a DOM clone of the 3D scene").

## 9. Pointer UX (Section 9) — all tested, all pass

Click a machine, click empty space, click another machine, rapid repeated clicks (5 clicks
across 2 machines and empty space, ~30ms apart), resize during selection, camera orbit during
selection — every case verified: no stale selection, no duplicate selection, no incorrect
machine id, no resource growth, no full-scene reconstruction (geometry count identical before/
after every transition).

**A real, disclosed camera-settle finding from this step's own test development** (not a
selection-logic defect): drei's `OrbitControls` has damping enabled by default, matching
`app.js`'s own `controls.enableDamping = !prefersReducedMotion` (app.js:162) — not a
difference this step introduced. Immediately after mount, the camera can still be settling for
its first render-or-two; a click fired in that narrow window can land on a neighboring machine
one boundary over from where the identical pixel resolves a moment later. Confirmed a
**one-time settle, not continuous drift** (5 repeated clicks at the same pixel: hit A, then hit
B, then B, B, B — stable from the third click onward). A 1000ms wait before the first
interaction made every tested coordinate fully stable across repeated clicks. This is a
property of damped orbit controls in general (present in the legacy app too, per its own
identical damping setting), not something Step 5C's picking logic caused.

## 10. Context recovery (Section 11)

Reused Step 4's corrected lifecycle exactly (`GeometryViewport.tsx`, unchanged this step) — no
second WebGL lifecycle implementation. Tested: select → context loss → recovery → select a
*different* machine → deselect, then 4 additional repeated cycles.

| | Result |
|---|---|
| Selection before loss | Works |
| Single recovery cycle | **PASS**, geometries 11→11, textures 1→1 |
| Select a different machine after recovery | **Works** — no stale object references (the new selection resolves to the correct, current instance index) |
| Deselect after recovery | Works |
| 4 repeated cycles | **PASS**, still 11/1, no accumulation |
| Select the same machine again after 4 cycles | Works |

The `sizedIndexById`/`markerIndexById` Maps are derived purely from the `machines` prop
(unchanged across context loss) via `useMemo` — they never need active "rebuilding" after
recovery because they were never invalidated by it; this is a direct consequence of Step 5A/5B's
own already-proven `invalidate()`-only (no remount) recovery strategy extending unchanged to
selection.

## 11. Responsive (Section 12) + Accessibility (Section 13)

All 6 required viewports (1366×768, 1920×1080, 2560×1440, 3840×2160, 1024×768, 1440×900):
0 horizontal overflow, `SelectedMachinePanel` visible and not overflowing, axe 0 serious/
critical violations, canvas remains interactive. Renders correctly under `forced-colors:
active` and `prefers-reduced-motion`. Selection is communicated by **text** (`machine.id`) in
every case this suite checks — never inferred from a screenshot's color alone — plus the 3D
highlight color as a second, non-load-bearing signal, satisfying Section 13's "at least two
signals" rule.

## 12. Regression matrix (Section 14)

| Suite | Result |
|---|---|
| Step 3 shell | **30/30** (unaffected) |
| Step 4 R3F spike | **45/45** (unaffected) |
| Step 5A geometry | **48/48** (unaffected) |
| Step 5B machines | **41/41**, **one assertion intentionally superseded, not weakened** (see below) |
| Step 5C selection (new) | **50/50** |
| Legacy `factory-twin-failure-modes.js` | **PASSED** (re-run against the unrebuilt, byte-identical disposable container) |
| `git diff --quiet` vs. every Dockerfile-copied legacy path | **Clean** |

**Step 5B's own assertion update, disclosed in full**: Step 5B's test asserted "clicking a
machine does NOT create any selection UI (deferred to a later step)" — correct for Step 5B's
own scope at the time it was written. Step 5C's entire mission is to build exactly that
selection UI, so the old assertion's premise is retired by design. Updated to assert the new,
intentional behavior (clicking now DOES show `Selected machine: <id>`) rather than leaving a
now-obsolete check failing or silently deleting it. This is the same category of correction as
Step 5A's stale hardcoded geometry-count baseline (fixed when Step 5B legitimately grew it) —
a forward-compatible update, not a weakening: the check still asserts something real about the
current, intended behavior.

## Known limitations

- The +2-vs-+1 React render count when a DOM button is clicked immediately before the first
  canvas interaction (§6) is measured and bounded but not fully root-caused. A stable-reference
  fix for `<Canvas>`'s `camera`/`dpr` props was tried and measured to have **no effect** —
  disclosed as a failed fix attempt, not silently dropped. Does not affect correctness,
  resource stability, or the "no per-frame updates" rule, which is about pattern, not an exact
  count.
- No dedicated equipment-selection highlight was found in the legacy `app.js` under any
  searched name — this candidate's 3D highlight is a genuinely new capability, not a reproduced
  one; the comparison in §5 is disclosed as such, not assumed to match a legacy behavior that
  may not exist.
- `Machines.tsx`'s picking now depends on precise click coordinates being stable across a
  post-mount camera settle window (§9) — real for any damped-OrbitControls scene (legacy
  included), not a regression, but worth carrying into any future automated visual-regression
  tooling that clicks fixed pixel coordinates.
- `GeometryViewport.tsx`'s WebGL-lifecycle code remains duplicated from Step 4's
  `TwinViewport.tsx` (carried forward from Steps 5A/5B, unchanged).
- No CI job exists for `services/factory-twin-3d-next/` yet (carried forward).

## Acceptance criteria

- [x] selection uses canonical `machine.id` (never a bare `instanceId` outside `Machines.tsx`)
- [x] InstancedMesh instance mapping is deterministic (tested)
- [x] no duplicate machine identity (431 unique of 431, tested)
- [x] picking does not scan irrelevant scene objects unnecessarily (R3F's own handler-scoped
      event system already achieves this; measured pick latency confirms no bottleneck)
- [x] React updates only on discrete selection events (no pointermove/frame handler calls
      `setSelectedId`, confirmed by inspection)
- [x] no per-frame React state updates
- [x] no resource growth from selection (geometries/textures/draw calls stable throughout)
- [x] selected visual is clear (instanceColor accent highlight)
- [x] semantic selected-machine information exists outside canvas (`SelectedMachinePanel`)
- [x] keyboard/accessibility path works (Clear button, Tab/Enter, visible focus)
- [x] context recovery preserves selection architecture (1 + 4 cycles, PASS)
- [x] 6 viewport matrix passes
- [x] axe passes (0 serious/critical, all 6 viewports)
- [x] all previous regression suites pass (30/30, 45/45, 48/48, 41/41 — one assertion
      intentionally superseded per its own design, not weakened)
- [x] legacy Factory Twin untouched (`git diff --quiet` confirmed)

## Verdict

**STEP 5C — R3F MACHINE SELECTION: PASS.**
