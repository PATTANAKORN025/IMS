-- ══════════════════════════════════════════════════════════════
-- 048: ldi_data DOUBLE PRECISION -> REAL (completes migration 020's
-- tuning block, which could define the ALTER but never apply it live)
-- ══════════════════════════════════════════════════════════════
-- Migration 020 defines this same ALTER TABLE ... ALTER COLUMN TYPE REAL
-- block, but it silently no-ops on a hypertable with compressed chunks
-- ("operation not supported on hypertables with compressed chunks") --
-- which is exactly the state the live DB was in, so 020 never actually
-- converted anything there (world-class audit P1-1 follow-up).
--
-- REAL also isn't just an ALTER on the base table: ldi_data feeds a CAGG
-- chain (ldi_data -> ldi_data_1m -> ldi_data_15m -> ldi_data_1h, and
-- ldi_data -> ldi_data_hourly independently) plus 7 plain views, and
-- Postgres refuses ALTER COLUMN TYPE on a table with dependent views/CAGGs.
-- This migration: decompresses ldi_data's chunks, drops the 7 views + 4
-- CAGGs, converts the columns, recreates everything, and does a full
-- refresh of each CAGG from raw data (retention keeps 180 days of raw
-- ldi_data, so nothing is lost). Idempotent: skips entirely if the columns
-- are already REAL (true immediately after this runs once, and true from
-- the start on any fresh deployment via postgres/init/001).
--
-- Chunk compression is untouched here beyond decompressing existing
-- chunks -- the compression policy from postgres/init/032 stays in place
-- and will recompress on its normal 7-day schedule.

-- Postgres refuses ALTER COLUMN TYPE on a column with dependent views
-- regardless of whether the target type already matches the current one --
-- so the guard has to wrap the ALTER itself too, not just the drops. Uses
-- psql's \gset/\if (not a DO block) so it can conditionally skip plain top-
-- level DDL statements, not just PL/pgSQL-internal logic.
SELECT (data_type = 'real') AS already_real
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'ldi_data' AND column_name = 'temperature'
\gset

\if :already_real
\echo 'ldi_data columns already REAL, skipping conversion.'
\else

-- Decompress any compressed chunks (ALTER COLUMN TYPE fails otherwise)
SELECT decompress_chunk(c.chunk_schema || '.' || c.chunk_name, if_compressed => true)
FROM timescaledb_information.chunks c
WHERE c.hypertable_name = 'ldi_data' AND c.is_compressed;

-- Drop the 7 plain views (no stored data, zero loss)
DROP VIEW IF EXISTS public.v_ldi_alarm_context;
DROP VIEW IF EXISTS public.v_ldi_event_timeline;
DROP VIEW IF EXISTS public.v_ldi_machine_snapshot;
DROP VIEW IF EXISTS public.v_ldi_nelson_rules_detection;
DROP VIEW IF EXISTS public.v_machine_spc_fleet;
DROP VIEW IF EXISTS public.v_machine_spc_ranking;
DROP VIEW IF EXISTS public.v_process_stability;

-- Drop the CAGG chain, deepest dependent first
DROP MATERIALIZED VIEW IF EXISTS public.ldi_data_1h;
DROP MATERIALIZED VIEW IF EXISTS public.ldi_data_15m;
DROP MATERIALIZED VIEW IF EXISTS public.ldi_data_1m;
DROP MATERIALIZED VIEW IF EXISTS public.ldi_data_hourly;

ALTER TABLE public.ldi_data
    ALTER COLUMN resist_dosage TYPE REAL,
    ALTER COLUMN scale_x       TYPE REAL,
    ALTER COLUMN scale_y       TYPE REAL,
    ALTER COLUMN temperature   TYPE REAL,
    ALTER COLUMN humidity      TYPE REAL,
    ALTER COLUMN scan_speed    TYPE REAL,
    ALTER COLUMN air_vacuum    TYPE REAL,
    ALTER COLUMN thickness     TYPE REAL,
    ALTER COLUMN total_time    TYPE REAL,
    ALTER COLUMN pe_1          TYPE REAL,
    ALTER COLUMN pe_2          TYPE REAL,
    ALTER COLUMN pe_3          TYPE REAL,
    ALTER COLUMN pe_4          TYPE REAL,
    ALTER COLUMN pe_5          TYPE REAL,
    ALTER COLUMN pe_6          TYPE REAL,
    ALTER COLUMN je_1          TYPE REAL,
    ALTER COLUMN je_2          TYPE REAL,
    ALTER COLUMN je_3          TYPE REAL,
    ALTER COLUMN je_4          TYPE REAL,
    ALTER COLUMN pe_setting    TYPE REAL,
    ALTER COLUMN je_setting    TYPE REAL;

