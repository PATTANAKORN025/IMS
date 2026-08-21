<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Disaster Recovery Test Plan

> Per `docs/architecture/IMS_MANUFACTURING_PLATFORM_V2.md` §6. Three drills, run via `scripts/dr-test.sh`, modeled on `scripts/soak-test-report.sh`'s pattern: real commands against the real running stack, real timings, no simulated output.

## Drill 1 — Backup / Restore

`./scripts/dr-test.sh backup-restore`

`pg_dump`s the live `ims` database, restores it into a ephemeral `ims_dr_test` validation database (never touches live data), compares row counts on `devices`/`ldi_data`/`ldi_alarm_log` between live and restored, then drops the throwaway database. Pass criterion: **row-count bracketing, not exact match** — this is a live-ingesting system, so `scripts/dr-test.sh` captures counts before and after the snapshot and verifies the restored count falls inside that bracket (see `docs/operations/BACKUP_RESTORE.md` for why exact-match was tried first and produced a false negative validation).

## Drill 2 — Single-Container-Loss Recovery

`./scripts/dr-test.sh container-loss timescaledb` (or `node-red`)

Kills the named container outright, polls up to 120s for Docker's `restart: unless-stopped` policy to bring it back to `running`. This directly exercises the same self-healing this session's own reliability fix relies on (the Node-RED pg.Pool watchdog fixed earlier this session assumes the container itself recovers; this drill proves that assumption rather than leaving it implicit). Pass criterion: container reaches `running` within 120s.

## Drill 3 — Full-Stack Recreate

`./scripts/dr-test.sh full-recreate --confirm-destroy`

**Destructive — requires explicit `--confirm-destroy`.** Runs `docker compose down -v` (deletes every named volume: `timescaledb_data`, `prometheus_data`, `alertmanager_data`, `grafana_data`), recreates the entire stack from `docker-compose.yaml`, runs migrations, and restores from the backup taken in Drill 1. Without the flag, this drill is skipped with an explanation rather than silently run — it destroys whatever is live in the environment it runs against, so it should only be run when that's actually intended (a genuinely clean environment, or with explicit sign-off that current state is disposable).

**Fixed 2026-08-13** (found on the first real run, root-caused and fixed same day — see `docs/evidence/DR_DRILL_3_FINDINGS.md` for the full story): `postgres/init/034-ldi-statistical-mock.sql` was auto-seeding a stale mock dataset into any fresh volume before `db-migrate` ran, putting migrations into a schema state they didn't expect; the drill's restore step was also restoring a full `pg_dump` into an already-migrated database, which TimescaleDB doesn't support reliably once continuous aggregates are involved. Fixed by deleting the stale init seed and rewriting `drill_full_recreate` to restore only the raw row data (not schema) after `db-migrate` builds the schema from `database/migrations/` alone. Verified: 2 clean passes out of 3 runs (the third hit a Postgres crash correlated with heavy repeated local testing, not the fix itself — see findings doc). This drill is a normal, expected-to-pass part of the DR posture now, not a known gap.

## Evidence

Real output from each drill is recorded in `docs/architecture/IMS_MANUFACTURING_PLATFORM_V2.md`'s DR Test Evidence section, not hypothetical, plus the full findings and manual-recovery log for the first Drill 3 run in `docs/evidence/DR_DRILL_3_FINDINGS.md` (raw output: `docs/evidence/dr-drill-3-raw-output.log`). `scripts/dr-test-reports/` (gitignored) holds the raw backup/restore logs behind each run.
