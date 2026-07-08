-- Migration 001: Create hypertable with ALL columns
-- Run FIRST — all other objects depend on this table
-- Idempotent: uses IF NOT EXISTS

CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS public.machine_telemetry (
    "time"              TIMESTAMPTZ NOT NULL,
    machine_id          TEXT NOT NULL,
    cpu_cores           INTEGER,
    cpu_load_percent    DOUBLE PRECISION,
    ram_total_mb        DOUBLE PRECISION,
    ram_used_mb         DOUBLE PRECISION,
    ram_free_mb         DOUBLE PRECISION,
    disk_total_gb       DOUBLE PRECISION,
    disk_used_gb        DOUBLE PRECISION,
    disk_free_gb        DOUBLE PRECISION,
    net_rx_bytes        BIGINT DEFAULT 0,
    net_tx_bytes        BIGINT DEFAULT 0,
    net_rx_errors       BIGINT DEFAULT 0,
    net_rx_drops        BIGINT DEFAULT 0,
    net_if_status       INTEGER DEFAULT 1,
    temp_c              DOUBLE PRECISION DEFAULT 0,
    rx_mbps             DOUBLE PRECISION DEFAULT 0,
    tx_mbps             DOUBLE PRECISION DEFAULT 0,
    interface_metrics   JSONB DEFAULT '{}'::jsonb,
    ldi_throughput      DOUBLE PRECISION DEFAULT 0,
    ldi_temp            DOUBLE PRECISION DEFAULT 0,
    ldi_humidity        DOUBLE PRECISION DEFAULT 0,
    ldi_pe              DOUBLE PRECISION DEFAULT 0,
    ldi_je              DOUBLE PRECISION DEFAULT 0,
    ldi_power           DOUBLE PRECISION DEFAULT 0,
    ldi_vibration       DOUBLE PRECISION DEFAULT 0,
    ldi_uptime          BIGINT DEFAULT 0,
    wifi_rssi           INTEGER DEFAULT 0,
    wifi_snr            INTEGER DEFAULT 0,
    disk_description    TEXT DEFAULT ''
);

SELECT create_hypertable('public.machine_telemetry', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_machine_time ON public.machine_telemetry (machine_id, "time" DESC);
CREATE INDEX IF NOT EXISTS idx_machine_interfaces ON public.machine_telemetry USING GIN (interface_metrics);
