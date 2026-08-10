-- ══════════════════════════════════════════════════════════════
-- Migration 064: Materialize the fleet SPC / RCA analytical views
-- ══════════════════════════════════════════════════════════════
-- World-Class Ready audit (2026-08-08) measured and documented (via
-- QUERY_BUDGET_EXEMPT comments) that 5 deep-dive analytical panels exceed
-- the 50-80ms real-time budget because their backing views recompute an
-- expensive per-row unpivot+STDDEV Cpk aggregation (v_machine_spc_fleet)
-- or re-scan an alarm-context CTE once per UNION branch
-- (v_ldi_rca_recent_window, and the RCA Truth Test panel's inline query)
-- on every single dashboard load:
--   - Fleet Status, Worst Cpk (Fleet, 24h), JE Pass Rate (Fleet, 24h)
--     [ims-ldi-manufacturing.json]           <- read v_machine_spc_fleet
--   - Top Correlated Alarms (24h)            <- reads v_ldi_rca_recent_window
--     [ims-ldi-manufacturing.json]
--   - Alarm <-> Process Correlation (RCA Truth Test)
--     [ims-ldi-engineering-analytics.json]   <- inline CTE, not a shared view
--
-- None of these need per-request precision: a 24h-rolling-window fleet KPI
-- or a full-dataset RCA validation table are both meaningfully "fresh" at
-- a 60-second refresh cadence. Converting the two existing views (same
-- names, same output columns -- zero dashboard JSON changes needed for
-- those 4 panels) and the RCA Truth Test's inline query (new shared view,
-- one dashboard JSON update) to materialized views, refreshed on a
-- schedule via TimescaleDB's built-in generic job scheduler (`add_job` --
-- no pg_cron extension required, and none is installed in this stack),
-- turns each read from "recompute the whole aggregation" into "scan a few
-- pre-computed rows".
--
-- REFRESH MATERIALIZED VIEW CONCURRENTLY is used so readers are never
-- blocked during a refresh; it requires a unique index on each MV.

-- ── v_machine_spc_fleet ──────────────────────────────────────────
DROP VIEW IF EXISTS public.v_machine_spc_fleet CASCADE;
CREATE MATERIALIZED VIEW public.v_machine_spc_fleet AS
WITH pe_base AS (
    SELECT eqp_id, pe_1, pe_2, pe_3, pe_4, pe_5, pe_6,
           COALESCE(pe_setting, 25.0) AS pe_val
    FROM public.ldi_data
    WHERE pe_1 IS NOT NULL
      AND COALESCE(pe_setting, 0) > 2.0
      AND "time" > NOW() - INTERVAL '24 hours'
),
pe_samples AS (
    SELECT eqp_id, pe_val, v.pe
    FROM pe_base
    CROSS JOIN LATERAL (VALUES (pe_1),(pe_2),(pe_3),(pe_4),(pe_5),(pe_6)) v(pe)
    WHERE v.pe IS NOT NULL
),
pe_stats AS (
    SELECT eqp_id, COUNT(*) AS n_pe,
           COUNT(*) FILTER (WHERE ABS(pe) <= pe_val) AS pass_pe,
           AVG(pe) AS mu, STDDEV(pe) AS sigma, AVG(pe_val) AS setting_val
    FROM pe_samples GROUP BY eqp_id
),
pe_capability AS (
    SELECT *,
           setting_val / NULLIF(3 * sigma, 0) AS cp_pe,
           LEAST((setting_val - mu) / NULLIF(3 * sigma, 0),
                 (mu + setting_val) / NULLIF(3 * sigma, 0)) AS cpk_pe
    FROM pe_stats
),
je_base AS (
    SELECT eqp_id, je_1, je_2, je_3, je_4,
           COALESCE(je_setting, 25.0) AS je_val
    FROM public.ldi_data
    WHERE je_1 IS NOT NULL
      AND COALESCE(je_setting, 0) > 2.0
      AND "time" > NOW() - INTERVAL '24 hours'
),
je_samples AS (
    SELECT eqp_id, je_val, v.je
    FROM je_base
    CROSS JOIN LATERAL (VALUES (je_1),(je_2),(je_3),(je_4)) v(je)
    WHERE v.je IS NOT NULL
),
je_stats AS (
    SELECT eqp_id, COUNT(*) AS n_je,
           COUNT(*) FILTER (WHERE ABS(je) <= je_val) AS pass_je,
           AVG(je) AS mu, STDDEV(je) AS sigma, AVG(je_val) AS setting_val
    FROM je_samples GROUP BY eqp_id
),
je_capability AS (
    SELECT *,
           setting_val / NULLIF(3 * sigma, 0) AS cp_je,
           LEAST((setting_val - mu) / NULLIF(3 * sigma, 0),
                 (mu + setting_val) / NULLIF(3 * sigma, 0)) AS cpk_je
    FROM je_stats
)
SELECT d.device_id AS eqp_id,
       d.location,
       p.n_pe,
       ROUND(p.cp_pe::NUMERIC, 3) AS cp_pe,
       ROUND(p.cpk_pe::NUMERIC, 3) AS cpk_pe,
       ROUND((100.0 * p.pass_pe / NULLIF(p.n_pe, 0))::NUMERIC, 1) AS pe_pass_rate,
       j.n_je,
       ROUND(j.cp_je::NUMERIC, 3) AS cp_je,
       ROUND(j.cpk_je::NUMERIC, 3) AS cpk_je,
       ROUND((100.0 * j.pass_je / NULLIF(j.n_je, 0))::NUMERIC, 1) AS je_pass_rate,
       ROUND((CASE
           WHEN p.cpk_pe IS NULL THEN j.cpk_je
           WHEN j.cpk_je IS NULL THEN p.cpk_pe
           ELSE LEAST(p.cpk_pe, j.cpk_je)
       END)::NUMERIC, 3) AS worst_cpk,
       CASE
           WHEN p.cpk_pe IS NULL THEN j.n_je
           WHEN j.cpk_je IS NULL THEN p.n_pe
           WHEN p.cpk_pe <= j.cpk_je THEN p.n_pe
           ELSE j.n_je
       END AS worst_n
