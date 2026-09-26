# FT-21 — SPC Validation Evidence

Every claim below traces to a real test run, a real curl/fetch against a
disposable container with the real production DB mounted, or a real
Playwright browser session. No number here is estimated.

## Unit tests (synthetic fixtures, as this phase's own instructions require)

`node tests/unit/factory-twin-spc.test.js` — **42 passed, 0 failed.**
Covers: `mean`/`sampleStddev` (including the golden-dataset cross-check),
`computeCpk` (golden-dataset PE and JE match to 1e-9, `worstCpk`, sample
sufficiency at n=30, no-tolerance → UNAVAILABLE, zero-variance → null Cpk
not Infinity), `stabilityStateForCpk` (all 4 states, exact documented
thresholds), `computeEwma` (stable process never signals, a real +3
sustained shift is detected, insufficient-data gate), `computeCusum`
(stable stays near zero, sustained up/down shifts both signal), all 8
`evaluateNelsonRules` checked individually plus a genuinely stable
fixture producing zero violations (after one self-caught test-fixture
bug — see below), drift velocity (flat = 0, steady ramp = exact known
slope, accelerating drift correctly flagged, insufficient-data gate),
and `isValidSpcMetric` (PE/JE/real AVG_METRICS accepted, a SQL-injection
attempt and empty/null rejected).

### Golden-dataset cross-check — the strongest evidence in this suite

`computeCpk({values: PE_VALUES, tolerance: PE_SETTING})` and the JE
equivalent were asserted against `tests/e2e/golden-dataset-spc.js`'s own
`PE_VALUES`/`JE_VALUES`/`PE_SETTING`/`JE_SETTING` fixture and its own
independently-computed expected Cpk — the SAME ground truth all 5
existing dashboard/view implementations are already checked against.
Match: exact to `1e-9`, not "close enough."

### A self-caught test bug, disclosed rather than hidden

An initial Nelson-rule "genuinely stable" fixture was a tight,
deterministic sawtooth (alternating ±0.1 around the mean) — it FAILED,
correctly, because it is a textbook example of rules 4 (alternating) and
7 (hugging one narrow band), which are exactly what those rules exist to
detect. This was the TEST's own error, not the code's: replaced with a
genuinely irregular, non-alternating, non-narrow-band fixture, confirmed
empirically to trigger zero rules before being committed to the suite.

## Real production-data verification (disposable container, real DB, real geometry mount)

Built `ims-factory-twin-3d:ft21` from this phase's exact source, run
against the real production database (`grafana_reader`, read-only) and
the real private-geometry bind mount, on a disposable port — never
touching production until every gate below passed.

| Check | Result |
|---|---|
| `PE` on `LDI-01`, 6h | `sample_count: 0` (honest — no PE readings for this device in this window), `cpk.quality: UNAVAILABLE`, no fabricated number |
| `JE` on `LDI-01`, 1h | `sample_count: 597` rows, `cpk.n: 2388` pooled readings, `Cpk: 3.03`, `CAPABLE`, `quality: VALID` |
| `temperature` on `LDI-01`, 6h | `sample_count: 2347+`, `Cpk: UNAVAILABLE` (no tolerance column, correctly not fabricated), EWMA/CUSUM/Nelson/drift all real and computed |
| Invalid metric | `400`, real `valid_metrics` list (`PE`, `JE`, plus all `AVG_METRICS`) |
| Range > 6h (24h requested) | `400`, explicit "SPC requires individual raw samples... 6h" reason, `max_supported_range: "6h"` |
| Unknown `device_id` | `404`, `device not found` |

## The multi-rule-violation finding — investigated, not dismissed

Real `JE`/`temperature` queries at 1h/6h triggered 5-6 Nelson rules
simultaneously, including the seemingly-contradictory pair 7 (tight
clustering) and 8 (spread, none within 1-sigma). Rather than assume this
was a bug, it was tested at 15m (a shorter, more likely homogeneous
window) on the SAME device/metric: **only rule 1 fired.** This confirms
the multi-rule firing at 1h/6h is a real property of this phase's own
disclosed Phase I (self-referential) baseline convention — a longer
window spanning a real recipe/product change legitimately looks
heterogeneous relative to its own computed mean/sigma, and rule 8
specifically exists to flag exactly that kind of mixture. Not
"fixed" (there is nothing wrong to fix); documented plainly in
`SPC_SPEC.md`'s baseline-definition section instead.

## Real browser verification (Playwright, disposable container)

- **End-to-end panel flow:** open drawer → expand IMS devices → click a
  device's History → expand the SPC panel (lazy fetch fires) → switch
  metric (PE/JE/temperature) → switch range (15m/1h/6h) → each produces
  the correct, freshly-fetched real result text. 0 runtime/console
  errors across the whole flow.
- **Keyboard:** the 1h range button, activated via `.focus()` +
  `Enter` (not a mouse click), correctly updates `aria-pressed` and
  re-fetches.
- **Request discipline (Phase 4):** exactly 1 `/api/spc` request fires
  on opening the panel; a full 5-second `/api/state` poll cycle passing
  afterward produces zero additional `/api/spc` requests — confirmed via
  real Playwright request-log instrumentation, not assumed from reading
  the code. SPC is on-demand only, never on the poll interval.
- **Accessibility (axe-core 4.9.1), all 4 target viewports (1366x768,
  1920x1080, 2560x1440, 3840x2160): 0 violations**, after finding and
  fixing 2 real pre-existing/newly-introduced defects this phase's own
  testing surfaced (neither caused by SPC's core logic, both real):
  1. `color-contrast` (serious) on the drawer's status LEGEND
     (`.st-off`/`.st-na`) — a whole-element `opacity: .45` crushing label
     text to ~2.3-3.8:1. A different class family from FT-18's `.ss-off`
     fix (topbar strip vs. drawer legend), never audited before. Fixed
     with the same pattern: dim only the decorative glyph.
  2. `select-name` (critical) on BOTH `#history-metric` (pre-existing
     since FT-17) and this phase's own new `#spc-metric` — neither
     `<select>` had an accessible name. Fixed with a real `aria-label`
     on both.

## Full regression (zero tolerated)

`mapping` 36/36, `telemetry` 29/29, `alarm` 37/37, `analytics` 25/25,
`wire` 96/96, `spc` 42/42 (new), `floor1-geometry-validator`/
`floor1-orientation`/`floor1-cad-reconciliation` all PASSED, unchanged —
confirming this phase touched no geometry, mapping, or DB schema.
