-- Migration 002: Add ldi_temp column for LDI machine temperature
-- Created: 2026-06-27
-- Stage 3.4: ldiTemp calculated by parser but not stored
-- LDI OID .1.2.0 returns centidegrees, parser divides by 100

BEGIN;

-- Drop dependent continuous aggregates
DROP MATERIALIZED VIEW IF EXISTS public.telemetry_hourly_summary CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.telemetry_minute_summary CASCADE;

-- Disable compression
ALTER TABLE public.machine_telemetry SET (timescaledb.compress = false);

-- Add column
ALTER TABLE public.machine_telemetry
    ADD COLUMN IF NOT EXISTS ldi_temp DOUBLE PRECISION DEFAULT 0;

-- Re-enable compression
ALTER TABLE public.machine_telemetry SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'machine_id',
    timescaledb.compress_orderby = '"time" DESC'
);

-- Recreate telemetry_minute_summary with ldi_temp
CREATE MATERIALIZED VIEW public.telemetry_minute_summary
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 minute', "time") AS "bucket",
    machine_id,
    AVG(cpu_load_percent) AS avg_cpu_load,
    MAX(cpu_load_percent) AS max_cpu_load,
    AVG(ram_used_mb) AS avg_ram_used,
    AVG(ram_total_mb) AS avg_ram_total,
    AVG(disk_used_gb) AS avg_disk_used,
    AVG(disk_total_gb) AS avg_disk_total,
    GREATEST(0, (MAX(net_rx_bytes) - MIN(net_rx_bytes))) * 8.0 /
        NULLIF(EXTRACT(EPOCH FROM (MAX("time") - MIN("time"))), 0) / 1000000 AS avg_rx_mbps,
    GREATEST(0, (MAX(net_tx_bytes) - MIN(net_tx_bytes))) * 8.0 /
        NULLIF(EXTRACT(EPOCH FROM (MAX("time") - MIN("time"))), 0) / 1000000 AS avg_tx_mbps,
    MAX(net_rx_errors) - MIN(net_rx_errors) AS total_rx_errors,
    MAX(net_rx_drops) - MIN(net_rx_drops) AS total_rx_drops,
    MIN(net_if_status) AS min_if_status,
    MAX(temp_c) AS max_temp,
    AVG(ldi_throughput) AS avg_ldi_throughput,
    MAX(ldi_throughput) AS max_ldi_throughput,
    AVG(ldi_humidity) AS avg_ldi_humidity,
    AVG(ldi_pe) AS avg_ldi_pe,
    MIN(ldi_pe) AS min_ldi_pe,
    AVG(ldi_je) AS avg_ldi_je,
    AVG(ldi_power) AS avg_ldi_power,
    AVG(ldi_vibration) AS avg_ldi_vibration,
    MAX(ldi_vibration) AS max_ldi_vibration,
    AVG(ldi_temp) AS avg_ldi_temp,
    MAX(ldi_temp) AS max_ldi_temp,
    AVG(wifi_rssi) AS avg_wifi_rssi,
    MIN(wifi_rssi) AS min_wifi_rssi,
    AVG(wifi_snr) AS avg_wifi_snr,
    MIN(wifi_snr) AS min_wifi_snr
FROM public.machine_telemetry
GROUP BY "bucket", machine_id;

SELECT add_continuous_aggregate_policy('public.telemetry_minute_summary',
    start_offset    => INTERVAL '1 hour',
    end_offset      => INTERVAL '1 minute',
    schedule_interval => INTERVAL '1 minute',
    if_not_exists   => TRUE
);

-- Recreate telemetry_hourly_summary
CREATE MATERIALIZED VIEW public.telemetry_hourly_summary
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', "bucket") AS "hour_bucket",
    machine_id,
    AVG(avg_cpu_load) AS avg_cpu_load,
    MAX(max_cpu_load) AS max_cpu_load,
    AVG(avg_ram_used) AS avg_ram_used,
    AVG(avg_disk_used) AS avg_disk_used,
    AVG(avg_rx_mbps) AS avg_rx_mbps,
    AVG(avg_tx_mbps) AS avg_tx_mbps,
    MAX(max_temp) AS max_temp,
    SUM(total_rx_errors) AS total_rx_errors,
    SUM(total_rx_drops) AS total_rx_drops,
    MIN(min_if_status) AS min_if_status,
    AVG(avg_ldi_throughput) AS avg_ldi_throughput,
    MAX(max_ldi_throughput) AS max_ldi_throughput,
    AVG(avg_ldi_humidity) AS avg_ldi_humidity,
    AVG(avg_ldi_pe) AS avg_ldi_pe,
    MIN(min_ldi_pe) AS min_ldi_pe,
    AVG(avg_ldi_je) AS avg_ldi_je,
    AVG(avg_ldi_power) AS avg_ldi_power,
    AVG(avg_ldi_vibration) AS avg_ldi_vibration,
    MAX(max_ldi_vibration) AS max_ldi_vibration,
    AVG(avg_ldi_temp) AS avg_ldi_temp,
    MAX(max_ldi_temp) AS max_ldi_temp,
    AVG(avg_wifi_rssi) AS avg_wifi_rssi,
    MIN(min_wifi_rssi) AS min_wifi_rssi,
    AVG(avg_wifi_snr) AS avg_wifi_snr,
    MIN(min_wifi_snr) AS min_wifi_snr
FROM public.telemetry_minute_summary
GROUP BY "hour_bucket", machine_id;

SELECT add_continuous_aggregate_policy('public.telemetry_hourly_summary',
    start_offset    => INTERVAL '2 days',
    end_offset      => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists   => TRUE
);

COMMIT;
