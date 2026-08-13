# Soak Test — Evidence Log

## Attempt 1 (2026-08-10T08:34:21Z → 2026-08-13T07:20:15Z, 70.8h) — INVALID, not a clean soak

Raw data: `docs/evidence/soak-log-2026-08-10-to-13-contaminated.tsv` (90 samples).

`bash scripts/soak-test-report.sh --summarize` verdict: **FAIL**. Kept as evidence, not deleted, because the failure is real and explains itself:

- **9 container-restart events logged.** `awk -F'\t' 'NR>1 && $5=="yes"{print $1}'` shows 5 of the 9 landed on 2026-08-13, the same day this session did active development on the same running stack (recreating `proxy`, `alarm-api`, `grafana` repeatedly while building/fixing the Alarm Console write path). This window is contaminated by intentional work, not organic instability — invalid as a "quiet system" soak.
- **28 samples show literal `NaN`** across the ingest-failure/overflow columns, concentrated in a ~14-hour stretch (2026-08-11T14:00:08Z → 2026-08-11T17:20:14Z) plus scattered singles. Root cause per the script: `curl -sf http://localhost:1880/metrics` returned nothing during those samples, so it logged `NaN` honestly instead of fabricating a `0`.
  - **Root-cause investigation, 2026-08-13**: attempted. `docker logs ims-node-red --since 2026-08-11T13:30:00Z --until 2026-08-11T17:30:00Z` returns **0 lines** — Docker's logging driver (`json-file`, `max-size: 10m`, `max-file: 5`, confirmed via `docker inspect`) had already rotated past that window by the time this was checked, 2 days later. The evidence needed to determine *why* `/metrics` was unreachable for that stretch no longer exists.
  - Confirmed the endpoint is **not currently flaky**: 3/3 manual `curl` checks on 2026-08-13 returned `200` in ~0.2s each.
  - **Real, undecided gap**: this repo's current Docker log retention (~50MB/container) is not sufficient to forensically diagnose an issue discovered days after it happened during a multi-day soak. Not fixed here — would mean either temporarily raising retention for the duration of a soak window, or shipping a lighter-weight continuous health-check log that doesn't depend on container log retention. Flagged, not resolved.

## Attempt 2 (2026-08-13T07:28:26Z → 07:50:17Z, 4 samples) — INVALID, contaminated by DR Drill 3

Raw data: `docs/evidence/soak-log-2026-08-13-attempt2-contaminated-by-dr-drill.tsv`.

Killed by DR Drill 3 (see `DR_DRILL_3_FINDINGS.md`): the drill's `full-recreate` step ran `docker compose down -v` at 07:43Z, inside this window. Sample at 07:50:17Z shows `any_container_restarted=yes` and `NaN` inserts (node-red was down). Archived, not deleted, same reasoning as Attempt 1.

## Attempt 3 (2026-08-13T07:54:17Z → 08:58:28Z) — INVALID, contaminated by DR Drill 3 root-cause fix iteration

Raw data: `docs/evidence/soak-log-2026-08-13-attempt3-contaminated-by-dr-fix-iteration.tsv`.

Root-causing the Drill 3 findings above required repeatedly running `docker compose down -v` (7+ times) against this same environment to reproduce and verify the fix -- see `docs/evidence/DR_DRILL_3_FINDINGS.md`. Necessary for that work, but it makes this window's data meaningless as a "quiet system" soak. Archived, not deleted, same reasoning as Attempts 1 and 2.

## Attempt 4 (started 2026-08-13T08:58:28Z) — in progress

Log reset: Attempt 3's log moved to `docs/evidence/soak-log-2026-08-13-attempt3-contaminated-by-dr-fix-iteration.tsv`, fresh log started at `scripts/soak-test-reports/soak-log.tsv`.

Collection mechanism: Windows Scheduled Task `IMS-SoakTest` (already existed, enabled since 2026-08-10T15:35:12+07:00, fires every 15 minutes independent of any chat session).

No further intentional container restarts planned during this window -- the DR Drill 3 root-cause fix is done and verified (see `DR_DRILL_3_FINDINGS.md`), so there's no more reason to tear the stack down before this window completes. Re-run `bash scripts/soak-test-report.sh --summarize` after 72h real elapsed time (target: 2026-08-16T08:58Z or later) for the actual verdict.
