-- ══════════════════════════════════════════════════════════════
-- 059: widen ldi_data numeric columns real -> double precision
-- ══════════════════════════════════════════════════════════════
-- Widening conversion (real -> double precision): every representable
-- `real` value converts exactly, no data loss, no precision loss.
--
-- Two things TimescaleDB/Postgres require before this ALTER can run,
-- both handled below:
--   1. "operation not supported on hypertables with compressed chunks" --
--      13/28 ldi_data chunks were compressed at the time of this migration
--      (the compress_after: 7 days policy's first real activity this
--      session -- see migration 058's commit). Decompress everything,
--      widen the columns, then recompress exactly the chunks that qualify
--      under the same policy -- restores the pre-migration compression
--      state atomically rather than leaving chunks decompressed until the
--      policy's next scheduled run (every 12h).
--   2. "cannot alter type of a column used by a view or rule" -- every view
--      that reads these columns (9 total; confirmed via pg_depend, not
--      guessed) has to be dropped before the ALTER and recreated after.
--      Rebuilding them was also the right time to replace their
--      COALESCE(pe_1, 0::real)-style literals with ::double precision --
--      functionally harmless either way (real implicitly promotes), but
--      now internally consistent with the widened column type.
--      v_ldi_alarm_context and v_ldi_machine_snapshot etc. don't have any
--      ::real literal on the widened columns at all (their only ::real
--      casts, where present, are on pe_setting/je_setting -- untouched by
--      this migration) so their bodies are otherwise byte-identical to
--      what's live today.
--   3. The same "used by a view" restriction blocks on continuous
--      aggregates too, since their real-time-aggregation machinery is
--      itself implemented as a pair of internal views
--      (_direct_view_N/_partial_view_N) that read the source column.
--      ldi_data_1m and ldi_data_hourly are built directly on ldi_data;
--      ldi_data_15m is built FROM ldi_data_1m and ldi_data_1h FROM
--      ldi_data_15m (migration 044's cascaded-CAGG design), so all 4 have
--      to be dropped (deepest dependent first) and recreated (source
--      first) around the ALTER, then explicitly refreshed in dependency
--      order since dropping loses previously materialized data -- this is
--      the standard, documented way to change a column type under an
--      existing TimescaleDB continuous aggregate. The CREATE MATERIALIZED
--      VIEW / policy statements below are copied verbatim from their
--      original migrations (032, 043, 044) as already-idempotent, already-
--      proven SQL, not rewritten.

SELECT public.decompress_chunk(c, if_compressed => true)
FROM public.show_chunks('public.ldi_data') c;

DROP MATERIALIZED VIEW IF EXISTS public.ldi_data_1h;
DROP MATERIALIZED VIEW IF EXISTS public.ldi_data_15m;
DROP MATERIALIZED VIEW IF EXISTS public.ldi_data_1m;
DROP MATERIALIZED VIEW IF EXISTS public.ldi_data_hourly;

DROP VIEW IF EXISTS public.v_ldi_rca_recent_window;
DROP VIEW IF EXISTS public.v_ldi_alarm_context;
DROP VIEW IF EXISTS public.v_ldi_event_timeline;
DROP VIEW IF EXISTS public.v_ldi_machine_latest_full;
DROP VIEW IF EXISTS public.v_ldi_machine_snapshot;
DROP VIEW IF EXISTS public.v_ldi_nelson_rules_detection;
DROP VIEW IF EXISTS public.v_machine_spc_fleet;
DROP VIEW IF EXISTS public.v_machine_spc_ranking;
DROP VIEW IF EXISTS public.v_process_stability;

ALTER TABLE public.ldi_data
    ALTER COLUMN temperature TYPE DOUBLE PRECISION,
    ALTER COLUMN humidity TYPE DOUBLE PRECISION,
    ALTER COLUMN pe_1 TYPE DOUBLE PRECISION,
    ALTER COLUMN pe_2 TYPE DOUBLE PRECISION,
    ALTER COLUMN pe_3 TYPE DOUBLE PRECISION,
    ALTER COLUMN pe_4 TYPE DOUBLE PRECISION,
    ALTER COLUMN pe_5 TYPE DOUBLE PRECISION,
    ALTER COLUMN pe_6 TYPE DOUBLE PRECISION,
    ALTER COLUMN je_1 TYPE DOUBLE PRECISION,
    ALTER COLUMN je_2 TYPE DOUBLE PRECISION,
    ALTER COLUMN je_3 TYPE DOUBLE PRECISION,
    ALTER COLUMN je_4 TYPE DOUBLE PRECISION,
    ALTER COLUMN scale_x TYPE DOUBLE PRECISION,
    ALTER COLUMN scale_y TYPE DOUBLE PRECISION,
    ALTER COLUMN thickness TYPE DOUBLE PRECISION,
    ALTER COLUMN resist_dosage TYPE DOUBLE PRECISION;

SELECT public.compress_chunk(c, if_not_compressed => true)
FROM public.show_chunks('public.ldi_data', older_than => INTERVAL '7 days') c;

-- ── Recreate the 4 continuous aggregates (source-first: ldi_data_hourly
--    and ldi_data_1m read raw ldi_data; ldi_data_15m reads ldi_data_1m;
--    ldi_data_1h reads ldi_data_15m) -- SQL copied verbatim from migrations
--    032, 043, 044. ──

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

SELECT add_continuous_aggregate_policy('public.ldi_data_hourly',
    start_offset => INTERVAL '3 days',
    end_offset => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => true);

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

DO $$ BEGIN
    PERFORM add_continuous_aggregate_policy('public.ldi_data_1m',
        start_offset      => INTERVAL '2 hours',
        end_offset        => INTERVAL '1 minute',
        schedule_interval => INTERVAL '1 minute',
        if_not_exists     => TRUE);
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

SELECT add_retention_policy('public.ldi_data_15m', INTERVAL '90 days', if_not_exists => true);
SELECT add_retention_policy('public.ldi_data_1h', INTERVAL '2 years', if_not_exists => true);

-- ── Backfill all previously-materialized history (dropping a CAGG loses
--    its materialized data) -- source-first order, NULL/NULL means "all
--    available range". ──
CALL refresh_continuous_aggregate('public.ldi_data_hourly', NULL, NULL);
CALL refresh_continuous_aggregate('public.ldi_data_1m', NULL, NULL);
CALL refresh_continuous_aggregate('public.ldi_data_15m', NULL, NULL);
CALL refresh_continuous_aggregate('public.ldi_data_1h', NULL, NULL);

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
     d.temperature < 20::double precision OR d.temperature > 24::double precision AS flag_thermal_out_of_spec,
     d.humidity < 50::double precision OR d.humidity > 60::double precision AS flag_humidity_out_of_spec,
     d.air_vacuum IS NOT NULL AND (d.air_vacuum > '-8'::integer::double precision OR d.air_vacuum < '-30'::integer::double precision) AS flag_vac_out_of_spec,
     abs(d.pe_1) > 10::double precision OR abs(d.je_1) > 10::double precision AS flag_pe_out_of_spec,
     d.scan_speed > 450::double precision OR d.scan_speed <= 0::double precision AS flag_scan_speed_out_of_spec,
     d.resist_dosage > 650::double precision OR d.resist_dosage <= 0::double precision AS flag_exposure_out_of_spec,
     d.temperature < 20::double precision OR d.temperature > 24::double precision OR d.humidity < 50::double precision OR d.humidity > 60::double precision AS flag_temp_out_of_spec,
     d.match_type
    FROM ldi_alarm_log a
      LEFT JOIN ldi_alarm_ms_code m ON a.errorcode::text = m.alarm_id::text
      LEFT JOIN LATERAL ( SELECT d1.temperature,
             d1.humidity,
             d1.air_vacuum,
             d1.scan_speed,
             d1.resist_dosage,
             d1.pe_1,
             d1.je_1,
             'exact'::text AS match_type
            FROM public.ldi_data d1
           WHERE d1.log_id::text = a.related_log_id::text AND d1."time" >= (a.logdate - '00:10:00'::interval) AND d1."time" <= (a.logdate + '00:01:00'::interval)
         UNION ALL
         ( SELECT d2.temperature,
             d2.humidity,
             d2.air_vacuum,
             d2.scan_speed,
             d2.resist_dosage,
             d2.pe_1,
             d2.je_1,
             'nearest'::text AS match_type
            FROM public.ldi_data d2
           WHERE a.related_log_id IS NULL AND d2.eqp_id::text = a.equipmentid::text AND d2."time" <= a.logdate AND d2."time" >= (a.logdate - '00:05:00'::interval)
           ORDER BY d2."time" DESC
          LIMIT 1)
  LIMIT 1) d ON true;
GRANT SELECT ON public.v_ldi_alarm_context TO grafana_reader;

CREATE OR REPLACE VIEW public.v_ldi_rca_recent_window AS
  WITH alarm_ctx AS (
          SELECT c_1.alarm_time,
             c_1.eqp_id,
             c_1.errorcode,
             c_1.alarm_msg,
             c_1.temperature,
             c_1.humidity,
             c_1.air_vacuum,
             c_1.scan_speed,
             c_1.resist_dosage,
             c_1.pe_1,
             c_1.je_1,
             c_1.flag_thermal_out_of_spec,
             c_1.flag_humidity_out_of_spec,
             c_1.flag_vac_out_of_spec,
             c_1.flag_pe_out_of_spec,
             c_1.flag_scan_speed_out_of_spec,
             c_1.flag_exposure_out_of_spec,
             c_1.flag_temp_out_of_spec,
             cat.category
            FROM v_ldi_alarm_context c_1
              JOIN v_ldi_alarm_category cat ON cat.alarm_code::text = c_1.errorcode::text
           WHERE c_1.alarm_time > (now() - '24:00:00'::interval)
         ), baseline AS (
          SELECT round(100.0 * count(*) FILTER (WHERE ldi_data.temperature < 20::double precision OR ldi_data.temperature > 24::double precision)::numeric / NULLIF(count(*), 0)::numeric, 1) AS thermal_pct,
             round(100.0 * count(*) FILTER (WHERE ldi_data.humidity < 50::double precision OR ldi_data.humidity > 60::double precision)::numeric / NULLIF(count(*), 0)::numeric, 1) AS humidity_pct,
             round(100.0 * count(*) FILTER (WHERE abs(ldi_data.pe_1) > 10::double precision OR abs(ldi_data.je_1) > 10::double precision)::numeric / NULLIF(count(*), 0)::numeric, 1) AS pe_pct,
             round(100.0 * count(*) FILTER (WHERE ldi_data.scan_speed > 450::double precision OR ldi_data.scan_speed <= 0::double precision)::numeric / NULLIF(count(*), 0)::numeric, 1) AS motion_pct
            FROM public.ldi_data
           WHERE ldi_data."time" > (now() - '24:00:00'::interval)
         ), cats AS (
          SELECT 'THERMAL (91008)'::text AS cat,
             round(100.0 * count(*) FILTER (WHERE alarm_ctx.flag_thermal_out_of_spec)::numeric / NULLIF(count(*), 0)::numeric, 1) AS alarm_pct,
             count(*) AS n
            FROM alarm_ctx
           WHERE alarm_ctx.category = 'ENVIRONMENT'::text
         UNION ALL
          SELECT 'HUMIDITY (91008)'::text,
             round(100.0 * count(*) FILTER (WHERE alarm_ctx.flag_humidity_out_of_spec)::numeric / NULLIF(count(*), 0)::numeric, 1) AS round,
             count(*) AS count
            FROM alarm_ctx
           WHERE alarm_ctx.category = 'ENVIRONMENT'::text
         UNION ALL
          SELECT 'ALIGNMENT/PE-JE (90001,90004,90005,90012,90013)'::text,
             round(100.0 * count(*) FILTER (WHERE alarm_ctx.flag_pe_out_of_spec)::numeric / NULLIF(count(*), 0)::numeric, 1) AS round,
             count(*) AS count
            FROM alarm_ctx
           WHERE alarm_ctx.category = ANY (ARRAY['REGISTRATION'::text, 'ALIGNMENT'::text])
         UNION ALL
          SELECT 'MOTION (70004)'::text,
             round(100.0 * count(*) FILTER (WHERE alarm_ctx.flag_scan_speed_out_of_spec)::numeric / NULLIF(count(*), 0)::numeric, 1) AS round,
             count(*) AS count
            FROM alarm_ctx
           WHERE alarm_ctx.category = 'MOTION'::text
         )
  SELECT c.cat AS alarm_category,
     c.alarm_pct AS alarm_window_pct,
         CASE
             WHEN c.cat = 'THERMAL (91008)'::text THEN b.thermal_pct
             WHEN c.cat = 'HUMIDITY (91008)'::text THEN b.humidity_pct
             WHEN c.cat = 'MOTION (70004)'::text THEN b.motion_pct
             ELSE b.pe_pct
         END AS baseline_pct,
     round(c.alarm_pct / NULLIF(
         CASE
             WHEN c.cat = 'THERMAL (91008)'::text THEN b.thermal_pct
             WHEN c.cat = 'HUMIDITY (91008)'::text THEN b.humidity_pct
             WHEN c.cat = 'MOTION (70004)'::text THEN b.motion_pct
             ELSE b.pe_pct
         END, 0::numeric), 2) AS lift,
     c.n AS event_count,
         CASE
             WHEN c.n < 30 THEN 'LOW SAMPLE (n<30)'::text
             ELSE 'OK'::text
         END AS confidence
    FROM cats c
      CROSS JOIN baseline b
   ORDER BY (round(c.alarm_pct / NULLIF(
         CASE
             WHEN c.cat = 'THERMAL (91008)'::text THEN b.thermal_pct
             WHEN c.cat = 'HUMIDITY (91008)'::text THEN b.humidity_pct
             WHEN c.cat = 'MOTION (70004)'::text THEN b.motion_pct
             ELSE b.pe_pct
         END, 0::numeric), 2)) DESC NULLS LAST;
GRANT SELECT ON public.v_ldi_rca_recent_window TO grafana_reader;

CREATE OR REPLACE VIEW public.v_ldi_event_timeline AS
  WITH state_changes AS (
          SELECT d."time" AS event_time,
             d.eqp_id,
                 CASE
                     WHEN d.state = false AND lag(d.state) OVER (PARTITION BY d.eqp_id ORDER BY d."time") = true THEN 'Machine Stop'::text
                     WHEN d.state = true AND lag(d.state) OVER (PARTITION BY d.eqp_id ORDER BY d."time") = false THEN 'Machine Start'::text
                     ELSE NULL::text
                 END AS event_type,
             'ldi_data'::text AS source,
                 CASE
                     WHEN d.state = false AND lag(d.state) OVER (PARTITION BY d.eqp_id ORDER BY d."time") = true THEN 'state changed to DOWN'::text
                     WHEN d.state = true AND lag(d.state) OVER (PARTITION BY d.eqp_id ORDER BY d."time") = false THEN 'state changed to RUNNING'::text
                     ELSE NULL::text
                 END AS description
            FROM public.ldi_data d
         ), alarms AS (
          SELECT al.logdate AS event_time,
             al.equipmentid AS eqp_id,
             'Alarm'::text AS event_type,
             'alarm_log'::text AS source,
             COALESCE(m.alarm_msg, al.errorcode::text::character varying) AS description
            FROM ldi_alarm_log al
              LEFT JOIN ldi_alarm_ms_code m ON al.errorcode::text = m.alarm_code::text
         )
  SELECT state_changes.event_time,
     state_changes.eqp_id,
     state_changes.event_type,
     state_changes.source,
     state_changes.description
    FROM state_changes
   WHERE state_changes.event_type IS NOT NULL
 UNION ALL
  SELECT alarms.event_time,
     alarms.eqp_id,
     alarms.event_type,
     alarms.source,
     alarms.description
    FROM alarms
   ORDER BY 1 DESC;
GRANT SELECT ON public.v_ldi_event_timeline TO grafana_reader;

CREATE OR REPLACE VIEW public.v_ldi_machine_latest_full AS
  SELECT dev.device_id AS eqp_id,
     dev.hostname,
     dev.location,
     dev.enabled,
     latest.eqp_id IS NOT NULL AS has_data,
     latest.eqp_id IS NOT NULL AND latest."time" < (now() - '00:05:00'::interval) AS is_stale,
     latest."time",
     latest.factory,
     latest.process,
     latest.mo,
     latest.fpn,
     latest.layer_name,
     latest.state,
     latest.board_no,
     latest.total_board,
     latest.total_time,
     latest.board_id,
     latest.filmno,
     latest.resist,
     latest.scale_mode,
     latest.temperature,
     latest.humidity,
     latest.scan_speed,
     latest.air_vacuum,
     latest.thickness,
     latest.resist_dosage,
     latest.scale_x,
     latest.scale_y,
     latest.pe_1,
     latest.pe_2,
     latest.pe_3,
     latest.pe_4,
     latest.pe_5,
     latest.pe_6,
     latest.je_1,
     latest.je_2,
     latest.je_3,
     latest.je_4,
     latest.pe_setting,
     latest.je_setting,
     latest.log_id
    FROM devices dev
      LEFT JOIN LATERAL ( SELECT d."time",
             d.factory,
             d.process,
             d.eqp_id,
             d.mo,
             d.fpn,
             d.layer_name,
             d.resist_dosage,
             d.scale_x,
             d.scale_y,
             d.temperature,
             d.humidity,
             d.scan_speed,
             d.air_vacuum,
             d.thickness,
             d.board_no,
             d.total_board,
             d.total_time,
             d.filmno,
             d.board_id,
             d.resist,
             d.state,
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
             d.log_id
            FROM public.ldi_data d
           WHERE d.eqp_id::text = dev.device_id
           ORDER BY d."time" DESC
          LIMIT 1) latest ON true
   WHERE dev.device_type = 'ldi'::text AND dev.enabled;
GRANT SELECT ON public.v_ldi_machine_latest_full TO grafana_reader;

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
    FROM public.ldi_data d
      LEFT JOIN LATERAL ( SELECT le.errorcode,
             le.errortime,
             le.logid
            FROM ldi_alarm_log le
           WHERE le.equipmentid::text = d.eqp_id::text AND le.logdate >= (d."time" - '00:02:00'::interval) AND le.logdate <= (d."time" + '00:02:00'::interval)
           ORDER BY (abs(EXTRACT(epoch FROM le.logdate - d."time")))
          LIMIT 1) a ON true
      LEFT JOIN ldi_alarm_ms_code m ON a.errorcode::text = m.alarm_code::text;
GRANT SELECT ON public.v_ldi_machine_snapshot TO grafana_reader;

CREATE OR REPLACE VIEW public.v_ldi_nelson_rules_detection AS
  WITH raw_pe AS (
          SELECT d."time",
             d.eqp_id,
             GREATEST(abs(COALESCE(d.pe_1, 0::double precision)), abs(COALESCE(d.pe_2, 0::double precision)), abs(COALESCE(d.pe_3, 0::double precision)), abs(COALESCE(d.pe_4, 0::double precision)), abs(COALESCE(d.pe_5, 0::double precision)), abs(COALESCE(d.pe_6, 0::double precision))) AS max_pe
            FROM public.ldi_data d
           WHERE d.pe_1 IS NOT NULL
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
                     WHEN rs.max_pe > rs.mu THEN 1
                     WHEN rs.max_pe < rs.mu THEN '-1'::integer
                     ELSE 0
                 END AS side,
             rs.max_pe - lag(rs.max_pe) OVER (PARTITION BY rs.eqp_id ORDER BY rs."time") AS delta
            FROM rolling_stats rs
         )
  SELECT ws."time",
     ws.eqp_id,
     round(ws.max_pe::numeric, 4) AS avg_pe,
     round(ws.mu::numeric, 4) AS mu,
     round(ws.sigma::numeric, 4) AS sigma,
     round((ws.mu + 3::double precision * ws.sigma)::numeric, 4) AS ucl,
     round((ws.mu - 3::double precision * ws.sigma)::numeric, 4) AS lcl,
         CASE
             WHEN ws.sigma > 0::double precision AND (ws.max_pe > (ws.mu + 3::double precision * ws.sigma) OR ws.max_pe < (ws.mu - 3::double precision * ws.sigma)) THEN 1
             ELSE 0
         END AS rule1_beyond_3sigma,
         CASE
             WHEN sum(
             CASE
                 WHEN ws2.side <> 0 THEN ws2.side
                 ELSE 0
             END) OVER (PARTITION BY ws2.eqp_id ORDER BY ws2."time" ROWS BETWEEN 8 PRECEDING AND CURRENT ROW) = ANY (ARRAY[9::bigint, '-9'::integer::bigint]) THEN 1
             ELSE 0
         END AS rule2_nine_same_side,
         CASE
             WHEN sum(
             CASE
                 WHEN ws2.delta > 0::double precision THEN 1
                 WHEN ws2.delta < 0::double precision THEN '-1'::integer
                 ELSE 0
             END) OVER (PARTITION BY ws2.eqp_id ORDER BY ws2."time" ROWS BETWEEN 5 PRECEDING AND CURRENT ROW) = ANY (ARRAY[6::bigint, '-6'::integer::bigint]) THEN 1
             ELSE 0
         END AS rule3_six_trend,
         CASE
             WHEN ws.sigma > 0::double precision AND (ws.max_pe > (ws.mu + 3::double precision * ws.sigma) OR ws.max_pe < (ws.mu - 3::double precision * ws.sigma)) OR (sum(
             CASE
                 WHEN ws2.side <> 0 THEN ws2.side
                 ELSE 0
             END) OVER (PARTITION BY ws2.eqp_id ORDER BY ws2."time" ROWS BETWEEN 8 PRECEDING AND CURRENT ROW) = ANY (ARRAY[9::bigint, '-9'::integer::bigint])) OR (sum(
             CASE
                 WHEN ws2.delta > 0::double precision THEN 1
                 WHEN ws2.delta < 0::double precision THEN '-1'::integer
                 ELSE 0
             END) OVER (PARTITION BY ws2.eqp_id ORDER BY ws2."time" ROWS BETWEEN 5 PRECEDING AND CURRENT ROW) = ANY (ARRAY[6::bigint, '-6'::integer::bigint])) THEN 1
             ELSE 0
         END AS any_rule_triggered
    FROM with_sides ws
      LEFT JOIN with_sides ws2 ON ws."time" = ws2."time" AND ws.eqp_id::text = ws2.eqp_id::text
   ORDER BY ws.eqp_id, ws."time" DESC;
GRANT SELECT ON public.v_ldi_nelson_rules_detection TO grafana_reader;

CREATE OR REPLACE VIEW public.v_machine_spc_fleet AS
  WITH pe_base AS (
          SELECT ldi_data.eqp_id,
             ldi_data.pe_1,
             ldi_data.pe_2,
             ldi_data.pe_3,
             ldi_data.pe_4,
             ldi_data.pe_5,
             ldi_data.pe_6,
             COALESCE(ldi_data.pe_setting, 25.0::double precision) AS pe_val
            FROM public.ldi_data
           WHERE ldi_data.pe_1 IS NOT NULL AND COALESCE(ldi_data.pe_setting, 0::double precision) > 2.0::double precision AND ldi_data."time" > (now() - '24:00:00'::interval)
         ), pe_samples AS (
          SELECT pe_base.eqp_id,
             pe_base.pe_val,
             v.pe
            FROM pe_base
              CROSS JOIN LATERAL ( VALUES (pe_base.pe_1), (pe_base.pe_2), (pe_base.pe_3), (pe_base.pe_4), (pe_base.pe_5), (pe_base.pe_6)) v(pe)
           WHERE v.pe IS NOT NULL
         ), pe_stats AS (
          SELECT pe_samples.eqp_id,
             count(*) AS n_pe,
             count(*) FILTER (WHERE abs(pe_samples.pe) <= pe_samples.pe_val) AS pass_pe,
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
             pe_stats.setting_val / NULLIF(3::double precision * pe_stats.sigma, 0::double precision) AS cp_pe,
             LEAST((pe_stats.setting_val - pe_stats.mu) / NULLIF(3::double precision * pe_stats.sigma, 0::double precision), (pe_stats.mu + pe_stats.setting_val) / NULLIF(3::double precision * pe_stats.sigma, 0::double precision)) AS cpk_pe
            FROM pe_stats
         ), je_base AS (
          SELECT ldi_data.eqp_id,
             ldi_data.je_1,
             ldi_data.je_2,
             ldi_data.je_3,
             ldi_data.je_4,
             COALESCE(ldi_data.je_setting, 25.0::double precision) AS je_val
            FROM public.ldi_data
           WHERE ldi_data.je_1 IS NOT NULL AND COALESCE(ldi_data.je_setting, 0::double precision) > 2.0::double precision AND ldi_data."time" > (now() - '24:00:00'::interval)
         ), je_samples AS (
          SELECT je_base.eqp_id,
             je_base.je_val,
             v.je
            FROM je_base
              CROSS JOIN LATERAL ( VALUES (je_base.je_1), (je_base.je_2), (je_base.je_3), (je_base.je_4)) v(je)
           WHERE v.je IS NOT NULL
         ), je_stats AS (
          SELECT je_samples.eqp_id,
             count(*) AS n_je,
             count(*) FILTER (WHERE abs(je_samples.je) <= je_samples.je_val) AS pass_je,
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
             je_stats.setting_val / NULLIF(3::double precision * je_stats.sigma, 0::double precision) AS cp_je,
             LEAST((je_stats.setting_val - je_stats.mu) / NULLIF(3::double precision * je_stats.sigma, 0::double precision), (je_stats.mu + je_stats.setting_val) / NULLIF(3::double precision * je_stats.sigma, 0::double precision)) AS cpk_je
            FROM je_stats
         )
  SELECT d.device_id AS eqp_id,
     d.location,
     p.n_pe,
     round(p.cp_pe::numeric, 3) AS cp_pe,
     round(p.cpk_pe::numeric, 3) AS cpk_pe,
     round(100.0 * p.pass_pe::numeric / NULLIF(p.n_pe, 0)::numeric, 1) AS pe_pass_rate,
     j.n_je,
     round(j.cp_je::numeric, 3) AS cp_je,
     round(j.cpk_je::numeric, 3) AS cpk_je,
     round(100.0 * j.pass_je::numeric / NULLIF(j.n_je, 0)::numeric, 1) AS je_pass_rate,
     round(
         CASE
             WHEN p.cpk_pe IS NULL THEN j.cpk_je
             WHEN j.cpk_je IS NULL THEN p.cpk_pe
             ELSE LEAST(p.cpk_pe, j.cpk_je)
         END::numeric, 3) AS worst_cpk,
         CASE
             WHEN p.cpk_pe IS NULL THEN j.n_je
             WHEN j.cpk_je IS NULL THEN p.n_pe
             WHEN p.cpk_pe <= j.cpk_je THEN p.n_pe
             ELSE j.n_je
         END AS worst_n
    FROM devices d
      LEFT JOIN pe_capability p ON p.eqp_id::text = d.device_id
      LEFT JOIN je_capability j ON j.eqp_id::text = d.device_id
   WHERE d.device_type = 'ldi'::text AND d.enabled;
GRANT SELECT ON public.v_machine_spc_fleet TO grafana_reader;

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
             COALESCE(ldi_data.pe_setting, 25.0::double precision) AS pe_val
            FROM public.ldi_data
           WHERE ldi_data.pe_1 IS NOT NULL AND COALESCE(ldi_data.pe_setting, 0::double precision) > 2.0::double precision AND ldi_data."time" > (( SELECT max(ldi_data_1."time") - '02:00:00'::interval
                    FROM public.ldi_data ldi_data_1))
         ), pe_samples AS (
          SELECT pe_base.eqp_id,
             pe_base.factory,
             pe_base.mo,
             pe_base.fpn,
             pe_base.layer_name,
             pe_base.pe_val,
             v.pe
            FROM pe_base
              CROSS JOIN LATERAL ( VALUES (pe_base.pe_1), (pe_base.pe_2), (pe_base.pe_3), (pe_base.pe_4), (pe_base.pe_5), (pe_base.pe_6)) v(pe)
           WHERE v.pe IS NOT NULL
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
             pe_stats.setting_val / NULLIF(3::double precision * pe_stats.sigma, 0::double precision) AS cp,
             LEAST((pe_stats.setting_val - pe_stats.mu) / NULLIF(3::double precision * pe_stats.sigma, 0::double precision), (pe_stats.mu + pe_stats.setting_val) / NULLIF(3::double precision * pe_stats.sigma, 0::double precision)) AS cpk
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
             COALESCE(ldi_data.je_setting, 25.0::double precision) AS je_val
            FROM public.ldi_data
           WHERE ldi_data.je_1 IS NOT NULL AND COALESCE(ldi_data.je_setting, 0::double precision) > 2.0::double precision AND ldi_data."time" > (( SELECT max(ldi_data_1."time") - '02:00:00'::interval
                    FROM public.ldi_data ldi_data_1))
         ), je_samples AS (
          SELECT je_base.eqp_id,
             je_base.factory,
             je_base.mo,
             je_base.fpn,
             je_base.layer_name,
             je_base.je_val,
             v.je
            FROM je_base
              CROSS JOIN LATERAL ( VALUES (je_base.je_1), (je_base.je_2), (je_base.je_3), (je_base.je_4)) v(je)
           WHERE v.je IS NOT NULL
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
             je_stats.setting_val / NULLIF(3::double precision * je_stats.sigma, 0::double precision) AS cp,
             LEAST((je_stats.setting_val - je_stats.mu) / NULLIF(3::double precision * je_stats.sigma, 0::double precision), (je_stats.mu + je_stats.setting_val) / NULLIF(3::double precision * je_stats.sigma, 0::double precision)) AS cpk
            FROM je_stats
         )
  SELECT COALESCE(p.eqp_id, j.eqp_id) AS eqp_id,
     COALESCE(p.factory, j.factory) AS factory,
     COALESCE(p.mo, j.mo) AS mo,
     COALESCE(p.fpn, j.fpn) AS fpn,
     COALESCE(p.layer_name, j.layer_name) AS layer_name,
     p.sample_count,
     round(p.mu::numeric, 3) AS mean_pe,
     round(p.sigma::numeric, 3) AS stddev_pe,
     round(p.cp::numeric, 3) AS cp,
     round(p.cpk::numeric, 3) AS cpk,
         CASE
             WHEN p.cpk IS NULL THEN NULL::text
             WHEN p.cpk >= 2.0::double precision THEN 'World Class'::text
             WHEN p.cpk >= 1.67::double precision THEN 'Excellent'::text
             WHEN p.cpk >= 1.33::double precision THEN 'Capable'::text
             WHEN p.cpk >= 1.0::double precision THEN 'Marginally Capable'::text
             ELSE 'Not Capable'::text
         END AS capability_class,
     j.sample_count AS sample_count_je,
     round(j.mu::numeric, 3) AS mean_je,
     round(j.sigma::numeric, 3) AS stddev_je,
     round(j.cp::numeric, 3) AS cp_je,
     round(j.cpk::numeric, 3) AS cpk_je,
         CASE
             WHEN j.cpk IS NULL THEN NULL::text
             WHEN j.cpk >= 2.0::double precision THEN 'World Class'::text
             WHEN j.cpk >= 1.67::double precision THEN 'Excellent'::text
             WHEN j.cpk >= 1.33::double precision THEN 'Capable'::text
             WHEN j.cpk >= 1.0::double precision THEN 'Marginally Capable'::text
             ELSE 'Not Capable'::text
         END AS capability_class_je
    FROM pe_capability p
      FULL JOIN je_capability j ON p.eqp_id::text = j.eqp_id::text AND p.factory::text = j.factory::text AND p.mo::text = j.mo::text AND p.fpn::text = j.fpn::text AND p.layer_name::text = j.layer_name::text
   WHERE COALESCE(p.sigma, j.sigma) > 0::double precision
   ORDER BY (round(p.cpk::numeric, 3)) DESC NULLS LAST;
GRANT SELECT ON public.v_machine_spc_ranking TO grafana_reader;

CREATE OR REPLACE VIEW public.v_process_stability AS
  WITH time_range AS (
          SELECT max(ldi_data."time") - '02:00:00'::interval AS cutoff
            FROM public.ldi_data
         ), temp_stats AS (
          SELECT ldi_data.eqp_id,
             avg(ldi_data.temperature) AS temp_mu,
             stddev(ldi_data.temperature) AS temp_sigma
            FROM public.ldi_data
           WHERE ldi_data."time" > (( SELECT time_range.cutoff
                    FROM time_range)) AND ldi_data.temperature IS NOT NULL
           GROUP BY ldi_data.eqp_id
         ), hum_stats AS (
          SELECT ldi_data.eqp_id,
             avg(ldi_data.humidity) AS hum_mu,
             stddev(ldi_data.humidity) AS hum_sigma
            FROM public.ldi_data
           WHERE ldi_data."time" > (( SELECT time_range.cutoff
                    FROM time_range)) AND ldi_data.humidity IS NOT NULL
           GROUP BY ldi_data.eqp_id
         ), pe_stats AS (
          SELECT ldi_data.eqp_id,
             avg(GREATEST(abs(COALESCE(ldi_data.pe_1, 0::double precision)), abs(COALESCE(ldi_data.pe_2, 0::double precision)), abs(COALESCE(ldi_data.pe_3, 0::double precision)), abs(COALESCE(ldi_data.pe_4, 0::double precision)), abs(COALESCE(ldi_data.pe_5, 0::double precision)), abs(COALESCE(ldi_data.pe_6, 0::double precision)))) AS pe_mu,
             stddev(GREATEST(abs(COALESCE(ldi_data.pe_1, 0::double precision)), abs(COALESCE(ldi_data.pe_2, 0::double precision)), abs(COALESCE(ldi_data.pe_3, 0::double precision)), abs(COALESCE(ldi_data.pe_4, 0::double precision)), abs(COALESCE(ldi_data.pe_5, 0::double precision)), abs(COALESCE(ldi_data.pe_6, 0::double precision)))) AS pe_sigma,
             avg(GREATEST(abs(COALESCE(ldi_data.je_1, 0::double precision)), abs(COALESCE(ldi_data.je_2, 0::double precision)), abs(COALESCE(ldi_data.je_3, 0::double precision)), abs(COALESCE(ldi_data.je_4, 0::double precision)))) AS je_mu,
             stddev(GREATEST(abs(COALESCE(ldi_data.je_1, 0::double precision)), abs(COALESCE(ldi_data.je_2, 0::double precision)), abs(COALESCE(ldi_data.je_3, 0::double precision)), abs(COALESCE(ldi_data.je_4, 0::double precision)))) AS je_sigma
            FROM public.ldi_data
           WHERE ldi_data."time" > (( SELECT time_range.cutoff
                    FROM time_range)) AND ldi_data.pe_1 IS NOT NULL
           GROUP BY ldi_data.eqp_id
         )
  SELECT COALESCE(t.eqp_id, h.eqp_id, pe.eqp_id) AS eqp_id,
     GREATEST(0::double precision, 33::double precision - COALESCE(t.temp_sigma, 99::double precision) * 10::double precision)::numeric(5,1) AS temp_score,
     GREATEST(0::double precision, 33::double precision - COALESCE(h.hum_sigma, 99::double precision) * 10::double precision)::numeric(5,1) AS hum_score,
     GREATEST(0::double precision, 34::double precision - COALESCE(pe.pe_sigma, 99::double precision) * 5::double precision - COALESCE(pe.pe_mu, 99::double precision) * 2::double precision)::numeric(5,1) AS pe_score,
     GREATEST(0::double precision, 17::double precision - COALESCE(pe.je_sigma, 99::double precision) * 5::double precision - COALESCE(pe.je_mu, 99::double precision))::numeric(5,1) AS je_score,
     GREATEST(0::double precision, GREATEST(0::double precision, 33::double precision - COALESCE(t.temp_sigma, 99::double precision) * 10::double precision) + GREATEST(0::double precision, 33::double precision - COALESCE(h.hum_sigma, 99::double precision) * 10::double precision) + GREATEST(0::double precision, 34::double precision - COALESCE(pe.pe_sigma, 99::double precision) * 5::double precision - COALESCE(pe.pe_mu, 99::double precision) * 2::double precision) + GREATEST(0::double precision, 17::double precision - COALESCE(pe.je_sigma, 99::double precision) * 5::double precision - COALESCE(pe.je_mu, 99::double precision)))::numeric(5,1) AS stability_index
    FROM temp_stats t
      FULL JOIN hum_stats h ON t.eqp_id::text = h.eqp_id::text
      FULL JOIN pe_stats pe ON COALESCE(t.eqp_id, h.eqp_id)::text = pe.eqp_id::text
   ORDER BY (GREATEST(0::double precision, GREATEST(0::double precision, 33::double precision - COALESCE(t.temp_sigma, 99::double precision) * 10::double precision) + GREATEST(0::double precision, 33::double precision - COALESCE(h.hum_sigma, 99::double precision) * 10::double precision) + GREATEST(0::double precision, 34::double precision - COALESCE(pe.pe_sigma, 99::double precision) * 5::double precision - COALESCE(pe.pe_mu, 99::double precision) * 2::double precision) + GREATEST(0::double precision, 17::double precision - COALESCE(pe.je_sigma, 99::double precision) * 5::double precision - COALESCE(pe.je_mu, 99::double precision)))::numeric(5,1)) DESC;
GRANT SELECT ON public.v_process_stability TO grafana_reader;