FROM public.devices d
LEFT JOIN pe_capability p ON p.eqp_id = d.device_id
LEFT JOIN je_capability j ON j.eqp_id = d.device_id
WHERE d.device_type = 'ldi' AND d.enabled
WITH DATA;

CREATE UNIQUE INDEX v_machine_spc_fleet_eqp_id_idx ON public.v_machine_spc_fleet (eqp_id);
GRANT SELECT ON public.v_machine_spc_fleet TO grafana_reader;

-- ── v_ldi_rca_recent_window ──────────────────────────────────────
DROP VIEW IF EXISTS public.v_ldi_rca_recent_window CASCADE;
CREATE MATERIALIZED VIEW public.v_ldi_rca_recent_window AS
WITH alarm_ctx AS (
    SELECT c.*, cat.category
    FROM public.v_ldi_alarm_context c
    JOIN public.v_ldi_alarm_category cat ON cat.alarm_code = c.errorcode
    WHERE c.alarm_time > NOW() - INTERVAL '24 hours'
),
baseline AS (
    SELECT
        ROUND((100.0 * COUNT(*) FILTER (WHERE temperature < 20 OR temperature > 24) / NULLIF(COUNT(*), 0))::NUMERIC, 1) AS thermal_pct,
        ROUND((100.0 * COUNT(*) FILTER (WHERE humidity < 50 OR humidity > 60) / NULLIF(COUNT(*), 0))::NUMERIC, 1) AS humidity_pct,
        ROUND((100.0 * COUNT(*) FILTER (WHERE ABS(pe_1) > 10 OR ABS(je_1) > 10) / NULLIF(COUNT(*), 0))::NUMERIC, 1) AS pe_pct,
        ROUND((100.0 * COUNT(*) FILTER (WHERE scan_speed > 450 OR scan_speed <= 0) / NULLIF(COUNT(*), 0))::NUMERIC, 1) AS motion_pct
    FROM public.ldi_data WHERE "time" > NOW() - INTERVAL '24 hours'
),
cats AS (
    SELECT 'THERMAL (91008)' AS cat, ROUND((100.0 * COUNT(*) FILTER (WHERE flag_thermal_out_of_spec) / NULLIF(COUNT(*), 0))::NUMERIC, 1) AS alarm_pct, COUNT(*) AS n FROM alarm_ctx WHERE category = 'ENVIRONMENT'
    UNION ALL
    SELECT 'HUMIDITY (91008)', ROUND((100.0 * COUNT(*) FILTER (WHERE flag_humidity_out_of_spec) / NULLIF(COUNT(*), 0))::NUMERIC, 1), COUNT(*) FROM alarm_ctx WHERE category = 'ENVIRONMENT'
    UNION ALL
    SELECT 'ALIGNMENT/PE-JE (90001,90004,90005,90012,90013)', ROUND((100.0 * COUNT(*) FILTER (WHERE flag_pe_out_of_spec) / NULLIF(COUNT(*), 0))::NUMERIC, 1), COUNT(*) FROM alarm_ctx WHERE category IN ('REGISTRATION', 'ALIGNMENT')
    UNION ALL
    SELECT 'MOTION (70004)', ROUND((100.0 * COUNT(*) FILTER (WHERE flag_scan_speed_out_of_spec) / NULLIF(COUNT(*), 0))::NUMERIC, 1), COUNT(*) FROM alarm_ctx WHERE category = 'MOTION'
)
SELECT
    c.cat AS alarm_category,
    c.alarm_pct AS alarm_window_pct,
    CASE
        WHEN c.cat = 'THERMAL (91008)' THEN b.thermal_pct
        WHEN c.cat = 'HUMIDITY (91008)' THEN b.humidity_pct
        WHEN c.cat = 'MOTION (70004)' THEN b.motion_pct
        ELSE b.pe_pct
    END AS baseline_pct,
    ROUND((c.alarm_pct / NULLIF(CASE
        WHEN c.cat = 'THERMAL (91008)' THEN b.thermal_pct
        WHEN c.cat = 'HUMIDITY (91008)' THEN b.humidity_pct
        WHEN c.cat = 'MOTION (70004)' THEN b.motion_pct
        ELSE b.pe_pct
    END, 0))::NUMERIC, 2) AS lift,
    c.n AS event_count,
    CASE WHEN c.n < 30 THEN 'LOW SAMPLE (n<30)' ELSE 'OK' END AS confidence
