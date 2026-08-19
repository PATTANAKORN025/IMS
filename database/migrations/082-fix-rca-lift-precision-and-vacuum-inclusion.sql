-- ══════════════════════════════════════════════════════════════
-- Migration 082: Fix RCA Lift double-rounding + include VACUUM in
--                 v_ldi_rca_recent_window
-- ══════════════════════════════════════════════════════════════
-- LDI system end-to-end audit (2026-08-19, .superpowers/sdd/
-- 2026-08-19-ldi-system-audit/track-d-rca-spc-correctness-report.md,
-- independently reviewed TRUSTWORTHY) found two real defects in the two
-- RCA materialized views created by migration 064:
--
-- Finding 1 (CRITICAL): both views compute `alarm_pct` and each baseline
-- percentage with ROUND(...,1) *inside their CTEs*, then divide those
-- already-rounded values to get Lift. Any baseline that rounds to 0.0%
-- (even though the true fraction is nonzero) makes NULLIF(0.0,0) null out
-- the Lift entirely -- hand-verified live: THERMAL's true baseline is
-- 0.0201% (true Lift ~56x) and VACUUM's true baseline is 0.020306% (true
-- Lift ~4,925x), both display blank. MOTION's baseline rounds to a
-- nonzero-but-still-wrong value, producing Lift figures 9-22% off from
-- the raw-count-based truth. Fix: divide raw (unrounded) fractions to
-- compute Lift; only round for the *displayed* alarm/baseline percentage
-- columns, matching the guide's own formula (LDI_RCA_GUIDE.md lines
-- 22-27), which was never specified as "round first, then divide".
--
-- Finding 2 (IMPORTANT): v_ldi_rca_recent_window has excluded VACUUM
-- since migration 050, whose header comment justified this because the
-- pre-057 vacuum threshold was saturated near 100% (uncorrelatable).
-- Migration 057 recalibrated that threshold and added weak-vacuum fault
-- injection specifically so VACUUM *could* be correlated -- the same
-- design already used for MOTION -- but migration 064 copied the
-- exclusion forward verbatim when it rebuilt this view as a materialized
-- view. v_ldi_rca_truth_test already includes VACUUM correctly (it was
-- never excluded there); this migration brings v_ldi_rca_recent_window
-- in line with it, using the same recalibrated threshold/flag.
--
-- No dashboard JSON changes needed: output column names/types are
-- unchanged, VACUUM is simply a 5th row that now appears in both views'
-- output instead of only in v_ldi_rca_truth_test's.

