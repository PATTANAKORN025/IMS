# IMS Fleet-Wide Security & Data-Integrity Pass — P21

**Date:** 2026-08-26
**Scope:** bounded autonomous slices per user-directed priority order (security → mock-data → no-data fleet scan → variable stress → performance → viewport). All 6 slices given real, bounded coverage this pass.

## Slice 1 — SQL Injection Audit (fleet-wide) — FIXED, VERIFIED

Audited every `rawSql` field in every dashboard JSON (`monitoring/grafana/dashboards/**/*.json`) for template variables interpolated without a Grafana escaping filter (`:sqlstring`, `:singlequote`, `:csv`, etc.). Found and fixed 3 real findings, all in commit `db4bf57`:

| File | Panel(s) | Issue | Severity | Fix |
|---|---|---|---|---|
| `ims-ldi-alarm-dictionary.json` | 2, 3 | `${alarm_code}` raw inside hardcoded `'...'` — `alarm_code` is a free-text `textbox` variable, directly editable in the dashboard UI, no dropdown constraint | **CRITICAL** — most exploitable case: any authenticated viewer can type SQL directly into the visible textbox | Removed hardcoded quotes, use `${alarm_code:sqlstring}` |
| `ims-ldi-operator-andon.json` | 1000, 1001 | `$machine_id` raw as a double-quoted SQL column alias — a `"` in the value breaks the identifier; `machine_id` is URL-overridable to arbitrary text (proven earlier this session via `?var-machine_id=` long-name testing, bypassing its dropdown) | **HIGH** — requires URL manipulation, not a visible UI field | Panel 1001's alias was purely cosmetic (unused by `textMode:"value"`) — renamed to fixed `mo`. Panel 1000 needed the name displayed — SQL alias fixed to `status`, visible name now comes from a `fieldConfig` `displayName` override, interpolated by Grafana's own template engine (never touches SQL) |

Post-fix: fleet-wide re-scan for unescaped `${machine_id|factory|mo|alarm_code|process|fpn|log_id|eqp_id}` in any `rawSql` → **0 findings**. Live-rendered at 1920×1080 to confirm zero visual regression (machine names, OK/ALARM states, MO numbers all identical to before). Dashboard linter clean.

**No other dashboard had this pattern.** All other variable usages already used `:sqlstring` correctly (the established, consistent pattern across this codebase).

## Slice 2 — Mock-Data Audit — CLEAN, no remediation needed

Searched the full dashboard tree for `mock|fake|dummy|synthetic|placeholder.*data`. All matches are honest documentation, not hidden contamination:

- `ims-ingestion-latency.json`: describes the `almsim_gen` simulator's injected detection delay — a disclosed, documented dev/staging data generator, not a silent production fallback.
- `ims-ldi-alarm-dictionary.json`: panel description explicitly notes "check data mode: mock vs. real" as a caveat for catalog completeness — transparent, not hidden.
- `ims-ldi-alarm-response.json`: description notes MTTA/MTTR are "meaningless in mock-simulator mode" unless someone is actually acting on alarms — again a disclosed caveat, not contamination.

Separately searched for literal hardcoded fake values (`'MOCK`, `'FAKE`, `'DUMMY`, `'TEST-`, `'SAMPLE` as SQL string literals) — **0 findings**. No dashboard silently falls back to fabricated values; every panel either shows real query results or an honest empty/no-data state.

**Context:** this environment's actual data source is a documented simulator (`almsim_gen`/`snmpsim`, referenced in `docker-compose.dev.yaml`) — it is the intended data source for this environment, not a mock standing in for a "real" one, and every dashboard that references it does so transparently.

## Slice 3 — No-Data Fleet Scan (Manufacturing + Engineering Analytics) — CLEAN

