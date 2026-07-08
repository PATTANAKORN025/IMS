-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 010: Redesign Hypertable Schema — Production-Ready
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Design Goals:
--   1. Single hypertable for ALL telemetry (wide table pattern)
--   2. partitioned by "time" with 7-day chunk intervals
--   3. Segmented by machine_id for per-device query efficiency
--   4. JSONB for flexible per-interface metrics (avoids EAV anti-pattern)
--   5. Continuous aggregates for minute/hourly rollups (no raw-table scans)
--   6. Compression: raw data after 90d, CAGGs after 7d
--   7. Retention: auto-drop raw chunks older than 365d
--
-- PgBouncer Notes:
--   - Uses transaction pooling (no prepared statements)
--   - All queries use parameterized $1..$N (safe for connection pooler)
--   - No session-level features (TEMP tables, LISTEN/NOTIFY)
--   - AUTH_TYPE: plain (password sent in clear over internal network)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Extensions ────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ── 2. Device Registry ───────────────────────────────────────────────────────
-- Source of truth for SNMP targets. The "Load Device Registry" node reads from
-- this table and caches into global context on startup.

CREATE TABLE IF NOT EXISTS public.machines (
    machine_id      TEXT PRIMARY KEY,
    hostname        TEXT NOT NULL,
    community       TEXT DEFAULT 'public',
    snmp_port       INTEGER DEFAULT 161,
    enabled         BOOLEAN DEFAULT TRUE,
    description     TEXT DEFAULT '',
    location        TEXT DEFAULT '',
    machine_type    TEXT DEFAULT 'server',   -- server | workstation | network | sensor
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_machines_enabled ON public.machines (enabled) WHERE enabled = TRUE;

-- ── 3. Main Hypertable ──────────────────────────────────────────────────────
-- Wide table: every metric from every poll cycle in one row.
-- Partitioned by "time", segmented by "machine_id".
-- chunk_interval = 7 days (good balance: ~70k rows/chunk at 10s poll, 5 machines)

CREATE TABLE IF NOT EXISTS public.machine_telemetry (
    "time"              TIMESTAMPTZ     NOT NULL,
    machine_id          TEXT            NOT NULL,

    -- CPU
    cpu_cores           INTEGER,
    cpu_load_percent    DOUBLE PRECISION,

    -- RAM (derived from hrStorageType 25.2.1.2)
    ram_total_mb        DOUBLE PRECISION,
    ram_used_mb         DOUBLE PRECISION,
    ram_free_mb         DOUBLE PRECISION,

    -- Disk (derived from hrStorageType 25.2.1.4)
    disk_total_gb       DOUBLE PRECISION,
    disk_used_gb        DOUBLE PRECISION,
    disk_free_gb        DOUBLE PRECISION,
    disk_description    TEXT            DEFAULT '',

    -- Network (aggregated across all interfaces)
    net_rx_bytes        BIGINT          DEFAULT 0,
    net_tx_bytes        BIGINT          DEFAULT 0,
    net_rx_errors       BIGINT          DEFAULT 0,
    net_rx_drops        BIGINT          DEFAULT 0,
    net_if_status       INTEGER         DEFAULT 1,     -- 1=UP, 2=DOWN

    -- Network Rate (calculated by parser from counter deltas)
    rx_mbps             DOUBLE PRECISION DEFAULT 0,
    tx_mbps             DOUBLE PRECISION DEFAULT 0,

    -- Per-interface breakdown (flexible schema for varying NIC counts)
    interface_metrics   JSONB           DEFAULT '{}'::jsonb,

    -- Temperature (max sensor reading per poll cycle)
    temp_c              DOUBLE PRECISION DEFAULT 0,

    -- LDI Manufacturing Equipment
    ldi_throughput      DOUBLE PRECISION DEFAULT 0,
    ldi_temp            DOUBLE PRECISION DEFAULT 0,
    ldi_humidity        DOUBLE PRECISION DEFAULT 0,
    ldi_pe              DOUBLE PRECISION DEFAULT 0,   -- pressure sensor avg
    ldi_je              DOUBLE PRECISION DEFAULT 0,
    ldi_power           DOUBLE PRECISION DEFAULT 0,
    ldi_vibration       DOUBLE PRECISION DEFAULT 0,
    ldi_uptime          BIGINT          DEFAULT 0,

    -- WiFi (signal quality)
    wifi_rssi           INTEGER         DEFAULT 0,
    wifi_snr            INTEGER         DEFAULT 0
);

-- Convert to hypertable (idempotent)
SELECT create_hypertable(
    'public.machine_telemetry', 'time',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE
);

-- ── 4. Indexes ──────────────────────────────────────────────────────────────
-- idx_machine_time: primary query path (machine + time range)
-- idx_machine_interfaces: GIN for JSONB queries on interface_metrics
-- idx_time_desc: used by "latest N rows" pattern

CREATE INDEX IF NOT EXISTS idx_machine_time
    ON public.machine_telemetry (machine_id, "time" DESC);

CREATE INDEX IF NOT EXISTS idx_machine_interfaces
    ON public.machine_telemetry USING GIN (interface_metrics);

CREATE INDEX IF NOT EXISTS idx_time_desc
    ON public.machine_telemetry ("time" DESC);

-- ── 5. Continuous Aggregates ────────────────────────────────────────────────
-- CAGGs pre-compute rollups so dashboards never scan raw data.
-- Refresh policy runs every 5 minutes, keeping data ~5min fresh.

-- Minute-level aggregate (keeps 30 days)
CREATE MATERIALIZED VIEW IF NOT EXISTS public.telemetry_minute_summary
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 minute', "time")   AS bucket,
    machine_id,
    AVG(cpu_load_percent)             AS avg_cpu,
    MAX(cpu_load_percent)             AS max_cpu,
    AVG(ram_used_mb)                  AS avg_ram_used,
    AVG(ram_total_mb)                 AS avg_ram_total,
    AVG(disk_used_gb)                 AS avg_disk_used,
    AVG(disk_total_gb)                AS avg_disk_total,
    AVG(rx_mbps)                      AS avg_rx_mbps,
    AVG(tx_mbps)                      AS avg_tx_mbps,
    MAX(rx_mbps)                      AS max_rx_mbps,
    MAX(tx_mbps)                      AS max_tx_mbps,
    SUM(net_rx_errors)                AS sum_errors,
    SUM(net_rx_drops)                 AS sum_drops,
    MAX(temp_c)                       AS max_temp,
    AVG(ldi_throughput)               AS avg_ldi_throughput,
    AVG(ldi_humidity)                 AS avg_ldi_humidity,
    AVG(ldi_power)                    AS avg_ldi_power,
    AVG(wifi_rssi)                    AS avg_wifi_rssi,
    AVG(wifi_snr)                     AS avg_wifi_snr
FROM public.machine_telemetry
GROUP BY bucket, machine_id
WITH NO DATA;

-- Hourly aggregate (keeps 90 days)
CREATE MATERIALIZED VIEW IF NOT EXISTS public.telemetry_hourly_summary
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', "time")     AS bucket,
    machine_id,
    AVG(cpu_load_percent)             AS avg_cpu,
    MAX(cpu_load_percent)             AS max_cpu,
    AVG(ram_used_mb)                  AS avg_ram_used,
    AVG(ram_total_mb)                 AS avg_ram_total,
    AVG(disk_used_gb)                 AS avg_disk_used,
    AVG(disk_total_gb)                AS avg_disk_total,
    AVG(rx_mbps)                      AS avg_rx_mbps,
    AVG(tx_mbps)                      AS avg_tx_mbps,
    MAX(rx_mbps)                      AS max_rx_mbps,
    MAX(tx_mbps)                      AS max_tx_mbps,
    SUM(net_rx_errors)                AS sum_errors,
    SUM(net_rx_drops)                 AS sum_drops,
    MAX(temp_c)                       AS max_temp,
    AVG(ldi_throughput)               AS avg_ldi_throughput,
    AVG(ldi_humidity)                 AS avg_ldi_humidity,
    AVG(ldi_power)                    AS avg_ldi_power,
    AVG(wifi_rssi)                    AS avg_wifi_rssi,
    AVG(wifi_snr)                     AS avg_wifi_snr
FROM public.machine_telemetry
GROUP BY bucket, machine_id
WITH NO DATA;

-- ── 6. Continuous Aggregate Refresh Policies ────────────────────────────────

SELECT add_continuous_aggregate_policy('public.telemetry_minute_summary',
    start_offset    => INTERVAL '10 minutes',
    end_offset      => INTERVAL '1 minute',
    schedule_interval => INTERVAL '5 minutes',
    if_not_exists   => TRUE
);

SELECT add_continuous_aggregate_policy('public.telemetry_hourly_summary',
    start_offset    => INTERVAL '2 hours',
    end_offset      => INTERVAL '10 minutes',
    schedule_interval => INTERVAL '15 minutes',
    if_not_exists   => TRUE
);

-- ── 7. Compression Policy ──────────────────────────────────────────────────
-- Raw data: compress after 90 days (saves ~90% storage)
-- CAGGs: compress after 7 days (already aggregated, minimal gain)

ALTER TABLE public.machine_telemetry SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'machine_id',
    timescaledb.compress_orderby = 'time DESC'
);

SELECT add_compression_policy(
    'public.machine_telemetry',
    INTERVAL '90 days',
    if_not_exists => TRUE
);

-- ── 8. Retention Policy ────────────────────────────────────────────────────
-- Auto-drop raw chunks older than 1 year (CAGGs preserve aggregates)

SELECT add_retention_policy(
    'public.machine_telemetry',
    INTERVAL '365 days',
    if_not_exists => TRUE
);

-- ── 9. Real-Time Aggregation Policy ────────────────────────────────────────
-- Allows CAGG queries to include recent (not-yet-materialized) data
-- from the raw hypertable, so dashboards see data up to ~1 minute ago.

ALTER MATERIALIZED VIEW public.telemetry_minute_summary
    SET (timescaledb.materialized_only = false);

ALTER MATERIALIZED VIEW public.telemetry_hourly_summary
    SET (timescaledb.materialized_only = false);
