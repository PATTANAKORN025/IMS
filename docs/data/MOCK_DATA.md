# Synthetic Drilling and VCP Data

The drilling and VCP dashboards read the `eap_backup` database. On the plant server that database is a restore of factory data, and it is not in git. This page shows how to build a stand-in `eap_backup` from generated data, so the drilling folder, the VCP folder, the VCP alert rules and migrations 084–086 all run with no factory data.

## What it is

| Piece | Path | Role |
| --- | --- | --- |
| Schema | `database/mock/eap_backup-schema.sql` | Creates the tables and views the dashboards, the alert rules and migrations 084–086 read. |
| Generator | `scripts/mock/eap-mock-data.js` | Writes generated drilling events and VCP line data. |
| Verifier | `scripts/mock/verify-mock-dashboards.js` | Runs every drilling and VCP panel query and every VCP alert query. Reports rows per panel. |
| Unit test | `tests/unit/eap-mock-data.test.js` | Checks the generator with no database. Runs in pre-commit and CI. |

Every value is made up: machine counts, setpoints, recipes, panel sizes, lot codes and alarm texts. None of it is measured at a plant.

The generator keeps only what the dashboards parse:
- event codes and message formats;
- the `-VCP` equipment-id shape;
- the swapped bath tags (`preset_<bath>` is the reading, `actual_<bath>` the setpoint);
- `plating_time × line_speed = 54`;
- Triggered/Reset alarm pairs.

## Safety

- The schema file refuses to run on a database that already has `machine_event` or `vcp_upp` but no `public.mock_dataset` marker table. This stops it from running on a restored plant database.
- `--apply` runs as one transaction and checks for the marker before its first insert.
- Every generated row has an id that starts with `MOCK-`. `--undo --apply` deletes only those rows.

## Run it on an empty stack

This applies when `eap_backup` does not exist yet, for example on a fresh install. From Git Bash, at the repository root:

```bash
docker exec -i ims-timescaledb sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE eap_backup"'
docker exec -i ims-timescaledb sh -c 'psql -U "$POSTGRES_USER" -d eap_backup -v ON_ERROR_STOP=1' < database/mock/eap_backup-schema.sql
for m in 084 085 086; do                                 # see the note below
  docker exec -i ims-timescaledb sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1' < database/migrations/$m-*.sql
done
node scripts/mock/eap-mock-data.js --hours=168 --apply   # one week of data
```

Apply 084–086 by hand as shown. Re-running `db-migrate` does not apply them. On an install without `eap_backup`, the runner already ran these three files: each one skipped its work and was still recorded as applied in `public.schema_migrations`. All three files are safe to run again: `CREATE OR REPLACE`, `IF NOT EXISTS` and `COMMENT`.

The generator writes the rows once. It does not keep adding data, so the "last 15 minutes" panels go quiet after a while. Run it again when you need fresh data. Each run adds a new window, and `--undo --apply` clears the old ones.

## Run it in a throwaway container

This proof uses no stack and publishes no ports:

```bash
docker run -d --name ims-mock-verify -e POSTGRES_PASSWORD=mockonly -e POSTGRES_DB=ims timescale/timescaledb:2.29.2-pg16
docker exec ims-mock-verify psql -U postgres -d ims -c "CREATE DATABASE eap_backup"
docker exec -i ims-mock-verify psql -U postgres -d eap_backup -v ON_ERROR_STOP=1 < database/mock/eap_backup-schema.sql
for m in 084 085 086; do docker exec -i ims-mock-verify psql -U postgres -d ims -v ON_ERROR_STOP=1 < database/migrations/$m-*.sql; done
node scripts/mock/eap-mock-data.js --hours=168 --apply --container=ims-mock-verify --psql-user=postgres
node scripts/mock/verify-mock-dashboards.js --container=ims-mock-verify --psql-user=postgres
docker rm -f ims-mock-verify
```

The verifier requires `--container`, so it never runs against the live stack by default.

## Options

| Option | Default | Meaning |
| --- | --- | --- |
| `--hours=N` | 24 | Length of the window that ends now. |
| `--seed=N` | 20260928 | The same seed and end time give the same rows. |
| `--drilling=N` | 12 | Number of drilling machines (3–200). |
| `--incidents` | off | The last 35 minutes break each VCP alert rule once. |
| `--apply` | off | Write to the database. Without it, the SQL goes to a file. |
| `--undo` | off | With `--apply`, delete every `MOCK-` row. |
| `--container`, `--database`, `--psql-user` | `ims-timescaledb`, `eap_backup`, from `.env` | Where the rows go. |

## What the data shows

**Drilling:**
- Every machine runs jobs: program start, rpm/feed change, spindle mask, cycle start, tool changes, alarms with recovery time, job end with hit count, and a shift report at 08:00 and 20:00 Bangkok time.
- The alarms cover every category on the anomaly board.
- The last machine stops reporting 3 hours before the end, which shows as COMM LOSS.
- The machine before it goes quiet mid-cycle 75 minutes before the end, which shows as STALE RUN.

**VCP:**
- The data covers three lines, one row per line per minute. Each line moves between RUN, IDLE and DOWN.
- Stations draw current only while the line is plating.
- Bath readings follow their setpoints and cool when the line stands.
- Alarms arrive at random, and each one is reset after a while.

**Alert rules:**
- **Without `--incidents`:** the plant is healthy and all seven VCP rules return no rows. These rules list breaches, so no rows is the healthy result.
- **With `--incidents`, over the last 35 minutes:**
  - VCP01 stops sending data.
  - VCP02 plates with one station side 8 A over its setpoint and `preset_amp_1a` at zero. Pump 9 reads 0, and the two QC flags disagree.
  - VCP03 runs copperplating2 6 °C over its setpoint and hotwater 12 °C over.
- If the real alerting contact points are set up on a stack, loading incidents there sends real notifications.

## Verified result

The result is from 2026-09-28, TimescaleDB 2.29.2-pg16, in a throwaway container:
- The schema and migrations 084, 085 and 086 applied cleanly. Before `eap_backup` existed, 084 printed its skip message.
- With 168 hours of healthy data, 41 queries ran with 0 errors. All 34 panel queries returned rows, and the 7 alert queries returned none.
- With `--incidents`, 41 queries ran with 0 errors, and every one of them returned rows, including all 7 alert rules.
- The same results held for seeds 1 to 6 in both modes.

## Limits

- The column types are reconstructed from how the dashboards and migrations use each column. They are not a dump of the plant server.
- The schema leaves out the derived views and `plc_mqtt` schema that the plant database has. As a result, 12 rows of `catalog.object_registry` show `physical_missing = true` on a mock database.
