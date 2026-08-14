# Soak Test — Evidence Log

## Attempt 1 (2026-08-10T08:34:21Z → 2026-08-13T07:20:15Z, 70.8h) — INVALID, not a clean soak

Raw data: `docs/evidence/soak-log-2026-08-10-to-13-contaminated.tsv` (90 samples).

`bash scripts/soak-test-report.sh --summarize` verdict: **FAIL**. Kept as evidence, not deleted, because the failure is real and explains itself:

- **9 container-restart events logged.** `awk -F'\t' 'NR>1 && $5=="yes"{print $1}'` shows 5 of the 9 landed on 2026-08-13, the same day this session did active development on the same running stack (recreating `proxy`, `alarm-api`, `grafana` repeatedly while building/fixing the Alarm Console write path). This window is contaminated by intentional work, not organic instability — invalid as a "quiet system" soak.
- **28 samples show literal `NaN`** across the ingest-failure/overflow columns, concentrated in a ~14-hour stretch (2026-08-11T14:00:08Z → 2026-08-11T17:20:14Z) plus scattered singles. Root cause per the script: `curl -sf http://localhost:1880/metrics` returned nothing during those samples, so it logged `NaN` honestly instead of fabricating a `0`.
- **Root-cause investigation, 2026-08-13**: attempted. `docker logs ims-node-red --since 2026-08-11T13:30:00Z --until 2026-08-11T17:30:00Z` returns **0 lines** — Docker's logging driver (`json-file`, `max-size: 10m`, `max-file: 5`, confirmed via `docker inspect`) had already rotated past that window by the time this was checked, 2 days later. The evidence needed to determine _why_ `/metrics` was unreachable for that stretch no longer exists.
- Confirmed the endpoint is **not currently flaky**: 3/3 manual `curl` checks on 2026-08-13 returned `200` in ~0.2s each.
- **Real, undecided gap**: this repo's current Docker log retention (~50MB/container) is not sufficient to forensically diagnose an issue discovered days after it happened during a multi-day soak. Not fixed here — would mean either temporarily raising retention for the duration of a soak window, or shipping a lighter-weight continuous health-check log that doesn't depend on container log retention. Flagged, not resolved.

## Attempt 2 (2026-08-13T07:28:26Z → 07:50:17Z, 4 samples) — INVALID, contaminated by DR Drill 3

Raw data: `docs/evidence/soak-log-2026-08-13-attempt2-contaminated-by-dr-drill.tsv`.

Killed by DR Drill 3 (see `DR_DRILL_3_FINDINGS.md`): the drill's `full-recreate` step ran `docker compose down -v` at 07:43Z, inside this window. Sample at 07:50:17Z shows `any_container_restarted=yes` and `NaN` inserts (node-red was down). Archived, not deleted, same reasoning as Attempt 1.

## Attempt 3 (2026-08-13T07:54:17Z → 08:58:28Z) — INVALID, contaminated by DR Drill 3 root-cause fix iteration

Raw data: `docs/evidence/soak-log-2026-08-13-attempt3-contaminated-by-dr-fix-iteration.tsv`.

Root-causing the Drill 3 findings above required repeatedly running `docker compose down -v` (7+ times) against this same environment to reproduce and verify the fix -- see `docs/evidence/DR_DRILL_3_FINDINGS.md`. Necessary for that work, but it makes this window's data meaningless as a "quiet system" soak. Archived, not deleted, same reasoning as Attempts 1 and 2.

## Attempt 4 (2026-08-13T08:58:28Z → 2026-08-14T02:50:23Z, 24 samples) — INVALID, restart detection was blind

Raw data: `docs/evidence/soak-log-2026-08-13-attempt4-contaminated-by-undetected-manual-restarts.tsv`.

The restart-detection logic compared `docker inspect --format='{{.RestartCount}}'` between samples. That counter only increments when the daemon's own `restart: unless-stopped` policy fires after a crash -- it does **not** change for a deliberate `docker compose restart` / `docker restart`. During this window, `ims-node-red` was restarted twice (2026-08-14T02:00Z and 02:13Z, deploying the net_metrics root-cause fix) and once more during a live restart-detection test (02:50:23Z, deliberately forcing the check to confirm it fires). All three are real restarts of a container this soak test is supposed to be watching, and the log shows `restarted=no` for the two real ones -- the evidence was silently wrong, not just incomplete.

