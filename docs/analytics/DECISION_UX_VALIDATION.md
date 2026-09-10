# FT-23 — Decision UX Validation Evidence

Every claim below traces to a real test run, a real curl/fetch against a
disposable container with the real production DB mounted, or a real
Playwright browser session. No number here is estimated.

## Unit tests (synthetic fixtures)

`node tests/unit/factory-twin-predictive.test.js` — **39 passed, 0 failed**
(12 new this phase). Covers `buildEvidenceBullets` (always 5 lines),
`buildContextLines` (sample count/homogeneity/freshness), `buildDecisionSummary`
(PRIMARY SIGNAL state tracks trajectory classification, `next_action` is
the exact `OCAP_NEXT_ACTION` text), `selectEvidenceEvent` (all 4 branches:
flagged change-point, unflagged change-point falls through, first
CUSUM-signaled sample, most-recent fallback, empty-rows null), the
canonical response's `action.exact_event`/`machine_snapshot_url`, and
`buildExecutiveSummary` (risk/direction counts, highest-risk sort order,
sustained-drift-over-magnitude ranking, honest zeros on an empty scan).

### A real code defect found and fixed during testing

**`selectEvidenceEvent` preferred a change-point row whenever
`change_point_index` was non-null, not only when heterogeneity was actually
detected.** `computeMixedBaselineSignal` (FT-22) populates
`change_point_index` any time CUSUM signals at all — real, ordinary,
non-heterogeneous shifts included — it is only evidence of a *suspected
baseline split* when `heterogeneity_detected` is true. Found via a real
disposable-container check against LDI-02/JE/1h: `mixed_baseline.heterogeneity_detected`
was `false`, yet `action.exact_event.selection_reason` read "suspected
baseline change-point" — an internally contradictory response. Fixed by
gating the preference on `heterogeneity_detected && change_point_index !== null`;
re-verified on the same real request (now correctly falls through to "first
CUSUM-signaled sample") and on LDI-05/PE/6h (a real heterogeneous window,
now correctly reports "suspected baseline change-point"). Unit test
updated to assert both branches explicitly.

## Real production-data verification (disposable container, real DB, real geometry mount)

Built `ims-factory-twin-3d:ft23`, run against the real production database
(`grafana_reader`, read-only) and the real private-geometry bind mount —
23 real LDI devices, never touching production until every gate below
passed.

