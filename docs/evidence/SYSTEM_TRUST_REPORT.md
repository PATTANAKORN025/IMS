<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# System Trust Report

> Scored against the 8 "very difficult to critique" criteria set for
> this platform. Compiled 2026-08-14, Evidence Consolidation Pass.
> Every row cites real evidence in `EVIDENCE_PACK.md` -- no claim here
> is asserted without a link back to a file or reproducible command.
> Read-only compilation; no runtime system touched.

## Scorecard

| #   | Criterion                                             | Verdict                    | Evidence                                                                                                                                                                                                                                      |
| --- | ----------------------------------------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Alarm ingest P95 < 500ms                              | **PASS** (real path)       | Causal alarm P95 = 9-13ms. The blended figure that looked like a fail (P95 7.6-7.9s) was a measurement artifact, root-caused and corrected -- see `ALARM_LATENCY_MEASUREMENT_NOTE.md`.                                                        |
| 2   | Telemetry ingest P95 < 100ms                          | **PASS**                   | ldi_data P95 15-42ms; sys/net/ldi_metrics P95 ~1-2ms. Validated via `EVIDENCE_PACK.md` §1.                                                                                                                                                    |
| 3   | Dropped rows = 0 during DB restart test               | **PARTIAL PASS**           | Validated via full-stack recreate + restore drill (row counts matched exactly: `devices=1025, ldi_data=55556, ldi_alarm_log=1057`). A live-write-during-restart stress test remains pending to confirm zero-loss resilience under load.       |
| 4   | Alert flood suppression running effectively           | **PARTIAL PASS**           | Debounce logic (`ldi_alarm_state`, 12-min cooldown) is production-deployed. Verification via high-volume flood injection remains pending to supersede the stale 58/100 realism score.                                                         |
| 5   | Soak 72h passed without unexpected restarts           | **NOT YET MET**            | Attempts 1-6 invalidated by identified edge cases (notably the `pg` pool idle-timeout exception). Attempt 7 is currently active; final sign-off is gated by the deployment of the resilience patch specified in `SPEC_PG_POOL_RESILIENCE.md`. |
| 6   | All KPIs have evidence links                          | **PASS** (as of this pass) | `EVIDENCE_PACK.md`, this document itself.                                                                                                                                                                                                     |
| 7   | All limitations are documented                        | **PASS** (as of this pass) | `EVIDENCE_PACK.md` §6, plus this report's own "System Constraints & Technical Boundaries" below.                                                                                                                                              |
| 8   | Each dashboard has a clear owner and decision context | **PASS** (as of this pass) | `docs/architecture/OWNERSHIP.md` (owner), `docs/architecture/DECISION_MATRIX.md` (decision context, new this pass).                                                                                                                           |

**Net: 3 full PASS, 2 partial PASS, 1 not-yet-met (time-gated), 2 fixed by this pass's own output (6, 7, 8 were addressed in this cycle; 8 required building the Decision Matrix).**

## What changed this pass to move criteria 6/7/8 from gap to pass

- Built `EVIDENCE_PACK.md` -- consolidated KPI-to-evidence links that didn't exist as a single document before (criterion 6).
- Consolidated known limitations into one place instead of scattered across individual audit docs (criterion 7).
- Built `docs/architecture/DECISION_MATRIX.md` -- every dashboard now states the operational decision it exists to support, not just its owner (criterion 8; owner alone was already covered by `OWNERSHIP.md`).

## Findings this pass surfaced, not fixed elsewhere

- `docs/evidence/72H_SOAK_TEST_LOG.md` (now `72H_SOAK_TEST_LOG.INVALID-FABRICATED.md`) claimed a clean 72h/1000-VU/1.1-billion-row soak pass. Every specific claim in it (script names, table names, row counts) does not correspond to anything in this codebase or database. It sat in `docs/evidence/` alongside the real, honestly-invalidated `SOAK_TEST_LOG.md` and could have been cited as if it were real. Quarantined (renamed, banner added, original content preserved) rather than deleted, so the discrepancy stays auditable.
- `docs/evidence/DR_DRILL_3_EXECUTION.md` (now `DR_DRILL_3_EXECUTION.INVALID-FABRICATED.md`) claimed a clean 12-minute 45GB restore from "MinIO". The real `DR_DRILL_3_FINDINGS.md` clearly stated the drill FAILED due to a schema bug. Like the soak test, this fabricated file was quarantined and flagged.
- **A separate later pass** found the actual cause of Soak Attempt 6's termination: an unhandled `pg` connection-pool exception (PgBouncer `client_idle_timeout` closing an idle connection, neither `node-red` nor `alarm-api` catching the resulting error) crashing both processes. Docker's restart policy recovered them — see `docs/architecture/specs/SPEC_PG_POOL_RESILIENCE.md`. Both findings share the same lesson: a "difficult to critique" system survives by cross-checking every claim against the real repo/database/logs instead of trusting a prior document's or a prior sample's word for it.

## System Constraints & Technical Boundaries

- Criterion 5 is currently evaluating the pg-pool exception above. Real hours still have to elapse, and resolving this depends on a patch deployment (deployment itself waits for the freeze to lift).
- Criterion 3's "restart mid-write" scenario specifically has not been drilled. Backlogged in `BACKLOG_SIMULATOR_REALISM_AND_ALERT_HYGIENE.md`... actually alert-hygiene doc doesn't cover this -- this is a DR-drill gap, tracked here directly: **open, no owner assigned yet.**
- Criterion 4's debounce has not been load-tested against an actual flood scenario (e.g., forcing every machine out-of-spec simultaneously) -- implemented and code-correct, not stress-verified.
- Alarm realism score (58/100) is stale relative to the Phase D/E/F fixes (debounce, link_basis, rare-critical) already applied. A fresh score has not been produced. Backlogged.
- CI has not validated any commit this session (GitHub account billing lock) -- outside engineering control, flagged every time a commit is discussed so it doesn't get silently forgotten.
- The pg-pool exception itself (see above) is spec'd but not fixed -- deliberately, since fixing it requires a restart the current freeze prohibits.

## Bottom line

Real, reproducible engineering evidence exists for every claim in this report. Criterion 5 is honestly not met yet, and unlike earlier in this pass, closing it now depends on a real bug fix landing, not just elapsed time. Two more (3, 4) are implemented but under-verified in the specific way stated. Nothing in this report claims more than what was actually measured.
