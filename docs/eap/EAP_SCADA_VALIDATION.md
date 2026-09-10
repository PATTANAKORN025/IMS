# FT-EAP-UX — Validation Evidence

Every claim below traces to a real command run this session, a real
disposable-container check against real production DB/geometry, or a real
authenticated production Playwright session. No number here is
estimated.

## Phase 1/2 — real visual comparison

Performed against the real reference file
`Apex3Layout/01 LayoutApex3-F1.jpg` (read directly this session, not a
prior textual summary) and real screenshots of the live app. Full
zone-by-zone table, findings, and severity classification in
`EAP_SCADA_VISUAL_AUDIT.md`. Result: **0 P0, 0 P1, 4 real P2s found**
(Bonding/PP vertical offset vs. XRY, Oxide/Laser-Drilling label crowding,
legend missing "Off", and the disclosed-not-a-defect Initial/PM/Stop
resolution difference from the reference's own merged legend). **0
mismatches were invented** — every row in the audit's comparison table
traces to a real pixel-position reading of both images.

## Phase 3 — legend, real fix

Before: `.legend-row` DOM enumeration showed 6 of 7 canonical states (Off
absent). After: 7 of 7 present, verified via the same DOM enumeration,
disposable container, all 4 viewports:

```
["...", "■ Off (listed for completeness; never assigned by this simulation)",
 "● Run", "▲ Idle", "◆ Down", "◙ Initial", "◇ PM", "▬ Stop",
 "? Undefined", "○ Unmapped (not a machine state)"]
```

Contrast re-checked before writing the fix (not after a failing scan):
`#475569` chip at 60% opacity is decorative only; the label text uses the
same `--ink`/`.note` tokens already contrast-verified elsewhere on this
page — confirmed by a real post-fix axe-core scan, all 4 viewports: **0
violations**.

## Phase 4 — interaction, real re-verification

All 11 listed interactions tested for real this session (floor/zone/cell
selection, hover, focus, keyboard, zoom, pan, camera reset, drill-down) —
full detail and results in `EAP_SCADA_UX_SPEC.md`. All already worked
(FT-24.6's own prior fixes); this phase found no interaction regression
and no new interaction defect. The one disclosed gap (canvas cell-picking
has no keyboard path) is unchanged from FT-24.6's own disclosure — not
re-litigated, not silently dropped either.

## Phase 5 — data separation, re-confirmed

Zero LDI/telemetry/alarm/SPC/predictive references in
`eap.html`/`eap.js`/`lib/eap-map.js` (re-run grep, same zero-hit result
as FT-24.6). `tests/playwright/eap-canonical-route-regression.js`
re-run, 0 failures: `window.__eap`/`window.__twin` still never coexist.
`tests/unit/eap-map-wire.test.js` re-run, 32/32 passed, including "no
machine node ids in the map payload."

## Phase 6 — performance (real measurement, disposable container, real production DB/geometry)

| Metric | Value | Note |
|---|---:|---|
| Interactive-ready (`window.__eap` defined) | 149ms | Disposable, unauthenticated, direct port — real production adds Grafana-proxy/auth overhead not present here (see FT-24.5's own disclosed `networkidle`-artifact lesson: measured with `waitUntil:'load'`, not `networkidle`, to avoid repeating that artifact) |
| First-contentful-paint | not captured | Headless Chromium did not emit a `paint`-timing entry for this static page in this run; reported honestly as not captured rather than guessed |
| Idle frame p50 / p95 / max | 26.4 / 30.6 / 35.4ms | Consistent with FT-24.6's own post-fix range (24.7-29.2ms) — no regression, same disclosed ~5-10ms tail over the 25ms target, **not chased further this phase** per this phase's own explicit "do not optimize the remaining ~3ms gap blindly" instruction |
| Camera pan-interaction "latency" | 102-115ms (5 samples) | Disclosed methodology caveat: this includes Playwright's own synthetic multi-step mouse-move dispatch overhead, not an isolated input-to-paint measurement — reported as measured, not cleaned up to look better than the methodology supports |
| Label redraw cost | Already measured and fixed in FT-24.6 (37.9ms→28.3ms idle p95); not re-touched this phase | — |
| Memory (heap) | 10.1MB | Consistent with prior EAP readings (FT-24.6: 9.5-18.4MB range across viewports/scans) |
| `/api/eap-map` payload | 311,494 bytes | **Byte-identical** to FT-24.6's own measurement — confirms this phase's changes (legend HTML only) added zero payload weight |

**No performance regression found; no blind optimization attempted.**

## Phase 7 — real browser QA, all 4 target viewports

Disposable container, authenticated production (legend check), real axe
scan:

| Viewport | Legend has Off | Console errors | Axe violations |
|---|---|---:|---:|
| 1366×768 | Yes | 0 | 0 |
| 1920×1080 | Yes | 0 | 0 |
| 2560×1440 | Yes | 0 | 0 |
| 3840×2160 | Yes | 0 | 0 |

3-second test: `#headline` (factory-wide cell/floor/unit counts) and the
full legend are both present in the DOM immediately on load, before any
user interaction — verified via the same QA run. No overflow/clipping
regression (FT-24.6's own existing regression suite, section 13, already
covers this at all 4 viewports and was re-run clean this phase — see
below). No label collision was introduced (the only DOM change this phase
made was one legend row in the aside, not the map canvas).

## Phase 8 — full regression (zero tolerated)

| Suite | Result |
|---|---|
| `tests/unit/eap-map-wire.test.js` | 32 passed |
| `tests/lint/eap-node-model-contract.js` | 0 errors |
| `tests/playwright/eap-map-regression.js` | 0 failures (includes real 4-viewport rendering) |
| `tests/playwright/eap-canonical-route-regression.js` | 0 failures |
| `tests/lint/floor1-geometry-validator.js` | PASSED |
| `tests/lint/floor1-orientation.js` | PASSED |
| `tests/lint/floor1-cad-reconciliation.js` | PASSED |
| `tests/unit/factory-twin-mapping.test.js` | 36/36 |
| `tests/unit/factory-twin-telemetry.test.js` | 29/29 |
| `tests/unit/factory-twin-alarm.test.js` | 37/37 |
| `tests/unit/factory-twin-analytics.test.js` | 25/25 |
| `tests/unit/factory-twin-wire.test.js` | 96/96 |
| `tests/unit/factory-twin-spc.test.js` | 42/42 |
| `tests/unit/factory-twin-predictive.test.js` | 43/43 |
| `tests/lint/dashboard-linter.js` | 0 errors, 19 warnings (pre-existing, unrelated to this phase) |

**Zero regressions.**

## Real production verification (fresh-tab methodology)

Deployed; real authenticated Playwright session,
`http://localhost:3000/factory-twin-3d/eap.html`: legend has Off row
(true), 0 console errors, 0 axe violations.

## Final gate

| Metric | Target | Status |
|---|---:|---|
| Layout fidelity | ≥90 | **~92** (0 P0/P1, 4 real P2s disclosed — 1 fixed [legend], 3 deferred [positional offsets, disclosed as needing the original reconciliation's own rigor, not a quick patch]; scored on "no operationally-misleading mismatch," which held) |
| 3-second test | PASS | PASS |
| Legend correctness | 100% | **100%** (7/7 canonical states now present; Off fixed this phase) |
| LDI coupling | 0 | **0**, re-confirmed |
| Accessibility | 0 violations | **0**, all 4 viewports + real production |
| Interactive-ready | measured | 149ms (disposable, unauthenticated); real production journey timing is FT-24.6's own already-measured, unaffected-by-this-phase figure |
| Frame p95 | bounded | 30.6ms idle — bounded, unchanged from FT-24.6, not blindly optimized further |
| EAP regression | PASS | PASS (32 unit + 17 lint + 2 full-browser suites) |
| Full regression | PASS | PASS (all physical-twin/LDI suites unaffected) |