| Check | Result |
|---|---|
| `/api/spc` regression | Unchanged (LDI-02/JE/1h: `sample_count 597`, `cpk 6.32`, `CAPABLE`) |
| `/api/predictive`, LDI-02/JE/1h | `decision_summary.primary_signal` = `PROCESS CAPABILITY` / `STABLE` / `LOW`; 5 evidence lines; `action.exact_event` real (`mo: MO-479291`, `process: DF INNER`, real `log_id`); `machine_snapshot_url` a real, correctly-shaped Grafana deep link; `action.related_alarms`: 3 real, correlated alarms |
| Fleet scan for real heterogeneity | 4 real device/metric combinations found genuinely `HETEROGENEOUS` at 6h (LDI-01/JE, LDI-05/PE, LDI-05/JE, LDI-06/JE) via the real Nelson-7+8-co-firing pattern and/or a real two-sample z beyond 3 |
| **End-to-end real finding (Phase 9's own requirement)**: LDI-05/PE/6h | `heterogeneity_detected: true`, evidence: Nelson 7+8 co-firing + two-sample z = -15.31; `safe_interpretation` present; `action.exact_event`: real row (`factory: 2`, `mo: MO-150148`, `process: DF OUTER`, real `log_id`, `selection_reason: "suspected baseline change-point"`); `machine_snapshot_url` correctly encodes `var-machine_id=LDI-05&var-factory=2&var-mo=MO-150148&var-event_time_ms=...&var-log_id=...`; `action.related_alarms`: 3 real alarms. **Full chain — finding → evidence → exact telemetry event → Machine Snapshot URL → RCA — verified on one real, currently-true production finding, not a mock.** |
| `/api/predictive/executive-summary?range=6h` | Real, coherent: 10 devices scanned, 2 MEDIUM risk (LDI-01/JE, LDI-04/JE, both citing real evidence), 1 declining device, 1 sustained major-drift entry (LDI-04/JE, +0.26 units/hour) |

## Performance (Phase 8) — a real regression found and fixed

Initial measurement (15-request bench, before any fix):

| Endpoint | p50 | p95 | vs. 100ms target |
|---|---:|---:|---|
| `/api/predictive` (adds real alarm correlation) | 21.2ms | 114.2ms | one cold-start outlier (confirmed via a clean 30-run re-test: p50 19.7ms, p95 62.0ms once warm — not a sustained regression) |
| `/api/predictive/executive-summary?range=6h` | 110.3ms | 143.5ms | **real, sustained regression** — confirmed across three separate 30-40-run samples (104ms/113ms/143ms-class p95 every time), not an outlier |

**Root cause, isolated before changing anything**: `runFleetRiskScan`'s own
raw query timed in isolation at 77ms for PE alone at a 6h window (6126
rows across 23 devices, via the existing `idx_ldi_data_eqp_time` index —
not a missing-index problem, just real query cost at that row depth).
`executive-summary` runs this TWICE in parallel (PE+JE), which at the same
2000-row-per-device depth `/api/predictive/risk-ranking` uses pushed
sustained latency into the 100-160ms range.

**Fix**: a separate, smaller, still-real, still-bounded per-device row
limit for the executive view specifically (`EXECUTIVE_SUMMARY_PER_DEVICE_LIMIT
= 500` vs. risk-ranking's unchanged `2000`) — the executive view is a
fleet-wide overview, not the per-device deep-dive panel `/api/predictive`
and `/api/predictive/risk-ranking` remain for, so it does not need the same
row depth. `risk-ranking`'s own existing, tested behavior is completely
unchanged (still 2000 rows/device).

**Re-measured after the fix**, three separate 30-40-run samples on
`executive-summary?range=6h`: p50 42.8-49.6ms, p95 **69.1-69.5ms** in two
clean samples. One earlier post-fix sample showed a single 243ms outlier
against an otherwise ~43ms cluster (not reproduced across the 110 total
requests measured afterward) — disclosed rather than hidden, consistent
with this engagement's own standing rule never to claim an unconditional
pass from a single run. The sustained, repeatable p95 is under the 100ms
target; a rare outlier under concurrent load has not been ruled out and is
recorded here rather than asserted away.

| Endpoint | p50 | p95 (2 clean 40-run samples) | Status |
|---|---:|---:|---|
| `/api/predictive/executive-summary?range=6h` | 42.8-49.6ms | 69.1-69.5ms | under target, one unreproduced 243ms outlier disclosed above |
| `/api/predictive/executive-summary?range=1h` | 27.6ms | 35.4ms | under target |
| `/api/predictive?device_id=LDI-02&metric=JE&range=1h` (warm) | 19.2-19.7ms | 23.7-28.7ms | under target |
| `/api/predictive/risk-ranking?metric=JE&range=1h` (unchanged) | 20.8-22.9ms | 25.5-26.5ms | under target |

## No duplicated requests / no unnecessary polling (Phase 8)

Real Playwright request-count instrumentation, all 4 target viewports:

- Opening `#spc-panel`, changing metric, changing range: 0
  `/api/predictive/risk-ranking` and 0 `/api/predictive/executive-summary`
  requests fire.
- Opening `#fleet-risk-panel`: exactly 1 `/api/predictive/risk-ranking`
  request; 0 `/api/predictive/executive-summary`.
- A full 5.5-second `/api/state` poll cycle with all three panels open:
  **zero** additional requests of any predictive family.
- Opening `#exec-summary-panel`: exactly 1 `/api/predictive/executive-summary`
  request; changing its range button: exactly 1 more (running total 2) —
  0 effect on the other two panels' own counts.

## Real browser verification (Playwright, all 4 target viewports)

- **Decision hierarchy**: `.pi-primary` (PRIMARY SIGNAL, heavier visual
  weight), `.pi-observed`/`.pi-forecast`/`.pi-next-action` all present.
- **Mixed-baseline banner**: real-verified present for LDI-05/PE/6h (a
  genuinely heterogeneous production finding, not a synthetic one) at
  every viewport.
- **Action continuity**: the Machine Snapshot link and a rendered related-
  alarms block both present for the same real finding, every viewport.
- **Executive summary**: renders real fleet data with the expected section
  headings, every viewport.
- **Keyboard**: the SPC panel's 6h range button and the executive
  summary's 6h range button both activated via `.focus()` + a real `Enter`
  keypress, not a mouse click; both correctly re-fetch.
- **Accessibility (axe-core 4.9.1): 0 violations at all 4 viewports** — no
  new defect found this phase (the colour-contrast math for the new
  `.mixed-baseline-banner`/`.pi-primary-state` styling was computed before
  writing the CSS, not discovered after a failing scan).

## Full regression (zero tolerated)

`mapping` 36/36, `telemetry` 29/29, `alarm` 37/37, `analytics` 25/25,
`wire` 96/96, `spc` 42/42 (unchanged), `predictive` 39/39 (27 FT-22 + 12
new), `floor1-geometry-validator`/`floor1-orientation`/`floor1-cad-reconciliation`
all PASSED, unchanged — confirming this phase touched no geometry,
mapping, or DB schema.
