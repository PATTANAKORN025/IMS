-- ══════════════════════════════════════════════════════════════
-- Migration 015: Daily Continuous Aggregates
-- Idempotent: safe to re-run
-- ══════════════════════════════════════════════════════════════

-- ── sys_daily ───────────────────────────────────────────
-- Built on sys_hourly (not raw) to avoid re-aggregating 14 days of raw data.
-- Uses the same AVG/MAX pattern as sys_hourly but over 1-day buckets.
CREATE MATERIALIZED VIEW IF NOT EXISTS public.sys_daily
WITH (timescaledb.continuous) AS
SELECT time_bucket('1 day', bucket) AS bucket, device_id,
    AVG(avg_cpu) AS avg_cpu, MAX(max_cpu) AS max_cpu,
    AVG(avg_ram_used) AS avg_ram_used, AVG(avg_ram_total) AS avg_ram_total,
    AVG(avg_disk_used) AS avg_disk_used, AVG(avg_disk_total) AS avg_disk_total,
    MAX(max_temp) AS max_temp
FROM public.sys_hourly GROUP BY bucket, device_id WITH NO DATA;

-- ── net_daily ───────────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS public.net_daily
WITH (timescaledb.continuous) AS
SELECT time_bucket('1 day', bucket) AS bucket, device_id, iface_name,
    AVG(avg_rx) AS avg_rx, MAX(max_rx) AS max_rx,
    AVG(avg_tx) AS avg_tx, MAX(max_tx) AS max_tx,
    SUM(total_errors) AS total_errors, SUM(total_drops) AS total_drops
FROM public.net_hourly GROUP BY bucket, device_id, iface_name WITH NO DATA;

-- ── ldi_daily ───────────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS public.ldi_daily
WITH (timescaledb.continuous) AS
SELECT time_bucket('1 day', bucket) AS bucket, device_id,
    AVG(avg_throughput) AS avg_throughput, MAX(max_temp) AS max_temp,
    AVG(avg_humidity) AS avg_humidity, AVG(avg_power) AS avg_power,
    AVG(avg_vibration) AS avg_vibration
FROM public.ldi_hourly GROUP BY bucket, device_id WITH NO DATA;

-- ── Daily CAGG Refresh Policies ────────────────────────
-- Refresh every 2 hours, covering last 3 days of hourly data
DO $$ BEGIN
    PERFORM add_continuous_aggregate_policy('public.sys_daily',
        start_offset => INTERVAL '3 days', end_offset => INTERVAL '2 hours',
        schedule_interval => INTERVAL '2 hours', if_not_exists => TRUE);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
    PERFORM add_continuous_aggregate_policy('public.net_daily',
        start_offset => INTERVAL '3 days', end_offset => INTERVAL '2 hours',
        schedule_interval => INTERVAL '2 hours', if_not_exists => TRUE);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
    PERFORM add_continuous_aggregate_policy('public.ldi_daily',
        start_offset => INTERVAL '3 days', end_offset => INTERVAL '2 hours',
        schedule_interval => INTERVAL '2 hours', if_not_exists => TRUE);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ── Enable real-time aggregation for daily CAGGs ───────
ALTER MATERIALIZED VIEW public.sys_daily SET (timescaledb.materialized_only = false);
ALTER MATERIALIZED VIEW public.net_daily SET (timescaledb.materialized_only = false);
ALTER MATERIALIZED VIEW public.ldi_daily SET (timescaledb.materialized_only = false);