-- ── v_ldi_rca_recent_window ──────────────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS public.v_ldi_rca_recent_window CASCADE;
CREATE MATERIALIZED VIEW public.v_ldi_rca_recent_window AS
WITH alarm_ctx AS (
    SELECT c.*, cat.category
    FROM public.v_ldi_alarm_context c
    JOIN public.v_ldi_alarm_category cat ON cat.alarm_code = c.errorcode
    WHERE c.alarm_time > NOW() - INTERVAL '24 hours'
),
baseline AS (
    SELECT
        (100.0 * COUNT(*) FILTER (WHERE temperature < 20 OR temperature > 24) / NULLIF(COUNT(*), 0))::NUMERIC AS thermal_pct_raw,
        (100.0 * COUNT(*) FILTER (WHERE humidity < 50 OR humidity > 60) / NULLIF(COUNT(*), 0))::NUMERIC AS humidity_pct_raw,
        (100.0 * COUNT(*) FILTER (WHERE air_vacuum > -8 OR air_vacuum < -30) / NULLIF(COUNT(*), 0))::NUMERIC AS vac_pct_raw,
        (100.0 * COUNT(*) FILTER (WHERE ABS(pe_1) > 10 OR ABS(je_1) > 10) / NULLIF(COUNT(*), 0))::NUMERIC AS pe_pct_raw,
        (100.0 * COUNT(*) FILTER (WHERE scan_speed > 450 OR scan_speed <= 0) / NULLIF(COUNT(*), 0))::NUMERIC AS motion_pct_raw
    FROM public.ldi_data WHERE "time" > NOW() - INTERVAL '24 hours'
),
cats AS (
    SELECT 'THERMAL (91008)' AS cat, (100.0 * COUNT(*) FILTER (WHERE flag_thermal_out_of_spec) / NULLIF(COUNT(*), 0))::NUMERIC AS alarm_pct_raw, COUNT(*) AS n FROM alarm_ctx WHERE category = 'ENVIRONMENT'
    UNION ALL
    SELECT 'HUMIDITY (91008)', (100.0 * COUNT(*) FILTER (WHERE flag_humidity_out_of_spec) / NULLIF(COUNT(*), 0))::NUMERIC, COUNT(*) FROM alarm_ctx WHERE category = 'ENVIRONMENT'
    UNION ALL
    SELECT 'VACUUM (91009)', (100.0 * COUNT(*) FILTER (WHERE flag_vac_out_of_spec) / NULLIF(COUNT(*), 0))::NUMERIC, COUNT(*) FROM alarm_ctx WHERE category = 'VACUUM'
    UNION ALL
    SELECT 'ALIGNMENT/PE-JE (90001,90004,90005,90012,90013)', (100.0 * COUNT(*) FILTER (WHERE flag_pe_out_of_spec) / NULLIF(COUNT(*), 0))::NUMERIC, COUNT(*) FROM alarm_ctx WHERE category IN ('REGISTRATION', 'ALIGNMENT')
    UNION ALL
    SELECT 'MOTION (70004)', (100.0 * COUNT(*) FILTER (WHERE flag_scan_speed_out_of_spec) / NULLIF(COUNT(*), 0))::NUMERIC, COUNT(*) FROM alarm_ctx WHERE category = 'MOTION'
)
SELECT
    c.cat AS alarm_category,
    ROUND(c.alarm_pct_raw, 1) AS alarm_window_pct,
    ROUND((CASE
        WHEN c.cat = 'THERMAL (91008)' THEN b.thermal_pct_raw
        WHEN c.cat = 'HUMIDITY (91008)' THEN b.humidity_pct_raw
        WHEN c.cat = 'VACUUM (91009)' THEN b.vac_pct_raw
        WHEN c.cat = 'MOTION (70004)' THEN b.motion_pct_raw
        ELSE b.pe_pct_raw
    END), 1) AS baseline_pct,
    ROUND((c.alarm_pct_raw / NULLIF(CASE
        WHEN c.cat = 'THERMAL (91008)' THEN b.thermal_pct_raw
        WHEN c.cat = 'HUMIDITY (91008)' THEN b.humidity_pct_raw
        WHEN c.cat = 'VACUUM (91009)' THEN b.vac_pct_raw
        WHEN c.cat = 'MOTION (70004)' THEN b.motion_pct_raw
        ELSE b.pe_pct_raw
    END, 0)), 2) AS lift,
    c.n AS event_count,
    CASE WHEN c.n < 30 THEN 'LOW SAMPLE (n<30)' ELSE 'OK' END AS confidence
FROM cats c CROSS JOIN baseline b
WITH DATA;

CREATE UNIQUE INDEX v_ldi_rca_recent_window_cat_idx ON public.v_ldi_rca_recent_window (alarm_category);
GRANT SELECT ON public.v_ldi_rca_recent_window TO grafana_reader;

