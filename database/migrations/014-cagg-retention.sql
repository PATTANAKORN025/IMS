-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 012: Continuous Aggregates + Retention Policy
-- ═══════════════════════════════════════════════════════════════════════════════
-- CAGG = pre-computed rollups → Grafana ไม่ต้อง scan raw table
-- Retention = ลบ raw data อัตโนมัติ แต่เก็บ aggregate ไว้
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. System Metrics — Hourly CAGG ────────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS public.sys_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', "time")   AS bucket,
    device_id,
    AVG(cpu_load_percent)           AS avg_cpu,
    MAX(cpu_load_percent)           AS max_cpu,
    AVG(ram_used_mb)                AS avg_ram_used,
    AVG(ram_total_mb)               AS avg_ram_total,
    AVG(disk_used_gb)               AS avg_disk_used,
    AVG(disk_total_gb)              AS avg_disk_total,
    MAX(temp_c)                     AS max_temp
FROM public.sys_metrics
GROUP BY bucket, device_id
WITH NO DATA;

-- ── 2. Network Metrics — Hourly CAGG ──────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS public.net_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', "time")   AS bucket,
    device_id,
    iface_name,
    AVG(rx_mbps)                    AS avg_rx,
    MAX(rx_mbps)                    AS max_rx,
    AVG(tx_mbps)                    AS avg_tx,
    MAX(tx_mbps)                    AS max_tx,
    SUM(rx_errors)                  AS total_errors,
    SUM(rx_drops)                   AS total_drops
FROM public.net_metrics
GROUP BY bucket, device_id, iface_name
WITH NO DATA;

-- ── 3. LDI Metrics — Hourly CAGG ──────────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS public.ldi_hourly
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', "time")   AS bucket,
    device_id,
    AVG(throughput)                 AS avg_throughput,
    MAX(temperature)                AS max_temp,
    AVG(humidity)                   AS avg_humidity,
    AVG(power_watt)                 AS avg_power,
    AVG(vibration)                  AS avg_vibration
FROM public.ldi_metrics
GROUP BY bucket, device_id
WITH NO DATA;

-- ── 4. Refresh Policies (auto-update CAGGs) ───────────────────────────────
SELECT add_continuous_aggregate_policy('public.sys_hourly',
    start_offset      => INTERVAL '2 hours',
    end_offset        => INTERVAL '10 minutes',
    schedule_interval => INTERVAL '15 minutes',
    if_not_exists     => TRUE
);

SELECT add_continuous_aggregate_policy('public.net_hourly',
    start_offset      => INTERVAL '2 hours',
    end_offset        => INTERVAL '10 minutes',
    schedule_interval => INTERVAL '15 minutes',
    if_not_exists     => TRUE
);

SELECT add_continuous_aggregate_policy('public.ldi_hourly',
    start_offset      => INTERVAL '2 hours',
    end_offset        => INTERVAL '10 minutes',
    schedule_interval => INTERVAL '15 minutes',
    if_not_exists     => TRUE
);

-- ── 5. Compression (raw data → compress after 7 days) ─────────────────────

ALTER TABLE public.sys_metrics SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'device_id',
    timescaledb.compress_orderby = 'time DESC'
);

ALTER TABLE public.net_metrics SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'device_id',
    timescaledb.compress_orderby = 'time DESC'
);

ALTER TABLE public.ldi_metrics SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'device_id',
    timescaledb.compress_orderby = 'time DESC'
);

SELECT add_compression_policy('public.sys_metrics',  INTERVAL '7 days', if_not_exists => TRUE);
SELECT add_compression_policy('public.net_metrics',  INTERVAL '7 days', if_not_exists => TRUE);
SELECT add_compression_policy('public.ldi_metrics',  INTERVAL '7 days', if_not_exists => TRUE);

-- ── 6. Retention (raw → drop after 30 days, CAGG stays forever) ────────────
SELECT add_retention_policy('public.sys_metrics', INTERVAL '30 days', if_not_exists => TRUE);
SELECT add_retention_policy('public.net_metrics', INTERVAL '30 days', if_not_exists => TRUE);
SELECT add_retention_policy('public.ldi_metrics', INTERVAL '30 days', if_not_exists => TRUE);

-- ── 7. Real-time Aggregation (include recent raw data in CAGG queries) ────
ALTER MATERIALIZED VIEW public.sys_hourly  SET (timescaledb.materialized_only = false);
ALTER MATERIALIZED VIEW public.net_hourly  SET (timescaledb.materialized_only = false);
ALTER MATERIALIZED VIEW public.ldi_hourly  SET (timescaledb.materialized_only = false);