Extended the exact methodology proven on the Andon board (live authenticated render, real DOM scan for "No data" text and Grafana's own error-corner badge), with one methodology fix baked in from the start: used a tall viewport (1920×4000) to eliminate the lazy-load-below-fold false positive already discovered and explained during the Andon audit.

| Dashboard | Panels scanned | Unexpected "No data" | Error badges |
|---|---:|---:|---:|
| Manufacturing (`ims-ldi-manufacturing`) | 24 | 0 | 0 |
| Engineering Analytics (`ims-ldi-engineering-analytics`) | 19 | 0 | 0 |

## Slice 4 — Variable Stress Test (Andon board `machine_id`) — CLEAN

Tested via real live render + network response capture (watching for `/api/ds/query` 4xx/5xx):

| Case | Panels rendered | Error badges | No-data | Network errors |
|---|---:|---:|---|---|
| Default (All) | 29 | 0 | none | none |
| Empty selection (`var-machine_id=`) | 11 | 0 | 1 panel (unidentified title) | none |
| Single machine | 11 | 0 | none | none |
| Multiple machines (3) | 15 | 0 | none | none |

No SQL errors at any tested cardinality, including the empty-selection edge case (Grafana/Postgres handle an empty `IN`-list gracefully — no syntax error, no crash). The one "No data" panel under empty-selection is a non-issue in practice: `machine_id`'s variable picker is hidden in this dashboard (`"hide": 2`, kiosk mode) — no real operator can reach an empty selection through the UI; it's only reachable by manually editing the URL. Not fixed, not a real-world defect — documented rather than silently dropped.

## Slice 5 — Performance (real measurements, DB + browser)

**Database:** `EXPLAIN (ANALYZE, BUFFERS)` on the Temperature Compliance query (10-machine fleet, 2h range) — **4.552ms execution, 12.222ms planning**. Proper backward index scans on the hypertable's time index across 3 chunks, zero full-table scans, chunk exclusion working correctly for the requested time window.

**Browser (Andon board, real authenticated render):**

| Metric | Value |
|---|---|
| Initial load (`goto` to `networkidle`) | 2,336–2,605ms across 2 runs |
| `domContentLoaded` | 148–190ms |
| `/api/ds/query` requests per 5s refresh cycle | ~20.8 (50 requests / 2.4 cycles over a 12s window) |
| Failed requests (4xx/5xx) during refresh window | 0 |
| Browser JS heap | 133MB used / 190MB total |

**No refresh storm detected** — request volume per cycle is stable and proportional to the dashboard's real panel count (~29 panel-level queries across KPIs, 2 compliance timelines, Action Queue, and 20 repeated per-machine tiles), not runaway or duplicated. Zero failed requests across two independent 12-second observation windows.

## Slice 6 — Viewport Matrix (real, live-rendered)

Extended the already-tested 1280/1920/3840 set (from earlier P18/P20 passes) with the two sizes never checked this session:

| Viewport | Actual rendered size | Vertical overflow | Horizontal overflow |
|---|---|---:|---:|
| 1366×768 | 1366×768 (1:1) | 580px | none (-16px margin) |
| 1600×900 | 1600×900 (1:1) | 448px | none (-16px margin) |

Consistent with the already-documented, already-accepted layout tradeoff (compliance timelines and Action Queue sized for readability over literal zero-scroll) — no new or unexpected behavior at these intermediate sizes. No horizontal overflow at any tested size this entire engagement.

## P22/P23 — Reported No-Data Bug (Action Queue → Machine Snapshot) and Full Navigation-Chain Audit

**User-reported defect, real, reproduced live:** navigating from the Andon board's Action Queue to Machine Snapshot showed "No data" on 4 panels (Worst Cpk, Alarm Context, Event Timeline, and transitively Raw Timestamp appeared affected in initial testing but was later cleared as a lazy-load artifact, not a real defect on that specific panel).

**Root cause:** panels 9, 10, 12 resolved their target machine via `event_time_ms > 0 → use clicked_series, else → machine_id`. `clicked_series` is only set by a *different* interaction (clicking a point in an Engineering Analytics trend chart); the Action Queue's link always sets `event_time_ms` but never `clicked_series` (defaults to sentinel `'__none__'`). This forced every Action Queue navigation into the wrong branch, resolving to a machine name of `'__none__'` that matches nothing — even though `machine_id` was correctly passed the whole time. On 2 of the 3 panels this was worse than a plain empty result: their own "no alarm found" / "no telemetry" explanatory fallback rows were `CROSS JOIN`ed against the same broken machine-resolution CTE, so the failure silently ate the fallback message too, leaving a panel with no explanation at all.

**Fixed** (commit `2cb9e3e`): branch on whether `clicked_series` is actually set (`NOT IN ('__none__','')`) instead of on `event_time_ms`, applied to all 4 occurrences across the 3 panels. Verified by reproducing the exact blank state live, confirming Grafana loaded the corrected query via the dashboard API, then confirming all 4 panels render real data using the identical machine/timestamp that was previously blank.

**Full navigation-chain audit** (this pass): enumerated every `url`/panel-link across the entire manufacturing dashboard set that targets Machine Snapshot, Alarm Dictionary, or Alarm Console, to check for the same class of parameter-contract bug elsewhere in the chain:

| Entry point | Parameters passed | Live test result |
|---|---|---|
| Andon Action Queue → Machine Snapshot | `machine_id, factory, mo, event_time_ms` (no `clicked_series`) | Fixed and verified (above) |
| 2D Digital Twin → Machine Snapshot (all 10 machine zones) | `machine_id, factory` only (no `event_time_ms`, no `clicked_series`) | **Clean** — 14 panels, 0 blank |
| Engineering Analytics trend charts → Machine Snapshot (the *designed* click-a-point interaction) | `clicked_series, event_time_ms, machine_id, log_id=__auto__` | **Clean** — 14 panels, 0 blank. Confirms the fix did not regress the one path that's supposed to use `clicked_series` |
| Manufacturing "Worst Cpk" / "Board Traceability" → Machine Snapshot | `machine_id` only (no `factory`, no `event_time_ms`, no `clicked_series`) | **Clean** — 14 panels, 0 blank |
| Machine Snapshot "Alarm Context" → Alarm Dictionary | `alarm_code` only, no machine/factory/time context | **Correct as designed** — Alarm Dictionary is a pure code-lookup reference (its own panels don't take a machine parameter at all), not a context-preserving drill-down |
| Machine Snapshot "Event Timeline" panel | No outbound links at all (verified via `fieldConfig.overrides` inspection) | N/A — no drill-down exists on this panel to test |

**Checklist items from the request that don't apply to this dashboard:** Machine Snapshot has no `process` template variable at all (confirmed via its `templating.list`) — process/layer context is shown as a field in the Machine Context table, not modeled as a separate navigable variable. Not a defect; nothing to fix.

**Conclusion: the one real defect in this chain was the one already found and fixed.** The other 3 real entry patterns into Machine Snapshot (Digital Twin, the designed trend-chart click, Manufacturing's fleet tables) were tested live and are clean, including confirming no regression from the fix on the one path that legitimately depends on `clicked_series`.

## What Remains (explicit, per required discipline)

- Fleet-wide polish (typography/spacing normalization across all ~15 dashboards) — not started.
- Node-RED ingestion internals (flow-level inspection — enabled/disabled state, parse error handling, retry loops) — not inspected; only downstream DB freshness was used to infer pipeline health.
- Full variable stress matrix on dashboards other than Andon (Manufacturing, Engineering Analytics variable edge cases: large-cardinality, factory chaining) — not tested.
- 2560×1440, 4096×2160 viewports — not tested this pass (3840×2160 was tested in an earlier pass and covers the 4K case at a slightly different aspect ratio).
- Formal visual-regression baseline/diffing (pixel-level comparison across code changes) — not built; screenshots exist as point-in-time evidence but no automated before/after diff pipeline.
- Security audit scope beyond SQL injection (Node-RED Function-node code review, HTTP endpoint exposure, dependency vulnerability scan) — not performed.

## Commits

- `db4bf57` — `fix(security): close SQL injection via unescaped alarm_code and machine_id interpolation`

## Status

```
Slices completed: 6/6 (security, mock-data, no-data fleet scan, variable stress, performance, viewport)
Critical findings: 1 found, 1 fixed (alarm_code textbox injection)
High findings: 1 found, 1 fixed (machine_id alias injection, 2 panels)
Unexpected No-data (fleet, this pass): 0
Mock-data contamination: 0
Refresh storm: none detected (stable ~20.8 queries/cycle, 0 failures)
Slowest measured query: 4.552ms execution (Temperature Compliance, 10-machine fleet, 2h range)
Regressions from fixes: 0 (verified live)
Remaining: fleet-wide polish, Node-RED flow internals, full variable matrix on non-Andon dashboards,
  2560x1440/4096x2160 viewports, formal visual-regression diffing, broader security scope -- all NOT VERIFIED
```
