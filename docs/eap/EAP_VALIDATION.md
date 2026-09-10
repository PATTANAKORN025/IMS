# FT-24.6 — EAP Validation Evidence

Every claim below traces to a real command run this session, a real
disposable-container check against the real production DB/geometry mount,
or a real authenticated production Playwright session. No number here is
estimated.

## LDI coupling scan (Phase 0/this phase's own core requirement): NONE, confirmed

```
grep -n "ldi\|LDI\|telemetry\|alarm\|spc\|predictive\|Cpk\|EWMA\|CUSUM\|Nelson" \
  services/factory-twin-3d/public/eap.js
```
Two hits, both in comments explicitly DISCLAIMING telemetry coupling
("never touches /api/state or any production telemetry source"), zero in
executable code. Same zero-hit result for `eap.html` (two hits, both in
the Simulation-toggle's own disclosure text) and `lib/eap-map.js` (one
hit, in a comment). Confirmed further by the existing
`tests/playwright/eap-canonical-route-regression.js` (re-run this
session, 0 failures): `window.__eap` is asserted NOT defined at the
physical twin's root route, and `window.__twin` is asserted NOT defined
at `/eap.html` -- two independent WebGL contexts, two independent
bootstraps, zero shared runtime state.

## Real defects found and fixed this session

### 1-2. Accessibility (real axe-core scan, real production, never previously audited)

`eap.html` had never been through this engagement's own accessibility
discipline (unlike `index.html`, audited every phase since FT-18). Real
first scan, authenticated production:

```
axe violations: 4
  color-contrast serious 7
  landmark-one-main moderate 1
  region moderate 2
  scrollable-region-focusable serious 1
```

