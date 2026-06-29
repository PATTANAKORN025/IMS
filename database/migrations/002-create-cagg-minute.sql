-- Migration 002: Create 1-minute continuous aggregate
-- Run AFTER 001 (hypertable must exist)

DROP MATERIALIZED VIEW IF EXISTS public.telemetry_minute_summary CASCADE;

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
    AVG(ldi_temp) AS avg_ldi_temp,
    MAX(ldi_temp) AS max_ldi_temp,
    AVG(ldi_humidity) AS avg_ldi_humidity,
    AVG(ldi_pe) AS avg_ldi_pe,
    MIN(ldi_pe) AS min_ldi_pe,
    AVG(ldi_je) AS avg_ldi_je,
    AVG(ldi_power) AS avg_ldi_power,
    AVG(ldi_vibration) AS avg_ldi_vibration,
    MAX(ldi_vibration) AS max_ldi_vibration,
    AVG(wifi_rssi) AS avg_wifi_rssi,
    MIN(wifi_rssi) AS min_wifi_rssi,
    AVG(wifi_snr) AS avg_wifi_snr,
    MIN(wifi_snr) AS min_wifi_snr
FROM public.machine_telemetry
GROUP BY "bucket", machine_id;
