---
name: alter-hypertable-columns
description: Safely change column types on a TimescaleDB hypertable — handles compression, continuous aggregates, and re-creation
---

# Alter Hypertable Columns

Change column types on a TimescaleDB hypertable without data loss. This is a complex multi-step process because hypertables with compression and dependent views cannot be altered directly.

## When to Use

- Changing `INT` columns to `DOUBLE PRECISION` (or vice versa)
- Adding new columns to the hypertable
- Modifying column defaults
- Any DDL on `public.machine_telemetry` or other hypertables

## Why This Is Complex

TimescaleDB hypertables have two blockers for direct ALTER:
1. **Compression enabled** → "operation not supported on hypertables that have compression enabled"
2. **Continuous aggregates depend on columns** → "cannot alter type of a column used by a view or rule"

Both must be resolved before ALTER can proceed.

## The 7-Step Sequence

**ALL steps must run in a SINGLE psql session** (single `docker exec` command). Running them as separate commands causes race conditions.

### Step 1: Drop dependent continuous aggregates

```sql
DROP MATERIALIZED VIEW IF EXISTS public.telemetry_minute_summary CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.telemetry_hourly_summary CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.ldi_minute_summary CASCADE;
```

**Why**: Continuous aggregates reference the columns being altered. PostgreSQL blocks ALTER when views depend on the column.

**Which views to drop**: Check with:
```sql
SELECT * FROM pg_views WHERE tablename LIKE '%summary%' AND schemaname = 'public';
```

### Step 2: Disable compression on the hypertable

```sql
ALTER TABLE public.machine_telemetry SET (timescaledb.compress = false);
```

**Why**: TimescaleDB blocks column type changes when compression is enabled. The compression engine has its own column type registry.

### Step 3: ALTER the columns

```sql
ALTER TABLE public.machine_telemetry ALTER COLUMN ldi_humidity TYPE double precision;
ALTER TABLE public.machine_telemetry ALTER COLUMN ldi_pe TYPE double precision;
-- ... additional columns ...
```

**Common type changes**:
| From | To | Use Case |
|------|----|----------|
| `INT` | `DOUBLE PRECISION` | Decimal values (percentages, sensor readings) |
| `DOUBLE PRECISION` | `INT` | Whole numbers only (节省存储) |
| `INT` | `BIGINT` | Large counter values |
| Add column | `column_name TYPE DEFAULT value` | New metrics |

### Step 4: Re-enable compression

```sql
ALTER TABLE public.machine_telemetry SET (
    timescaledb.compress = true,
    timescaledb.compress_segmentby = 'machine_id',
    timescaledb.compress_orderby = 'time DESC'
);
```

**Why**: Restores compression policy. The segmentby/orderby must match the original configuration.

**Find original config** (if unsure):
```sql
SELECT * FROM timescaledb_information.compression_settings
WHERE hypertable_name = 'machine_telemetry';
```

### Step 5: Recreate continuous aggregates

```sql
CREATE MATERIALIZED VIEW public.telemetry_minute_summary
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 minute', "time") AS "bucket",
    machine_id,
    AVG(cpu_load_percent) AS avg_cpu_load,
    MAX(temp_c) AS avg_temp,
    -- ... include ALL columns needed by Grafana panels ...
FROM public.machine_telemetry
GROUP BY "bucket", machine_id;

SELECT add_continuous_aggregate_policy('public.telemetry_minute_summary',
    start_offset    => INTERVAL '1 hour',
    end_offset      => INTERVAL '1 minute',
    schedule_interval => INTERVAL '1 minute',
    if_not_exists   => TRUE
);
```

**Critical**: Column names in the aggregate MUST match what Grafana panels reference. After recreation, verify with:
```sql
\d public.telemetry_minute_summary
```

**Common naming trap**: Old aggregate had `max_temp_c`, new one may have `avg_temp`. Always verify and update Grafana panel SQL to match.

### Step 6: Sync flows (if parser was changed)

```bash
Copy-Item "flows-ubuntu.json" "nodered_data\flows.json" -Force
docker compose restart node-red
```

### Step 7: Verify data

```bash
# Wait 25 seconds for pipeline restart
Start-Sleep -Seconds 25

# Check raw data
docker exec ims-timescaledb psql -U ims_admin -d ims -c "
SELECT ldi_humidity, ldi_pe, ldi_je
FROM public.machine_telemetry
WHERE ldi_humidity != 0
ORDER BY time DESC LIMIT 3;"

# Check continuous aggregate
docker exec ims-timescaledb psql -U ims_admin -d ims -c "
SELECT avg_ldi_humidity, avg_ldi_pe
FROM public.telemetry_minute_summary
ORDER BY bucket DESC LIMIT 2;"
```

## Full Single-Session Command (PowerShell)

```powershell
docker exec ims-timescaledb psql -U ims_admin -d ims -c "
-- Step 1: Drop aggregates
DROP MATERIALIZED VIEW IF EXISTS public.telemetry_minute_summary CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.telemetry_hourly_summary CASCADE;

-- Step 2: Disable compression
ALTER TABLE public.machine_telemetry SET (timescaledb.compress = false);

-- Step 3: ALTER columns
ALTER TABLE public.machine_telemetry ALTER COLUMN ldi_humidity TYPE double precision;
ALTER TABLE public.machine_telemetry ALTER COLUMN ldi_pe TYPE double precision;

-- Step 4: Re-enable compression
ALTER TABLE public.machine_telemetry SET (
    timescaledb.compress = true,
    timescaledb.compress_segmentby = 'machine_id',
    timescaledb.compress_orderby = 'time DESC'
);

-- Step 5: Recreate aggregates
CREATE MATERIALIZED VIEW public.telemetry_minute_summary
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 minute', \"time\") AS \"bucket\",
    machine_id,
    AVG(cpu_load_percent) AS avg_cpu_load,
    MAX(temp_c) AS avg_temp,
    AVG(ldi_humidity) AS avg_ldi_humidity,
    AVG(ldi_pe) AS avg_ldi_pe
FROM public.machine_telemetry
GROUP BY \"bucket\", machine_id;

SELECT add_continuous_aggregate_policy('public.telemetry_minute_summary',
    start_offset    => INTERVAL '1 hour',
    end_offset      => INTERVAL '1 minute',
    schedule_interval => INTERVAL '1 minute',
    if_not_exists   => TRUE
);
"
```

## Error Reference

| Error | Cause | Fix |
|-------|-------|-----|
| `operation not supported on hypertables that have compression enabled` | Compression still active | Step 2: `SET (timescaledb.compress = false)` |
| `cannot alter type of a column used by a view or rule` | Continuous aggregate depends on column | Step 1: Drop the aggregate first |
| `column "X" of relation "Y" does not exist` | Typo in column name or already dropped | Check `\d public.machine_telemetry` |
| `permission denied` | Not running as owner | Use `-U ims_admin` |

## Gotchas

- **Single session**: All 7 steps MUST run in one `docker exec` command. Separate commands cause race conditions.
- **Column names may change**: When recreating aggregates, column names may differ from the original (e.g., `max_temp_c` → `avg_temp`). Always verify with `\d`.
- **init/001-init-timescaledb.sql**: This file defines the original schema. After live ALTER, it becomes stale. Update it to match, or `docker compose down -v` will recreate with old types.
- **Data preservation**: ALTER TYPE does NOT destroy existing data. `INT 60` becomes `DOUBLE PRECISION 60.0`. No data loss.
