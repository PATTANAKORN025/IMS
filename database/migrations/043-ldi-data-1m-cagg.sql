-- ══════════════════════════════════════════════════════════════
-- Migration 043: ldi_data_1m — 1-minute continuous aggregate
-- ══════════════════════════════════════════════════════════════
-- public.ldi_data_hourly already exists (migration 032) but is grouped by
-- (bucket, eqp_id) only — no factory/process/mo/fpn/layer_name — so it
-- can't back any dashboard panel that respects the Factory/Process/MO/FPN/
-- Layer template filters, and hourly resolution is too coarse for the
-- shorter end of "long-range" (a 6h view would get 6 points). No dashboard
-- currently queries it.
--
-- ldi_data_1m is a complementary, finer-grained CAGG carrying the full
-- filter dimension set, built specifically to back the long-range TREND
-- panels currently scanning raw ldi_data:
--   - temperature/humidity, scan_speed/air_vacuum, scale_x/scale_y
--   - resist_dosage
--   - pe_1..pe_6, je_1..je_4, pe_setting, je_setting (per-column AVG —
--     NOT unpivoted/pooled, since that needs raw signed samples; a CAGG
--     storing only avg() can't reconstruct STDDEV_SAMP across a longer
--     re-aggregation window without also carrying variance/count state,
--     which is out of scope here)
--
-- Explicitly NOT migrated to this CAGG (left on raw ldi_data):
--   - the "state" state-timeline panel — 1-min-bucketed state would
--     average away the precise on/off transition timing a state-timeline
--     needs to render meaningfully.
--   - v_machine_spc_ranking / v_machine_spc_fleet / the Machine Capability
--     Ranking / PE-StdDev / JE-StdDev / Process Capability panels — these
--     all need STDDEV_SAMP over individual signed pe_1..6/je_1..4 samples
--     for real Cpk math (see migrations 041/042), and are already scoped
--     to short rolling windows (2h/24h), not "long-range" in the sense
--     this migration targets.
--
-- Grouped by (bucket, eqp_id, factory, process, mo, fpn, layer_name): in
-- any given 1-minute window a machine is essentially always on a single
-- job/part/layer, so this grouping barely fragments the aggregation while
-- preserving full filterability by every template variable dashboards use.

CREATE MATERIALIZED VIEW IF NOT EXISTS public.ldi_data_1m
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 minute', "time") AS bucket,
    eqp_id, factory, process, mo, fpn, layer_name,
    COUNT(*)                AS sample_count,
    AVG(temperature)        AS avg_temperature,
    AVG(humidity)            AS avg_humidity,
    AVG(air_vacuum)          AS avg_air_vacuum,
    AVG(scan_speed)          AS avg_scan_speed,
    AVG(thickness)           AS avg_thickness,
    AVG(resist_dosage)       AS avg_resist_dosage,
    AVG(scale_x)             AS avg_scale_x,
    AVG(scale_y)             AS avg_scale_y,
    AVG(pe_1) AS avg_pe_1, AVG(pe_2) AS avg_pe_2, AVG(pe_3) AS avg_pe_3,
    AVG(pe_4) AS avg_pe_4, AVG(pe_5) AS avg_pe_5, AVG(pe_6) AS avg_pe_6,
    AVG(je_1) AS avg_je_1, AVG(je_2) AS avg_je_2, AVG(je_3) AS avg_je_3, AVG(je_4) AS avg_je_4,
    AVG(pe_setting)          AS avg_pe_setting,
    AVG(je_setting)          AS avg_je_setting
FROM public.ldi_data
GROUP BY bucket, eqp_id, factory, process, mo, fpn, layer_name
WITH NO DATA;

-- Refresh every minute; leave the last minute unaggregated (still settling).
DO $$ BEGIN
    PERFORM add_continuous_aggregate_policy('public.ldi_data_1m',
        start_offset      => INTERVAL '2 hours',
        end_offset        => INTERVAL '1 minute',
        schedule_interval => INTERVAL '1 minute',
        if_not_exists     => TRUE);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Real-time aggregation: merge the latest not-yet-refreshed raw rows into
-- query results, so panels reading this CAGG never show data staler than
-- the underlying ingestion lag (not just the last completed refresh).
ALTER MATERIALIZED VIEW public.ldi_data_1m SET (timescaledb.materialized_only = false);

-- Retention: 1-minute granularity only matters for the recent end of
-- "long-range" (days-to-weeks); older history is still served at hourly
-- resolution by ldi_data_hourly (2-year retention) or from raw ldi_data
-- (180-day retention, migration 032).
SELECT add_retention_policy('public.ldi_data_1m', INTERVAL '30 days', if_not_exists => true);
