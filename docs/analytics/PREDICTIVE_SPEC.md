# FT-22 — Predictive Process Intelligence (Factory Twin)

`services/factory-twin-3d/lib/predictive.js`, `GET /api/predictive`,
`GET /api/predictive/risk-ranking`, and an extension of the existing
device-history drawer's SPC panel. Scoped to Factory Twin only, per this
engagement's standing rule — Grafana/Andon untouched.

## Why this is not a new statistics engine

Every number in a predictive response traces to one of `lib/spc.js`'s
already-verified primitives: `computeCpk`, `computeEwma`, `computeCusum`,
`evaluateNelsonRules`, `computeDriftVelocity`. This module adds no new Cpk
formula (still [[FT-21's own disclosure|SPC_SPEC.md]] — a 6th instance of the
plant's one Cpk formula, not a 6th different one) and no opaque classifier.
What it adds, composing only from those existing outputs:

1. **A canonical response contract** (Phase 1) so a caller reads one shape
   instead of five separate objects.
2. **Drift intelligence** (Phase 2): EWMA + CUSUM + Nelson rules + OLS drift
   velocity synthesized into one direction/velocity/persistence verdict,
   with every claim named in `evidence`.
3. **Capability trajectory, Cpk(t)** (Phase 3): the SAME rows already
   fetched for the whole-window Cpk, re-sliced into 5 equal time buckets and
   run through the SAME `computeCpk` — no second query.
4. **Mixed-baseline detection** (Phase 4): a two-sample z-test between the
   window's first and second half, plus the real Nelson-7-and-8-co-firing
   pattern FT-21's own validation found — never suppresses a real
   violation, only adds an honest "this window might not be one process"
   flag alongside it.
5. **Risk prioritization** (Phase 5): a deterministic rule table over
   evidence already computed above — no weights tuned against data, no
   score that can't be read back to a named signal.
6. **Traceability** (Phase 6): every field in `calculated`/`risk.evidence`
   names the exact rule, sample index, or window it came from; every
   response carries `source_event` (device, metric, table, rows scanned,
   last row time).
7. **A disclosed forecast** (the objective's own explicit rule — "never
   present forecasts as facts"): one OLS extrapolation, one bucket-width
   past the trajectory already shown, always labeled `type: 'FORECAST'`,
   always names its method, capped at `MEDIUM` confidence — never `HIGH`.

## Canonical contract (Phase 1)

```
GET /api/predictive?device_id=<id>&metric=<PE|JE|AVG_METRICS>&range=<15m|1h|6h>
```

```json
{
  "metric": "JE",
  "window": { "from": "...", "to": "...", "sample_count": 548 },
  "quality_state": "VALID",
  "baseline": { "definition": "...", "mean": 5.97, "stddev": 1.02, "tolerance": 6.0 },
  "observed": { "last_valid_sample": "...", "freshness": "LIVE", "row_limit_hit": false },
  "calculated": {
    "cpk": { "...": "same shape lib/spc.js's computeCpk already returns" },
    "control_limits": { "ewma": {...}, "cusum": {...} },
    "signals": { "nelson_violations": [...], "cusum_points": [...], "ewma_points": [...] },
    "trend": { "capability_trajectory": { "points": [...], "classification": "stable", "slopePerHour": 0.01 } },
    "drift": { "direction": "up", "velocity_per_hour": 0.05, "persistence": "transient", "evidence": [...], "quality_state": "VALID" },
    "mixed_baseline": { "heterogeneity_detected": false, "change_point_index": null, "two_sample_z": null, "evidence": [] },
    "risk": { "level": "LOW", "evidence": [...] }
  },
  "forecast": { "type": "FORECAST", "next_window_cpk_estimate": 6.33, "method": "...", "confidence": "MEDIUM" },
  "confidence": { "level": "HIGH", "reasons": [...] },
  "source_event": { "device_id": "LDI-02", "metric": "JE", "table": "public.ldi_data", "rows_scanned": 548, "last_row_time": "..." }
}
```

`observed` / `calculated` / `forecast` are the three top-level groups the
UI renders as visually and semantically distinct blocks — never merged,
never let a forecast value sit next to an observed one without its own
label.

## Data source, scope boundary, freshness — reused, not reinvented

- Same raw-`ldi_data`-only, ≤6h boundary `lib/analytics.js`'s
  `extendedStatsAvailable()` already enforces (see `SPC_SPEC.md`) — reused
  verbatim via the same `validateSpcRequest()` both `/api/spc` and
  `/api/predictive` now share.
- Same `SPC_ROW_LIMIT` (5000) bound on the raw scan.
- **Freshness/staleness**: the plant's own existing 5-minute convention
  (migration 052's `is_stale`, `lib/telemetry.js`'s `Freshness` enum) reused
  verbatim as `STALE_THRESHOLD_MS` — not a second staleness number.
  `capability_trajectory.classification` reports `STALE` (rather than
  `stable`/`improving`/`declining`) whenever the window's last real sample
  is already older than that threshold vs. now — a trend computed from data
  that stopped arriving is not a live trend.

## Capability trajectory (Phase 3) — Cpk(t)

5 equal time buckets across the requested window, each bucket's own pooled
readings run through `spc.computeCpk` — the classical "did capability move
within this window" question, not a new formula. Classification:

- `UNAVAILABLE` — no tolerance recorded anywhere in the window (same
  as the whole-window Cpk's own UNAVAILABLE case).
- `STALE` — last sample older than the 5-minute threshold vs. now.
- `INSUFFICIENT_DATA` — fewer than 2 buckets produced a valid Cpk.
- `stable` / `improving` / `declining` — otherwise, from the first vs. last
  *valid* bucket's Cpk. **Both** a relative (≥10%) and an absolute (≥0.10
  Cpk-unit) change are required together — a new, disclosed threshold (no
  prior plant document defines "how much Cpk change is a real trend",
  because nothing computed a trajectory before this phase). Requiring both
  bounds avoids two real failure modes found during testing: a huge-Cpk
  process (e.g. Cpk 20+, near-zero sigma) where a trivial 0.15 wobble is
  0.7% relative but ≥0.10 absolute (would wrongly read as "improving" on
  the absolute bound alone), and a near-zero-Cpk process where a tiny 0.04
  absolute move is a 400% relative swing (would wrongly read as
  meaningful on the relative bound alone).

## Drift intelligence (Phase 2)

- **direction**: sign of the OLS drift velocity, with a dead zone at 5% of
  one EWMA sigma/hour (a new, disclosed threshold — nothing previously
  defined "flat" for a slope) so float noise around a genuinely flat
  process never reads as up/down.
- **velocity_per_hour**: `spc.computeDriftVelocity`'s own value, unchanged.
- **persistence**: `sustained` if ≥60% of the last 10 CUSUM points are
  still signaling, `transient` if a signal fired and cleared, `none` if it
  never fired. Real, tested consequence of `lib/spc.js`'s own documented
  design (no FIR/reset-to-zero applied to CUSUM): a short shift followed by
  a short reversion can still read `sustained` at the tail, because the
  running C+/C- has not had time to decay back under `h` — this is
  expected CUSUM behavior, not a defect (see `PREDICTIVE_VALIDATION.md`).
- **evidence**: one line per contributing signal (OLS velocity, EWMA
  out-of-control count, CUSUM signal + its own persistence verdict, every
  Nelson-rule violation by number and name) — never a summary that can't be
  traced back to the exact primitive that produced it.

## Mixed-baseline detection (Phase 4)

Two independent, disclosed signals, never suppressing a real Nelson
violation:

1. **Nelson rules 7 and 8 co-firing** — the exact real pattern FT-21's own
   validation found (`SPC_VALIDATION.md`) as evidence of a window spanning
   more than one real process population.
2. **Front-half vs. back-half two-sample z-test**, flagged past
   `MIXED_BASELINE_Z_THRESHOLD = 3` — this codebase's own recurring
   3-sigma convention (EWMA's `L`, Nelson rule 1), not a new number.
   When both halves have zero variance individually (perfectly flat
   sub-populations at different levels — a real edge case found during
   testing, not a hypothetical), the standard z formula's denominator is
   zero; that case is treated as maximally significant (saturated at
   ±1e6, not `null`) rather than silently reported as "no evidence" —
   `null` there would have inverted the most extreme case into no signal.

`change_point_index`/`change_point_timestamp` reuse the SAME
`spc.computeCusum` output already computed for drift intelligence — the
first sample where the running statistic crosses its own decision
interval — not a second change-point algorithm.

## Risk prioritization (Phase 5) and traceability (Phase 6)

`RiskLevel`: `NONE` / `LOW` / `MEDIUM` / `HIGH` — genuinely new vocabulary
for this phase's own synthesized signal (not a replacement for the plant's
`StabilityState`, which remains authoritative for what Cpk itself means).
A deterministic rule table, never a tuned score:

- `HIGH`: Cpk state `INTERVENTION`, or `ASSESSMENT` + declining trajectory
  + sustained drift.
- `MEDIUM`: Cpk state `ASSESSMENT`, or a declining trajectory, or a
  mixed-baseline flag.
- `LOW`: Cpk `CAPABLE` but drift is non-flat or a Nelson rule fired.
- `NONE`: otherwise — **missing evidence never escalates risk on its own**;
  an `UNKNOWN`/`UNAVAILABLE` Cpk with no other signal is `NONE`, not a false
  alarm on absent data.

Every `risk.evidence` line, and every field in `calculated`, names the
exact metric/window/sample/rule it came from — no black-box result reaches
the UI without a named source.

## UI — five real questions, three visually distinct claims (Phase 7)

The existing SPC panel's single fetch moved from `/api/spc` to
`/api/predictive` (a strict superset — same call count, richer content).
Rendered as three blocks, each with its own left-border colour AND an
explicit `OBSERVED`/`CALCULATED`/`FORECAST` text label (never colour alone
— colour-contrast- and colour-blind-safe):

1. **Is the process stable?** — `OBSERVED` block: sample count, freshness,
   last-sample time. `CALCULATED` block: Cpk + trajectory classification.
2. **Is capability declining?** — trajectory classification, directly.
3. **Why?** — `risk.evidence`, one line per real signal.
4. **How strong is the evidence?** — `confidence.level` + `confidence.reasons`.
5. **What should I inspect next?** — the plant's own OCAP Stage 1/2 text
   (`SPC_NEXT_ACTION`, unchanged from FT-21), plus `risk.evidence` for what
   specifically triggered that stage this time.

A nested, separately-lazy **fleet risk ranking** sub-panel (`#fleet-risk-panel`)
answers "which machine needs attention first" across the whole fleet for
PE/JE (the only metrics with a real tolerance column) — closed by default,
its own fetch only on its own toggle, never fired by opening the panel
above it.

## Files

- `services/factory-twin-3d/lib/predictive.js` — pure, no I/O, mirrors
  `lib/spc.js`/`lib/analytics.js`/`lib/telemetry.js`'s own discipline.
- `services/factory-twin-3d/server.js` — `fetchSpcSeries()`/`validateSpcRequest()`
  extracted and shared by `/api/spc` (unchanged behavior) and the new
  `GET /api/predictive`; `GET /api/predictive/risk-ranking` (fleet-wide,
  one bounded query, not N per-device round trips).
- `services/factory-twin-3d/public/index.html`/`app.js` — the drawer
  panel extension + fleet-risk sub-panel.
- `tests/unit/factory-twin-predictive.test.js` — 27 tests, synthetic
  fixtures per this phase's own instruction.
