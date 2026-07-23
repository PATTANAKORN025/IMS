-- Migration 032: LDI Data Scaling Policies
-- CAGG for hourly aggregation, compression for storage, retention for cleanup

-- 1. Continuous Aggregate: ldi_data_hourly
CREATE MATERIALIZED VIEW IF NOT EXISTS public.ldi_data_hourly
    WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', "time") AS bucket,
    eqp_id,
    AVG(temperature) AS avg_temp,
    MAX(temperature) AS max_temp,
    AVG(humidity) AS avg_humidity,
    AVG(GREATEST(ABS(pe_1), ABS(pe_2), ABS(pe_3), ABS(pe_4), ABS(pe_5), ABS(pe_6))) AS avg_max_pe,
    MAX(GREATEST(ABS(pe_1), ABS(pe_2), ABS(pe_3), ABS(pe_4), ABS(pe_5), ABS(pe_6))) AS peak_pe,
    AVG(scan_speed) AS avg_scan_speed,
    AVG(air_vacuum) AS avg_air_vacuum,
    COUNT(*) AS sample_count
FROM public.ldi_data
GROUP BY bucket, eqp_id
WITH NO DATA;

-- Refresh policy: every hour, backfill 3 days
SELECT add_continuous_aggregate_policy('public.ldi_data_hourly',
    start_offset => INTERVAL '3 days',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => true);

-- 2. Compression: compress segments older than 7 days by eqp_id
ALTER TABLE public.ldi_data SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'eqp_id'
);
SELECT add_compression_policy('public.ldi_data', INTERVAL '7 days', if_not_exists => true);

-- 3. Retention: auto-drop data older than 180 days
SELECT add_retention_policy('public.ldi_data', INTERVAL '180 days', if_not_exists => true);

-- 4. Also set compression on ldi_alarm_log
ALTER TABLE public.ldi_alarm_log SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'equipmentid'
);
SELECT add_compression_policy('public.ldi_alarm_log', INTERVAL '7 days', if_not_exists => true);
SELECT add_retention_policy('public.ldi_alarm_log', INTERVAL '365 days', if_not_exists => true);
