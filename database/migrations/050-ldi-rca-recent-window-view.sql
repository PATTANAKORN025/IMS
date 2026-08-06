-- ══════════════════════════════════════════════════════════════
-- 050: v_ldi_rca_recent_window — recent-window RCA as a shared view
-- ══════════════════════════════════════════════════════════════
-- The Lift/Confidence RCA logic (alarm-window rate vs. 24h telemetry
-- baseline rate, per alarm category) previously lived only as inline
-- rawSql duplicated inside ims-ldi-manufacturing.json's "RCA Truth Test"
-- panel. Promoted to a real view so it's a single source of truth
-- (world-class audit Phase 2/3: shared views, not inline duplication) and
-- independently testable/queryable outside Grafana.
--
-- VACUUM (91009) intentionally excluded from the categories CTE here for
-- the same reason documented in nodered_data/flows/ldi_alarm_simulator.json:
-- its baseline is saturated near 100% by a recipe/spec-threshold mismatch,
-- so Lift can never exceed ~1 regardless of alarm timing -- a real fix
-- needs the actual vendor vacuum spec, not a view-level workaround.

CREATE OR REPLACE VIEW public.v_ldi_rca_recent_window AS
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
ORDER BY lift DESC NULLS LAST;

GRANT SELECT ON public.v_ldi_rca_recent_window TO grafana_reader;