**Root-cause fixed**: `scripts/soak-test-report.sh` now tracks `docker inspect --format='{{.State.StartedAt}}'` alongside `RestartCount` and flags `restarted=yes` if either changes -- `StartedAt` changes on every restart regardless of cause. Verified live: forcing a stale state file correctly produced `restarted=yes` on the next sample (`docs/evidence/soak-log-2026-08-13-attempt4-contaminated-by-undetected-manual-restarts.tsv`, last row).

## Attempt 5 (2026-08-14T02:50:39Z → 04:35:14Z, ~1h45m, 8 samples) — INVALID, contaminated by ingestion-durability fix work

Raw data: `docs/evidence/soak-log-2026-08-14-attempt5-contaminated-by-ingestion-durability-fix.tsv`.

Clean for its first ~1h44m (7 samples, `restarted=no` throughout). Contaminated at the 8th sample (`2026-08-14T04:35:14Z`, `any_container_restarted=yes`) by `docker compose restart node-red`, run deliberately while deploying migration 081 (`ingest_ts`) and iterating on the `sre_parser` INSERT fix (see the `feat(e2e): real end-to-end ingestion latency measurement` and `feat: add read-only ingestion latency dashboard` commits). Several further `node-red` restarts followed in the same session while root-causing a live type-mismatch regression. User explicitly approved starting this work over letting the soak clock run ("Start queue work now, accept soak reset") — the reset is intentional, not a failure of the soak mechanism itself. Archived, not deleted, same reasoning as Attempts 1-4.

## Attempt 6 (2026-08-14T04:48:35Z → 05:51:52Z, ~1h03m, 3 samples) — INVALID, real unhandled-crash bug, not intentional dev activity

Raw data: `docs/evidence/soak-log-2026-08-14-attempt6-contaminated-by-pg-pool-crash.tsv`.

Clean for its first ~1h03m, then `any_container_restarted=yes` at `2026-08-14T05:51:52Z`. **Unlike every prior invalidated attempt, this one was NOT caused by this session's own dev activity.** Root-caused via `public.container_restart_audit` and `docker logs`: `ims-node-red` and `ims-alarm-api` both crashed simultaneously with an uncaught `client_idle_timeout` exception from their `pg` connection pools -- PgBouncer's `client_idle_timeout = 300` (its own config comments this "Dangerous timeouts") forcibly closed an idle pooled connection, and neither service has a `pool.on('error', ...)` handler, so the resulting error crashed the whole process instead of being handled gracefully. Docker's `restart: unless-stopped` policy recovered both containers within ~2 seconds; no evidence of data loss. Full root cause and fix design: `docs/architecture/specs/SPEC_PG_POOL_RESILIENCE.md`. Archived, not deleted, same reasoning as Attempts 1-5.

**This is a real, previously-undiagnosed bug** that may explain instability in earlier soak attempts and possibly the original 16-hour event this session's observability effort was built to investigate (not confirmed -- Docker log retention didn't preserve that far back -- but the failure signature matches). It is the highest-priority item in the current backlog specifically because it can invalidate a soak attempt without anyone touching anything.

## Attempt 7 (started 2026-08-14T07:34:17Z) — in progress

Log reset: Attempt 6's log archived above, fresh log started at `scripts/soak-test-reports/soak-log.tsv`, restart-state files (`.restart_*`) cleared. No fix for the pg-pool crash bug has been deployed yet -- per the standing freeze, no runtime system is being touched until a soak attempt completes cleanly or the freeze is explicitly lifted. This means Attempt 7 carries the same real risk of hitting the same `client_idle_timeout` crash as Attempt 6 did; that is expected and accepted, not overlooked -- fixing it now would itself be a restart, which the freeze exists to prevent.

Collection mechanism unchanged: Windows Scheduled Task `IMS-SoakTest` (fires every 15 minutes independent of any chat session).

Re-run `bash scripts/soak-test-report.sh --summarize` after 72h real elapsed time (target: 2026-08-17T07:34Z or later) for the actual verdict.