CREATE MATERIALIZED VIEW IF NOT EXISTS public.ldi_data_hourly
    WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', "time") AS bucket,
    eqp_id,
    AVG(temperature) AS avg_temp,
    MAX(temperature) AS max_temp,
    AVG(humidity) AS avg_humidity,
    AVG(GREATEST(ABS(pe_1), ABS(pe_2), ABS(pe_3), ABS(pe_4), ABS(pe_5), ABS(pe_6))) AS avg_max_pe,
    MAX(GREATEST(ABS(pe_1), ABS(pe_2), ABS(pe_3), ABS(pe_4), ABS(pe_5), ABS(pe_6))) AS peak_pe,
    AVG(scan_speed) AS avg_scan_speed,
    AVG(air_vacuum) AS avg_air_vacuum,
    COUNT(*) AS sample_count
FROM public.ldi_data
GROUP BY bucket, eqp_id
WITH NO DATA;

-- Refresh BEFORE the policy exists, not after: add_continuous_aggregate_policy
-- can hand this CAGG to a background worker almost immediately, which then
-- races an explicit refresh run later against the same object (found running
-- this migration for real on 2026-08-13 -- "could not refresh continuous
-- aggregate ... due to a concurrent refresh", non-deterministic, timing
-- dependent, on a genuinely fresh database). No policy yet means nothing else
-- can be refreshing this CAGG concurrently.
CALL refresh_continuous_aggregate('public.ldi_data_hourly', NULL, NULL);

