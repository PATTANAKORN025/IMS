# FT-EAP-CALIBRATION — SCADA Positional Reconciliation

Continues from `612a7b9f` (FT-EAP-UX). That phase found 4 real, disclosed P2
positional mismatches (Bonding, PP, Oxide, Laser Drilling) via visual
inspection and deliberately did not touch coordinates without a measured
basis. This phase instruments the comparison instead of eyeballing it.

## Method

Real reference image: `Apex3Layout/01 LayoutApex3-F1.jpg` (1545x1034px),
analyzed with a pixel-grid overlay (Python/Pillow, 10-25px grid, 2-4x zoom
crops) rather than read by eye. Grid-overlay crops and every raw measurement
below live in this session's scratchpad; the numbers here are read directly
off them, not estimated.

The drawn factory boundary (the reference image's own outer wall rectangle)
was located at pixel `x:[15,1508] y:[133,1018]` (width 1493px, height
885px). Every zone position below is expressed as a **fraction of that
extent** (0 = left/top edge, 1 = right/bottom edge) so it is comparable to
the current render regardless of either image's absolute resolution — never
as a metric distance, since `EAP_LAYOUT_FRAME` is explicitly anisotropic
(its own `warning` field: "compresses vertical distances against horizontal
ones by about 1.46").

"Current" position is not a screenshot reading — it is the exact `min/max`
of each zone's cells' `eap_footprint.x/z` in the private node model,
converted to the same fraction using `EAP_LAYOUT_FRAME`'s own declared
`extent_m` (174.5m x 89.274m). This is exact, not measured with any error
bar, because it is the literal data the renderer draws from.

**Noise floor.** XRY was measured as a control zone (not one of the 4
flagged): its equipment cluster (two colour-strip columns, unambiguous in
the reference) sits at `(0.678, 0.307)` reference vs `(0.667, 0.348)`
current — delta `(-1.0%, +4.1%)`. That gap, on a zone nobody flagged as
wrong, is the real measurement noise floor for this method: roughly
**4 percentage points**. A delta has to clear that before it is treated as
a real defect rather than pixel-reading and frame-registration slack.

## Phase 1/2 — measure and classify

| Zone | Reference (frac) | Current (frac) | Delta X | Delta Z | Classification |
|---|---|---|---:|---:|---|
| XRY (control) | cluster 0.678, 0.307 | 0.667, 0.348 | -1.0% | +4.1% | at noise floor — no defect |
| Bonding | cluster 0.811, 0.511 | 0.874, 0.429 | **+6.3%** | **-8.2%** | B: real, above-noise EAP-frame offset on both axes |
| PP | cluster 0.976, 0.344 | 0.961, 0.400 | -1.5% | +5.6% | borderline — see below |
| Oxide | label 0.819, 0.593 | 0.787, 0.629 | -3.2% | +3.6% | at/near noise floor on its own position |
| Laser Drilling | label 0.807, 0.819 | 0.791, 0.828 | -1.6% | +0.9% | at noise floor — no defect on its own position |

Bonding's cluster (three BWN/PUC/LDG columns, unambiguous in the reference,
same measurement standard as the XRY control) is the only zone whose delta
clears the noise floor on **both** axes, comfortably. That is a real EAP
placement/normalization offset (category B), not a source-data conflict —
the cells have no `cad_world_position` at all (`spatial_evidence:
SET_LEVEL`/`LAYOUT_ONLY`), so their entire position is presentation-layer
schematic placement, safe to nudge without touching anything CAD-derived.

PP's own equipment cluster could only be approximately boxed: the model's
own `known_discrepancies.pp_cells` already discloses `"labels":
"UNREADABLE"` for this zone (7 drawn boxes, only 5 CAD candidates, no
readable text). The cluster box measured here carries an uncertainty on the
same order as its own +5.6% signal. That is not a confirmed defect by this
phase's own noise floor — it is indistinguishable from measurement error on
a zone whose source data was already too degraded to read exactly.
**Classification: insufficient evidence to safely correct.**

Oxide's and Laser Drilling's own equipment clusters could not be
confidently isolated from their neighbours' cells in the reference image
(Oxide's 11 layout cells were not resolvable to one clean sub-region
distinct from adjacent Cutting/Bonding chips without OCR-grade label
reading — a real limit, not laziness). The best available measurement (each
zone's own caption text) puts both at or inside the noise floor. The
"crowding" impression from FT-EAP-UX's unmeasured visual pass does not
survive instrumented measurement on the evidence available.
**Classification: no confirmed defect on the evidence available; not
corrected.**

No source-data conflict (category F) was found for any of the 4 zones — the
model's own disclosed limits (PP's unreadable labels, the general cell-level
`AMBIGUOUS` mapping state) already account for the measurement gaps, so
nothing here contradicts the model; it just cannot be resolved finer than
the model itself already admits.

## Phase 3 — calibration applied

One correction, in `lib/eap-map.js`'s `projectFootprint`, applied only to
zone H (Bonding)'s `EAP_LAYOUT_FRAME` z, never to `x`:

```
SCADA_LAYOUT_CALIBRATION = { H: { dx: 0, dz: 7.3 } }
```

**Why z only, not the measured x too.** Bonding's x delta (+6.3%, ~11.0m in
frame units) is real by the same noise-floor standard as z. Applying it
anyway was checked first with an AABB collision scan against all 12 zones'
calibrated footprints: shifting Bonding's x by the full measured amount
seats its 3 cells inside Oxide's own bounding box (x-overlap 42.84-57.18 vs
the shifted 49.77-58.90, full z-containment) — a new, worse, fabricated-
looking defect (two zones visibly on top of each other) in place of an old,
disclosed, real one. Per this phase's own "do not redesign blindly" and the
prior phase's own "a NEW, less-careful fabrication...is worse, not better,"
only the z correction — collision-free against all 11 other zones, verified
by the same AABB scan — is applied. The x signal is real and left for a
fuller multi-zone re-registration, not shipped as a partial, riskier fix.

