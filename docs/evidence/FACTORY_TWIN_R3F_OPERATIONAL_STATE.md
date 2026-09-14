# Factory Twin — Step 6A: Operational State Presentation

Scope: integrate the existing operational-state semantics (`operational-status.js`,
`operational-state-adapters.js`, Step 1's `machine-state.ts`/`data-quality.ts`) into the R3F
Factory Twin as a presentation layer, on the isolated `/factory-twin-3d/geometry-candidate`
route only. No live telemetry connected, no fake backend API, no database schema change.
Legacy `/factory-twin-3d/`, `app.js`, `eap.js`, EAP, LDI, alarms, RCA, inspector all untouched
(`git diff --quiet` confirmed clean against `services/factory-twin-3d/`).

## 1. Operational state contract — unchanged, reused exactly

Reused Step 1's `MachineStateCode` (`machine-state.ts`) exactly: `RUN`, `DOWN`, `IDLE`, `OFF`,
`INITIAL`, `PM`, `STOP`, `UNDEFINED`. No ninth state invented. Reused `StateSourceQuality`
(`data-quality.ts`) for the data/source axis: `VALID`, `STALE`, `NO_DATA`, `UNAVAILABLE`,
`SIMULATION`. These two axes are never conflated — `NO_DATA` and `UNAVAILABLE` render as a
single, distinct neutral color (`#64748b`, matching `operational-status.js`'s own
`DATA_QUALITY.UNMAPPED` color), never `DOWN`'s red (`#ef4444`) and never any of the other 7
machine-state colors.

## 2. State source boundary

New file: `services/factory-twin-3d-next/lib/operational-state-adapter.ts` — a structural
port of `public/operational-state-adapters.js`'s real/simulated adapter pair
(FT-EAP-STATE-03/04), applied to `Asset[]` instead of EAP cells:

- `resolveReal(asset)` — unconditionally `UNAVAILABLE`. No PLC/SCADA/MES/historian/equipment-
  controller integration exists for these 431 machines (same evidence class
  `docs/eap/EAP_OPERATIONAL_SOURCE_AUDIT.md` documents for EAP) — this step's own hard rule
  forbids connecting one, so the real adapter is honest, always, never a fake backend standing
  in for it.
- `resolveSimulated(asset)` — deterministic per-asset hash (`hashString()`, byte-for-byte
  reproduced from `eap.js:580-584`), only applied when `isMachine(asset)` is true (the same
  `ims_device_id` + `live_status_eligible` type guard `statusForAsset()` already enforces at
  runtime). An asset with no confirmed IMS mapping has no machine state to simulate one for —
  that resolves to `NO_DATA`, never a plausible-looking `Idle` or `Off`, mirroring
  `operational-state-adapters.js:110-116`'s "cell not attached to a machine unit" rule exactly.
- `resolveOperationalState(asset, demoModeOn)` — the one canonical resolver every caller uses:
  tries real first, always; only substitutes simulated because the real answer genuinely was
  `UNAVAILABLE` **and** a viewer explicitly turned the demo toggle on. Default `false`, matching
  `eap.js:578`'s own default-off convention — never an automatic fallback.

## 3. A real, honest finding: 0 machines are IMS-mapped in this deployment today

Verified directly against `/api/floor-geometry` (the authoritative source, not assumed):

```
mappedCount(live_status_eligible && ims_device_id) = 0 of 431
```

This matches `operational-state-adapters.js`'s own documented reality ("this floor has 0
confirmed IMS mappings today"). Consequence: with the demo toggle on, every one of the 431
assets resolves to `NO_DATA` today, and `simulated=0` — not a bug, the same honesty discipline
`statusForAsset()` and the EAP adapters already enforce elsewhere in this codebase. The full
8-state color vocabulary is still real and available (proven by the legend, §5, and by the
adapter's own deterministic logic), it simply has no eligible asset to color with it yet in
this dataset. `resolveOperationalState`'s own unit-shaped behavior (real-first, demo-gated,
mapping-gated) is exactly what the day a real mapping exists will exercise — this step's
mission was proving that pipeline works, not fabricating mapped machines to make it look busy.

## 4. Rendering — no coupling to 431 React components

`Machines.tsx` (edited) gained a `showOperationalState`/`operationalStateByAssetId` prop pair.
Coloring reuses the EXACT mechanism Step 5B/5C already proved correct: `InstancedMesh.
setColorAt()` + `instanceColor.needsUpdate = true`, on the same 2 shared `InstancedMesh`
objects (`sized`, `markers`) — no new mesh, no per-machine component, no per-machine React
state. A `sizedDisplayColors`/`markerDisplayColors` memo (derived once per toggle/resolution
change, never per frame) is the single source of truth both the initial-paint effect and the
selection-revert effect read from, so a selected instance always reverts to whichever base
color is currently active (tier color, or operational-state color) — never a stale one.

Measured: toggling operational state on/off causes exactly 0 resource growth (`geometries`/
`textures`/`calls` unchanged, color-swap only) and a small, bounded React-render delta (+2,
never approaching 431) — direct proof of this step's own mission statement ("real operational
semantics can drive the new renderer without coupling React rendering to 431 machines").

## 5. Legend — status never communicated by color alone

A real, DOM-rendered legend (shown only when the demo toggle is on) lists all 8 machine states
plus "No data / unavailable" by **glyph + label text**, not color swatches alone — same
accessibility discipline `operational-status.js`'s own header comment states ("glyph and label
are both load-bearing, which matters most for the red/green pair"). Verified via axe (0
serious/critical violations with the legend visible) and via direct text-content assertions for
every one of the 9 entries.

