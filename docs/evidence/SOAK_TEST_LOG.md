<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

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

## Attempt 7 (2026-08-14T07:34:17Z → 08:20:14Z, ~46min, 4 samples) — INVALID, host powered off mid-window

Raw data: `docs/evidence/soak-log-2026-08-14-attempt7-contaminated-by-host-shutdown.tsv`.

Clean for all 4 samples it collected (`restarted=no` throughout, db_size_mb growing 34→36 normally). Then nothing -- the `IMS-SoakTest` scheduled task's `LastRunTime` is `2026-08-14T15:20:13+07:00` (matches the last sample) and `NumberOfMissedRuns: 1` when queried afterward. Host `LastBootUpTime` (`wmic os get lastbootuptime`) is `2026-08-15T08:09:30+07:00` = `2026-08-15T01:09:30Z` -- **~17 hours after** the last sample. Every `ims-*` container's `StartedAt` clusters at `2026-08-15T01:15:45Z`-`01:17:26Z`, seconds after that boot, consistent with Docker's `restart: unless-stopped` policy bringing the stack back up after the host itself restarted. Cause of the host going down (sleep, Windows Update, manual shutdown) not established -- Windows Event Log wasn't checked -- but the fact pattern (task simply stopped firing, then a fresh boot timestamp, then every container starting within 2 seconds of each other and of that boot) is a host power event, not a container-level crash.

**Why this still counts as INVALID rather than "4 clean samples toward the total":** the soak test's claim is _continuous_ unattended monitoring with zero unexpected restarts. A ~17-hour gap where nothing was being sampled and the machine was off is a gap in evidence, not evidence of a clean 17 hours -- can't rule out anything happened in that window. Scheduled task confirmed still `Enabled: True`, `StartWhenAvailable: True`, trigger intact, so it will resume on its own; no fix needed for the task itself.

Two containers unrelated to the IMS stack were also observed running at the same boot (`ghcr.io/github/github-mcp-server`, `mcp/sonarqube`) -- these are this session's own MCP tool containers (GitHub MCP server, SonarQube MCP), not a second unexplained process. Noted only because they showed up in the same `docker ps` sweep and were briefly suspected of being another concurrent-workspace signal; ruled out.

No fix for the Attempt 6 pg-pool crash bug has been deployed yet -- per the standing freeze, no runtime system was touched to investigate or close out this attempt (all commands above were read-only: `docker ps`, `docker inspect`, `Get-ScheduledTask*`, `wmic`). Archived, not deleted, same reasoning as Attempts 1-6.

## Attempt 8 (2026-08-15T01:49Z → ended by approved Phase A1 fix, 0 samples collected) — INVALID, superseded by deliberate remediation, and its own collection mechanism silently stalled

No raw `.tsv` to archive -- `scripts/soak-test-reports/soak-log.tsv` still shows only its header row as of 2026-08-15T03:30Z, ~1h41m after Attempt 8's approximate start. `IMS-SoakTest` was confirmed `Enabled: True` right after the reboot, but evidently never actually fired a sample in this window -- a real, separate finding (the task not running despite being enabled) that is flagged here but **not investigated in this pass**; out of scope for the read-only audit and remediation work this attempt was superseded by.

**Why this attempt ends here, deliberately:** during this window, a read-only audit (ordered by the user, run without touching Soak Attempt 8) found a new, real, high-blast-radius bug -- `sys_metrics` was silently receiving 3-4x duplicate rows per real polling cycle (66.7% of all rows in the table, confirmed via `SELECT COUNT(*), COUNT(*)-COUNT(DISTINCT (device_id,time))`), traced node-by-node to `sre_parser`'s batch-buffer logic pushing a full row on every one of 3 walker-type completions (cpu/storage/temp) instead of once per real cycle. The user explicitly approved proceeding to a fix ("Phase A1") ahead of finishing the 72h soak on the buggy version, on the reasoning that soaking a known-broken ingestion path for 72h produces evidence of the wrong thing. The fix is in `nodered_data/flows.json` (`sre_parser` node) and requires a Node-RED redeploy to take effect -- ending this soak attempt is a direct, known consequence of that decision, not a surprise.

Deploy details and full before/after measurement are in `docs/architecture/specs/SPEC_SYS_METRICS_DUPLICATE_INSERT.md`. Summary: `docker compose restart node-red` at 2026-08-15T03:31:09Z, clean restart, and a ~4.5-minute post-deploy window shows duplicate rate 66.9% → 0.0%, sample cadence a clean 30s (matching the real poll trigger, no gaps), sub-millisecond ingest latency, zero pipeline errors, no resource regression.

**No new numbered soak attempt started yet, deliberately.** More approved fixes (RAM accumulation, `ubuntu.snmprec` disk config, alarm hygiene) are still pending, each needing to land and be independently measured (per the user's explicit instruction not to bundle them, so each fix's effect stays provable on its own) before a real 72h soak is worth starting -- starting one now would just get invalidated by the next restart. This window between Attempt 8's end and the next real attempt is dev/remediation work, not soak time, and is logged as such.

## Collection mechanism root cause found and fixed (2026-08-15)