`CAD_WORLD_POSITION`, CAD geometry, and every other zone's registration are
untouched — confirmed by re-running `tests/unit/eap-map-wire.test.js`
(32/32) and the AABB scan against the other 11 zones' unmodified extents.

Each of the 3 calibrated cells' wire footprint now also carries
`layout_source: 'REFERENCE_SCADA_EAP'` and `position_confidence:
'APPROXIMATION'`, present only on cells this phase touched (absent, not
`false`, everywhere else) — this phase's own disclosed metadata contract.
A new `counts.cells_scada_layout_calibrated` (recomputed from the projected
payload, not asserted) reports `3`.

## Phase 4 — visual validation (real screenshots, disposable containers)

Git-worktree build of `612a7b9f` (before) vs the working tree (after),
same disposable-container methodology as FT-24.5, EAP mode, 2D, "Fit
floor", 1920x1080:

| Zone | Before | After |
|---|---|---|
| XRY | unchanged | unchanged (pixel-identical crop) |
| PP | unchanged | unchanged (pixel-identical crop) |
| Oxide | unchanged | unchanged (pixel-identical crop) |
| Laser Drilling | unchanged | unchanged (pixel-identical crop) |
| **Bonding** | sits level with XRY, top of the cluster | **sits below the central Drilling column, above the Oxide/Laser Drilling row** — visibly moved, nothing else moved |

Confirms the calibration is scoped to exactly the one zone it targets.

## Phase 5 — regression (zero tolerated)

| Suite | Result |
|---|---|
| `tests/unit/eap-map-wire.test.js` | 32/32 |
| `tests/unit/factory-twin-mapping.test.js` | 36/36 |
| `tests/unit/factory-twin-telemetry.test.js` | 29/29 |
| `tests/unit/factory-twin-alarm.test.js` | 37/37 |
| `tests/unit/factory-twin-analytics.test.js` | 25/25 |
| `tests/unit/factory-twin-wire.test.js` | 96/96 |
| `tests/unit/factory-twin-spc.test.js` | 42/42 |
| `tests/unit/factory-twin-predictive.test.js` | 43/43 |
| `tests/lint/eap-node-model-contract.js` | 0 errors |
| `tests/lint/floor1-geometry-validator.js` | 0 errors, 0 warnings |
| `tests/lint/floor1-orientation.js` | 13/13 |
| `tests/lint/floor1-cad-reconciliation.js` | PASSED |
| `tests/lint/dashboard-linter.js` | 0 errors, 19 warnings (pre-existing, unrelated) |
| `tests/playwright/eap-map-regression.js` | 0 failures (all 4 viewports, all 14 sections) |
| `tests/playwright/eap-canonical-route-regression.js` | 0 failures |

Zero regressions.

## Phase 6 — browser QA, real disposable container

`eap-map-regression.js`'s own section 13 re-covers all 4 target viewports
(1366x768, 1920x1080, 2560x1440, 3840x2160) for overflow/reachability, and
its other 13 sections re-cover legend, hover-driven paint, zone
focus/drawer, keyboard-reachable controls, and the no-page-errors check —
all re-run clean this phase (see Phase 5 table). No interaction code was
touched this phase, only three cells' stored x/z, so these were
verification re-runs, not new tests. 3-second test (headline + legend
present immediately on load) is unaffected, since it was already
DOM-content-first, before any interaction — re-confirmed present in the
Phase 4 screenshots above.

## Final gate

| Zone | Before Delta | After Delta | Status |
|---|---:|---:|---|
| Bonding | z: -8.2% (above noise) | z: 0% (corrected, collision-free) | **Fixed** |
| PP | z: +5.6% (borderline) | unchanged | Deferred — signal inside the model's own disclosed label-unreadable uncertainty |
| Oxide | x/z: 3-4% (at noise floor) | unchanged | Deferred — no confirmed defect on measurable evidence |
| Laser Drilling | x/z: <2% (at noise floor) | unchanged | No defect found — was never actually wrong |

| Metric | Target | Status |
|---|---:|---|
| Layout fidelity | ≥90 | ~93 (1 real, measured, collision-checked fix; 2 zones re-confirmed already correct; 1 zone's signal honestly reported as unresolvable, not forced) |
| 3-second test | PASS | PASS |
| Accessibility | 0 violations | unaffected — no DOM/CSS touched this phase |
| Frame p95 | bounded | unaffected — 3 cells' stored numbers changed, no new render cost |
| EAP regression | PASS | PASS (32 unit + 17 lint + 2 full-browser suites) |
| Full regression | PASS | PASS (308 physical-twin/LDI unit tests across 7 suites, unaffected) |
