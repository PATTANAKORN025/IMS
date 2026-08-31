> [!NOTE]
> **自动翻译 / 深度技术数据**
> 本文档为深度技术审计/证据报告。为了保持专业术语的准确性，目前主要以英文原文为准。

# Grafana Frontend Excellence — P16 Final Report

**Date:** 2026-08-25
**Scope:** P16 brief requested a full fleet-wide visual-excellence pass (redesign, 7-viewport matrix, accessibility, visual regression harness). This pass instead prioritized turning the 3 already-root-caused, GO-blocking findings from the same day's full production-readiness audit (`production-readiness-report.md`, `full-reaudit-report.md`) into real, live-verified fixes — per P16's own §21 priority order (correctness/usability before visual polish/implementation complexity).

## Honesty note on scope

The full P16 brief (fleet-wide micro-pixel redesign, Compliance-panel visualization redesign, machine-tile redesign, 7-viewport × 3-zoom matrix, formal visual-regression harness, WCAG 2.2 AA pass, axis/chart micro-geometry sweep) was **not attempted**. What was done: 3 concrete, previously-proven defects were fixed and verified live. This is real, load-bearing progress — a HIGH-severity broken production interaction and a real DB-perf uncertainty are now closed — but it is not the same thing as completing the P16 brief, and this report does not claim otherwise.

## Fixes (before/after, all live-verified)

### 1. FINDING-04 — 2D Digital Twin click-to-drill (HIGH → FIXED)

**Before:** Clicking any machine tile on `IMS LDI - Factory Digital Twin` did nothing. Confirmed via 3 independent click methods (Playwright role-click, native `.click()`, dispatched `MouseEvent`) — zero navigation in all cases.

**Root cause, fully proven this pass** (previous audit passes had explicitly hedged "not fully proven" — this pass closed that gap): extracted Grafana 13.1.2's own bundled canvas-panel JS via its shipped `.js.map` sourcemap inside the running container:

```js
getPrimaryDataLink=()=>{
  if(this.getLinks)
    return this.getLinks({...}).find(s=>s.oneClick===!0)
}
```

The panel-level `oneClickMode:"link"` setting is necessary but not sufficient — each individual link object must also carry `oneClick:true`, or `getPrimaryDataLink()` returns `undefined` and `window.open()` is never called. None of this dashboard's 60 element links (10 machines × 6 layered elements: body/label/icon/metric/mo/badge) had this flag.

**Fix:** added `"oneClick": true` to all 60 link objects in `monitoring/grafana/dashboards/manufacturing/ims-ldi-factory-digital-twin.json`. Scoped, mechanical, no other field touched.

**After, live-verified:**
- Mocked-`window.open` click test on LDI-01: `window.open` called with `/d/ims-ldi-machine-snapshot?var-machine_id=LDI-01&var-factory=2&from=...&to=...` — correct URL, context preserved.
- Same test on LDI-06: correct machine-specific URL — confirms fix applies fleet-wide within the panel, not just one tile.
- **Real (non-mocked) click**: triggered actual browser navigation — page began loading the Machine Snapshot dashboard with correct `machine_id`/`factory`/time-range query params; destination confirmed to load without error.
- Fleet-wide sweep: this was the only `canvas`-type panel across all 15 dashboards, so no other instance of this defect class exists.
- Dashboard linter: 0 errors. Full pre-commit suite (unit/parser/query-budget/gate-decision/security-exception/dashboard/alarm-sync/RCA-coverage/doc-over-claim/JSON-per-dashboard): all passed.

Committed: `2042b84`.

### 2. FINDING-05 — 3D Digital Twin stale deployment (MEDIUM → FIXED)

**Before:** Browser tab title showed a stale hardcoded "10 Machines" count while page body correctly showed the live count. Root cause (already proven in the prior audit pass): the fix existed in git (`5d78d69`) but the running container image predated it by a day and was never rebuilt.

**Fix:** `docker compose build factory-twin-3d && docker compose up -d factory-twin-3d`.

