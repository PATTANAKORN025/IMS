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
    interface_metrics   JSONB DEFAULT '{}'::jsonb,
    -- LDI Private MIB (Enterprise .1.3.6.1.4.1.9999)
    ldi_throughput      DOUBLE PRECISION DEFAULT 0,
    ldi_humidity        DOUBLE PRECISION DEFAULT 0,
    ldi_pe              DOUBLE PRECISION DEFAULT 0,
    ldi_je              DOUBLE PRECISION DEFAULT 0,
    ldi_power           DOUBLE PRECISION DEFAULT 0,
    ldi_vibration       DOUBLE PRECISION DEFAULT 0,
    ldi_uptime          BIGINT DEFAULT 0,
    ldi_temp            DOUBLE PRECISION DEFAULT 0,
    -- Wi-Fi RF metrics (private MIB .1.3.6.1.4.1.9999.2.x): RSSI in dBm (negative), SNR in dB
    wifi_rssi           INT DEFAULT 0,
    wifi_snr            INT DEFAULT 0,
    -- Disk description (hrStorageDescr from HOST-RESOURCES-MIB)
    disk_description    TEXT DEFAULT ''
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
$$ LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE;

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
    -- Wi-Fi RF: MIN(snr) = worst signal-to-noise in the bucket (used by the SNR<20 alert)
    AVG(wifi_rssi) AS avg_wifi_rssi,
    MIN(wifi_rssi) AS min_wifi_rssi,
    AVG(wifi_snr) AS avg_wifi_snr,
    MIN(wifi_snr) AS min_wifi_snr
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

-- ── Fleet Status View ───────────────────────────────────
-- Scans only last 24h to prevent full hypertable scan as data grows
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
WHERE "time" > NOW() - INTERVAL '24 hours'
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

-- ── Device Registry ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.machines (
    machine_id    TEXT PRIMARY KEY,
    hostname      TEXT NOT NULL,
    community     TEXT NOT NULL DEFAULT 'Netk@',
    snmp_port     INT NOT NULL DEFAULT 161,
    enabled       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.machines (machine_id, hostname, community, snmp_port) VALUES
    ('ERP-MASTER-WINDOWS', 'ims-snmpsim', 'Netk@', 161),
    ('ERP-MASTER-UBUNTU',  'ims-snmpsim', 'Netk@', 161)
ON CONFLICT (machine_id) DO NOTHING;

-- ── Fleet Health Views ─────────────────────────────────
-- v_fleet_health: per-machine snapshot from raw telemetry (last 5 min)
CREATE OR REPLACE VIEW public.v_fleet_health AS
SELECT DISTINCT ON (m.machine_id)
    m.machine_id,
    ROUND((m.cpu_load_percent)::NUMERIC, 1) AS cpu_pct,
    ROUND((m.ram_used_mb / NULLIF(m.ram_total_mb, 0) * 100)::NUMERIC, 1) AS ram_pct,
    ROUND((m.disk_used_gb / NULLIF(m.disk_total_gb, 0) * 100)::NUMERIC, 1) AS disk_pct,
    ROUND(m.temp_c::NUMERIC, 0) AS temp_c,
    CASE
        WHEN m.cpu_load_percent > 90 OR m.ram_used_mb / NULLIF(m.ram_total_mb, 0) * 100 > 95
             OR m.disk_used_gb / NULLIF(m.disk_total_gb, 0) * 100 > 90 THEN 0
        WHEN m.cpu_load_percent > 80 OR m.ram_used_mb / NULLIF(m.ram_total_mb, 0) * 100 > 85
             OR m.disk_used_gb / NULLIF(m.disk_total_gb, 0) * 100 > 80 THEN 50
        ELSE 100
    END AS health_score,
    m.time
FROM public.machine_telemetry m
WHERE m.time > NOW() - INTERVAL '5 minutes'
ORDER BY m.machine_id, m.time DESC;

-- v_fleet_score: composite fleet score (single-row aggregation)
CREATE OR REPLACE VIEW public.v_fleet_score AS
SELECT 'Fleet Score' AS metric,
       ROUND(AVG(health_score)::NUMERIC, 1) AS value
FROM public.v_fleet_health;

-- ── Read-Only Grafana Role (least privilege) ──────────────
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'grafana_reader') THEN
        CREATE ROLE grafana_reader WITH LOGIN PASSWORD 'grafana_readonly_pw';
    END IF;
END
$$;
GRANT CONNECT ON DATABASE ims TO grafana_reader;
GRANT USAGE ON SCHEMA public TO grafana_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO grafana_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO grafana_reader;
