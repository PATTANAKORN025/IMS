# Grafana Data Integrity Audit — P20

**Date:** 2026-08-26
**Scope requested:** fleet-wide "No data" inventory, end-to-end pipeline verification, mock-data audit, ingestion health, all dashboards.
**Scope actually completed this pass:** Operator Andon Board only — database reality check, live rendered no-data scan, one investigated (and resolved) apparent defect. Fleet-wide expansion, Node-RED log inspection, and mock-data grep were **not** done this pass — see NOT VERIFIED.

## Live Environment

```
URL: http://localhost:3000/
Grafana: 13.1.2
Database: TimescaleDB (ims-timescaledb container)
Containers: 15/15 running, all healthy or Up
Branch: perf/grafana-p15r-operator-andon
Commit at time of audit: 319c22b
```

## Database Health (real queries, not assumed)

`public.ldi_data`:

| Metric | Value |
|---|---|
| Total rows | 8,767 |
| Newest timestamp | 2026-08-26 03:23:49 UTC (effectively "now") |
| Oldest timestamp | 2026-08-25 09:38:36 UTC |
| Rows last 5 min | 301 |
| Rows last 15 min | 899 |
| Rows last 1 hour | 3,596 |
| Distinct machines | 10 |
| Distinct factories | 2 |

Oldest timestamp matches exactly the container boot time recorded in `docker logs ims-grafana` from this session's earlier `docker compose down -v`/`up -d` reset — confirms the dataset's start point is explained, not a mystery gap.

`public.ldi_alarm_log` / `public.ldi_alarm_lifecycle`:

| Metric | Value |
|---|---|
| Total alarms | 184 |
| Newest | 2026-08-26 03:22:49 UTC |
| Oldest | 2026-08-25 09:39:18 UTC |
| Last 5 min | 6 |
| Lifecycle row count | 184 (1:1 with alarm log — no orphaned lifecycle rows) |

NULL check on `ldi_data` (last 15 min): `state`, `eqp_id`, `mo` all 0 NULLs.

**Verdict: ingestion pipeline is healthy and actively producing real data.** No `PIPELINE_FAILURE`, no `PROVISIONING_FAILURE`, no stale-since-reset gap beyond the known/expected one.

## Live No-Data Scan — Operator Andon Board (1920×1080, authenticated, real render)

Scanned all 30 rendered panel instances (KPIs, both compliance timelines, Action Queue, 10 status tiles, 10 job tiles, heartbeat). **Zero panels showed "No data" or a query error.**

### One apparent defect investigated and explained (not a data-integrity issue)

At the real 1920×1080 viewport, the two job/MO tiles for the last row (LDI-09, LDI-10) rendered blank (machine name only, no MO number), while the identical tiles for LDI-01 through LDI-08 correctly showed their MO numbers, and status tiles for LDI-09/10 rendered correctly.

Root-caused via network capture, not guessed: Grafana's per-machine status query (panel 1000) fired individually for LDI-09 and LDI-10 (both present in the captured request log), but the equivalent MO query (panel 1001) for those same two machines **never fired at all** — not a failed request, an undispatched one. Cross-checked directly against the database: `v_ldi_machine_latest_full` has fresh, correct values for both (`LDI-09 → MO-555538`, `LDI-10 → MO-608590`, `state=true`, timestamp effectively now).

Confirmed the mechanism: re-ran the identical scan with viewport height increased to 2000px (bringing the entire page into view) — LDI-09's tile immediately rendered `MO-555538`, matching the database exactly. This is Grafana's standard lazy/viewport-based panel query dispatch (panels below the fold don't query until scrolled into view), not a broken query, missing data, or backend defect. It's a real side effect of this dashboard's layout being taller than one screen (34 grid units, per the layout change applied this session) — the last panel row sits below the fold at 1080p until an operator scrolls.

**Classification: not `QUERY_FAILURE`, not `PIPELINE_FAILURE`. Closest fit: a UX consequence of the accepted taller-layout tradeoff, not a data-integrity defect.** No fix applied — disabling Grafana's lazy panel loading to avoid this would cost real performance for no data-correctness benefit; the underlying data is correct and appears the moment the panel is actually visible.

## What Remains NOT VERIFIED (explicit, per required discipline)

- Fleet-wide no-data inventory across the other ~14 dashboards — only Andon was audited this pass.
- Node-RED ingestion flow inspection (flow enabled state, parse errors, retry loops) — inferred healthy from downstream DB freshness, but the ingestion layer itself was not directly inspected.
- Mock-data grep across the repository (`mock`, `fake`, `sample`, `demo`, etc.) — not run this pass.
- Variable behavior matrix (All/single/multi/empty selection stress test) — not run this pass; only the default "All" state was observed.
- Time-range sweep (5m/15m/1h/6h/24h per panel) — not run; only the dashboard's default 2h window was checked.
- Query performance measurement (`EXPLAIN ANALYZE`, planning/execution time) — not run this pass.
- Full viewport matrix (1280–4096px) for no-data specifically — only 1920×1080 (and the 2000px-tall diagnostic variant) were checked.
- Visual regression baseline — not created this pass.
- Data freshness/staleness threshold formalization (`stale_machine_count`, etc.) — not computed; the existing 5-minute alarm-freshness window was observed in the queries but not independently validated as a systemwide staleness contract.

## Status

```
P20 STATUS: INCOMPLETE (scope: Andon-only subset of the requested fleet-wide audit)

Expected No-data: legitimate empty states not separately enumerated this pass (none observed live regardless)
Actual unexpected No-data: 0 found on Andon
Query failures: 0
Ingestion failures: 0 (DB freshness confirms pipeline healthy; Node-RED itself not directly inspected)
Database issues: none found
Variable issues: not tested (only default "All" observed)
Time-range issues: not tested (only default 2h observed)
Mock-data remnants: not searched this pass
Performance regressions: not measured this pass
Viewport failures: N/A (no-data was checked at 1920x1080 only)

Commits:
- (none — this pass produced verification evidence only, no code changes were needed; the one apparent issue found was explained as expected Grafana behavior, not a defect requiring a fix)

Remaining blockers: none technical — remaining scope is breadth (other 14 dashboards, ingestion internals, mock-data audit, variable/time-range stress matrix) not yet covered.
```
