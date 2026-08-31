> [!NOTE]
> **自动翻译 / 深度技术数据**
> 本文档为深度技术审计/证据报告。为了保持专业术语的准确性，目前主要以英文原文为准。

# Grafana Frontend Excellence — P15-R Final Report

**Date:** 2026-08-25
**Branch:** `perf/grafana-p15r-operator-andon`
**Full findings detail:** `GRAFANA_FRONTEND_EXCELLENCE_P15R_AUDIT.md`

## Summary

P15-R re-opened the Operator Andon Board for a deeper audit than the earlier P15 closure performed. That closure had verified two carried-over defects by render, but had not caught a severe, silent defect in the board's own most important panel. This pass found it.

## Metric table

| Metric | Before | After | Status |
|---|---:|---:|---|
| Dashboards audited (deep) | 0 | 1 (Operator Andon Board) | Partial — see audit §5 |
| Dashboards modified | 0 | 1 | — |
| Panels audited (Andon) | 0 | 11/11 structurally, 2 root-caused in depth | — |
| P0 defects found | — | 1 | Fixed |
| P1 defects found | — | 1 | Fixed |
| P2 defects found | — | 1 (bottom whitespace) | Documented, accepted |
| Action Queue query execution time | 36–115s (never completed within 5s refresh) | 2.2s | Fixed, measured |
| Action Queue join-node time (EXPLAIN ANALYZE) | tens of thousands of ms | 4.4ms | Fixed, measured |
| Query result correctness | — | Byte-identical (500 most recent alarms, before vs after) | Verified |
| Action Queue max visible rows before scroll | ~1 | ~2 (h4→h5, within same 20u budget) | Fixed |
| Dashboard lint errors | 0 | 0 | Clean |
| Pre-commit suite | — | All checks passed both commits | Clean |
| Git scope | — | 2 commits, both scoped to the one file that changed | Clean |
| Secrets | 0 | 0 | Clean |

## What was fixed

1. **Action Queue permanently stuck loading** (P0) — `LEFT JOIN public.ldi_data d` had no time bound, forcing TimescaleDB to decompress and scan all 250+ chunks of the hypertable on every 5-second refresh. Bounded the join to a 10-minute window around the alarm's own timestamp (verified real gap is never more than 23 seconds — 25x safety margin). Commit `6690787`.
2. **Action Queue too short to show multiple alarms without scrolling** (P1) — rebalanced grid height within the existing 20-unit kiosk ceiling, taking 1 unit from each compliance timeline (secondary info) and giving 2 to Action Queue (primary info, per the board's own alarm-first hierarchy). Net height unchanged. Commit `683d5b3`.

Both fixes were verified against a live, already-authenticated Grafana browser session — not just query-level proof — and held stable across multiple real refresh cycles.

## Deferred / accepted

- Bottom whitespace at the literal 1280×720 kiosk resolution (~20% of canvas unused) — real, but bounded by the same lint-enforced 20-grid-unit ceiling shared by two other kiosk dashboards. Documented as an accepted P2, not fixed this pass (would need a fleet-wide height-ceiling decision, out of scope for a single-dashboard fix).
- Stale "Mentor LDI Read-only" provisioning log noise, Action Queue's 12-column width fine-tuning, and 4 dashboards still missing the newer design-system CSS pass — all carried over unchanged from the prior `GRAFANA_FRONTEND_EXCELLENCE_P15.md` / `..._FINAL.md` reports, not re-litigated here.

## Not executed this pass (see audit §5 for the full list)

Full 5-viewport responsive matrix, browser-zoom testing, axis micro-geometry, typography hierarchy audit, accessibility measurement pass, interaction QA beyond what P14/P15 already covered, fleet-wide consistency matrix, and a formal visual-regression harness. These are explicitly marked **UNVERIFIED**, not claimed as passing.

## Final decision

**P15-R PARTIAL — CORE DEFECT RESOLVED, BROADER AUDIT DEFERRED.**

The single most severe, previously-undiscovered defect on this system's most operationally important dashboard is now found, root-caused with real database evidence, fixed with a minimal and semantically-verified change, and confirmed live in-browser. That is real, load-bearing progress. It is not the same thing as having completed the full 33-section P15-R brief, and this report does not claim otherwise — the remaining sections are real, legitimate follow-up work, not silently dropped work.

Git state: branch `perf/grafana-p15r-operator-andon`, 2 commits ahead of `main`@`6b47131`, working tree clean aside from evidence screenshots. Not yet merged or pushed — recommend review before merging, since it sits on top of the `main` branch's state as of `6b47131` (a concurrent, unrelated commit landed on `main` itself mid-session; this branch was kept isolated from it and should be merged, not rebased blindly, once reviewed).
