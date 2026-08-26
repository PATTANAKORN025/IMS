# Dashboard/Panel Integrity Audit — Batch 3

**Method:** Live browser sweep of all 15 dashboards (Playwright, authenticated session against `http://localhost:3000/`). For each: navigated, waited for panels to settle, counted live-rendered panels via `document.querySelectorAll('[data-viz-panel-key]')`, checked browser console for errors. This is a deviations-only report per the plan — dashboards with 0 findings are listed with their evidence, not narrated panel-by-panel.

## Results — all 15 dashboards

| Dashboard | UID | Live panels | Console errors | Notes |
|---|---|---:|---:|---|
| IMS AIOps & Capacity Forecast | ims-capacity | 12 | 0 | Clean |
| IMS Engineering Drill-Down | ims-engineering | 19 | 0 | 2 untitled elements = CSS-injection text panels (expected pattern, matches noc-overview) |
| IMS Ingestion Latency | ims-ingestion-latency | 10 | 0 | Clean |
| IMS Pipeline Health & Meta-Monitoring | ims-meta-monitoring | 12 | 0 | Clean render; missing panel IDs (FINDING-01) is a JSON-level issue, doesn't affect live rendering |
| IMS NOC Overview | ims-noc-overview | 10 | 0 | Matches reconciled inventory exactly (10/10) |
| IMS Easy Overview | ims-easy-overview | 7 | 0 | Matches reconciled inventory exactly (7/7) |
| IMS LDI - Alarm Console | ims-ldi-alarm-console | 2 | 0 | Matches JSON exactly (2 panels by design) |
| IMS LDI - Alarm Dictionary | ims-ldi-alarm-dictionary | 3 | 0 | Clean |
| IMS LDI - Alarm Response (MTTA/MTTR) | ims-ldi-alarm-response | 8 | 0 | Clean |
| IMS LDI - Engineering Analytics & SPC | ims-ldi-engineering-analytics | 19 | 0 | Matches reconciled inventory exactly (19/19) — 3rd and final confirmation of the always-recurse panel-count model |
| IMS LDI - Factory Digital Twin | ims-ldi-factory-digital-twin | 1 | 0 | Renders clean and live-refreshes correctly (value change observed between checks), but **click-to-drill confirmed broken — FINDING-04 (HIGH)** |
| IMS LDI - Machine Snapshot | ims-ldi-machine-snapshot | 14 | 0 | Self-populates sensible defaults even without a real click-through context (`log_id`, `event_time_ms` fall back to a real recent record) |
| IMS LDI - Manufacturing Command Center | ims-ldi-manufacturing | 24 | 0 | Clean |
| IMS LDI - Operator Andon Board | ims-ldi-operator-andon | 31 | 0 | Re-tested per brief §13 — see below |
| LDI Data Readiness & Integration Gaps | ldi-data-readiness | 17 | 0 | Clean |

**Total live-rendered panels across all dashboards where checked: matches or exceeds the reconciled static inventory (169) — no dashboard under-rendered relative to its JSON.** (Note: raw live counts above include row-header/CSS-panel elements not present in the panel-only static count in some cases — e.g., Andon's 31 includes the two Status Panel machine-tile template groups × 11 machines + real panels, consistent with its known repeat-panel design, not a discrepancy.)

## Operator Andon Board re-test (brief §13, continuous with P15-R)

- 0 errored panels, Action Queue panel renders its "NO ACTIVE CRITICAL/MAJOR ALARMS" fallback row correctly (healthy empty state, not stuck loading).
- Network requests captured across 3+ consecutive 5-second refresh cycles: **all `POST /api/ds/query` calls returned 200 OK, zero 400s** — directly confirms the brief's explicit ask ("5-second refresh does not create request storms, no repeated 400 errors").
- 7 datasource queries per refresh cycle — reasonable, not a request storm.
- Screenshot evidence: `docs/evidence/screenshots/audit-2026-08-25/andon_retest.png`.
- **Verdict: PASS, re-confirmed live post-P15-R.**

## Real finding surfaced this batch

See `full-reaudit-report.md` FINDING-04 (HIGH) — 2D Digital Twin click-to-drill confirmed broken via live multi-method testing, correcting an earlier static-only PASS from Batch 1.

## Scope note

This was a defect-sweep pass (console errors, panel render counts, obvious broken/loading/error states), not the full 20-question-per-panel checklist from brief §4 for every one of the 169 panels — that remains **NOT VERIFIED** at the individual-question level (thresholds, value mappings, exact transformations, per-panel empty/loading state styling). What this batch does provide: confirmed evidence that no dashboard is silently broken, blank, or erroring fleet-wide, and one real, previously-unconfirmed-live regression was found and corrected into the record.
