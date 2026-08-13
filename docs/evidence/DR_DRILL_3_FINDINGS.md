# DR Drill 3 — Findings and Live Recovery Log

Run: `bash scripts/dr-test.sh all --confirm-destroy`, started 2026-08-13T07:30:58Z.
Raw output: `docs/evidence/dr-drill-3-raw-output.log`.

## Verdicts

| Drill | Verdict | Notes |
|---|---|---|
| 1. Backup/restore (throwaway DB) | **PASS** | Restored row counts fell within the live [before, after] bracket for every table. Dump: 3s, 27,313,174 bytes. Restore: 19s. |
| 2. Container-loss recovery (timescaledb, node-red) | **FAIL** (known, compensated) | Docker Desktop/WSL2's native `restart: unless-stopped` policy does not fire after `docker kill` on this host (reproduced deterministically 2026-08-12, RestartCount stays 0 for 5+ minutes). Compensating control: `scripts/container-watchdog.sh`, verified 6x. Not a new finding this run. |
| 3. Full-stack recreate | **FAIL — real, previously-unknown bug.** See below. | The script's own verdict line already hedged ("verify manually against pre-wipe row counts before trusting this environment again") rather than claiming PASS. That manual verification is what follows. |

## Drill 3: what actually broke

1. **`postgres/init/034-ldi-statistical-mock.sql`** is a 74 MB, 242k-row mock-data bootstrap script mounted at `/docker-entrypoint-initdb.d`. On any fresh `timescaledb_data` volume, Postgres runs it automatically, before `db-migrate` ever starts. It seeds `ldi_data`/`ldi_alarm_log` with an old fixed dataset (2026-07-18 → 08-01) and a partial schema.
2. `db-migrate` then runs against a database that is **not actually empty**, and 7 of 37 pending migrations fail because they assume a different intermediate schema state than what the init-seed left behind:
   `042-spc-fleet-view.sql`, `043-ldi-data-1m-cagg.sql`, `044-ldi-data-15m-1h-caggs.sql`, `048-ldi-data-real-conversion.sql`, `050-ldi-rca-recent-window-view.sql`, `059-ldi-data-widen-double-precision.sql`, `064-materialize-spc-fleet-rca-views.sql` — all fail with variants of `"X" is not a view` / `is not a materialized view`, i.e. an object already exists in a different shape than the migration expects.
   One knock-on effect: migration 077's `CREATE TABLE IF NOT EXISTS public.ldi_alarm_lifecycle` silently skipped table creation because the init seed already had the table — but *without* its `PRIMARY KEY (logdate, logid)` / FK, since `IF NOT EXISTS` doesn't check constraints. The table was live with no primary key at all until fixed manually (below).
3. `db-migrate` exits 1. Every service gated on `depends_on: condition: service_completed_successfully` (node-red, proxy, alarm-api) never started — full stack outage, not just a degraded drill result.
4. The drill's own restore step (`psql < dump.sql` into the now-partially-migrated live `ims` database) then failed almost completely: 435 errors, mostly `relation "_timescaledb_internal._hyper_N_M_chunk" does not exist`. Root cause: `pg_dump` on a hypertable dumps data through internal per-chunk tables named by TimescaleDB-assigned internal IDs. Those IDs are specific to the database instance that produced the dump; they don't exist in a freshly-recreated database where `db-migrate` already created its own hypertables (and therefore its own, different, internal chunk IDs) before the restore ran. Net effect: the live `ims` database was left populated with the **stale init-seed data**, not the real pre-wipe snapshot — dashboards would have shown 2-week-old data as "current."

None of this is something this session introduced. It's a latent gap that a true from-scratch rebuild had apparently never been exercised against until this drill — exactly what DR Drill 3 exists to catch.

## Live recovery performed (2026-08-13, this session)

The above left the stack down and the database wrong. Fixed manually rather than left broken:

1. `TRUNCATE ldi_data, ldi_alarm_log;` — cleared the stale init-seed data.
2. Extracted the correct rows directly from the dump's per-chunk `COPY` blocks (bypassing the internal-chunk-ID mismatch that broke the drill's own restore) and reloaded through the parent tables via `\copy`. Row counts after: `devices=1025, ldi_data=55556, ldi_alarm_log=1057` — exact match to the live pre-wipe snapshot.
3. Added the missing `PRIMARY KEY (logdate, logid)` and matching `FOREIGN KEY ... REFERENCES ldi_alarm_log` to `ldi_alarm_lifecycle` (table was empty at the time, safe to add) so the alarm-insert trigger's `ON CONFLICT (logdate, logid)` clause has a constraint to target. It backfilled to 1057 rows (one `OPEN` lifecycle row per alarm) automatically via the existing trigger.
4. `docker compose up -d --no-deps node-red proxy alarm-api` — force-started the services `db-migrate`'s failure had gated. All 11 services confirmed healthy; Grafana `/api/health` OK; simulator confirmed writing fresh rows again (`ldi_data` rows with `time > now() - 2min`).

**Not fixed, flagged for follow-up:** the 7 migrations themselves are still not idempotent against an init-seeded fresh database (`bash scripts/migrate.sh` on this now-recovered instance still reports `Pending: 7 Applied: 0 Failed: 7` for the same 7 files — their target objects already exist correctly via the recovery above, the migration *files* just don't know that). A real fix means either making those 7 migrations tolerant of the init-seed's starting state, or changing `drill_full_recreate` to not run `db-migrate` against an init-seeded database at all (e.g. restore the dump first, before migrations, and skip migrations that the dump's own schema already satisfies). Both are real design decisions, not a one-line patch — deliberately not rushed through here.

## Separate discovery: CI has not been running

While checking this, found that GitHub Actions has been failing on **every push this session** (`417199b`, `da6bdee`, `f9bed7f`, and earlier) — not from any code issue. Every job fails in ~2 seconds with zero steps executed:

> "The job was not started because your account is locked due to a billing issue."

This means **no commit in this session has actually been validated by CI**, including the P0 documentation-reconciliation commit. This is an account/billing issue on GitHub's side, outside this session's ability to fix — needs direct attention on the GitHub account.
