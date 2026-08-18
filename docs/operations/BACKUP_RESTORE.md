# Backup & Restore

> **Audience:** SRE/operations, QA/audit.
>
> **Provenance:** the procedure below is `scripts/dr-test.sh`'s `backup-restore` drill, real-executed and evidence-recorded in `docs/architecture/IMS_MANUFACTURING_PLATFORM_V2.md`'s DR Test section on 2026-08-10 — not a hypothetical runbook.

---

## Backup procedure

```bash
docker exec ims-timescaledb pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" > backup.sql
```

An uncompressed `pg_dump` snapshot extracted from the production database. **Real measured performance** (2026-08-10, ~52,800 `ldi_data` rows + ~1,025 `devices` + ~10,400 `ldi_alarm_log` rows): **1 second, 22.3 MB**. `pg_dump` emits a warning about circular foreign-key constraints on `continuous_agg` — expected and harmless for this stack (TimescaleDB's own catalog tables), not a sign of a corrupted dump.

## Restore procedure

```bash
docker exec ims-timescaledb psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE ims_dr_test;"
docker exec -i ims-timescaledb psql -U "$POSTGRES_USER" -d ims_dr_test < backup.sql
```

**Real measured performance:** 18 seconds for the same dataset size.

## Verification: row-count bracketing, not exact equality

This is a **live-ingesting system** — the simulator writes continuously. A simplistic "restored count == live count" check will yield variances, as data lands during the snapshot operation. `scripts/dr-test.sh` handles this correctly: it captures row counts _before_ and _after_ the snapshot, then verifies the restored count falls inside that bracket (inclusive). This behavior was verified during DR testing — the validation script correctly brackets live counts around the snapshot operation.

```bash
./scripts/dr-test.sh backup-restore
```

Runs the full drill end-to-end: dump, bracket the live count, restore into a ephemeral `ims_dr_test` validation database (**never touches the live database**), verify, then drop the throwaway database. Real result, 2026-08-10: **PASS** — `devices=1025 ldi_data=52795→52796 (bracket) alarm_log=10405`, restored count `52795` fell inside the bracket.

## What backup/restore does _not_ cover

- **Continuous aggregates and materialized views are not automatically repopulated by a plain restore** — `pg_dump`'s output includes their definitions, but a fresh restore target needs the TimescaleDB extension and background job scheduler running before the CAGGs will refresh. For a full environment rebuild (not just data), see the Full-Stack Recreate drill in `docs/operations/DR_TEST_PLAN.md`.
- **Grafana dashboards, alert rules, and library panels** are file-provisioned (`monitoring/grafana/`), not stored in the database — they come back automatically on container start from the repo's own tracked files, not from a database backup.
- **Node-RED flows** are similarly file-based (`nodered_data/flows/`), not part of a database backup.

A database backup alone is not a full disaster-recovery plan — see `docs/operations/DR_TEST_PLAN.md` and `docs/operations/INCIDENT_RESPONSE.md` for the complete picture, including the real reliability gap this system's own DR testing found (container restart policy not reliably recovering from a kill — see below).

## System constraints & operational considerations

DR testing on 2026-08-10 identified specific recovery behaviors with `restart: unless-stopped` for `ims-timescaledb` after a simulated process termination on this environment (confirmed via live `docker events` streaming). A backup is foundational to recovery, and database process restoration is equally critical. See `ARCHITECTURE.md`'s System Constraints & Technical Boundaries and `docs/operations/INCIDENT_RESPONSE.md` for manual recovery procedures.

## Related documents

- `docs/operations/DR_TEST_PLAN.md` — the full 3-drill DR test plan (backup/restore is Drill 1).
- `docs/architecture/IMS_MANUFACTURING_PLATFORM_V2.md` — real evidence log for all 3 drills.
- `docs/architecture/DATA_RETENTION.md` — retention policy is not a backup strategy; know the difference.
- `docs/operations/INCIDENT_RESPONSE.md` — what to do when this actually happens.