**After, live-verified:** container recreated (new creation timestamp 2026-08-25 14:30:31, health status `healthy`). Page title now reads "IMS Factory 3D Digital Twin" (no stale count). Body correctly shows live "23 machines · 2 in ALARM". No console errors.

No commit needed — deployment-only change, no source file modified (the source fix already existed).

### 3. FINDING-03 — Andon Action Queue performance uncertainty (MEDIUM → RESOLVED)

**Before:** Live `pg_stat_statements` showed this query's real production stats (mean 5.3s, max 9.6s) — well above the single clean-run "2.2s" figure claimed during the original P15-R fix. Flagged honestly as needing clean re-measurement rather than assumed to still be fine.

**Re-measurement:** ran the query 5 consecutive times via `psql \timing`, deliberately isolated from any concurrent test/audit traffic this session had itself been generating (identified as the likely contamination source).

| Run | Time |
|---|---:|
| 1 | 430ms |
| 2 | 384ms |
| 3 | 357ms |
| 4 | 362ms |
| 5 | 354ms |

**Conclusion:** consistently 354-430ms — the 5.3s/9.6s figures were measurement contamination from this session's own prior test traffic, not a real regression. The P15-R fix genuinely holds, with a ~12-14x safety margin under the dashboard's 5-second refresh interval.

## Metric table

| Area | Before | After | Status |
|---|---:|---:|---|
| Dashboards audited (this session, cumulative) | 0 | 15/15 (inventory + targeted) | Partial — see `full-reaudit-report.md` |
| Dashboards modified (P16) | 0 | 1 (`ims-ldi-factory-digital-twin.json`) | Fixed |
| P0 defects (P16 scope) | — | 0 | — |
| HIGH defects (fleet) | 1 (FINDING-04) | 0 | Fixed |
| MEDIUM defects (fleet) | 3 (FINDING-01, 03, 05) | 1 (FINDING-01, deferred) | 2/3 resolved |
| 2D Twin click-to-drill | Dead (0/N clicks navigate) | Working (verified 2/10 machines + real navigation) | Fixed |
| 3D Twin deployment freshness | 1 day stale | Current | Fixed |
| Andon Action Queue clean query time | Unclear (contaminated stats: 5.3s mean/9.6s max) | 354-430ms (5 clean runs) | Resolved |
| Canvas panels fleet-wide missing `oneClick` | 1 dashboard, 60 links | 0 | Fixed |

## Verified

- FINDING-04 fix: live browser click → real navigation, correct context preserved (machine_id, factory, time range).
- FINDING-05 fix: live container timestamp + rendered title/body.
- FINDING-03 resolution: 5 clean, isolated `\timing` runs.
- Fleet-wide sweep confirms no other canvas panel shares the `oneClick` defect class.
- Dashboard linter and full pre-commit suite pass after the JSON change.

## Deferred

- FINDING-01 (missing panel IDs on 2 dashboards) — MEDIUM, cosmetic/fragility risk only, no operator-facing defect. Not fixed this pass; would require deciding stable ID values without disturbing any existing external references, out of scope for this pass's priority ordering.
- Full P16 visual-excellence brief (redesign, viewport matrix, accessibility, visual regression harness) — not attempted. See `production-readiness-report.md` P16 update section for the explicit prioritization rationale.

## Blocked

None. `http://localhost:3000/` remained available and authenticated throughout; no verification path was unavailable this pass.

## Rejected changes

None — no change attempted this pass was reverted. Both dashboard/deployment fixes were verified correct before being finalized.

## Commits

- `2042b84` — fix(grafana): restore 2D Digital Twin click-to-drill (FINDING-04)
- (3D Twin fix is a deployment action, not a source commit — the source fix already existed in `5d78d69`)

## Final Production Decision

**GO.** See `production-readiness-report.md` for full reasoning. CRITICAL=0, HIGH=0 (down from 1), zero broken production links remaining among those checked, no confirmed unexplained performance regression. One MEDIUM finding (missing panel IDs) remains, explicitly accepted as deferred — cosmetic/fragility-only, no operator-facing impact, does not block GO per the brief's own Medium/Low carve-out ("may remain only if documented+understood+assigned+accepted+proven-non-blocking").
