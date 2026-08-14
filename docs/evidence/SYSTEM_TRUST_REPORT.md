# System Trust Report

> Scored against the 8 "very difficult to critique" criteria set for
> this platform. Compiled 2026-08-14, Evidence Consolidation Pass.
> Every row cites real evidence in `EVIDENCE_PACK.md` -- no claim here
> is asserted without a link back to a file or reproducible command.
> Read-only compilation; no runtime system touched.

## Scorecard

| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 1 | Alarm ingest P95 < 500ms | **PASS** (real path) | Causal alarm P95 = 9-13ms. The blended figure that looked like a fail (P95 7.6-7.9s) was a measurement artifact, root-caused and corrected -- see `ALARM_LATENCY_MEASUREMENT_NOTE.md`. |
| 2 | Telemetry ingest P95 < 100ms | **PASS** | ldi_data P95 15-42ms; sys/net/ldi_metrics P95 ~1-2ms. `EVIDENCE_PACK.md` §1. |
| 3 | Dropped rows = 0 during DB restart test | **PARTIAL PASS** | Full-stack recreate + restore drill: row counts matched exactly after fix (`devices=1025, ldi_data=55556, ldi_alarm_log=1057`). But this is a recreate/restore drill, not a live-write-during-restart drill -- no test has yet measured rows in flight at the moment of a restart. Marked partial, not full pass, on that distinction. |
| 4 | Alert flood suppression running effectively | **PARTIAL PASS** | Debounce (`ldi_alarm_state`, 12-min cooldown) is real and implemented. But it has not been re-measured since implementation -- the last realism/flood audit (58/100) predates it. No fresh evidence of "effectively" beyond "implemented and code-reviewed." |
| 5 | Soak 72h passed without unexpected restarts | **NOT YET MET** | Attempts 1-5 each invalidated for documented reasons. Attempt 6 in progress since 2026-08-14T04:48:35Z; verdict due after 2026-08-17T04:48Z+. This is the one criterion that is purely a matter of time, not more engineering. |
| 6 | All KPIs have evidence links | **PASS** (as of this pass) | `EVIDENCE_PACK.md`, this document itself. |
| 7 | All limitations are documented | **PASS** (as of this pass) | `EVIDENCE_PACK.md` §6, plus this report's own "Known gaps" below. |
| 8 | Each dashboard has a clear owner and decision context | **PASS** (as of this pass) | `docs/architecture/OWNERSHIP.md` (owner), `docs/architecture/DECISION_MATRIX.md` (decision context, new this pass). |

**Net: 3 full PASS, 2 partial PASS, 1 not-yet-met (time-gated), 2 fixed by this pass's own output (6, 7, 8 were gaps until this pass; 8 required building the Decision Matrix).**

## What changed this pass to move criteria 6/7/8 from gap to pass

- Built `EVIDENCE_PACK.md` -- consolidated KPI-to-evidence links that didn't exist as a single document before (criterion 6).
- Consolidated known limitations into one place instead of scattered across individual audit docs (criterion 7).
- Built `docs/architecture/DECISION_MATRIX.md` -- every dashboard now states the operational decision it exists to support, not just its owner (criterion 8; owner alone was already covered by `OWNERSHIP.md`).

## A finding this pass surfaced, not fixed elsewhere

`docs/evidence/72H_SOAK_TEST_LOG.md` (now `72H_SOAK_TEST_LOG.INVALID-FABRICATED.md`) claimed a clean 72h/1000-VU/1.1-billion-row soak pass. Every specific claim in it (script names, table names, row counts) does not correspond to anything in this codebase or database. It sat in `docs/evidence/` alongside the real, honestly-invalidated `SOAK_TEST_LOG.md` and could have been cited as if it were real. Quarantined (renamed, banner added, original content preserved) rather than deleted, so the discrepancy stays auditable. This is exactly the kind of thing a "difficult to critique" system needs to survive -- and this pass is what caught it, by cross-checking every cited script/table against the real repo and database instead of trusting the document's own claims.

## Known gaps (honest, not closed by this pass)

- Criterion 5 cannot be closed by engineering effort -- it requires 72 real hours to elapse cleanly. Nothing productive to do here except not restart anything.
- Criterion 3's "restart mid-write" scenario specifically has not been drilled. Backlogged in `BACKLOG_SIMULATOR_REALISM_AND_ALERT_HYGIENE.md`... actually alert-hygiene doc doesn't cover this -- this is a DR-drill gap, tracked here directly: **open, no owner assigned yet.**
- Criterion 4's debounce has not been load-tested against an actual flood scenario (e.g., forcing every machine out-of-spec simultaneously) -- implemented and code-correct, not stress-verified.
- Alarm realism score (58/100) is stale relative to the Phase D/E/F fixes (debounce, link_basis, rare-critical) already applied. A fresh score has not been produced. Backlogged.
- CI has not validated any commit this session (GitHub account billing lock) -- outside engineering control, flagged every time a commit is discussed so it doesn't get silently forgotten.

## Bottom line

Real, reproducible engineering evidence exists for every claim in this report. Two criteria (5) are honestly not met yet and can't be rushed. Two more (3, 4) are implemented but under-verified in the specific way stated. Nothing in this report claims more than what was actually measured.
