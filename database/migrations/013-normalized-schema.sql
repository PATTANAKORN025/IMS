-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 011: Normalized Schema — Separate tables by data domain
-- ═══════════════════════════════════════════════════════════════════════════════
-- แยกข้อมูลตามธรรมชาติ: devices (static), sys, net, ldi (time-series)
-- ทุกตารางใช้ parameterized $N ผ่าน PgBouncer ได้ปลอดภัย
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ── 1. Device Registry (Static — ไม่ต้อง partition) ────────────────────────
CREATE TABLE IF NOT EXISTS public.devices (
    device_id       TEXT PRIMARY KEY,
    hostname        TEXT NOT NULL,
    ip_address      TEXT NOT NULL,
    location        TEXT DEFAULT '',
    device_type     TEXT DEFAULT 'server',   -- server | workstation | ldi | network
    snmp_community  TEXT DEFAULT 'public',
    snmp_port       INTEGER DEFAULT 161,
    poll_interval   INTEGER DEFAULT 1,
    enabled         BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'devices' AND column_name = 'is_active'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'devices' AND column_name = 'enabled'
    ) THEN
        ALTER TABLE public.devices RENAME COLUMN is_active TO enabled;
    ELSIF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'devices' AND column_name = 'enabled'
    ) THEN
        ALTER TABLE public.devices ADD COLUMN enabled BOOLEAN DEFAULT TRUE;
    END IF;
END $$;

-- ── 2. System Metrics (CPU, RAM, Disk, Temp) ───────────────────────────────
-- ทุกเครื่องมีข้อมูลกลุ่มนี้ — ไม่มี NULL column
CREATE TABLE IF NOT EXISTS public.sys_metrics (
    "time"              TIMESTAMPTZ     NOT NULL,
    device_id           TEXT            NOT NULL,
    cpu_cores           INTEGER,
    cpu_load_percent    DOUBLE PRECISION,
    ram_total_mb        DOUBLE PRECISION,
    ram_used_mb         DOUBLE PRECISION,
    ram_free_mb         DOUBLE PRECISION,
    disk_total_gb       DOUBLE PRECISION,
    disk_used_gb        DOUBLE PRECISION,
    disk_free_gb        DOUBLE PRECISION,
    disk_description    TEXT            DEFAULT '',
    temp_c              DOUBLE PRECISION DEFAULT 0
);

SELECT create_hypertable(
    'public.sys_metrics', 'time',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_sys_device_time
    ON public.sys_metrics (device_id, "time" DESC);

-- ── 3. Network Metrics (per-interface row) ─────────────────────────────────
-- แยก interface เป็น row 而非 JSONB — query ง่าย, Grafana filter ได้เลย
CREATE TABLE IF NOT EXISTS public.net_metrics (
    "time"              TIMESTAMPTZ     NOT NULL,
    device_id           TEXT            NOT NULL,
    iface_name          TEXT            NOT NULL,
    rx_mbps             DOUBLE PRECISION DEFAULT 0,
    tx_mbps             DOUBLE PRECISION DEFAULT 0,
    rx_errors           BIGINT          DEFAULT 0,
    tx_errors           BIGINT          DEFAULT 0,
    rx_drops            BIGINT          DEFAULT 0,
    tx_drops            BIGINT          DEFAULT 0,
    status              TEXT            DEFAULT 'UP'  -- UP | DOWN
);

SELECT create_hypertable(
    'public.net_metrics', 'time',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_net_device_time
    ON public.net_metrics (device_id, "time" DESC);

CREATE INDEX IF NOT EXISTS idx_net_iface
    ON public.net_metrics (device_id, iface_name, "time" DESC);

-- ── 4. LDI Metrics (Manufacturing equipment) ───────────────────────────────
-- เฉพาะเครื่องที่ต่ออุปกรณ์ LDI — ไม่มี row เปล่าสำหรับ server ธรรมดา
CREATE TABLE IF NOT EXISTS public.ldi_metrics (
    "time"              TIMESTAMPTZ     NOT NULL,
    device_id           TEXT            NOT NULL,
    throughput          DOUBLE PRECISION DEFAULT 0,
    temperature         DOUBLE PRECISION DEFAULT 0,
    humidity            DOUBLE PRECISION DEFAULT 0,
    pressure            DOUBLE PRECISION DEFAULT 0,
    joule_effect        DOUBLE PRECISION DEFAULT 0,
    power_watt          DOUBLE PRECISION DEFAULT 0,
    vibration           DOUBLE PRECISION DEFAULT 0,
    wifi_rssi           INTEGER         DEFAULT 0,
    wifi_snr            INTEGER         DEFAULT 0
);

SELECT create_hypertable(
    'public.ldi_metrics', 'time',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_ldi_device_time
    ON public.ldi_metrics (device_id, "time" DESC);
