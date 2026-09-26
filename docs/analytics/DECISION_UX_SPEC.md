# FT-23 — Decision UX / Executive Intelligence (Factory Twin)

Presentation layer over FT-21's SPC engine and FT-22's predictive
intelligence. **No new statistics** — every field this phase adds is a
plain-language restatement, selection, or aggregation of numbers those two
phases already computed and already tested. Scoped to Factory Twin only,
per this engagement's standing rule.

## Why this is not a new statistical algorithm

The objective's own instruction: "Do NOT add more statistical algorithms
unless a real business gap is proven." None were added. What exists here:

- `buildEvidenceBullets` / `buildContextLines` / `buildDecisionSummary` —
  restate `cpk`/`trend.capability_trajectory`/`calculated.signals`/`drift`
  as plain sentences. No new number.
- `selectEvidenceEvent` — picks ONE row already present in `fetchSpcSeries()`'s
  own query result. No new query, no invented event.
- `buildExecutiveSummary` — counts and top-N over ranking entries
  `runFleetRiskScan` (FT-22's own logic, unchanged) already computed. No
  new formula.

## Phase 1/2 — Decision hierarchy + evidence compression

`decision_summary` (new field on `/api/predictive`'s canonical response):

```json
{
  "primary_signal": { "subject": "PROCESS CAPABILITY", "state": "DECLINING", "risk_level": "MEDIUM" },
  "secondary_evidence": ["Cpk declining (currently 1.05, ASSESSMENT)", "EWMA rising -- 12 of 240 point(s) beyond control limit", "CUSUM shift detected (sustained)", "Nelson rule(s) 1, 2 triggered", "drift up at 0.42 units/hour"],
  "context": ["212 valid sample(s)", "homogeneous 15m window (no mixed-baseline signal)"],
  "next_action": "OCAP Stage 1: review the control chart for a sudden shift vs. gradual drift; check RCA for correlating thermal/vacuum anomalies; tune recipe parameters."
}
```

**`secondary_evidence` is always exactly 5 lines** — one per underlying
signal (Cpk/trajectory, EWMA, CUSUM, Nelson, drift), present whether or not
it fired ("no Nelson-rule violations" is as much a line as "rule 2
triggered"). This is Phase 2's own "do not hide underlying evidence" —
compression means restating concisely, never filtering down to only the
alarming signals.

**Visual weight** (Phase 1's own "do not present every rule with equal
visual weight"): the UI renders `primary_signal` in a bordered, larger-text
block (`.pi-primary`); `secondary_evidence`/`context` in a plain bullet
list and a dim hint line; `next_action` in its own accent-bordered line.
Nothing else on the panel gets that treatment.

`OCAP_NEXT_ACTION` moved from a client-side-only copy (app.js, since FT-21)
into `lib/predictive.js` — one authoritative copy of the plant's own OCAP
Stage 1/2 text, not two that could silently drift apart.

## Phase 3 — Mixed-baseline UX

`calculated.mixed_baseline` gains one new field this phase:
`safe_interpretation` — a fixed, deterministic sentence, non-null only when
`heterogeneity_detected` is true:

> "Treat the Cpk/EWMA/CUSUM figures for this window as descriptive only —
> do not use them alone to authorize a line-stop or a capability sign-off
> until the suspected sub-populations are separated (e.g. by recipe/product
> change) and re-analyzed individually."

The UI renders a `MIXED BASELINE SUSPECTED` banner (amber border, never the
crit/danger colour — this is a caution about *interpretation*, not itself a
fault) showing: why (the same `mixed_baseline.evidence` FT-22 already
computed), the affected window, and the safe-interpretation text above.
**No statistical violation is suppressed** — Nelson/Cpk/EWMA/CUSUM results
render exactly as they would without this banner; the banner is additive.

## Phase 4 — Action continuity

`fetchSpcSeries()`'s per-row query now also selects `factory`, `mo`,
`process`, `log_id` — real columns already on `ldi_data`, not a second
lookup. `selectEvidenceEvent` picks ONE real row from that same result,
by an evidence-driven preference order:

1. The mixed-baseline change-point row, **only when `heterogeneity_detected`
   is actually true** (a real bug found and fixed during this phase's own
   testing — see `DECISION_UX_VALIDATION.md`).
2. Otherwise, the first CUSUM-signaled row (the moment a real shift began).
3. Otherwise, the most recent row.

`action.exact_event` reports that row's own `device_id`/`factory`/`mo`/
`process`/`timestamp`/`log_id` verbatim — never approximated. `action.machine_snapshot_url`
is built by `telemetry.buildDrillDownUrl` — the SAME builder the existing
alarm/RCA pipeline already uses (`lib/alarm.js`'s `buildAlarmEvent`), not a
second URL scheme. `action.related_alarms` is a real correlation for the
SAME device+window via `queryAlarmHistory` — the SAME function
`/api/alarm-rca` already uses — capped to 3, filled in by `server.js` after
the pure `buildCanonicalResponse` returns (a DB call cannot live inside a
pure function).

Note on eligibility: `telemetry.buildDrillDownUrl`'s CAD-mapping
eligibility gate (`machine_drilldown_eligible`, used by the alarm pipeline)
does not apply here — a predictive finding's `device_id` is already a
confirmed real IMS device from `ldi_data.eqp_id`, with no CAD-to-IMS
physical-asset ambiguity involved. Building the URL unconditionally (when a
row exists) is correct, not a gap in the existing eligibility discipline.

## Phase 5 — Executive summary

`GET /api/predictive/executive-summary?range=15m|1h|6h` — fleet-wide, no
`device_id` needed. Runs `runFleetRiskScan` for PE and JE in parallel (the
SAME per-device math `/api/predictive/risk-ranking` already uses), then a
pure aggregation (`predictive.buildExecutiveSummary`):

```json
{
  "fleet": { "devices_scanned": 20, "high_risk_count": 0, "medium_risk_count": 2, "low_risk_count": 14 },
  "highest_risks": [ /* top 5, risk != NONE, sorted HIGH>MEDIUM>LOW then worst Cpk first */ ],
  "capability_direction": { "declining": 1, "improving": 0, "stable": 15, "unknown": 0 },
  "major_drift": [ /* top 3, sustained persistence ranked above larger-but-transient velocity */ ]
}
```

**No fake KPIs**: every field is a count or a slice of real per-device
entries; an empty fleet scan yields honest zeros (verified by unit test),
never an invented placeholder number.

## Phase 6 — UX preservation

- Plant status vocabulary (`RUN`/`IDLE`/`DOWN`/`UNDEFINED`), data-quality
  semantics (`VALID`/`INSUFFICIENT_DATA`/`UNAVAILABLE`), and UNMAPPED
  honesty are all untouched — this phase adds fields, renames nothing.
- `OBSERVED`/`CALCULATED`/`FORECAST` separation (FT-22) is preserved
  exactly; `decision_summary`/`action`/mixed-baseline banner all render
  inside or alongside the existing `CALCULATED` block, never blurring the
  three-way distinction.
- Every prediction remains traceable: `decision_summary` cites the same
  underlying fields `calculated`/`source_event` already expose; nothing new
  is asserted without evidence already in the response.

## Files

- `services/factory-twin-3d/lib/predictive.js` — `buildEvidenceBullets`,
  `buildContextLines`, `buildDecisionSummary`, `OCAP_NEXT_ACTION`,
  `selectEvidenceEvent`, `buildExecutiveSummary`, `RISK_ORDER`.
- `services/factory-twin-3d/server.js` — `fetchSpcSeries()` extended with
  factory/mo/process/log_id; `/api/predictive` attaches real
  `related_alarms` via the existing `queryAlarmHistory`; `runFleetRiskScan`
  extracted and reused by both `/api/predictive/risk-ranking` (unchanged
  behavior) and the new `/api/predictive/executive-summary`.
- `services/factory-twin-3d/public/index.html`/`app.js` — decision
  hierarchy rendering, mixed-baseline banner, action-continuity links, the
  executive-summary panel.
- `tests/unit/factory-twin-predictive.test.js` — 12 new tests (39 total).
