-- ══════════════════════════════════════════════════════════════
-- Migration 044: ldi_data_15m, ldi_data_1h — complete the tiering contract
-- ══════════════════════════════════════════════════════════════
-- docs/GRAFANA_DESIGN_SYSTEM.md §10 checklist already documents the query
-- tiering rule every panel must follow:
--   raw ldi_data   -> latest-value lookups only (single row by log_id/time)
--   ldi_data_1m    -> ranges <= 6h              (migration 043)
--   ldi_data_15m   -> ranges 6h - 2 days          (this migration)
--   ldi_data_1h    -> ranges > 2 days             (this migration)
--
-- Cascaded (CAGG-on-CAGG), same pattern as sys_hourly -> sys_daily
-- (migration 015): ldi_data_15m is built FROM ldi_data_1m, and ldi_data_1h
-- is built FROM ldi_data_15m. Re-aggregating an already-averaged column is
-- an accepted approximation for these AVG-only trend tiers (same tradeoff
-- migration 043 documents) — none of the Cpk/StdDev panels use these,
-- they stay on raw ldi_data with true sample-level STDDEV_SAMP.
--
-- No current LDI dashboard panel has an effective time range beyond 6h
-- today (checked: ims-capacity-planning.json's LDI panels default to
-- now-15m, no dashboard defaults past 24h), so nothing gets migrated to
-- these tiers in this migration — they exist so a future long-range LDI
-- panel has a tier to land on instead of scanning raw ldi_data, and so
-- the query-budget lint (tests/lint/query-budget-linter.js) has something
-- concrete to enforce against.

CREATE MATERIALIZED VIEW IF NOT EXISTS public.ldi_data_15m
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('15 minutes', bucket) AS bucket,
    eqp_id, factory, process, mo, fpn, layer_name,
    SUM(sample_count)         AS sample_count,
    AVG(avg_temperature)      AS avg_temperature,
    AVG(avg_humidity)         AS avg_humidity,
    AVG(avg_air_vacuum)       AS avg_air_vacuum,
    AVG(avg_scan_speed)       AS avg_scan_speed,
    AVG(avg_thickness)        AS avg_thickness,
    AVG(avg_resist_dosage)    AS avg_resist_dosage,
    AVG(avg_scale_x)          AS avg_scale_x,
    AVG(avg_scale_y)          AS avg_scale_y,
    AVG(avg_pe_1) AS avg_pe_1, AVG(avg_pe_2) AS avg_pe_2, AVG(avg_pe_3) AS avg_pe_3,
    AVG(avg_pe_4) AS avg_pe_4, AVG(avg_pe_5) AS avg_pe_5, AVG(avg_pe_6) AS avg_pe_6,
    AVG(avg_je_1) AS avg_je_1, AVG(avg_je_2) AS avg_je_2, AVG(avg_je_3) AS avg_je_3, AVG(avg_je_4) AS avg_je_4,
    AVG(avg_pe_setting)       AS avg_pe_setting,
    AVG(avg_je_setting)       AS avg_je_setting
FROM public.ldi_data_1m
GROUP BY 1, eqp_id, factory, process, mo, fpn, layer_name
WITH NO DATA;

CREATE MATERIALIZED VIEW IF NOT EXISTS public.ldi_data_1h
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', bucket) AS bucket,
    eqp_id, factory, process, mo, fpn, layer_name,
    SUM(sample_count)         AS sample_count,
    AVG(avg_temperature)      AS avg_temperature,
    AVG(avg_humidity)         AS avg_humidity,
    AVG(avg_air_vacuum)       AS avg_air_vacuum,
    AVG(avg_scan_speed)       AS avg_scan_speed,
    AVG(avg_thickness)        AS avg_thickness,
    AVG(avg_resist_dosage)    AS avg_resist_dosage,
    AVG(avg_scale_x)          AS avg_scale_x,
    AVG(avg_scale_y)          AS avg_scale_y,
    AVG(avg_pe_1) AS avg_pe_1, AVG(avg_pe_2) AS avg_pe_2, AVG(avg_pe_3) AS avg_pe_3,
    AVG(avg_pe_4) AS avg_pe_4, AVG(avg_pe_5) AS avg_pe_5, AVG(avg_pe_6) AS avg_pe_6,
    AVG(avg_je_1) AS avg_je_1, AVG(avg_je_2) AS avg_je_2, AVG(avg_je_3) AS avg_je_3, AVG(avg_je_4) AS avg_je_4,
    AVG(avg_pe_setting)       AS avg_pe_setting,
    AVG(avg_je_setting)       AS avg_je_setting
FROM public.ldi_data_15m
GROUP BY 1, eqp_id, factory, process, mo, fpn, layer_name
WITH NO DATA;

-- Refresh policies: 15m tier refreshes every 15 min once its source (1m)
-- has settled; 1h tier every hour once 15m has settled.
DO $$ BEGIN
    PERFORM add_continuous_aggregate_policy('public.ldi_data_15m',
        start_offset      => INTERVAL '3 hours',
        end_offset        => INTERVAL '15 minutes',
        schedule_interval => INTERVAL '15 minutes',
        if_not_exists     => TRUE);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
    PERFORM add_continuous_aggregate_policy('public.ldi_data_1h',
        start_offset      => INTERVAL '1 day',
        end_offset        => INTERVAL '1 hour',
        schedule_interval => INTERVAL '1 hour',
        if_not_exists     => TRUE);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ALTER MATERIALIZED VIEW public.ldi_data_15m SET (timescaledb.materialized_only = false);
ALTER MATERIALIZED VIEW public.ldi_data_1h SET (timescaledb.materialized_only = false);

-- Retention: 15m tier kept 90 days (covers the whole 6h-2d use case plus
-- headroom), 1h tier kept 2 years (matches ldi_data_hourly's existing
-- retention, migration 032).
SELECT add_retention_policy('public.ldi_data_15m', INTERVAL '90 days', if_not_exists => true);
SELECT add_retention_policy('public.ldi_data_1h', INTERVAL '2 years', if_not_exists => true);