-- ── v_ldi_rca_truth_test (Lift precision fix only -- VACUUM was already
--    included here, migration 050's exclusion never applied to this view)
DROP MATERIALIZED VIEW IF EXISTS public.v_ldi_rca_truth_test CASCADE;
CREATE MATERIALIZED VIEW public.v_ldi_rca_truth_test AS
WITH alarm_ctx AS (
    SELECT c.*, cat.category
    FROM public.v_ldi_alarm_context c
    JOIN public.v_ldi_alarm_category cat ON cat.alarm_code = c.errorcode
),
baseline AS (
    SELECT
        (100.0*COUNT(*) FILTER (WHERE temperature < 20 OR temperature > 24) / NULLIF(COUNT(*), 0))::NUMERIC AS thermal_pct_raw,
        (100.0*COUNT(*) FILTER (WHERE humidity < 50 OR humidity > 60) / NULLIF(COUNT(*), 0))::NUMERIC AS humidity_pct_raw,
        (100.0*COUNT(*) FILTER (WHERE air_vacuum > -8 OR air_vacuum < -30) / NULLIF(COUNT(*), 0))::NUMERIC AS vac_pct_raw,
        (100.0*COUNT(*) FILTER (WHERE ABS(pe_1) > 10 OR ABS(je_1) > 10) / NULLIF(COUNT(*), 0))::NUMERIC AS pe_pct_raw,
        (100.0*COUNT(*) FILTER (WHERE scan_speed > 450 OR scan_speed <= 0) / NULLIF(COUNT(*), 0))::NUMERIC AS motion_pct_raw
    FROM public.ldi_data
),
cats AS (
    SELECT 'THERMAL (91008)' AS cat, (100.0*COUNT(*) FILTER (WHERE flag_thermal_out_of_spec) / NULLIF(COUNT(*), 0))::NUMERIC AS alarm_pct_raw, COUNT(*) AS n FROM alarm_ctx WHERE category = 'ENVIRONMENT'
    UNION ALL
    SELECT 'HUMIDITY (91008)', (100.0*COUNT(*) FILTER (WHERE flag_humidity_out_of_spec) / NULLIF(COUNT(*), 0))::NUMERIC, COUNT(*) FROM alarm_ctx WHERE category = 'ENVIRONMENT'
    UNION ALL
    SELECT 'VACUUM (91009)', (100.0*COUNT(*) FILTER (WHERE flag_vac_out_of_spec) / NULLIF(COUNT(*), 0))::NUMERIC, COUNT(*) FROM alarm_ctx WHERE category = 'VACUUM'
    UNION ALL
    SELECT 'ALIGNMENT/PE-JE (90001,90004,90005,90012,90013)', (100.0*COUNT(*) FILTER (WHERE flag_pe_out_of_spec) / NULLIF(COUNT(*), 0))::NUMERIC, COUNT(*) FROM alarm_ctx WHERE category IN ('REGISTRATION','ALIGNMENT')
    UNION ALL
    SELECT 'MOTION (70004)', (100.0*COUNT(*) FILTER (WHERE flag_scan_speed_out_of_spec) / NULLIF(COUNT(*), 0))::NUMERIC, COUNT(*) FROM alarm_ctx WHERE category = 'MOTION'
)
SELECT c.cat AS "Alarm Category",
       ROUND(c.alarm_pct_raw, 1) AS "Alarm-Window %",
       ROUND((CASE
         WHEN c.cat = 'THERMAL (91008)' THEN b.thermal_pct_raw
         WHEN c.cat = 'HUMIDITY (91008)' THEN b.humidity_pct_raw
         WHEN c.cat = 'VACUUM (91009)' THEN b.vac_pct_raw
         WHEN c.cat = 'MOTION (70004)' THEN b.motion_pct_raw
         ELSE b.pe_pct_raw
       END), 1) AS "Baseline %",
       ROUND((c.alarm_pct_raw / NULLIF(CASE
         WHEN c.cat = 'THERMAL (91008)' THEN b.thermal_pct_raw
         WHEN c.cat = 'HUMIDITY (91008)' THEN b.humidity_pct_raw
         WHEN c.cat = 'VACUUM (91009)' THEN b.vac_pct_raw
         WHEN c.cat = 'MOTION (70004)' THEN b.motion_pct_raw
         ELSE b.pe_pct_raw
       END, 0)), 2) AS "Lift",
       c.n AS "Event Count",
       CASE WHEN c.n < 30 THEN 'LOW SAMPLE (n<30)' ELSE 'OK' END AS "Confidence"
FROM cats c CROSS JOIN baseline b
WITH DATA;

CREATE UNIQUE INDEX v_ldi_rca_truth_test_cat_idx ON public.v_ldi_rca_truth_test ("Alarm Category");
GRANT SELECT ON public.v_ldi_rca_truth_test TO grafana_reader;

-- Note: migration 064's `refresh_spc_fleet_rca_mvs()` scheduled job
-- refreshes these two MVs (and v_machine_spc_fleet, untouched by this
-- migration) by name every 60s -- no change needed there, both views
-- keep their original names/column names, only the internal Lift
-- calculation and (recent_window only) VACUUM inclusion changed.
