-- IMS Database Initialization — TimescaleDB
-- Phase 7: Living Simulation + Delta Mbps Schema
-- Run after: docker compose down -v && docker compose up -d

-- ── Extensions ──────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- ── Clean Legacy Objects (ims.* schema from older phases) ─
DROP MATERIALIZED VIEW IF EXISTS ims.telemetry_minute_summary CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.telemetry_minute_summary CASCADE;
DROP VIEW IF EXISTS ims.v_uptime_summary CASCADE;
DROP VIEW IF EXISTS public.v_uptime_summary CASCADE;
DROP TABLE IF EXISTS ims.machine_telemetry CASCADE;
DROP TABLE IF EXISTS ims.alert_rules CASCADE;
DROP TABLE IF EXISTS ims.alert_history CASCADE;
DROP TABLE IF EXISTS public.machine_telemetry CASCADE;
DROP TABLE IF EXISTS public.alert_rules CASCADE;
DROP TABLE IF EXISTS public.alert_history CASCADE;

-- ── Raw Telemetry (write-optimized, counter-based) ───────
CREATE TABLE public.machine_telemetry (
    "time"              TIMESTAMPTZ NOT NULL,
    machine_id          TEXT NOT NULL,
    cpu_cores           INT,
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
    net_if_status       INT DEFAULT 1,
    temp_c              DOUBLE PRECISION DEFAULT 0,
    rx_mbps             DOUBLE PRECISION DEFAULT 0,
    tx_mbps             DOUBLE PRECISION DEFAULT 0,
    interface_metrics   JSONB DEFAULT '{}'::jsonb
);

SELECT create_hypertable('public.machine_telemetry', 'time', if_not_exists => TRUE);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_machine_time ON public.machine_telemetry (machine_id, "time" DESC);
CREATE INDEX IF NOT EXISTS idx_machine_interfaces ON public.machine_telemetry USING GIN (interface_metrics);

-- Safe ROUND function (handles double precision -> NUMERIC conversion)
CREATE OR REPLACE FUNCTION safe_round_numeric(val ANYELEMENT, decimals INT DEFAULT 2)
RETURNS NUMERIC AS $$
BEGIN
    RETURN ROUND(val::NUMERIC, decimals);
EXCEPTION WHEN OTHERS THEN
    RETURN 0::NUMERIC;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Compression (saves ~90% disk after 7 days)
ALTER TABLE public.machine_telemetry SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'machine_id',
    timescaledb.compress_orderby = '"time" DESC'
);
SELECT add_compression_policy('public.machine_telemetry', INTERVAL '7 days', if_not_exists => TRUE);

-- Retention (auto-delete data older than 90 days)
SELECT add_retention_policy('public.machine_telemetry', INTERVAL '90 days', if_not_exists => TRUE);

-- ── Continuous Aggregate: 1-Minute Summary ───────────────
-- GREATEST(0,...) prevents negative bandwidth when counter resets after reboot
CREATE MATERIALIZED VIEW public.telemetry_minute_summary
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 minute', "time") AS "bucket",
    machine_id,
    AVG(cpu_load_percent) AS avg_cpu,
    MAX(cpu_load_percent) AS max_cpu,
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
    MAX(temp_c) AS max_temp_c
FROM public.machine_telemetry
GROUP BY "bucket", machine_id;

-- Refresh policy
SELECT add_continuous_aggregate_policy('public.telemetry_minute_summary',
    start_offset    => INTERVAL '1 hour',
    end_offset      => INTERVAL '1 minute',
    schedule_interval => INTERVAL '1 minute',
    if_not_exists   => TRUE
);

-- ── Continuous Aggregate: Hourly Summary (for long-term queries) ──
CREATE MATERIALIZED VIEW public.telemetry_hourly_summary
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', "bucket") AS "hour_bucket",
    machine_id,
    AVG(avg_cpu) AS avg_cpu,
    MAX(max_cpu) AS max_cpu,
    AVG(avg_ram_used) AS avg_ram_used,
    AVG(avg_disk_used) AS avg_disk_used,
    AVG(avg_rx_mbps) AS avg_rx_mbps,
    AVG(avg_tx_mbps) AS avg_tx_mbps,
    MAX(max_temp_c) AS max_temp_c,
    SUM(total_rx_errors) AS total_rx_errors,
    SUM(total_rx_drops) AS total_rx_drops,
    MIN(min_if_status) AS min_if_status
FROM public.telemetry_minute_summary
GROUP BY "hour_bucket", machine_id;

SELECT add_continuous_aggregate_policy('public.telemetry_hourly_summary',
    start_offset    => INTERVAL '2 days',
    end_offset      => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists   => TRUE
);

-- ── Fleet Status View ───────────────────────────────────
CREATE OR REPLACE VIEW public.v_uptime_summary AS
SELECT
    machine_id,
    MAX("time") AS last_seen,
    EXTRACT(EPOCH FROM (NOW() - MAX("time")))::INT AS seconds_since_last,
    CASE
        WHEN EXTRACT(EPOCH FROM (NOW() - MAX("time"))) <= 30 THEN 'online'
        WHEN EXTRACT(EPOCH FROM (NOW() - MAX("time"))) <= 300 THEN 'stale'
        ELSE 'offline'
    END AS health_status,
    ROUND(AVG(cpu_load_percent)::NUMERIC, 2) AS current_cpu,
    ROUND(AVG(temp_c)::NUMERIC, 1) AS current_temp,
    MIN(net_if_status) AS interface_status
FROM public.machine_telemetry
GROUP BY machine_id;

-- ── Alert Rules ─────────────────────────────────────────
CREATE TABLE public.alert_rules (
    rule_id       SERIAL PRIMARY KEY,
    machine_id    TEXT,
    metric_name   TEXT NOT NULL,
    operator      TEXT NOT NULL,
    threshold     DOUBLE PRECISION NOT NULL,
    severity      TEXT NOT NULL DEFAULT 'warning',
    enabled       BOOLEAN NOT NULL DEFAULT TRUE,
    cooldown_mins INT NOT NULL DEFAULT 5,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.alert_rules (machine_id, metric_name, operator, threshold, severity) VALUES
    (NULL, 'cpu_load_percent',  '>', 90, 'critical'),
    (NULL, 'cpu_load_percent',  '>', 75, 'warning'),
    (NULL, 'temp_c',            '>', 85, 'critical'),
    (NULL, 'temp_c',            '>', 70, 'warning'),
    (NULL, 'net_rx_errors',     '>', 100, 'warning'),
    (NULL, 'net_rx_drops',      '>', 50, 'warning'),
    (NULL, 'net_if_status',     '=', 2, 'critical')
ON CONFLICT DO NOTHING;

-- ── Alert History ───────────────────────────────────────
CREATE TABLE public.alert_history (
    alert_id      SERIAL PRIMARY KEY,
    rule_id       INT REFERENCES public.alert_rules(rule_id),
    machine_id    TEXT NOT NULL,
    metric_name   TEXT NOT NULL,
    current_value DOUBLE PRECISION,
    threshold     DOUBLE PRECISION,
    severity      TEXT NOT NULL,
    message       TEXT,
    resolved_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