FROM cats c CROSS JOIN baseline b
WITH DATA;

CREATE UNIQUE INDEX v_ldi_rca_recent_window_cat_idx ON public.v_ldi_rca_recent_window (alarm_category);
GRANT SELECT ON public.v_ldi_rca_recent_window TO grafana_reader;

-- ── v_ldi_rca_truth_test (new -- extracted from the inline panel query in
--    ims-ldi-engineering-analytics.json's "RCA Truth Test" panel) ────────
-- Deliberately full-dataset scope (no 24h window) and includes VACUUM,
-- unlike v_ldi_rca_recent_window -- this is a validation/truth-test view
-- checked against the whole simulator lifetime, not an operational
-- rolling-window KPI. See migration 050's header comment for why VACUUM
-- is excluded from the *recent_window* view but not here.
DROP MATERIALIZED VIEW IF EXISTS public.v_ldi_rca_truth_test CASCADE;
CREATE MATERIALIZED VIEW public.v_ldi_rca_truth_test AS
WITH alarm_ctx AS (
    SELECT c.*, cat.category
    FROM public.v_ldi_alarm_context c
    JOIN public.v_ldi_alarm_category cat ON cat.alarm_code = c.errorcode
),
baseline AS (
    SELECT
        ROUND((100.0*COUNT(*) FILTER (WHERE temperature < 20 OR temperature > 24) / NULLIF(COUNT(*), 0))::NUMERIC, 1) AS thermal_pct,
        ROUND((100.0*COUNT(*) FILTER (WHERE humidity < 50 OR humidity > 60) / NULLIF(COUNT(*), 0))::NUMERIC, 1) AS humidity_pct,
        ROUND((100.0*COUNT(*) FILTER (WHERE air_vacuum > -8 OR air_vacuum < -30) / NULLIF(COUNT(*), 0))::NUMERIC, 1) AS vac_pct,
        ROUND((100.0*COUNT(*) FILTER (WHERE ABS(pe_1) > 10 OR ABS(je_1) > 10) / NULLIF(COUNT(*), 0))::NUMERIC, 1) AS pe_pct,
        ROUND((100.0*COUNT(*) FILTER (WHERE scan_speed > 450 OR scan_speed <= 0) / NULLIF(COUNT(*), 0))::NUMERIC, 1) AS motion_pct
    FROM public.ldi_data
),
cats AS (
    SELECT 'THERMAL (91008)' AS cat, ROUND((100.0*COUNT(*) FILTER (WHERE flag_thermal_out_of_spec) / NULLIF(COUNT(*), 0))::NUMERIC, 1) AS alarm_pct, COUNT(*) AS n FROM alarm_ctx WHERE category = 'ENVIRONMENT'
    UNION ALL
    SELECT 'HUMIDITY (91008)', ROUND((100.0*COUNT(*) FILTER (WHERE flag_humidity_out_of_spec) / NULLIF(COUNT(*), 0))::NUMERIC, 1), COUNT(*) FROM alarm_ctx WHERE category = 'ENVIRONMENT'
    UNION ALL
    SELECT 'VACUUM (91009)', ROUND((100.0*COUNT(*) FILTER (WHERE flag_vac_out_of_spec) / NULLIF(COUNT(*), 0))::NUMERIC, 1), COUNT(*) FROM alarm_ctx WHERE category = 'VACUUM'
    UNION ALL
    SELECT 'ALIGNMENT/PE-JE (90001,90004,90005,90012,90013)', ROUND((100.0*COUNT(*) FILTER (WHERE flag_pe_out_of_spec) / NULLIF(COUNT(*), 0))::NUMERIC, 1), COUNT(*) FROM alarm_ctx WHERE category IN ('REGISTRATION','ALIGNMENT')
    UNION ALL
    SELECT 'MOTION (70004)', ROUND((100.0*COUNT(*) FILTER (WHERE flag_scan_speed_out_of_spec) / NULLIF(COUNT(*), 0))::NUMERIC, 1), COUNT(*) FROM alarm_ctx WHERE category = 'MOTION'
)
SELECT c.cat AS "Alarm Category",
       c.alarm_pct AS "Alarm-Window %",
       CASE
         WHEN c.cat = 'THERMAL (91008)' THEN b.thermal_pct
         WHEN c.cat = 'HUMIDITY (91008)' THEN b.humidity_pct
         WHEN c.cat = 'VACUUM (91009)' THEN b.vac_pct
         WHEN c.cat = 'MOTION (70004)' THEN b.motion_pct
         ELSE b.pe_pct
       END AS "Baseline %",
       ROUND((c.alarm_pct / NULLIF(CASE
         WHEN c.cat = 'THERMAL (91008)' THEN b.thermal_pct
         WHEN c.cat = 'HUMIDITY (91008)' THEN b.humidity_pct
         WHEN c.cat = 'VACUUM (91009)' THEN b.vac_pct
         WHEN c.cat = 'MOTION (70004)' THEN b.motion_pct
         ELSE b.pe_pct
       END, 0))::NUMERIC, 2) AS "Lift",
       c.n AS "Event Count",
       CASE WHEN c.n < 30 THEN 'LOW SAMPLE (n<30)' ELSE 'OK' END AS "Confidence"
FROM cats c CROSS JOIN baseline b
WITH DATA;

CREATE UNIQUE INDEX v_ldi_rca_truth_test_cat_idx ON public.v_ldi_rca_truth_test ("Alarm Category");
GRANT SELECT ON public.v_ldi_rca_truth_test TO grafana_reader;

-- ── Scheduled refresh (TimescaleDB generic background job -- no pg_cron
--    extension needed; this stack doesn't have one installed) ───────────
CREATE OR REPLACE PROCEDURE public.refresh_spc_fleet_rca_mvs(job_id INT, config JSONB)
LANGUAGE plpgsql AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.v_machine_spc_fleet;
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.v_ldi_rca_recent_window;
    REFRESH MATERIALIZED VIEW CONCURRENTLY public.v_ldi_rca_truth_test;
END;
$$;

DO $$ BEGIN
    PERFORM add_job('public.refresh_spc_fleet_rca_mvs', INTERVAL '1 minute');
EXCEPTION WHEN OTHERS THEN NULL; -- job already scheduled from a prior run of this migration
END $$;

-- Prime the first refresh immediately so the MVs aren't empty until the
-- first scheduled job tick.
CALL public.refresh_spc_fleet_rca_mvs(0, '{}'::jsonb);