The `IMS-SoakTest` scheduled task's silence during Attempt 8 (flagged above but not investigated at the time) is now root-caused: `Get-ScheduledTask`'s trigger showed `StartBoundary: 2026-08-10T15:35:12+07:00`, `Repetition: { Duration: P4D, Interval: PT15M, StopAtDurationEnd: True }`. **The task was only ever configured to repeat for 4 days from its original start** -- that window closed at `2026-08-14T15:35:12+07:00`, exactly matching the frozen `LastRunTime` (`2026-08-14 15:20:13`, the last 15-minute tick before the window closed) and the blank `NextRunTime` observed both during Attempt 8 and again just now. `StopAtDurationEnd: True` means Windows Task Scheduler did exactly what it was told: stop firing forever once the 4 days elapsed, silently, with no error surfaced anywhere `docker ps`/`Enabled: True` checks would catch. This explains the _entire_ Attempt-8 silence, not just a coincidental gap.

**Fixed**: replaced the trigger via `Set-ScheduledTask` with a new one (`-Once -At (Get-Date) -RepetitionInterval 15min -RepetitionDuration 365 days`) -- `NextRunTime` immediately populated with a real future timestamp, confirming the fix took. First real sample under the fixed trigger will confirm end-to-end before this is trusted for endurance evidence (see Attempt 9 below).

## Attempt 9 (started 2026-08-15, after the last runtime change this session) — 2h/6h/12h endurance, in progress

This is the P1/P2 endurance validation phase of the Evidence-Driven Reliability Test Suite (`RELIABILITY_TEST_SUITE.md`) -- not a 72h soak (demoted to optional P3). Starts counting from the most recent runtime change this session (the `alertmanager` restart for the duplicate-notification fix) -- every P0/P1 fix that touched a running container (Phase A1, P0.1 RAM, P0.2 disk, alertmanager) landed before this point, so the clock reflects the current, fully-patched state, not a mix of pre/post-fix behavior.

Targets: 2h engineering endurance (first checkpoint), 6h release-candidate, 12h final, each a checkpoint on the same continuous run, not separate restarts. Acceptance per `RELIABILITY_TEST_SUITE.md`: 0 unexpected restarts, 0 unexplained data loss, 0 duplicate-rate regression, stable memory/CPU/DB-connections/ingestion cadence, no unexplained error accumulation.

**Known, already-flagged non-blocking risk carried into this run**: the Phase A1 cycle-gate's concurrency race condition (`SCALE_TEST_2026-08-15.md`) only manifests under overlapping-poll conditions the real 4-device, 30s-cadence fleet doesn't create -- expected to have zero effect on this endurance run, and this run is itself further evidence for or against that expectation.

**Collection mechanism confirmed working end-to-end, not just assumed fixed**: first real sample landed `2026-08-15T05:34:03Z` -- `inserts_total=59994, inserts_failed_total=0, buffer_overflows_total=0, any_container_restarted=no, non_watchdog_alerts_firing=3, db_size_mb=67`. The scheduled-task fix from the previous section is verified, not just theoretically correct (`NextRunTime` populating was necessary but not sufficient evidence on its own -- this is the actual proof).

**Ended deliberately at 2 clean samples** (05:34:03Z, 05:49:03Z, both `restarted=no`) to deploy `SPEC_PG_POOL_RESILIENCE.md`'s fix -- the highest-priority undeployed item in the whole backlog, and a real crash risk that could otherwise invalidate this same endurance run hours in, exactly as it invalidated Attempt 6. Better to take one more planned restart now and start the endurance clock on the truly final patched state than let an unpatched crash reset a multi-hour run later. See Attempt 10 below.

## Attempt 10 (started 2026-08-15T05:59:41Z, after the pg-pool resilience deploy) — 2h/6h/12h endurance, in progress

Same P1/P2 endurance phase as Attempt 9, restarted because deploying `SPEC_PG_POOL_RESILIENCE.md` required touching `node-red`+`alarm-api`. This is now the **first endurance attempt running against the fully-patched architecture** -- every fix from this reliability program (Phase A1 sys_metrics dedup, P0.1 RAM, P0.2 disk, alertmanager duplicate-notification, pg-pool resilience) is live before this clock starts, so a clean result here reflects the complete current state, not a partial one.

Targets unchanged: 2h engineering endurance, 6h release-candidate, 12h final, same continuous run. Acceptance unchanged (0 unexpected restarts, 0 unexplained data loss, 0 duplicate-rate regression, stable memory/CPU/DB-connections/ingestion cadence, no unexplained error accumulation) -- plus this run is now the real-world proof (or disproof) of the pg-pool fix: any `client_idle_timeout` event during the run should show up as a harmless log line, not `any_container_restarted=yes`.

**2h checkpoint: PASS**, confirmed 2026-08-15T08:11Z. Started 05:59:41Z, 2h mark was 07:59:41Z. 9 samples collected (06:04:03Z through 08:04:03Z, 15-min cadence, 0 gaps). Only `restarted=yes` sample is 06:04:03Z itself -- the pg-pool deploy restart that started this attempt, not a failure during it. Every sample since (06:19 through 08:04, 8 in a row) shows `restarted=no`. `inserts_total` climbing cleanly (0 -> 3,952), `inserts_failed_total` and `buffer_overflows_total` stayed 0 throughout. No `client_idle_timeout` crash observed yet (PgBouncer's timeout is 300s and this run has crossed that boundary many times over without incident -- the pg-pool fix's real-world proof is accumulating). 6h checkpoint due ~11:59:41Z, 12h due ~17:59:41Z.
