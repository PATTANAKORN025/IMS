-- IMS Database Initialization — TimescaleDB V2 Normalized Schema
-- Day-1 Fresh Install: Creates all V2 tables, CAGGs, policies, and views
-- Run after: docker compose down -v && docker compose up -d

-- ── Extensions ──────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- ── Clean Legacy Objects ────────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS public.telemetry_minute_summary CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.telemetry_hourly_summary CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.sys_hourly CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.net_hourly CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.ldi_hourly CASCADE;
DROP VIEW IF EXISTS public.v_uptime_summary CASCADE;
DROP VIEW IF EXISTS public.v_fleet_health CASCADE;
DROP VIEW IF EXISTS public.v_fleet_score CASCADE;
DROP TABLE IF EXISTS public.machine_telemetry CASCADE;
DROP TABLE IF EXISTS public.sys_metrics CASCADE;
DROP TABLE IF EXISTS public.net_metrics CASCADE;
DROP TABLE IF EXISTS public.ldi_metrics CASCADE;
DROP TABLE IF EXISTS public.devices CASCADE;
DROP TABLE IF EXISTS public.alert_history CASCADE;
DROP TABLE IF EXISTS public.alert_rules CASCADE;

-- ══════════════════════════════════════════════════════════════
-- V2 NORMALIZED SCHEMA
-- ══════════════════════════════════════════════════════════════