- **`color-contrast`** (7 nodes: `.group-label`, `#mode-note`, 4×`aside h2`):
  `--ink-faint` (`#6b7688`) measured 3.22-3.98:1 against the page's real
  surfaces -- below the 4.5:1 AA minimum. Fixed with `#828da0`, computed
  before writing it: 4.62-5.76:1 across every surface this token is
  actually used against (`--surface` #1a1f27, `--bg` #12151a), still
  visibly dimmer than `--ink-dim`.
- **`landmark-one-main`** + **`region`** (canvas/`#labels` outside any
  landmark): no `<main>` existed on this page at all. Fixed by making
  `#stage` a `<main>` element (id-based CSS selectors unaffected by the
  tag change).
- **`scrollable-region-focusable`** (`<aside>`): the scrollable aside had
  no keyboard path to scroll it. Fixed with `tabindex="0"` and an
  `aria-label` naming the landmark.

Re-scan after the fix, disposable container, **all 4 target viewports:
0 violations**. Re-verified again on real authenticated production after
deploy: confirmed below.

**Disclosed, not fixed this phase**: the cell/zone-picking interaction
itself (click/hover on the WebGL canvas) has no keyboard equivalent. Axe
does not flag this (canvas interaction isn't something it can inspect),
but it is a real WCAG 2.1.1 gap. Not fixed here because a keyboard path
for 210 individually-pickable cells needs a real UI affordance (e.g. a
searchable list in the aside) -- a scoped feature addition, not a
one-line accessibility fix, and this phase's own instruction was not to
begin a large UI redesign before/without the audit's own sign-off.
Recorded here so it is not silently lost.

### 3. Performance: labels redrawn unconditionally every frame (real profiling, Phase 8/9)

Real idle-orbit (2-second-settled) WebGL frame sampling, disposable
container, real production geometry:

| State | Frame p95 (idle, 1920x1080) |
|---|---:|
| Before | **37.9ms** (min 31.8, max 41.0) — over the 25ms target |
| After | **28.3ms** (min 24.7, max 29.2) |

Root cause, confirmed by reading the render loop (`eap.js`'s `tick()`)
before changing anything: `drawLabels()` — a full-canvas 2D-context clear
plus up to ~210 `fillText` calls — ran unconditionally every frame, 60
times a second, even though `OrbitControls` damping was never enabled
here (confirmed: no `enableDamping`/`dampingFactor` anywhere in the file)
and nothing was actually moving at idle. Fixed with a `labelsDirty` flag,
set only where the labels' screen position or content can actually
change: `OrbitControls`'s own `'change'` event (real pan/zoom/rotate) and
`resize()` (covers window resize AND `rebuild()`, which mode/view
switches and the initial load already funnel through) — one injection
point per real trigger, not a guess.

**Correctness re-verified, not just performance**: a first test using a
LEFT-button drag found "no label change" and was initially read as a
possible regression in the fix — investigated before concluding anything,
and traced to the TEST's own mistake, not the code: `OrbitControls` here
has `enableRotate = (view === '3d')`, so a left-drag in 2D view is
correctly inert (real, confirmed via a real screenshot diff: left-drag
produces zero rendered change, right-drag and wheel-zoom both do). Redone
with a right-button drag (`OrbitControls`'s real pan button): labels
correctly changed. A resize was also confirmed to trigger a redraw.

**Disclosed, not chased further**: post-fix p95 (28.3ms) is still
modestly over the 25ms target. Further profiling traced the remainder to
`renderer.render()` itself (the only other per-frame call left) — real
WebGL draw-call/geometry cost for this scene, not a redundant call. Fixing
that would mean converting the zone-outline/grid line objects to
instanced/batched geometry, a real, larger rendering change out of
proportion to this phase's own audit/cleanup scope; recorded honestly as a
smaller, still-present cost rather than hidden or blindly attempted.

## Full regression (zero tolerated)

Existing EAP-specific suites, re-run this session, unaffected by the
`eap.html`/`eap.js`-only changes above:

| Suite | Result |
|---|---|
| `tests/unit/eap-map-wire.test.js` | 32 passed |
| `tests/lint/eap-node-model-contract.js` | 0 errors |
| `tests/playwright/eap-map-regression.js` (`EAP_URL` against disposable) | 0 failures — includes real 4-viewport rendering, all 210 cells reachable, no horizontal overflow, no console/page errors |
| `tests/playwright/eap-canonical-route-regression.js` | 0 failures — confirms `/`, `/index.html`, `/eap.html` all still serve the right page with the right globals |

Physical-twin/LDI suites (this phase's own explicit "no regression"
requirement), all re-run, all unaffected (no server-side, schema, or
LDI-domain file was touched this phase):

`mapping` 36/36, `telemetry` 29/29, `alarm` 37/37, `analytics` 25/25,
`wire` 96/96, `spc` 42/42, `predictive` 43/43,
`floor1-geometry-validator`/`floor1-orientation`/`floor1-cad-reconciliation`
all PASSED.

## Real production verification (fresh-tab methodology)

Deployed; real authenticated Playwright session against
`http://localhost:3000/factory-twin-3d/eap.html`:

- 0 console/page errors.
- 0 axe violations, post-fix (re-scanned live, not just on the disposable
  container).
- Real click-picking confirmed working post-fix: a real click resolved a
  real cell (`EAP-F1-0041`, `DIRECT`, reference label `141`, unit
  `MU-F1-0101`).
- Payload sizes, real: `/api/eap-map` 311,494 bytes, `/api/floor-geometry`
  734,887 bytes (shared with the physical twin, unchanged).
- No LDI-service dependency for interactive-readiness: `window.__eap`
  becomes available from exactly two fetches (`api/eap-map`,
  `api/floor-geometry`), neither of which touches `/api/state`,
  `/api/spc`, `/api/predictive*`, or `/api/alarm-rca`.

## Final gate

| Area | Result | Status |
|---|---|---|
| CAD geometry | Reused unchanged from `/api/floor-geometry`; zero redraw, zero modification | PASS |
| EAP positioning | 40 DIRECT/STRUCTURAL (real world coords), 167 SET_LEVEL (zone-region only), 3 neither -- all disclosed, no survey-grade claim on the 167 | PASS |
| Room/wall accuracy | No room polygon exists or is fabricated; zone outlines explicitly labelled as bounding extents, not rooms | PASS (honest, not fabricated) |
| Operational states | RUN/IDLE/DOWN/OFF/INITIAL/PM/STOP/UNDEFINED, shared vocabulary with the physical twin (`operational-status.js`), never merged/renamed | PASS |
| LDI coupling | Zero references in code (2-3 hits per file, all in disclosure comments); confirmed by dedicated regression assertions | **NONE** |
| Data lineage | Fully traced, `EAP_DATA_LINEAGE.md` | PASS |
| Accessibility | 4 real violations found (never previously audited), all 4 fixed, 0 violations after, all 4 viewports + real production | PASS |
| 4-view responsive | 1366x768 / 1920x1080 / 2560x1440 / 3840x2160, all cells reachable, no overflow (existing regression, re-verified) | PASS |
| Interactive-ready | No LDI-service dependency confirmed; two fetches only | PASS |
| Regression | EAP suites + full physical-twin/LDI suites, 0 failures | PASS |
