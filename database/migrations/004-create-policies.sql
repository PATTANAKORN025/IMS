-- Migration 004: Create refresh policies and supporting objects
-- Run AFTER 003 (caggs must exist)

-- Minute refresh policy
SELECT add_continuous_aggregate_policy('public.telemetry_minute_summary',
    start_offset    => INTERVAL '1 hour',
    end_offset      => INTERVAL '1 minute',
    schedule_interval => INTERVAL '1 minute',
    if_not_exists   => TRUE
);

-- Hourly refresh policy
SELECT add_continuous_aggregate_policy('public.telemetry_hourly_summary',
    start_offset    => INTERVAL '2 days',
    end_offset      => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists   => TRUE
);

-- Compression policy (after 7 days)
ALTER TABLE public.machine_telemetry SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'machine_id',
    timescaledb.compress_orderby = '"time" DESC'
);
SELECT add_compression_policy('public.machine_telemetry', INTERVAL '7 days', if_not_exists => TRUE);

-- Retention policy (90 days)
SELECT add_retention_policy('public.machine_telemetry', INTERVAL '90 days', if_not_exists => TRUE);

-- Safe ROUND function
CREATE OR REPLACE FUNCTION safe_round_numeric(val ANYELEMENT, decimals INT DEFAULT 2)
RETURNS NUMERIC AS $$
BEGIN
    RETURN ROUND(val::NUMERIC, decimals);
EXCEPTION WHEN OTHERS THEN
    RETURN 0::NUMERIC;
END;
$$ LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE;
