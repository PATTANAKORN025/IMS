# IMS Evidence Pack

> Every KPI claim this repo makes, with a link to the file/command that
> reproduces it. Compiled 2026-08-14 during the Evidence Consolidation
> Pass. Read-only compilation -- no runtime system touched to produce
> this document. See `SYSTEM_TRUST_REPORT.md` for the pass/fail verdict
> against the 8 production-grade criteria; this pack is the raw
> evidence those verdicts cite.

## How to reproduce every number in this pack

```bash
node tests/e2e/ingestion-latency-check.js     # latency P50/P95/P99
bash scripts/soak-test-report.sh --summarize    # soak verdict
bash scripts/dr-test.sh all --confirm-destroy    # DR drill (destructive, throwaway env only)
node tests/lint/alarm-sync-linter.js        # alarm code / master sync
node scripts/generate-dashboard-inventory.js --check # dashboard inventory drift
```

## 1. Ingestion latency

| Metric                                                | Value                                                                 | Evidence                                                                                               |
| ----------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Telemetry ingest P95 (ldi_data, last measured)        | 15-42ms                                                               | `tests/e2e/ingestion-latency-check.js` output; live dashboard `ims-ingestion-latency` panel `LDI_DATA` |
| Telemetry ingest P95 (sys/net/ldi_metrics)            | ~1-2ms                                                                | same script/dashboard, `SYS_METRICS`/`NET_METRICS`/`LDI_METRICS` panels                                |
| Alarm ingest P95, real (causal)                       | 9-13ms                                                                | same script/dashboard, `LDI_ALARM_LOG (causal)` panel                                                  |
| Alarm ingest, noise-code (nearest)                    | up to 8.1s -- **not pipeline latency**, simulator-injected backdating | `docs/evidence/ALARM_LATENCY_MEASUREMENT_NOTE.md`, `LDI_ALARM_LOG (nearest)` panel                     |
| Query-visible latency (EXPLAIN ANALYZE, all 5 tables) | <1ms                                                                  | same script, Stage 2 output                                                                            |

Instrumentation: `database/migrations/081-ingest-durability-and-latency.sql` (`ingest_ts` columns, `ingest_staging` durability table). Dashboard: `monitoring/grafana/dashboards/infrastructure/ims-ingestion-latency.json`.

## 2. Disaster recovery / restart durability

| Metric                                                  | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Evidence                                                                                          |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Backup/restore row-count integrity                      | PASS, restored counts within live bracket for every table                                                                                                                                                                                                                                                                                                                                                                                                                                             | `docs/evidence/DR_DRILL_3_FINDINGS.md` §Drill 1                                                   |
| Container-loss auto-recovery (external `docker kill`)   | FAIL on this host's Docker Desktop/WSL2 (native restart policy doesn't fire), **compensated** by `scripts/container-watchdog.sh`, verified 6x                                                                                                                                                                                                                                                                                                                                                         | `docs/evidence/DR_DRILL_3_FINDINGS.md` §Drill 2                                                   |
| Container-loss auto-recovery (internal process crash)   | **Different result than the above, real evidence, not yet reconciled**: an unhandled `pg` pool exception crashed `ims-node-red`/`ims-alarm-api` from _inside_ the process on 2026-08-14, and `restart: unless-stopped` recovered both within ~2s -- the opposite of Drill 2's "doesn't fire" finding. Not a contradiction necessarily (external `docker kill` vs. an internal non-zero exit may hit different code paths in Docker Desktop/WSL2), but flagged rather than silently left inconsistent. | `docs/evidence/SOAK_TEST_LOG.md` §Attempt 6, `docs/architecture/specs/SPEC_PG_POOL_RESILIENCE.md` |
| Full-stack recreate + data restore                      | Real bug found (stale init-seed script, hypertable chunk-ID mismatch on restore) -- root-caused and fixed, then 2 clean PASSes (38/38 migrations, 0 restore errors)                                                                                                                                                                                                                                                                                                                                   | `docs/evidence/DR_DRILL_3_FINDINGS.md` §Drill 3, root-cause fix section                           |
| Row-level data integrity after manual recovery          | `devices=1025, ldi_data=55556, ldi_alarm_log=1057` -- exact match to pre-wipe snapshot                                                                                                                                                                                                                                                                                                                                                                                                                | `docs/evidence/DR_DRILL_3_FINDINGS.md`, "Live recovery performed"                                 |
| Raw drill output                                        | --                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | `docs/evidence/dr-drill-3-raw-output.log`                                                         |
| **Unhandled pg-pool exception on idle-connection drop** | **Real bug, found 2026-08-14**: PgBouncer's `client_idle_timeout=300` (its own config flags this "Dangerous timeouts") kills idle pooled connections; neither `node-red` nor `alarm-api` has a `pool.on('error', ...)` handler, so the resulting error crashes the whole process instead of being handled. This is the actual cause of Attempt 6's soak failure -- not simulator/dev activity. Spec'd, not yet fixed (fix requires a restart, deferred past the freeze).                              | `docs/architecture/specs/SPEC_PG_POOL_RESILIENCE.md`                                              |

## 3. Soak test (72h stability)

