-- Migration 006: TimescaleDB Data Tiering — Compression policy
-- Compress data older than 90 days for storage efficiency
-- Idempotent: uses IF NOT EXISTS / DO NOTHING patterns

-- 1. Enable compression on the hypertable (if not already enabled)
ALTER TABLE public.machine_telemetry SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'machine_id',
    timescaledb.compress_orderby = 'time DESC'
);

-- 2. Add compression policy: compress chunks older than 90 days
SELECT add_compression_policy(
    'public.machine_telemetry',
    INTERVAL '90 days'
);

-- 3. Enable compression on continuous aggregate
ALTER MATERIALIZED VIEW public.telemetry_minute_summary SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'machine_id',
    timescaledb.compress_orderby = 'bucket DESC'
);

-- 4. Add compression policy for minute summary: compress after 7 days
SELECT add_compression_policy(
    'public.telemetry_minute_summary',
    INTERVAL '7 days'
);
