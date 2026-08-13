# Disaster Recovery Test Plan

> Per `docs/architecture/IMS_MANUFACTURING_PLATFORM_V2.md` §6. Three drills, run via `scripts/dr-test.sh`, modeled on `scripts/soak-test-report.sh`'s pattern: real commands against the real running stack, real timings, no simulated output.

## Drill 1 — Backup / Restore

`./scripts/dr-test.sh backup-restore`

`pg_dump`s the live `ims` database, restores it into a throwaway `ims_dr_test` database (never touches live data), compares row counts on `devices`/`ldi_data`/`ldi_alarm_log` between live and restored, then drops the throwaway database. Pass criterion: **row-count bracketing, not exact match** — this is a live-ingesting system, so `scripts/dr-test.sh` captures counts before and after the dump and verifies the restored count falls inside that bracket (see `docs/operations/BACKUP_RESTORE.md` for why exact-match was tried first and produced a false FAIL).

## Drill 2 — Single-Container-Loss Recovery

`./scripts/dr-test.sh container-loss timescaledb` (or `node-red`)

Kills the named container outright, polls up to 120s for Docker's `restart: unless-stopped` policy to bring it back to `running`. This directly exercises the same self-healing this session's own reliability fix relies on (the Node-RED pg.Pool watchdog fixed earlier this session assumes the container itself recovers; this drill proves that assumption rather than leaving it implicit). Pass criterion: container reaches `running` within 120s.

## Drill 3 — Full-Stack Recreate

`./scripts/dr-test.sh full-recreate --confirm-destroy`

**Destructive — requires explicit `--confirm-destroy`.** Runs `docker compose down -v` (deletes every named volume: `timescaledb_data`, `prometheus_data`, `alertmanager_data`, `grafana_data`), recreates the entire stack from `docker-compose.yaml`, runs migrations, and restores from the backup taken in Drill 1. Without the flag, this drill is skipped with an explanation rather than silently run — it destroys whatever is live in the environment it runs against, so it should only be run when that's actually intended (a genuinely clean environment, or with explicit sign-off that current state is disposable).

## Evidence

Real output from each drill is recorded in `docs/architecture/IMS_MANUFACTURING_PLATFORM_V2.md`'s DR Test Evidence section, not hypothetical. `scripts/dr-test-reports/` (gitignored) holds the raw backup/restore logs behind each run.