| Attempt | Result                                                                                                                                                                                                                                                 | Evidence                                                                                                                               |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1-4     | Each invalidated for a real, documented reason (contaminated by concurrent dev work, DR drill, or a blind restart-detection bug)                                                                                                                       | `docs/evidence/SOAK_TEST_LOG.md`                                                                                                       |
| 5       | Clean 1h44m, then invalidated by a deliberate `node-red` restart during the ingestion-durability fix (user-approved reset)                                                                                                                             | `docs/evidence/SOAK_TEST_LOG.md` §Attempt 5, `docs/evidence/soak-log-2026-08-14-attempt5-contaminated-by-ingestion-durability-fix.tsv` |
| 6       | Clean 1h03m, then invalidated by a **real, unrelated bug** -- unhandled pg-pool exception crashed node-red/alarm-api (see §2's new row above), not caused by any dev activity this time                                                                | `docs/evidence/SOAK_TEST_LOG.md` §Attempt 6, `docs/evidence/soak-log-2026-08-14-attempt6-contaminated-by-pg-pool-crash.tsv`            |
| 7       | **In progress**, started 2026-08-14T07:34:17Z, target verdict after 2026-08-17T07:34Z+. Fix for Attempt 6's crash cause not yet deployed (would require a restart) -- Attempt 7 carries the same real risk of recurrence, accepted rather than hidden. | `docs/evidence/SOAK_TEST_LOG.md` §Attempt 7, live at `scripts/soak-test-reports/soak-log.tsv` (gitignored, local)                      |

**A fabricated "72h soak" document was found and quarantined** during this pass -- see `docs/evidence/72H_SOAK_TEST_LOG.INVALID-FABRICATED.md`. It is not evidence of anything and must not be cited.

## 4. Alarm realism and flood control

| Metric                                  | Value                                                                              | Evidence                                                                                         |
| --------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Alarm code / master catalog sync        | PASS, 0 orphans, 19/19 codes resolve                                               | `node tests/lint/alarm-sync-linter.js` output, `docs/audit/LDI_ALARM_FIDELITY_AUDIT.md` §1       |
| Realism score (last measured)           | 58/100 -- **stale**, predates the debounce/link_basis/rare-critical fixes below    | `docs/audit/LDI_ALARM_FIDELITY_AUDIT.md`, dated 2026-08-11                                       |
| Flood suppression (debounce)            | Implemented: `public.ldi_alarm_state`, 12-minute cooldown per (machine, code) pair | `nodered_data/flows.json` node `almsim_gen`, `docs/audit/LDI_ALARM_FIDELITY_AUDIT.md` finding #6 |
| Correlation semantics                   | `link_basis` ('causal'/'nearest') set explicitly per row, not inferred             | `nodered_data/flows.json`, `public.v_ldi_alarm_context`                                          |
| Critical-severity reachability          | Fixed: 2 real Critical codes added at low, independent probability                 | `nodered_data/flows.json`, `RARE_CRITICAL_CODES`/`RARE_CRITICAL_PROB`                            |
| Re-scored realism after the above fixes | **Not yet done** -- open backlog item                                              | `docs/architecture/BACKLOG_SIMULATOR_REALISM_AND_ALERT_HYGIENE.md`                               |

## 5. Data integrity / schema governance

| Metric                          | Value                                                                                                                                             | Evidence                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Doc-over-claim linter           | PASS, 0 errors across 96 markdown files                                                                                                           | `node tests/lint/doc-overclaim-linter.js`                                                          |
| Dashboard inventory drift check | PASS, auto-generated, CI-gated                                                                                                                    | `docs/architecture/DASHBOARD_INVENTORY.md`, `node scripts/generate-dashboard-inventory.js --check` |
| Migration count                 | 56 files, max 081, all applied                                                                                                                    | `docs/architecture/DATABASE_SCHEMA.md`                                                             |
| CI validation status            | **Not running** -- GitHub Actions blocked by an account billing lock ("account is locked due to a billing issue"), outside this session's control | `docs/evidence/DR_DRILL_3_FINDINGS.md` §"Separate discovery: CI has not been running"              |

## 6. Known, documented limitations (not hidden)

- Docker log retention (~50MB/container) insufficient to forensically diagnose issues discovered days later during a multi-day soak -- flagged, not fixed. (`docs/evidence/SOAK_TEST_LOG.md` §Attempt 1)
- Container-loss auto-restart doesn't fire natively on this host's Docker Desktop/WSL2; compensated by an external watchdog, not a platform fix. (`docs/evidence/DR_DRILL_3_FINDINGS.md` §Drill 2)
- 7 migrations are not idempotent against the (now-deleted) init-seed's starting schema state -- real design decision deferred, not rushed. (`docs/evidence/DR_DRILL_3_FINDINGS.md`, "Not fixed, flagged for follow-up")
- Alarm realism score is 6 months stale relative to the fixes already applied; a fresh score has not been produced.
- CI has not validated any commit this session due to a billing lock on the GitHub account.
- Alarm ingest latency evidence originally conflated real pipeline speed with simulator-injected backdating; corrected 2026-08-14, see `ALARM_LATENCY_MEASUREMENT_NOTE.md`.
