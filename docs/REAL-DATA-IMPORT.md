# Real-data import

This repo tracks schema, views, functions, and dashboards only. Real LDI
production data (telemetry, alarm history, and a supplemental alarm-code
export) is never committed — it lives locally in `data/real/` (gitignored)
and is loaded into the live database by `scripts/import-real-data.sh`.

CI and fresh local dev environments never see real data: the Node-RED
simulator generates synthetic `ldi_data`/`ldi_alarm_log` rows by default
(`LDI_SIMULATOR_ENABLED=true` unless overridden), and `docker-compose.yaml`
seeds a small mock alarm-code set via the tracked migrations. Real device
identifiers (machine names like `LDI002-LD1`) ARE tracked, in migration
040 — those are equipment reference metadata, not business data, and the
dashboards need real names to query against.

## Source files

Place these 3 files (pgAdmin "Copy with SQL INSERT statements" exports) in
`data/real/`:

- `ldi_data_clean.sql` — real telemetry (10,000 rows in the reference export)
- `ldi_alarm_log_clean.sql` — real alarm history (10,000 rows)
- `ldi_alarm_ms_code_clean.sql` — supplemental live-DB alarm-code export
  (892 rows; smaller and more authoritative than the 1,820-row vendor
  catalog already in migration 061, since it reflects codes the plant
  actually saw, not just the full vendor list)

If your export is still in pgAdmin's raw CSV-wrapped INSERT format (a
single `insert_sql` column, each row a full multi-line SQL statement),
unwrap it first:

```bash
python3 scripts/unwrap-pgadmin-export.py <input.csv> data/real/<name>_clean.sql
```

## Running the import

```bash
bash scripts/import-real-data.sh
```

This is idempotent and safe to re-run. In order, it:

1. Registers 3 equipment IDs that appear only in the real alarm log, never
   in the telemetry export (`LDI001-LD1`, `LDI001-LD2`, `LDI_01`) —
   already covered by migration 040 for a fresh deploy, but re-asserted
   here in case the import runs against a database that predates that.
2. Decompresses `ldi_data` chunks (compressed chunks reject inserts),
   truncates `ldi_data`/`ldi_alarm_log` if non-empty, and loads the real
   rows.
3. Merges the 892-row alarm-code export into `ldi_alarm_ms_code` via
   `UPSERT`, computing `severity` with the identical rule documented in
   migration 061 (keyword/AlarmType-based Critical/Major/Minor/Warning
   classification) so both sources get consistent treatment.
4. Refreshes all 4 continuous aggregates, recompresses chunks older than
   7 days, and runs `ANALYZE`.

Before running for real data, stop the simulator so it doesn't keep
overwriting the real rows: set `LDI_SIMULATOR_ENABLED=false` in your
(gitignored) `.env` and recreate the `node-red` container.

## Known limitation: the reference export windows don't overlap

The specific 10,000-row `ldi_data` and `ldi_alarm_log` exports used to
build and test this pipeline are two independent snapshots, not a matched
pair: `ldi_data` spans only 2026-07-19 21:23–02:53 (~5.5 hours), while
`ldi_alarm_log` spans 2026-04-10–2026-07-16 — its latest alarm predates
the telemetry window entirely. RCA alarm→telemetry linkage
(`v_ldi_alarm_context.match_type`) will legitimately be `NULL` for every
row with data this shape; that's the data, not a bug in the linking
query. A production import with genuinely overlapping windows will link
normally. Cpk/SPC and alarm-severity/classification reporting don't
depend on this linkage and are unaffected.

## Auditing

- `scripts/import-real-data.sh` is the only path that writes real data —
  read it top to bottom for exactly what runs.
- Migration 061 (already committed) embeds the 1,820-row vendor alarm
  catalog as text — an accepted, low-sensitivity historical exception
  predating this out-of-git policy. Nothing after it repeats that
  pattern.
- `git log -- data/real/` and `git check-ignore -v data/real/anything`
  confirm the directory has never been and cannot accidentally be
  committed.