-- ── 1. Device Registry (Static) ─────────────────────────
-- NOTE: 'enabled' is the canonical column name used by Node-RED and Grafana.
--       'is_active' is NOT used — Node-RED reads 'enabled' directly.
CREATE TABLE public.devices (
    device_id       TEXT PRIMARY KEY,
    hostname        TEXT NOT NULL,
    ip_address      TEXT NOT NULL DEFAULT '',
    location        TEXT DEFAULT '',
    device_type     TEXT DEFAULT 'server',
    snmp_community  TEXT DEFAULT 'public',
    snmp_port       INTEGER DEFAULT 161,
    poll_interval   INTEGER DEFAULT 1,
    enabled         BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── 2. System Metrics (CPU, RAM, Disk, Temp) ────────────
CREATE TABLE public.sys_metrics (
    "time"              TIMESTAMPTZ     NOT NULL,
    device_id           TEXT            NOT NULL REFERENCES public.devices(device_id) ON DELETE CASCADE,
    cpu_cores           INTEGER,
    cpu_load_percent    DOUBLE PRECISION,
    ram_total_mb        DOUBLE PRECISION,
    ram_used_mb         DOUBLE PRECISION,
    ram_free_mb         DOUBLE PRECISION,
    disk_total_gb       DOUBLE PRECISION,
    disk_used_gb        DOUBLE PRECISION,
    disk_free_gb        DOUBLE PRECISION,
    disk_description    TEXT            DEFAULT '',
    temp_c              DOUBLE PRECISION DEFAULT 0,
    cpu_metrics         JSONB           DEFAULT '{}'::jsonb,
    temp_metrics        JSONB           DEFAULT '{}'::jsonb
);
SELECT create_hypertable('public.sys_metrics', 'time', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_sys_device_time ON public.sys_metrics (device_id, "time" DESC);

-- ── 3. Network Metrics (per-interface row) ──────────────
CREATE TABLE public.net_metrics (
    "time"              TIMESTAMPTZ     NOT NULL,
    device_id           TEXT            NOT NULL REFERENCES public.devices(device_id) ON DELETE CASCADE,
    iface_name          TEXT            NOT NULL,
    rx_mbps             DOUBLE PRECISION DEFAULT 0,
    tx_mbps             DOUBLE PRECISION DEFAULT 0,
    rx_errors           BIGINT          DEFAULT 0,
    tx_errors           BIGINT          DEFAULT 0,
    rx_drops            BIGINT          DEFAULT 0,
    tx_drops            BIGINT          DEFAULT 0,
    status              TEXT            DEFAULT 'UP'
);
SELECT create_hypertable('public.net_metrics', 'time', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_net_device_time ON public.net_metrics (device_id, "time" DESC);
CREATE INDEX IF NOT EXISTS idx_net_iface ON public.net_metrics (device_id, iface_name, "time" DESC);

-- ── 4. LDI Metrics (Manufacturing equipment) ────────────
CREATE TABLE public.ldi_metrics (
    "time"              TIMESTAMPTZ     NOT NULL,
    device_id           TEXT            NOT NULL REFERENCES public.devices(device_id) ON DELETE CASCADE,
    throughput          DOUBLE PRECISION DEFAULT 0,
    temperature         DOUBLE PRECISION DEFAULT 0,
    humidity            DOUBLE PRECISION DEFAULT 0,
    pressure            DOUBLE PRECISION DEFAULT 0,
    joule_effect        DOUBLE PRECISION DEFAULT 0,
    power_watt          DOUBLE PRECISION DEFAULT 0,
    vibration           DOUBLE PRECISION DEFAULT 0
);
SELECT create_hypertable('public.ldi_metrics', 'time', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_ldi_device_time ON public.ldi_metrics (device_id, "time" DESC);

-- ══════════════════════════════════════════════════════════════
-- CONTINUOUS AGGREGATES
-- ══════════════════════════════════════════════════════════════

-- ── sys_hourly ──────────────────────────────────────────
CREATE MATERIALIZED VIEW public.sys_hourly
WITH (timescaledb.continuous) AS
SELECT time_bucket('1 hour', "time") AS bucket, device_id,
    AVG(cpu_load_percent) AS avg_cpu, MAX(cpu_load_percent) AS max_cpu,
    AVG(ram_used_mb) AS avg_ram_used, AVG(ram_total_mb) AS avg_ram_total,
    AVG(disk_used_gb) AS avg_disk_used, AVG(disk_total_gb) AS avg_disk_total,
    MAX(temp_c) AS max_temp
FROM public.sys_metrics GROUP BY bucket, device_id WITH NO DATA;

-- ── net_hourly ──────────────────────────────────────────
CREATE MATERIALIZED VIEW public.net_hourly
WITH (timescaledb.continuous) AS
SELECT time_bucket('1 hour', "time") AS bucket, device_id, iface_name,
    AVG(rx_mbps) AS avg_rx, MAX(rx_mbps) AS max_rx,
    AVG(tx_mbps) AS avg_tx, MAX(tx_mbps) AS max_tx,
    SUM(rx_errors) AS total_errors, SUM(rx_drops) AS total_drops
FROM public.net_metrics GROUP BY bucket, device_id, iface_name WITH NO DATA;

-- ── ldi_hourly ──────────────────────────────────────────
CREATE MATERIALIZED VIEW public.ldi_hourly
WITH (timescaledb.continuous) AS
SELECT time_bucket('1 hour', "time") AS bucket, device_id,
    AVG(throughput) AS avg_throughput, MAX(temperature) AS max_temp,
    AVG(humidity) AS avg_humidity, AVG(power_watt) AS avg_power,
    AVG(vibration) AS avg_vibration
FROM public.ldi_metrics GROUP BY bucket, device_id WITH NO DATA;

-- ── CAGG Refresh Policies (wrapped for safe boot) ───────
-- On fresh install the raw tables are empty, so refresh windows can be tiny.
-- We widen start_offset to 6 hours and schedule every 30 min to avoid
-- the "policy refresh window too small" error during initdb.
DO $$ BEGIN
    PERFORM add_continuous_aggregate_policy('public.sys_hourly',
        start_offset => INTERVAL '6 hours', end_offset => INTERVAL '30 minutes',
        schedule_interval => INTERVAL '30 minutes', if_not_exists => TRUE);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
    PERFORM add_continuous_aggregate_policy('public.net_hourly',
        start_offset => INTERVAL '6 hours', end_offset => INTERVAL '30 minutes',
        schedule_interval => INTERVAL '30 minutes', if_not_exists => TRUE);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
    PERFORM add_continuous_aggregate_policy('public.ldi_hourly',
        start_offset => INTERVAL '6 hours', end_offset => INTERVAL '30 minutes',
        schedule_interval => INTERVAL '30 minutes', if_not_exists => TRUE);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- ── Compression (compress after 7 days) ─────────────────
DO $$ BEGIN
    ALTER TABLE public.sys_metrics SET (timescaledb.compress, timescaledb.compress_segmentby = 'device_id', timescaledb.compress_orderby = 'time DESC');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE public.net_metrics SET (timescaledb.compress, timescaledb.compress_segmentby = 'device_id', timescaledb.compress_orderby = 'time DESC');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
DO $$ BEGIN
    ALTER TABLE public.ldi_metrics SET (timescaledb.compress, timescaledb.compress_segmentby = 'device_id', timescaledb.compress_orderby = 'time DESC');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN PERFORM add_compression_policy('public.sys_metrics', INTERVAL '7 days', if_not_exists => TRUE); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM add_compression_policy('public.net_metrics', INTERVAL '7 days', if_not_exists => TRUE); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM add_compression_policy('public.ldi_metrics', INTERVAL '7 days', if_not_exists => TRUE); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ── Retention (drop raw after 30 days, CAGG stays forever) ─
DO $$ BEGIN PERFORM add_retention_policy('public.sys_metrics', INTERVAL '30 days', if_not_exists => TRUE); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM add_retention_policy('public.net_metrics', INTERVAL '30 days', if_not_exists => TRUE); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM add_retention_policy('public.ldi_metrics', INTERVAL '30 days', if_not_exists => TRUE); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ── Real-time aggregation ───────────────────────────────
ALTER MATERIALIZED VIEW public.sys_hourly SET (timescaledb.materialized_only = false);
ALTER MATERIALIZED VIEW public.net_hourly SET (timescaledb.materialized_only = false);
ALTER MATERIALIZED VIEW public.ldi_hourly SET (timescaledb.materialized_only = false);

-- Seed devices table with SNMP simulator targets (unified registry)
INSERT INTO public.devices (device_id, hostname, ip_address, snmp_community, snmp_port, enabled) VALUES
    ('ERP-MASTER-WINDOWS', 'ims-snmpsim', '192.168.1.10', 'windows', 161, true),
    ('ERP-MASTER-UBUNTU',  'ims-snmpsim', '192.168.1.11', 'ubuntu', 161, true)
ON CONFLICT (device_id) DO NOTHING;

-- Seed 1000 simulated devices for K6 stress testing
INSERT INTO public.devices (device_id, hostname, ip_address, snmp_community, snmp_port, enabled, device_type)
SELECT
    'E2E-SERVER-' || LPAD(i::text, 3, '0'),
    'ims-snmpsim',
    '10.0.0.' || (i + 1),
    CASE WHEN i % 2 = 0 THEN 'windows' ELSE 'ubuntu' END,
    161,
    false,
    'server'
FROM generate_series(0, 999) AS i
ON CONFLICT (device_id) DO NOTHING;

-- ══════════════════════════════════════════════════════════════
-- VIEWS
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.v_fleet_health AS
SELECT DISTINCT ON (d.device_id)
    d.device_id AS machine_id,
    ROUND((s.cpu_load_percent)::NUMERIC, 1) AS cpu_pct,
    ROUND((s.ram_used_mb / NULLIF(s.ram_total_mb, 0) * 100)::NUMERIC, 1) AS ram_pct,
    ROUND((s.disk_used_gb / NULLIF(s.disk_total_gb, 0) * 100)::NUMERIC, 1) AS disk_pct,
    ROUND(s.temp_c::NUMERIC, 0) AS temp_c,
    GREATEST(0, 100
        - GREATEST(0, s.cpu_load_percent - 70) * 1.5
        - GREATEST(0, (s.ram_used_mb / NULLIF(s.ram_total_mb, 0) * 100) - 75) * 2
        - GREATEST(0, (s.disk_used_gb / NULLIF(s.disk_total_gb, 0) * 100) - 80) * 2
    )::NUMERIC(5,1) AS health_score,
    s.time
FROM public.sys_metrics s
JOIN public.devices d ON d.device_id = s.device_id
WHERE s.time > NOW() - INTERVAL '5 minutes'
ORDER BY d.device_id, s.time DESC;

CREATE OR REPLACE VIEW public.v_fleet_score AS
SELECT 'Fleet Score' AS metric, ROUND(AVG(health_score)::NUMERIC, 1) AS value
FROM public.v_fleet_health;

CREATE OR REPLACE VIEW public.v_uptime_summary AS
SELECT s.device_id AS machine_id, MAX(s.time) AS last_seen,
    EXTRACT(EPOCH FROM (NOW() - MAX(s.time)))::INT AS seconds_since_last,
    CASE
        WHEN EXTRACT(EPOCH FROM (NOW() - MAX(s.time))) <= 30 THEN 'online'
        WHEN EXTRACT(EPOCH FROM (NOW() - MAX(s.time))) <= 300 THEN 'stale'
        ELSE 'offline'
    END AS health_status,
    ROUND(AVG(s.cpu_load_percent)::NUMERIC, 2) AS current_cpu,
    ROUND(AVG(s.temp_c)::NUMERIC, 1) AS current_temp
FROM public.sys_metrics s
WHERE s.time > NOW() - INTERVAL '24 hours'
GROUP BY s.device_id;

-- ══════════════════════════════════════════════════════════════
-- ALERTING
-- ══════════════════════════════════════════════════════════════

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
    (NULL, 'rx_errors',         '>', 100, 'warning'),
    (NULL, 'rx_drops',          '>', 50, 'warning'),
    (NULL, 'status',            '=', 0, 'critical')
ON CONFLICT DO NOTHING;

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

-- ══════════════════════════════════════════════════════════════
-- LDI MANUFACTURING SCHEMA (Production DDL)
-- ══════════════════════════════════════════════════════════════

-- ── LDI Alarm Message Codes (reference table) ─────────────
CREATE TABLE IF NOT EXISTS public.ldi_alarm_ms_code (
    alarm_id    VARCHAR(15) NOT NULL,
    alarm_type  VARCHAR(50),
    alarm_code  VARCHAR(50),
    alarm_msg   VARCHAR(500),
    alarm_detail VARCHAR(500),
    CONSTRAINT ldi_alarm_ms_code_pkey PRIMARY KEY (alarm_id)
);

-- ── LDI Telemetry (per-measurement row) ────────────────────
CREATE TABLE IF NOT EXISTS public.ldi_data (
    "time"          TIMESTAMPTZ     NOT NULL,
    factory         VARCHAR(10)     NOT NULL,
    process         VARCHAR(250)    NOT NULL,
    eqp_id          VARCHAR(250)    NOT NULL,
    mo              VARCHAR(50)     NOT NULL,
    fpn             VARCHAR(50)     NOT NULL,
    layer_name      VARCHAR(250)    NOT NULL,
    resist_dosage   DOUBLE PRECISION,
    scale_x         DOUBLE PRECISION,
    scale_y         DOUBLE PRECISION,
    temperature     DOUBLE PRECISION,
    humidity        DOUBLE PRECISION,
    scan_speed      DOUBLE PRECISION,
    air_vacuum      DOUBLE PRECISION,
    thickness       DOUBLE PRECISION,
    board_no        SMALLINT,
    total_board     SMALLINT,
    total_time      DOUBLE PRECISION,
    filmno          VARCHAR(250),
    board_id        VARCHAR(250),
    resist          VARCHAR(250),
    state           BOOLEAN,
    scale_mode      VARCHAR(250),
    pe_1            DOUBLE PRECISION,
    pe_2            DOUBLE PRECISION,
    pe_3            DOUBLE PRECISION,
    pe_4            DOUBLE PRECISION,
    pe_5            DOUBLE PRECISION,
    pe_6            DOUBLE PRECISION,
    je_1            DOUBLE PRECISION,
    je_2            DOUBLE PRECISION,
    je_3            DOUBLE PRECISION,
    je_4            DOUBLE PRECISION,
    pe_setting      DOUBLE PRECISION,
    je_setting      DOUBLE PRECISION,
    log_id          VARCHAR(50)     NOT NULL
);

SELECT create_hypertable('public.ldi_data', 'time',
    chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);
CREATE UNIQUE INDEX IF NOT EXISTS idx_logid
    ON public.ldi_data (log_id ASC NULLS LAST, "time" DESC NULLS FIRST);
CREATE INDEX IF NOT EXISTS ldi_data_time_idx
    ON public.ldi_data ("time" DESC NULLS FIRST);
CREATE INDEX IF NOT EXISTS idx_ldi_data_eqp_time
    ON public.ldi_data (eqp_id, "time" DESC);

-- ── LDI Alarm Log (per-alarm row) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.ldi_alarm_log (
    logid       VARCHAR(50)     NOT NULL,
    logdate     TIMESTAMPTZ     NOT NULL,
    errorcode   VARCHAR(50),
    errortime   VARCHAR(50),
    equipmentid VARCHAR(50),
    factory     VARCHAR(1),
    process     VARCHAR(50),
    CONSTRAINT pk_ldi_alarm_data PRIMARY KEY (logdate, logid)
);

SELECT create_hypertable('public.ldi_alarm_log', 'logdate',
    chunk_time_interval => INTERVAL '7 days', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_ldi_alarm_logid
    ON public.ldi_alarm_log (logid ASC NULLS LAST);
CREATE INDEX IF NOT EXISTS ldi_alarm_log_logdate_idx
    ON public.ldi_alarm_log (logdate DESC NULLS FIRST);

-- ══════════════════════════════════════════════════════════════
-- LDI SPC VIEWS (Process Capability & Stability)
-- ══════════════════════════════════════════════════════════════

-- Machine ranking by Cpk (process capability index)
CREATE OR REPLACE VIEW public.v_machine_spc_ranking AS
WITH base AS (
    SELECT eqp_id,
           GREATEST(ABS(COALESCE(pe_1,0)), ABS(COALESCE(pe_2,0)),
                     ABS(COALESCE(pe_3,0)), ABS(COALESCE(pe_4,0)),
                     ABS(COALESCE(pe_5,0)), ABS(COALESCE(pe_6,0))) AS max_pe,
           COALESCE(pe_setting, 25.0) AS setting
    FROM public.ldi_data
    WHERE pe_1 IS NOT NULL
      AND "time" > (SELECT MAX("time") - INTERVAL '2 hours' FROM public.ldi_data)
),
stats AS (
    SELECT eqp_id, AVG(max_pe) AS mu, STDDEV(max_pe) AS sigma,
           AVG(setting) AS setting_val, COUNT(*) AS sample_count
    FROM base GROUP BY eqp_id
)
SELECT s.eqp_id, s.sample_count,
       ROUND(s.mu::NUMERIC, 3) AS mean_pe,
       ROUND(s.sigma::NUMERIC, 3) AS stddev_pe,
       ROUND((s.setting_val * 2 / NULLIF(6 * s.sigma, 0))::NUMERIC, 3) AS cp,
       ROUND(LEAST((s.setting_val - s.mu) / NULLIF(3 * s.sigma, 0), (s.mu - (-s.setting_val)) / NULLIF(3 * s.sigma, 0))::NUMERIC, 3) AS cpk,
       CASE
           WHEN LEAST((s.setting_val - s.mu) / NULLIF(3 * s.sigma, 0), (s.mu - (-s.setting_val)) / NULLIF(3 * s.sigma, 0)) >= 2.0 THEN 'World Class'
           WHEN LEAST((s.setting_val - s.mu) / NULLIF(3 * s.sigma, 0), (s.mu - (-s.setting_val)) / NULLIF(3 * s.sigma, 0)) >= 1.67 THEN 'Excellent'
           WHEN LEAST((s.setting_val - s.mu) / NULLIF(3 * s.sigma, 0), (s.mu - (-s.setting_val)) / NULLIF(3 * s.sigma, 0)) >= 1.33 THEN 'Capable'
           WHEN LEAST((s.setting_val - s.mu) / NULLIF(3 * s.sigma, 0), (s.mu - (-s.setting_val)) / NULLIF(3 * s.sigma, 0)) >= 1.0 THEN 'Marginally Capable'
           ELSE 'Not Capable'
       END AS capability_class
FROM stats s WHERE s.sigma > 0 ORDER BY cpk DESC;

-- Process stability index (0-100 composite)
CREATE OR REPLACE VIEW public.v_process_stability AS
WITH time_range AS (
    SELECT MAX("time") - INTERVAL '2 hours' AS cutoff FROM public.ldi_data
),
temp_stats AS (
    SELECT eqp_id, AVG(temperature) AS temp_mu, STDDEV(temperature) AS temp_sigma
    FROM public.ldi_data
    WHERE "time" > (SELECT cutoff FROM time_range) AND temperature IS NOT NULL
    GROUP BY eqp_id
),
hum_stats AS (
    SELECT eqp_id, AVG(humidity) AS hum_mu, STDDEV(humidity) AS hum_sigma
    FROM public.ldi_data
    WHERE "time" > (SELECT cutoff FROM time_range) AND humidity IS NOT NULL
    GROUP BY eqp_id
),
pe_stats AS (
    SELECT eqp_id,
           AVG(GREATEST(ABS(COALESCE(pe_1,0)), ABS(COALESCE(pe_2,0)),
                        ABS(COALESCE(pe_3,0)), ABS(COALESCE(pe_4,0)),
                        ABS(COALESCE(pe_5,0)), ABS(COALESCE(pe_6,0)))) AS pe_mu,
           STDDEV(GREATEST(ABS(COALESCE(pe_1,0)), ABS(COALESCE(pe_2,0)),
                           ABS(COALESCE(pe_3,0)), ABS(COALESCE(pe_4,0)),
                           ABS(COALESCE(pe_5,0)), ABS(COALESCE(pe_6,0)))) AS pe_sigma
    FROM public.ldi_data
    WHERE "time" > (SELECT cutoff FROM time_range) AND pe_1 IS NOT NULL
    GROUP BY eqp_id
)
SELECT COALESCE(t.eqp_id, h.eqp_id, pe.eqp_id) AS eqp_id,
       GREATEST(0, 33 - COALESCE(t.temp_sigma, 99) * 10)::NUMERIC(5,1) AS temp_score,
       GREATEST(0, 33 - COALESCE(h.hum_sigma, 99) * 10)::NUMERIC(5,1) AS hum_score,
       GREATEST(0, 34 - COALESCE(pe.pe_sigma, 99) * 5 - COALESCE(pe.pe_mu, 99) * 2)::NUMERIC(5,1) AS pe_score,
       GREATEST(0, GREATEST(0, 33 - COALESCE(t.temp_sigma, 99) * 10) + GREATEST(0, 33 - COALESCE(h.hum_sigma, 99) * 10) + GREATEST(0, 34 - COALESCE(pe.pe_sigma, 99) * 5 - COALESCE(pe.pe_mu, 99) * 2))::NUMERIC(5,1) AS stability_index
FROM temp_stats t
FULL OUTER JOIN hum_stats h ON t.eqp_id = h.eqp_id
FULL OUTER JOIN pe_stats pe ON COALESCE(t.eqp_id, h.eqp_id) = pe.eqp_id
ORDER BY stability_index DESC;

-- ══════════════════════════════════════════════════════════════
-- GRAFANA READ-ONLY ROLE
-- ══════════════════════════════════════════════════════════════

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'grafana_reader') THEN
        CREATE ROLE grafana_reader WITH LOGIN PASSWORD 'grafana_secure';
    END IF;
END
$$;
GRANT CONNECT ON DATABASE ims TO grafana_reader;
GRANT USAGE ON SCHEMA public TO grafana_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO grafana_reader;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO grafana_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE ims_admin IN SCHEMA public GRANT SELECT ON TABLES TO grafana_reader;
ALTER DEFAULT PRIVILEGES FOR ROLE ims_admin IN SCHEMA public GRANT SELECT ON SEQUENCES TO grafana_reader;

-- ══════════════════════════════════════════════════════════════
-- MIGRATION TRACKING
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version         TEXT PRIMARY KEY,
    filename        TEXT NOT NULL,
    applied_at      TIMESTAMPTZ DEFAULT NOW(),
    checksum        TEXT
);

INSERT INTO public.schema_migrations (version, filename, checksum)
VALUES ('001-init-timescaledb', 'postgres/init/001-init-timescaledb.sql', 'builtin-v2')
ON CONFLICT (version) DO NOTHING;
