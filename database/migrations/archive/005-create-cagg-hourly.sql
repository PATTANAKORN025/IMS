-- Migration 003: Create 1-hour continuous aggregate
-- Run AFTER 002 (depends on telemetry_minute_summary)

DROP MATERIALIZED VIEW IF EXISTS public.telemetry_hourly_summary CASCADE;

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
    AVG(avg_ldi_temp) AS avg_ldi_temp,
    MAX(max_ldi_temp) AS max_ldi_temp,
    AVG(avg_ldi_humidity) AS avg_ldi_humidity,
    AVG(avg_ldi_pe) AS avg_ldi_pe,
    MIN(min_ldi_pe) AS min_ldi_pe,
    AVG(avg_ldi_je) AS avg_ldi_je,
    AVG(avg_ldi_power) AS avg_ldi_power,
    AVG(avg_ldi_vibration) AS avg_ldi_vibration,
    MAX(max_ldi_vibration) AS max_ldi_vibration,
    AVG(avg_wifi_rssi) AS avg_wifi_rssi,
    MIN(min_wifi_rssi) AS min_wifi_rssi,
    AVG(avg_wifi_snr) AS avg_wifi_snr,
    MIN(min_wifi_snr) AS min_wifi_snr
FROM public.telemetry_minute_summary
GROUP BY "hour_bucket", machine_id;
