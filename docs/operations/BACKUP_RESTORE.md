<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

<div align="center">
  <h1>IMS Database Backup, Restore & Verification Procedures</h1>
  <p><b>What the repository ships today, how to verify a restore, and what to add before a backup leaves the host</b></p>
  <p>
    <a href="BACKUP_RESTORE.md">English</a> |
    <a href="../../th/docs/operations/BACKUP_RESTORE.md">ไทย</a> |
    <a href="../../zh-CN/docs/operations/BACKUP_RESTORE.md">简体中文</a>
  </p>
</div>

---

> **Audience:** SRE / Operations, database engineers
> **Scope:** the `ims` database in `ims-timescaledb`. The separate `eap_backup` database is a restored plant copy and is not covered by these scripts.
> **Recovery targets:** RTO under 15 minutes and RPO under 1 hour are **targets**, not measured guarantees. With the shipped daily-or-manual `pg_dump`, the achievable RPO is the time since the last backup.

---

## 1. What ships today

| Command | Script | What it does |
| --- | --- | --- |
| `make backup` | `scripts/backup-db.sh` (Windows: `scripts/backup-db.ps1`) | `pg_dump -Z 6` inside the container, then `docker cp` to `./backups/ims_backup_<timestamp>.sql.gz`. Deletes dumps older than 30 days in `./backups`. |
| `make restore FILE=<path>` | `scripts/restore-db.sh` | Asks for confirmation, then pipes the gunzipped dump into `psql` against the **live** `ims` database. |
| `./scripts/dr-test.sh backup-restore` | `scripts/dr-test.sh` | Backs up `ims`, restores into a throwaway database `ims_dr_test` and compares them. Never touches the live database. |
| `./scripts/dr-verify-restore.sh …` | `scripts/dr-verify-restore.sh` | Compares tables, columns, indexes, constraints, triggers, extensions, continuous aggregates and policies between two databases, and brackets row counts. Exits non-zero on any mismatch. |
| `node scripts/production-assurance.js --profile=dr` | `scripts/production-assurance.js` | Runs the DR drills and writes one JSON result to `docs/evidence/runtime/`. |

**Not shipped:** the backups are **not encrypted**, are **not copied off the host**, and there is **no WAL archiving or point-in-time recovery**. `./backups/` is in `.gitignore`. Anyone with read access to the host can read a dump. Section 4 lists what to add.

---

## 2. Take a backup

```bash
make backup                       # or: bash scripts/backup-db.sh
ls -lh backups/                   # ims_backup_YYYYmmdd_HHMMSS.sql.gz
```

`backup-db.sh`, `backup-db.ps1` and `restore-db.sh` read `POSTGRES_USER` and `POSTGRES_DB` from `.env` (falling back to `ims_admin` and `ims`). The dump is written inside the container and copied out with `docker cp`, so it never passes through a host pipe that could re-encode it.

---

## 3. Restore, and prove the restore

### 3.1 Rehearse first (safe)

```bash
./scripts/dr-test.sh backup-restore
```

The drill restores into `ims_dr_test` and runs `dr-verify-restore.sh`. Row counts alone do not prove a restore: a TimescaleDB restore can drop constraints, indexes or continuous aggregates while row counts still match. That is why the verifier compares the catalog.

The live database keeps ingesting during the dump, so exact row equality is not expected. For each actively written hypertable, the restored count must fall inside the counts taken just before and just after the dump:

$$\text{Count}_{\text{before}} \le \text{Count}_{\text{restored}} \le \text{Count}_{\text{after}}$$

### 3.2 Restore over the live database (destructive)

```bash
make restore FILE=backups/ims_backup_YYYYmmdd_HHMMSS.sql.gz
```

This overwrites `ims`. Stop the writers first (`node-red`, `alarm-api`) so that nothing writes during the restore. Start them again afterwards and check them with `make verify`.

---

## 4. Before a backup leaves the host (recommended, not shipped)

Each item below is a change to make and test before relying on it. None of them is part of the stack today.

1. **Encrypt the dump.** Encrypt it with a key that is not stored next to it, for example:

   ```bash
   docker compose exec -T timescaledb pg_dump -U ims_admin ims \
     | gzip -9 \
     | openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -pass env:BACKUP_ENCRYPTION_KEY \
     > "backups/ims_backup_$(date -u +%Y%m%dT%H%M%SZ).sql.gz.enc"
   ```

   Keep `BACKUP_ENCRYPTION_KEY` out of `.env` and out of git. Test decryption with `openssl enc -d …` in the same drill that tests the restore.
2. **Copy it off the host**, to storage that the host's own credentials cannot delete. Keep a checksum (`sha256sum`) next to each file.
3. **Schedule it.** Nothing in the repository schedules `make backup`. Use cron or a systemd timer on the host, and alert when the newest backup is older than the RPO target.
4. **Point-in-time recovery**, only if the one-hour RPO target is not enough. This needs `wal_level=replica`, `archive_mode=on` and an `archive_command` added to the TimescaleDB command line in `docker-compose.yaml`. It also needs a base backup (`pg_basebackup`) and archive storage. It is not configured today.

---

## 5. Related

- `docs/operations/DR_TEST_PLAN.md` covers the drill plan and pass criteria.
- `docs/operations-runbook.md` covers the day-to-day operations that surround a restore.

---

[⬅️ Back to Operations Runbook](../operations-runbook.md) | [<img src="../assets/icons/home.svg" width="18" align="center" /> Main Repository](../../README.md)