DO $$ BEGIN
    PERFORM add_continuous_aggregate_policy('public.ldi_data_hourly',
        start_offset => INTERVAL '3 days', end_offset => INTERVAL '1 hour',
        schedule_interval => INTERVAL '1 hour', if_not_exists => true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
SELECT add_retention_policy('public.ldi_data_hourly', INTERVAL '2 years', if_not_exists => true);

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

CALL refresh_continuous_aggregate('public.ldi_data_1m', NULL, NULL);

DO $$ BEGIN
    PERFORM add_continuous_aggregate_policy('public.ldi_data_1m',
        start_offset => INTERVAL '2 hours', end_offset => INTERVAL '1 minute',
        schedule_interval => INTERVAL '1 minute', if_not_exists => true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
ALTER MATERIALIZED VIEW public.ldi_data_1m SET (timescaledb.materialized_only = false);
SELECT add_retention_policy('public.ldi_data_1m', INTERVAL '30 days', if_not_exists => true);

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

CALL refresh_continuous_aggregate('public.ldi_data_15m', NULL, NULL);

DO $$ BEGIN
    PERFORM add_continuous_aggregate_policy('public.ldi_data_15m',
        start_offset => INTERVAL '3 hours', end_offset => INTERVAL '15 minutes',
        schedule_interval => INTERVAL '15 minutes', if_not_exists => true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
ALTER MATERIALIZED VIEW public.ldi_data_15m SET (timescaledb.materialized_only = false);
SELECT add_retention_policy('public.ldi_data_15m', INTERVAL '90 days', if_not_exists => true);

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

CALL refresh_continuous_aggregate('public.ldi_data_1h', NULL, NULL);

DO $$ BEGIN
    PERFORM add_continuous_aggregate_policy('public.ldi_data_1h',
        start_offset => INTERVAL '1 day', end_offset => INTERVAL '1 hour',
        schedule_interval => INTERVAL '1 hour', if_not_exists => true);
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
ALTER MATERIALIZED VIEW public.ldi_data_1h SET (timescaledb.materialized_only = false);
SELECT add_retention_policy('public.ldi_data_1h', INTERVAL '2 years', if_not_exists => true);

CREATE OR REPLACE VIEW public.v_ldi_alarm_context AS
 SELECT a.logdate AS alarm_time,
    a.equipmentid AS eqp_id,
    a.errorcode,
    m.alarm_msg,
    d.temperature,
    d.humidity,
    d.air_vacuum,
    d.scan_speed,
    d.resist_dosage,
    d.pe_1,
    d.je_1,
    ((d.temperature < 20) OR (d.temperature > 24)) AS flag_thermal_out_of_spec,
    ((d.humidity < 50) OR (d.humidity > 60)) AS flag_humidity_out_of_spec,
    ((d.air_vacuum > (-50)) OR (d.air_vacuum < (-95))) AS flag_vac_out_of_spec,
    ((abs(d.pe_1) > 10) OR (abs(d.je_1) > 10)) AS flag_pe_out_of_spec,
    ((d.scan_speed > 450) OR (d.scan_speed <= 0)) AS flag_scan_speed_out_of_spec,
    ((d.resist_dosage > 650) OR (d.resist_dosage <= 0)) AS flag_exposure_out_of_spec,
    ((d.temperature < 20) OR (d.temperature > 24) OR (d.humidity < 50) OR (d.humidity > 60)) AS flag_temp_out_of_spec
   FROM ((public.ldi_alarm_log a
     LEFT JOIN public.ldi_alarm_ms_code m ON (((a.errorcode)::text = (m.alarm_id)::text)))
     LEFT JOIN LATERAL ( SELECT d_1.temperature,
            d_1.humidity,
            d_1.air_vacuum,
            d_1.scan_speed,
            d_1.resist_dosage,
            d_1.pe_1,
            d_1.je_1
           FROM public.ldi_data d_1
          WHERE (((d_1.eqp_id)::text = (a.equipmentid)::text) AND (d_1."time" <= a.logdate) AND (d_1."time" >= (a.logdate - '00:05:00'::interval)))
          ORDER BY d_1."time" DESC
         LIMIT 1) d ON (true));

CREATE OR REPLACE VIEW public.v_ldi_event_timeline AS
 WITH state_changes AS (
         SELECT d."time" AS event_time,
            d.eqp_id,
                CASE
                    WHEN ((d.state = false) AND (lag(d.state) OVER (PARTITION BY d.eqp_id ORDER BY d."time") = true)) THEN 'Machine Stop'::text
                    WHEN ((d.state = true) AND (lag(d.state) OVER (PARTITION BY d.eqp_id ORDER BY d."time") = false)) THEN 'Machine Start'::text
                    ELSE NULL::text
                END AS event_type,
            'ldi_data'::text AS source,
                CASE
                    WHEN ((d.state = false) AND (lag(d.state) OVER (PARTITION BY d.eqp_id ORDER BY d."time") = true)) THEN 'state changed to DOWN'::text
                    WHEN ((d.state = true) AND (lag(d.state) OVER (PARTITION BY d.eqp_id ORDER BY d."time") = false)) THEN 'state changed to RUNNING'::text
                    ELSE NULL::text
                END AS description
           FROM public.ldi_data d
        ), alarms AS (
         SELECT al.logdate AS event_time,
            al.equipmentid AS eqp_id,
            'Alarm'::text AS event_type,
            'alarm_log'::text AS source,
            COALESCE(m.alarm_msg, ((al.errorcode)::text)::character varying) AS description
           FROM (public.ldi_alarm_log al
             LEFT JOIN public.ldi_alarm_ms_code m ON (((al.errorcode)::text = (m.alarm_code)::text)))
        )
 SELECT state_changes.event_time,
    state_changes.eqp_id,
    state_changes.event_type,
    state_changes.source,
    state_changes.description
   FROM state_changes
  WHERE (state_changes.event_type IS NOT NULL)
UNION ALL
 SELECT alarms.event_time,
    alarms.eqp_id,
    alarms.event_type,
    alarms.source,
    alarms.description
   FROM alarms
  ORDER BY 1 DESC;

CREATE OR REPLACE VIEW public.v_ldi_machine_snapshot AS
 SELECT d."time",
    d.eqp_id,
    d.factory,
    d.process,
    d.state,
    d.temperature,
    d.humidity,
    d.scan_speed,
    d.air_vacuum,
    d.thickness,
    d.resist_dosage,
    d.scale_x,
    d.scale_y,
    d.scale_mode,
    d.pe_1,
    d.pe_2,
    d.pe_3,
    d.pe_4,
    d.pe_5,
    d.pe_6,
    d.je_1,
    d.je_2,
    d.je_3,
    d.je_4,
    d.pe_setting,
    d.je_setting,
    d.log_id,
    d.mo,
    d.fpn,
    d.layer_name,
    d.board_no,
    d.total_board,
    d.total_time,
    d.filmno,
    d.board_id,
    d.resist,
    a.errorcode AS alarm_errorcode,
    a.errortime AS alarm_errortime,
    a.logid AS alarm_logid,
    m.alarm_type,
    m.alarm_msg,
    m.alarm_detail
   FROM ((public.ldi_data d
     LEFT JOIN LATERAL ( SELECT le.errorcode,
            le.errortime,
            le.logid
           FROM public.ldi_alarm_log le
          WHERE (((le.equipmentid)::text = (d.eqp_id)::text) AND (le.logdate >= (d."time" - '00:02:00'::interval)) AND (le.logdate <= (d."time" + '00:02:00'::interval)))
          ORDER BY (abs(EXTRACT(epoch FROM (le.logdate - d."time"))))
         LIMIT 1) a ON (true))
     LEFT JOIN public.ldi_alarm_ms_code m ON (((a.errorcode)::text = (m.alarm_code)::text)));

CREATE OR REPLACE VIEW public.v_ldi_nelson_rules_detection AS
 WITH raw_pe AS (
         SELECT d."time",
            d.eqp_id,
            GREATEST(abs(COALESCE(d.pe_1, 0::real)), abs(COALESCE(d.pe_2, 0::real)), abs(COALESCE(d.pe_3, 0::real)), abs(COALESCE(d.pe_4, 0::real)), abs(COALESCE(d.pe_5, 0::real)), abs(COALESCE(d.pe_6, 0::real))) AS max_pe
           FROM public.ldi_data d
          WHERE (d.pe_1 IS NOT NULL)
        ), rolling_stats AS (
         SELECT rp."time",
            rp.eqp_id,
            rp.max_pe,
            avg(rp.max_pe) OVER w AS mu,
            stddev(rp.max_pe) OVER w AS sigma
           FROM raw_pe rp
          WINDOW w AS (PARTITION BY rp.eqp_id ORDER BY rp."time" ROWS BETWEEN 29 PRECEDING AND CURRENT ROW)
        ), with_sides AS (
         SELECT rs."time",
            rs.eqp_id,
            rs.max_pe,
            rs.mu,
            rs.sigma,
                CASE
                    WHEN (rs.max_pe > rs.mu) THEN 1
                    WHEN (rs.max_pe < rs.mu) THEN '-1'::integer
                    ELSE 0
                END AS side,
            (rs.max_pe - lag(rs.max_pe) OVER (PARTITION BY rs.eqp_id ORDER BY rs."time")) AS delta
           FROM rolling_stats rs
        )
 SELECT ws."time",
    ws.eqp_id,
    round((ws.max_pe)::numeric, 4) AS avg_pe,
    round((ws.mu)::numeric, 4) AS mu,
    round((ws.sigma)::numeric, 4) AS sigma,
    round(((ws.mu + (3::real * ws.sigma)))::numeric, 4) AS ucl,
    round(((ws.mu - (3::real * ws.sigma)))::numeric, 4) AS lcl,
        CASE
            WHEN ((ws.sigma > 0::real) AND ((ws.max_pe > (ws.mu + (3::real * ws.sigma))) OR (ws.max_pe < (ws.mu - (3::real * ws.sigma))))) THEN 1
            ELSE 0
        END AS rule1_beyond_3sigma,
        CASE
            WHEN (sum(
            CASE
                WHEN (ws2.side <> 0) THEN ws2.side
                ELSE 0
            END) OVER (PARTITION BY ws2.eqp_id ORDER BY ws2."time" ROWS BETWEEN 8 PRECEDING AND CURRENT ROW) = ANY (ARRAY[(9)::bigint, ('-9'::integer)::bigint])) THEN 1
            ELSE 0
        END AS rule2_nine_same_side,
        CASE
            WHEN (sum(
            CASE
                WHEN (ws2.delta > 0::real) THEN 1
                WHEN (ws2.delta < 0::real) THEN '-1'::integer
                ELSE 0
            END) OVER (PARTITION BY ws2.eqp_id ORDER BY ws2."time" ROWS BETWEEN 5 PRECEDING AND CURRENT ROW) = ANY (ARRAY[(6)::bigint, ('-6'::integer)::bigint])) THEN 1
            ELSE 0
        END AS rule3_six_trend,
        CASE
            WHEN (((ws.sigma > 0::real) AND ((ws.max_pe > (ws.mu + (3::real * ws.sigma))) OR (ws.max_pe < (ws.mu - (3::real * ws.sigma))))) OR (sum(
            CASE
                WHEN (ws2.side <> 0) THEN ws2.side
                ELSE 0
            END) OVER (PARTITION BY ws2.eqp_id ORDER BY ws2."time" ROWS BETWEEN 8 PRECEDING AND CURRENT ROW) = ANY (ARRAY[(9)::bigint, ('-9'::integer)::bigint])) OR (sum(
            CASE
                WHEN (ws2.delta > 0::real) THEN 1
                WHEN (ws2.delta < 0::real) THEN '-1'::integer
                ELSE 0
            END) OVER (PARTITION BY ws2.eqp_id ORDER BY ws2."time" ROWS BETWEEN 5 PRECEDING AND CURRENT ROW) = ANY (ARRAY[(6)::bigint, ('-6'::integer)::bigint]))) THEN 1
            ELSE 0
        END AS any_rule_triggered
   FROM (with_sides ws
     LEFT JOIN with_sides ws2 ON (((ws."time" = ws2."time") AND ((ws.eqp_id)::text = (ws2.eqp_id)::text))))
  ORDER BY ws.eqp_id, ws."time" DESC;

CREATE OR REPLACE VIEW public.v_machine_spc_fleet AS
 WITH pe_base AS (
         SELECT ldi_data.eqp_id,
            ldi_data.pe_1,
            ldi_data.pe_2,
            ldi_data.pe_3,
            ldi_data.pe_4,
            ldi_data.pe_5,
            ldi_data.pe_6,
            COALESCE(ldi_data.pe_setting, 25.0::real) AS pe_val
           FROM public.ldi_data
          WHERE ((ldi_data.pe_1 IS NOT NULL) AND (COALESCE(ldi_data.pe_setting, 0::real) > 2.0::real) AND (ldi_data."time" > (now() - '24:00:00'::interval)))
        ), pe_samples AS (
         SELECT pe_base.eqp_id,
            pe_base.pe_val,
            v.pe
           FROM (pe_base
             CROSS JOIN LATERAL ( VALUES (pe_base.pe_1), (pe_base.pe_2), (pe_base.pe_3), (pe_base.pe_4), (pe_base.pe_5), (pe_base.pe_6)) v(pe))
          WHERE (v.pe IS NOT NULL)
        ), pe_stats AS (
         SELECT pe_samples.eqp_id,
            count(*) AS n_pe,
            count(*) FILTER (WHERE (abs(pe_samples.pe) <= pe_samples.pe_val)) AS pass_pe,
            avg(pe_samples.pe) AS mu,
            stddev(pe_samples.pe) AS sigma,
            avg(pe_samples.pe_val) AS setting_val
           FROM pe_samples
          GROUP BY pe_samples.eqp_id
        ), pe_capability AS (
         SELECT pe_stats.eqp_id,
            pe_stats.n_pe,
            pe_stats.pass_pe,
            pe_stats.mu,
            pe_stats.sigma,
            pe_stats.setting_val,
            (pe_stats.setting_val / NULLIF((3::double precision * pe_stats.sigma), 0::double precision)) AS cp_pe,
            LEAST(((pe_stats.setting_val - pe_stats.mu) / NULLIF((3::double precision * pe_stats.sigma), 0::double precision)), ((pe_stats.mu + pe_stats.setting_val) / NULLIF((3::double precision * pe_stats.sigma), 0::double precision))) AS cpk_pe
           FROM pe_stats
        ), je_base AS (
         SELECT ldi_data.eqp_id,
            ldi_data.je_1,
            ldi_data.je_2,
            ldi_data.je_3,
            ldi_data.je_4,
            COALESCE(ldi_data.je_setting, 25.0::real) AS je_val
           FROM public.ldi_data
          WHERE ((ldi_data.je_1 IS NOT NULL) AND (COALESCE(ldi_data.je_setting, 0::real) > 2.0::real) AND (ldi_data."time" > (now() - '24:00:00'::interval)))
        ), je_samples AS (
         SELECT je_base.eqp_id,
            je_base.je_val,
            v.je
           FROM (je_base
             CROSS JOIN LATERAL ( VALUES (je_base.je_1), (je_base.je_2), (je_base.je_3), (je_base.je_4)) v(je))
          WHERE (v.je IS NOT NULL)
        ), je_stats AS (
         SELECT je_samples.eqp_id,
            count(*) AS n_je,
            count(*) FILTER (WHERE (abs(je_samples.je) <= je_samples.je_val)) AS pass_je,
            avg(je_samples.je) AS mu,
            stddev(je_samples.je) AS sigma,
            avg(je_samples.je_val) AS setting_val
           FROM je_samples
          GROUP BY je_samples.eqp_id
        ), je_capability AS (
         SELECT je_stats.eqp_id,
            je_stats.n_je,
            je_stats.pass_je,
            je_stats.mu,
            je_stats.sigma,
            je_stats.setting_val,
            (je_stats.setting_val / NULLIF((3::double precision * je_stats.sigma), 0::double precision)) AS cp_je,
            LEAST(((je_stats.setting_val - je_stats.mu) / NULLIF((3::double precision * je_stats.sigma), 0::double precision)), ((je_stats.mu + je_stats.setting_val) / NULLIF((3::double precision * je_stats.sigma), 0::double precision))) AS cpk_je
           FROM je_stats
        )
 SELECT d.device_id AS eqp_id,
    d.location,
    p.n_pe,
    round((p.cp_pe)::numeric, 3) AS cp_pe,
    round((p.cpk_pe)::numeric, 3) AS cpk_pe,
    round((100.0 * (p.pass_pe)::numeric) / (NULLIF(p.n_pe, 0))::numeric, 1) AS pe_pass_rate,
    j.n_je,
    round((j.cp_je)::numeric, 3) AS cp_je,
    round((j.cpk_je)::numeric, 3) AS cpk_je,
    round((100.0 * (j.pass_je)::numeric) / (NULLIF(j.n_je, 0))::numeric, 1) AS je_pass_rate,
    round((
        CASE
            WHEN (p.cpk_pe IS NULL) THEN j.cpk_je
            WHEN (j.cpk_je IS NULL) THEN p.cpk_pe
            ELSE LEAST(p.cpk_pe, j.cpk_je)
        END)::numeric, 3) AS worst_cpk,
        CASE
            WHEN (p.cpk_pe IS NULL) THEN j.n_je
            WHEN (j.cpk_je IS NULL) THEN p.n_pe
            WHEN (p.cpk_pe <= j.cpk_je) THEN p.n_pe
            ELSE j.n_je
        END AS worst_n
   FROM ((public.devices d
     LEFT JOIN pe_capability p ON (((p.eqp_id)::text = d.device_id)))
     LEFT JOIN je_capability j ON (((j.eqp_id)::text = d.device_id)))
  WHERE ((d.device_type = 'ldi'::text) AND d.enabled);

CREATE OR REPLACE VIEW public.v_machine_spc_ranking AS
 WITH pe_base AS (
         SELECT ldi_data.eqp_id,
            ldi_data.factory,
            ldi_data.mo,
            ldi_data.fpn,
            ldi_data.layer_name,
            ldi_data.pe_1,
            ldi_data.pe_2,
            ldi_data.pe_3,
            ldi_data.pe_4,
            ldi_data.pe_5,
            ldi_data.pe_6,
            COALESCE(ldi_data.pe_setting, 25.0::real) AS pe_val
           FROM public.ldi_data
          WHERE ((ldi_data.pe_1 IS NOT NULL) AND (COALESCE(ldi_data.pe_setting, 0::real) > 2.0::real) AND (ldi_data."time" > ( SELECT (max(ldi_data_1."time") - '02:00:00'::interval)
                   FROM public.ldi_data ldi_data_1)))
        ), pe_samples AS (
         SELECT pe_base.eqp_id,
            pe_base.factory,
            pe_base.mo,
            pe_base.fpn,
            pe_base.layer_name,
            pe_base.pe_val,
            v.pe
           FROM (pe_base
             CROSS JOIN LATERAL ( VALUES (pe_base.pe_1), (pe_base.pe_2), (pe_base.pe_3), (pe_base.pe_4), (pe_base.pe_5), (pe_base.pe_6)) v(pe))
          WHERE (v.pe IS NOT NULL)
        ), pe_stats AS (
         SELECT pe_samples.eqp_id,
            pe_samples.factory,
            pe_samples.mo,
            pe_samples.fpn,
            pe_samples.layer_name,
            avg(pe_samples.pe) AS mu,
            stddev(pe_samples.pe) AS sigma,
            avg(pe_samples.pe_val) AS setting_val,
            count(*) AS sample_count
           FROM pe_samples
          GROUP BY pe_samples.eqp_id, pe_samples.factory, pe_samples.mo, pe_samples.fpn, pe_samples.layer_name
        ), pe_capability AS (
         SELECT pe_stats.eqp_id,
            pe_stats.factory,
            pe_stats.mo,
            pe_stats.fpn,
            pe_stats.layer_name,
            pe_stats.mu,
            pe_stats.sigma,
            pe_stats.setting_val,
            pe_stats.sample_count,
            (pe_stats.setting_val / NULLIF((3::double precision * pe_stats.sigma), 0::double precision)) AS cp,
            LEAST(((pe_stats.setting_val - pe_stats.mu) / NULLIF((3::double precision * pe_stats.sigma), 0::double precision)), ((pe_stats.mu + pe_stats.setting_val) / NULLIF((3::double precision * pe_stats.sigma), 0::double precision))) AS cpk
           FROM pe_stats
        ), je_base AS (
         SELECT ldi_data.eqp_id,
            ldi_data.factory,
            ldi_data.mo,
            ldi_data.fpn,
            ldi_data.layer_name,
            ldi_data.je_1,
            ldi_data.je_2,
            ldi_data.je_3,
            ldi_data.je_4,
            COALESCE(ldi_data.je_setting, 25.0::real) AS je_val
           FROM public.ldi_data
          WHERE ((ldi_data.je_1 IS NOT NULL) AND (COALESCE(ldi_data.je_setting, 0::real) > 2.0::real) AND (ldi_data."time" > ( SELECT (max(ldi_data_1."time") - '02:00:00'::interval)
                   FROM public.ldi_data ldi_data_1)))
        ), je_samples AS (
         SELECT je_base.eqp_id,
            je_base.factory,
            je_base.mo,
            je_base.fpn,
            je_base.layer_name,
            je_base.je_val,
            v.je
           FROM (je_base
             CROSS JOIN LATERAL ( VALUES (je_base.je_1), (je_base.je_2), (je_base.je_3), (je_base.je_4)) v(je))
          WHERE (v.je IS NOT NULL)
        ), je_stats AS (
         SELECT je_samples.eqp_id,
            je_samples.factory,
            je_samples.mo,
            je_samples.fpn,
            je_samples.layer_name,
            avg(je_samples.je) AS mu,
            stddev(je_samples.je) AS sigma,
            avg(je_samples.je_val) AS setting_val,
            count(*) AS sample_count
           FROM je_samples
          GROUP BY je_samples.eqp_id, je_samples.factory, je_samples.mo, je_samples.fpn, je_samples.layer_name
        ), je_capability AS (
         SELECT je_stats.eqp_id,
            je_stats.factory,
            je_stats.mo,
            je_stats.fpn,
            je_stats.layer_name,
            je_stats.mu,
            je_stats.sigma,
            je_stats.setting_val,
            je_stats.sample_count,
            (je_stats.setting_val / NULLIF((3::double precision * je_stats.sigma), 0::double precision)) AS cp,
            LEAST(((je_stats.setting_val - je_stats.mu) / NULLIF((3::double precision * je_stats.sigma), 0::double precision)), ((je_stats.mu + je_stats.setting_val) / NULLIF((3::double precision * je_stats.sigma), 0::double precision))) AS cpk
           FROM je_stats
        )
 SELECT COALESCE(p.eqp_id, j.eqp_id) AS eqp_id,
    COALESCE(p.factory, j.factory) AS factory,
    COALESCE(p.mo, j.mo) AS mo,
    COALESCE(p.fpn, j.fpn) AS fpn,
    COALESCE(p.layer_name, j.layer_name) AS layer_name,
    p.sample_count,
    round((p.mu)::numeric, 3) AS mean_pe,
    round((p.sigma)::numeric, 3) AS stddev_pe,
    round((p.cp)::numeric, 3) AS cp,
    round((p.cpk)::numeric, 3) AS cpk,
        CASE
            WHEN (p.cpk IS NULL) THEN NULL::text
            WHEN (p.cpk >= 2.0::double precision) THEN 'World Class'::text
            WHEN (p.cpk >= 1.67::double precision) THEN 'Excellent'::text
            WHEN (p.cpk >= 1.33::double precision) THEN 'Capable'::text
            WHEN (p.cpk >= 1.0::double precision) THEN 'Marginally Capable'::text
            ELSE 'Not Capable'::text
        END AS capability_class,
    j.sample_count AS sample_count_je,
    round((j.mu)::numeric, 3) AS mean_je,
    round((j.sigma)::numeric, 3) AS stddev_je,
    round((j.cp)::numeric, 3) AS cp_je,
    round((j.cpk)::numeric, 3) AS cpk_je,
        CASE
            WHEN (j.cpk IS NULL) THEN NULL::text
            WHEN (j.cpk >= 2.0::double precision) THEN 'World Class'::text
            WHEN (j.cpk >= 1.67::double precision) THEN 'Excellent'::text
            WHEN (j.cpk >= 1.33::double precision) THEN 'Capable'::text
            WHEN (j.cpk >= 1.0::double precision) THEN 'Marginally Capable'::text
            ELSE 'Not Capable'::text
        END AS capability_class_je
   FROM (pe_capability p
     FULL JOIN je_capability j ON ((((p.eqp_id)::text = (j.eqp_id)::text) AND ((p.factory)::text = (j.factory)::text) AND ((p.mo)::text = (j.mo)::text) AND ((p.fpn)::text = (j.fpn)::text) AND ((p.layer_name)::text = (j.layer_name)::text))))
  WHERE (COALESCE(p.sigma, j.sigma) > 0::double precision)
  ORDER BY (round((p.cpk)::numeric, 3)) DESC NULLS LAST;

CREATE OR REPLACE VIEW public.v_process_stability AS
 WITH time_range AS (
         SELECT (max(ldi_data."time") - '02:00:00'::interval) AS cutoff
           FROM public.ldi_data
        ), temp_stats AS (
         SELECT ldi_data.eqp_id,
            avg(ldi_data.temperature) AS temp_mu,
            stddev(ldi_data.temperature) AS temp_sigma
           FROM public.ldi_data
          WHERE ((ldi_data."time" > ( SELECT time_range.cutoff
                   FROM time_range)) AND (ldi_data.temperature IS NOT NULL))
          GROUP BY ldi_data.eqp_id
        ), hum_stats AS (
         SELECT ldi_data.eqp_id,
            avg(ldi_data.humidity) AS hum_mu,
            stddev(ldi_data.humidity) AS hum_sigma
           FROM public.ldi_data
          WHERE ((ldi_data."time" > ( SELECT time_range.cutoff
                   FROM time_range)) AND (ldi_data.humidity IS NOT NULL))
          GROUP BY ldi_data.eqp_id
        ), pe_stats AS (
         SELECT ldi_data.eqp_id,
            avg(GREATEST(abs(COALESCE(ldi_data.pe_1, 0::real)), abs(COALESCE(ldi_data.pe_2, 0::real)), abs(COALESCE(ldi_data.pe_3, 0::real)), abs(COALESCE(ldi_data.pe_4, 0::real)), abs(COALESCE(ldi_data.pe_5, 0::real)), abs(COALESCE(ldi_data.pe_6, 0::real)))) AS pe_mu,
            stddev(GREATEST(abs(COALESCE(ldi_data.pe_1, 0::real)), abs(COALESCE(ldi_data.pe_2, 0::real)), abs(COALESCE(ldi_data.pe_3, 0::real)), abs(COALESCE(ldi_data.pe_4, 0::real)), abs(COALESCE(ldi_data.pe_5, 0::real)), abs(COALESCE(ldi_data.pe_6, 0::real)))) AS pe_sigma,
            avg(GREATEST(abs(COALESCE(ldi_data.je_1, 0::real)), abs(COALESCE(ldi_data.je_2, 0::real)), abs(COALESCE(ldi_data.je_3, 0::real)), abs(COALESCE(ldi_data.je_4, 0::real)))) AS je_mu,
            stddev(GREATEST(abs(COALESCE(ldi_data.je_1, 0::real)), abs(COALESCE(ldi_data.je_2, 0::real)), abs(COALESCE(ldi_data.je_3, 0::real)), abs(COALESCE(ldi_data.je_4, 0::real)))) AS je_sigma
           FROM public.ldi_data
          WHERE ((ldi_data."time" > ( SELECT time_range.cutoff
                   FROM time_range)) AND (ldi_data.pe_1 IS NOT NULL))
          GROUP BY ldi_data.eqp_id
        )
 SELECT COALESCE(t.eqp_id, h.eqp_id, pe.eqp_id) AS eqp_id,
    (GREATEST(0::double precision, (33::double precision - (COALESCE(t.temp_sigma, 99::double precision) * 10::double precision))))::numeric(5,1) AS temp_score,
    (GREATEST(0::double precision, (33::double precision - (COALESCE(h.hum_sigma, 99::double precision) * 10::double precision))))::numeric(5,1) AS hum_score,
    (GREATEST(0::double precision, ((34::double precision - (COALESCE(pe.pe_sigma, 99::double precision) * 5::double precision)) - (COALESCE(pe.pe_mu, 99::double precision) * 2::double precision))))::numeric(5,1) AS pe_score,
    (GREATEST(0::double precision, ((17::double precision - (COALESCE(pe.je_sigma, 99::double precision) * 5::double precision)) - COALESCE(pe.je_mu, 99::double precision))))::numeric(5,1) AS je_score,
    (GREATEST(0::double precision, (((GREATEST(0::double precision, (33::double precision - (COALESCE(t.temp_sigma, 99::double precision) * 10::double precision))) + GREATEST(0::double precision, (33::double precision - (COALESCE(h.hum_sigma, 99::double precision) * 10::double precision)))) + GREATEST(0::double precision, ((34::double precision - (COALESCE(pe.pe_sigma, 99::double precision) * 5::double precision)) - (COALESCE(pe.pe_mu, 99::double precision) * 2::double precision)))) + GREATEST(0::double precision, ((17::double precision - (COALESCE(pe.je_sigma, 99::double precision) * 5::double precision)) - COALESCE(pe.je_mu, 99::double precision))))))::numeric(5,1) AS stability_index
   FROM ((temp_stats t
     FULL JOIN hum_stats h ON (((t.eqp_id)::text = (h.eqp_id)::text)))
     FULL JOIN pe_stats pe ON (((COALESCE(t.eqp_id, h.eqp_id))::text = (pe.eqp_id)::text)))
  ORDER BY ((GREATEST(0::double precision, (((GREATEST(0::double precision, (33::double precision - (COALESCE(t.temp_sigma, 99::double precision) * 10::double precision))) + GREATEST(0::double precision, (33::double precision - (COALESCE(h.hum_sigma, 99::double precision) * 10::double precision)))) + GREATEST(0::double precision, ((34::double precision - (COALESCE(pe.pe_sigma, 99::double precision) * 5::double precision)) - (COALESCE(pe.pe_mu, 99::double precision) * 2::double precision)))) + GREATEST(0::double precision, ((17::double precision - (COALESCE(pe.je_sigma, 99::double precision) * 5::double precision)) - COALESCE(pe.je_mu, 99::double precision))))))::numeric(5,1)) DESC;

GRANT SELECT ON public.ldi_data_hourly TO grafana_reader;
GRANT SELECT ON public.ldi_data_1m TO grafana_reader;
GRANT SELECT ON public.ldi_data_15m TO grafana_reader;
GRANT SELECT ON public.ldi_data_1h TO grafana_reader;
GRANT SELECT ON public.v_ldi_alarm_context TO grafana_reader;
GRANT SELECT ON public.v_ldi_event_timeline TO grafana_reader;
GRANT SELECT ON public.v_ldi_machine_snapshot TO grafana_reader;
GRANT SELECT ON public.v_ldi_nelson_rules_detection TO grafana_reader;
GRANT SELECT ON public.v_machine_spc_fleet TO grafana_reader;
GRANT SELECT ON public.v_machine_spc_ranking TO grafana_reader;
GRANT SELECT ON public.v_process_stability TO grafana_reader;

\endif