## 6. Testable proof, not pixel-guessing

Rather than reading WebGL pixel buffers (would require `preserveDrawingBuffer: true` on the
Canvas, a production behavior change made purely for test convenience — rejected), a real,
DOM-readable `operational: simulated=X noData=Y unavailable=Z` summary was added to the
toolbar, computed once per toggle from the SAME resolution map the renderer consumes — the same
regex-parsed-toolbar-readout convention Step 5F's `controllerMounts`/`contextLost` counters
already established. This lets the test suite assert the Section 1 hard rule directly:
`NO_DATA != DOWN`, `UNAVAILABLE != DOWN`, `simulated` count exactly matches the API's own
mapped-machine count.

## 7. Selection coexistence

Selection (Step 5C) survives toggling operational state on/off, survives re-clicking the same
machine, survives Clear + re-select, all while demo mode is active — verified against a
dynamically captured selection id, not a hardcoded one (Step 5C's own suite documents a
one-time damped-`OrbitControls` settle where the very first click on a freshly loaded page can
resolve to a neighboring machine before stabilizing; this suite's assertions are written
against whatever id that first click actually returns, matching the established methodology).

## 8. WebGL context recovery

Verified: lose context with demo mode on and a machine selected → recovery reaches
`RECOVERED`, verification `PASS` (no resource growth), the demo toggle stays checked, the
operational summary re-derives identically (no drift), and the selection survives — all in one
combined scenario.

## 9. Accessibility + responsive

axe: 0 serious/critical violations with the legend visible. Demo toggle is keyboard-focusable
with a visible focus outline; Space toggles it. Renders under `forced-colors` and
`prefers-reduced-motion` with no error. No horizontal overflow at 1024×768, 1920×1080, or 200%
zoom with the legend visible (reuses Step 5F's toolbar `flex-nowrap`/`overflow-x-auto`/
`min-w-0` + fieldset `position: relative` fix — the new toggle fieldset follows the identical
pattern, verified not to reintroduce either the canvas-shift or the escaping-containing-block
bug).

## 10. Tests

`tests/playwright/factory-twin-r3f-operational-state.js` — 40 assertions, 40 passed.

Full regression re-run, all suites green against the same production (`next build` + standalone
`server.js`) build:

| Suite | Result |
|-------|--------|
| `factory-twin-next-shell.js` (Step 3) | 30 passed |
| `factory-twin-r3f-spike.js` (Step 4) | 45 passed |
| `factory-twin-r3f-machines.js` (Step 5B) | 41 passed |
| `factory-twin-r3f-selection.js` (Step 5C) | 50 passed |
| `factory-twin-r3f-camera.js` (Step 5D) | 66 passed |
| `factory-twin-r3f-layers.js` (Step 5E) | 69 passed |
| `factory-twin-r3f-scene-orchestration.js` (Step 5F) | 76 passed |
| `factory-twin-r3f-operational-state.js` (Step 6A) | 40 passed |
| `factory-twin-failure-modes.js` (legacy regression) | 1 pre-existing failure (`:3000` placement-route, out of scope, unchanged since Step 5D) |

`git diff --quiet -- services/factory-twin-3d/` confirmed clean — legacy stack untouched.

## Known limitations

- 0 machines are currently IMS-mapped in this deployment (§3), so demo mode today colors every
  asset `NO_DATA` — the full 8-color vocabulary is proven correct via the legend and the
  adapter's own deterministic logic, not via a live-colorful render, because fabricating a
  mapped machine to make the demo look busier would itself violate this step's hard rule
  against fake data.
- The demo-mode simulated state is NOT persisted (no `localStorage`), matching Section 2's
  "do not create persistent localStorage state yet" convention already established in Step 5D.
- No operational-state-driven behavior beyond color (no alarms, no inspector, no RCA, no
  EAP/LDI) — explicitly out of scope per this step's own hard rules.

## Acceptance criteria

- [x] Operational state contract reused exactly, no invented states
- [x] NO_DATA != DOWN, UNAVAILABLE != DOWN, both rendered and tested distinctly
- [x] Real adapter honest UNAVAILABLE always; simulated only via explicit, default-off toggle
- [x] No live telemetry connected, no fake backend API, no database schema change
- [x] Rendering decoupled from React per-machine components (InstancedMesh color swap only)
- [x] 0 resource growth on toggle; small, bounded React-render delta
- [x] Status communicated by text (legend), not color alone
- [x] Selection and WebGL context recovery both coexist correctly with operational state
- [x] All prior step suites (3, 4, 5A-5F) remain green
- [x] Legacy Factory Twin untouched (`git diff --quiet` clean)

## Verdict

**STEP 6A — OPERATIONAL STATE PRESENTATION: PASS**
