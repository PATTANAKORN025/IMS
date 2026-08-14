# Future Analytics — Roadmap Concepts (Not Implemented)

> Everything in this document is a **roadmap idea**, not a shipped capability.
> Nothing here is wired into any dashboard, migration, or the simulator. If a
> section here starts getting real SQL/panels behind it, move that content
> out of this file and into the relevant dashboard/migration docs — this
> file is only for concepts that are _not yet real_, so it never becomes a
> second source of truth for something that already exists.

## Why this file exists

`ims-ldi-engineering-analytics.json`'s "Advanced Diagnostics" row was
originally titled "<img src="docs/assets/icons/target.svg" width="18" height="18" align="center" /> AI-Assisted Advanced Diagnostics (Predictive & RCA)",
with a sub-panel subtitled "(Predictive Drift)" and a description claiming
the panel was "for predictive analytics." None of that was true: the panel
is a rolling simple moving average against dynamic control limits (rolling
mean ± 3σ) and a Dual-CUSUM/Nelson-Rule-1 violation flag — both are
standard, textbook SPC techniques computed directly from live telemetry.
No model is trained, nothing is forecast, and no AI/ML library or service
is anywhere in this stack. The row was renamed to "Advanced Diagnostics
(Correlation & SPC)", a disclaimer panel was added directly under it, and
the "AI-assisted"/"predictive" _concept_ — which is a reasonable thing to
eventually build — was moved here instead of being deleted outright.

## Concept: real predictive drift detection

What today's "Dynamic Moving Average Trend" panel does _not_ do, but a
genuinely predictive version could:

- Fit a simple forecasting model (e.g. exponential smoothing or a linear
  trend extrapolation) over each machine's rolling PE/JE window and project
  where the next N samples are likely to land relative to the dynamic
  control limits, surfacing "will breach spec in ~X minutes at current
  drift rate" instead of only "is currently breaching."
- Would need: a defined confidence interval on the forecast (not just a
  point estimate), a documented minimum sample size below which the
  forecast is suppressed rather than shown with false precision, and a
  visible distinction in the UI between "measured" and "forecast" data
  points (e.g. a dashed continuation of the line, never the same solid
  style as real telemetry).
- Explicitly out of scope for a first version: any model requiring offline
  training, a separate model-serving process, or an ML framework
  dependency — this stack has none of that infrastructure today, and
  adding it is a separate architectural decision, not a dashboard change.

## Concept: real anomaly/AI scoring

An "AI Score" or "Predictive Score" widget would need, before it could
honestly ship:

- A concrete, named model or statistical method (e.g. isolation forest,
  z-score ensemble, a specific control-chart-pattern classifier) — "AI"
  alone is not a method.
- A validation methodology equivalent to `tests/e2e/golden-dataset-spc.js`
  for the existing Cpk formulas: a golden dataset with a hand-computed
  expected score, checked in CI, so the score can't silently drift or
  become meaningless after a refactor.
- A clear, dashboard-visible explanation of what the score means and what
  action threshold it maps to — a bare number with no defined meaning is
  worse than no widget at all.

## Concept: RCA correlation beyond what exists today

The current RCA correlation work (`v_ldi_rca_recent_window`,
`v_ldi_rca_truth_test`, migrations 050/064) already computes real
alarm-category-vs-baseline lift ratios with an explicit low-sample-size
confidence flag (`n < 30` → `LOW SAMPLE`). A future extension worth
considering:

- Multi-factor correlation (e.g. temperature _and_ vacuum jointly, not
  each baseline computed independently) — meaningfully harder than the
  current single-factor lift calculation, and needs its own validation
  approach before it ships.
- Time-lagged correlation (does a vacuum drop N minutes _before_ an alarm
  correlate more strongly than a concurrent one) — would need a new
  golden-dataset-style test proving the lag window itself is measuring
  something real, not an artifact of the query's own bucketing.

## Ground rules for anything promoted out of this file

Before any concept above (or a new one) moves from "idea in this doc" to
"real panel," it needs:

1. A real, named computation — not marketing language ("AI-assisted",
   "predictive", "smart") standing in for an actual method.
2. A validation test (golden dataset or equivalent) checked into CI,
   matching the bar `tests/e2e/golden-dataset-spc.js` already sets for
   every other SPC/Cpk calculation in this repo.
3. Visible, honest framing in the dashboard itself of what the number is
   and isn't (measured vs. forecast, validated vs. low-confidence) — the
   same standard already applied to `v_ldi_rca_truth_test`'s confidence
   flag and the Action Queue's Owner-mapping disclosure.
