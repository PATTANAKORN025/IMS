-- ══════════════════════════════════════════════════════════════
-- IMS schema export (public schema only, structure only, no data)
-- ══════════════════════════════════════════════════════════════
-- Generated: pg_dump --schema-only --no-owner --no-privileges -n public
-- Captures: every table, view, function, index, trigger, and constraint
-- currently in the public schema -- 8 tables, 20 views, 3 functions,
-- 17 indexes, 1 trigger as of this export.
--
-- Does NOT capture TimescaleDB-specific setup (hypertable partitioning,
-- continuous aggregates, compression/retention policies) -- that
-- metadata lives in TimescaleDB's own internal catalog
-- (_timescaledb_catalog), which a plain schema-scoped pg_dump doesn't
-- replay as create_hypertable()/policy calls. Importing this file alone
-- into a fresh database gives you correctly-shaped plain tables/views/
-- functions, but ldi_data etc. won't be hypertables and no continuous
-- aggregate will exist.
--
-- For a genuinely complete fresh install (hypertables, CAGGs, policies,
-- everything), use postgres/init/001-init-timescaledb.sql instead --
-- the actual maintained, tested "docker compose up" fresh-install path
-- for this repo (see docs/ARCHITECTURE.md's Migration Governance
-- section). This export exists for reference/diffing/import into a
-- plain (non-TimescaleDB) Postgres, not as a second copy of that script
-- to keep in sync by hand.
--
-- PostgreSQL database dump
--

\restrict 6HBdm7rODCMoofIHI3gg1W49FIv8we25UFVh200Nk9utPxy0z63EMBn8Zugiu9q

-- Dumped from database version 16.14
-- Dumped by pg_dump version 16.14

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: f_ldi_alarm_link_log_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.f_ldi_alarm_link_log_id() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.related_log_id IS NULL THEN
        SELECT d.log_id INTO NEW.related_log_id
        FROM public.ldi_data d
        WHERE d.eqp_id = NEW.equipmentid
          AND d."time" BETWEEN NEW.logdate - INTERVAL '2 minutes' AND NEW.logdate + INTERVAL '2 minutes'
        ORDER BY ABS(EXTRACT(EPOCH FROM (d."time" - NEW.logdate)))
        LIMIT 1;
    ELSIF NOT EXISTS (SELECT 1 FROM public.ldi_data d WHERE d.log_id = NEW.related_log_id) THEN
        RAISE EXCEPTION 'ldi_alarm_log.related_log_id % does not exist in ldi_data.log_id', NEW.related_log_id;
    END IF;
    RETURN NEW;
END;
$$;


--
-- Name: f_ldi_yield_pct(text[], timestamp with time zone, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.f_ldi_yield_pct(p_eqp_id text[] DEFAULT NULL::text[], p_since timestamp with time zone DEFAULT (now() - '01:00:00'::interval), p_until timestamp with time zone DEFAULT now()) RETURNS numeric
    LANGUAGE sql STABLE
    AS $$
    WITH pe_yield AS (
        SELECT ROUND(100.0 * COUNT(*) FILTER (
            WHERE GREATEST(ABS(pe_1), ABS(pe_2), ABS(pe_3),
                           ABS(pe_4), ABS(pe_5), ABS(pe_6)) <= pe_setting
        ) / NULLIF(COUNT(*) FILTER (WHERE pe_1 IS NOT NULL), 0)::NUMERIC, 1) AS value
        FROM public.ldi_data
        WHERE "time" BETWEEN p_since AND p_until
          AND (p_eqp_id IS NULL OR eqp_id = ANY(p_eqp_id))
    ),
    je_yield AS (
        SELECT ROUND(100.0 * COUNT(*) FILTER (
            WHERE GREATEST(ABS(je_1), ABS(je_2), ABS(je_3), ABS(je_4)) <= je_setting
        ) / NULLIF(COUNT(*) FILTER (WHERE je_1 IS NOT NULL), 0)::NUMERIC, 1) AS value
        FROM public.ldi_data
        WHERE "time" BETWEEN p_since AND p_until
          AND (p_eqp_id IS NULL OR eqp_id = ANY(p_eqp_id))
    )
    SELECT COALESCE(LEAST(py.value, jy.value), py.value, jy.value)
    FROM pe_yield py, je_yield jy
$$;


--
-- Name: FUNCTION f_ldi_yield_pct(p_eqp_id text[], p_since timestamp with time zone, p_until timestamp with time zone); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.f_ldi_yield_pct(p_eqp_id text[], p_since timestamp with time zone, p_until timestamp with time zone) IS 'Fleet yield %: worst-case of PE-pass-rate and JE-pass-rate, each measured against pe_setting/je_setting (all 6 PE / 4 JE points, not just point 1). Shared by NOC Overview and Manufacturing dashboards so both always report an identical number for an identical scope.';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ldi_data; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ldi_data (
    "time" timestamp with time zone NOT NULL,
    factory character varying(10) NOT NULL,
    process character varying(250) NOT NULL,
    eqp_id character varying(250) NOT NULL,
    mo character varying(50) NOT NULL,
    fpn character varying(50) NOT NULL,
    layer_name character varying(250) NOT NULL,
    resist_dosage real,
    scale_x real,
    scale_y real,
    temperature real,
    humidity real,
    scan_speed real,
    air_vacuum real,
    thickness real,
    board_no smallint,
    total_board smallint,
    total_time real,
    filmno character varying(250),
    board_id character varying(250),
    resist character varying(250),
    state boolean,
    scale_mode character varying(250),
    pe_1 real,
    pe_2 real,
    pe_3 real,
    pe_4 real,
    pe_5 real,
    pe_6 real,
    je_1 real,
    je_2 real,
    je_3 real,
    je_4 real,
    pe_setting real,
    je_setting real,
    log_id character varying(50) NOT NULL
);


--
-- Name: ldi_data_1m; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.ldi_data_1m AS
 SELECT _materialized_hypertable_14.bucket,
    _materialized_hypertable_14.eqp_id,
    _materialized_hypertable_14.factory,
    _materialized_hypertable_14.process,
    _materialized_hypertable_14.mo,
    _materialized_hypertable_14.fpn,
    _materialized_hypertable_14.layer_name,
    _materialized_hypertable_14.sample_count,
    _materialized_hypertable_14.avg_temperature,
    _materialized_hypertable_14.avg_humidity,
    _materialized_hypertable_14.avg_air_vacuum,
    _materialized_hypertable_14.avg_scan_speed,
    _materialized_hypertable_14.avg_thickness,
    _materialized_hypertable_14.avg_resist_dosage,
    _materialized_hypertable_14.avg_scale_x,
    _materialized_hypertable_14.avg_scale_y,
    _materialized_hypertable_14.avg_pe_1,
    _materialized_hypertable_14.avg_pe_2,
    _materialized_hypertable_14.avg_pe_3,
    _materialized_hypertable_14.avg_pe_4,
    _materialized_hypertable_14.avg_pe_5,
    _materialized_hypertable_14.avg_pe_6,
    _materialized_hypertable_14.avg_je_1,
    _materialized_hypertable_14.avg_je_2,
    _materialized_hypertable_14.avg_je_3,
    _materialized_hypertable_14.avg_je_4,
    _materialized_hypertable_14.avg_pe_setting,
    _materialized_hypertable_14.avg_je_setting
   FROM _timescaledb_internal._materialized_hypertable_14
  WHERE (_materialized_hypertable_14.bucket < COALESCE(_timescaledb_functions.to_timestamp(_timescaledb_functions.cagg_watermark(14)), '-infinity'::timestamp with time zone))
UNION ALL
 SELECT public.time_bucket('00:01:00'::interval, ldi_data."time") AS bucket,
    ldi_data.eqp_id,
    ldi_data.factory,
    ldi_data.process,
    ldi_data.mo,
    ldi_data.fpn,
    ldi_data.layer_name,
    count(*) AS sample_count,
    avg(ldi_data.temperature) AS avg_temperature,
    avg(ldi_data.humidity) AS avg_humidity,
    avg(ldi_data.air_vacuum) AS avg_air_vacuum,
    avg(ldi_data.scan_speed) AS avg_scan_speed,
    avg(ldi_data.thickness) AS avg_thickness,
    avg(ldi_data.resist_dosage) AS avg_resist_dosage,
    avg(ldi_data.scale_x) AS avg_scale_x,
    avg(ldi_data.scale_y) AS avg_scale_y,
    avg(ldi_data.pe_1) AS avg_pe_1,
    avg(ldi_data.pe_2) AS avg_pe_2,
    avg(ldi_data.pe_3) AS avg_pe_3,
    avg(ldi_data.pe_4) AS avg_pe_4,
    avg(ldi_data.pe_5) AS avg_pe_5,
    avg(ldi_data.pe_6) AS avg_pe_6,
    avg(ldi_data.je_1) AS avg_je_1,
    avg(ldi_data.je_2) AS avg_je_2,
    avg(ldi_data.je_3) AS avg_je_3,
    avg(ldi_data.je_4) AS avg_je_4,
    avg(ldi_data.pe_setting) AS avg_pe_setting,
    avg(ldi_data.je_setting) AS avg_je_setting
   FROM public.ldi_data
  WHERE (ldi_data."time" >= COALESCE(_timescaledb_functions.to_timestamp(_timescaledb_functions.cagg_watermark(14)), '-infinity'::timestamp with time zone))
  GROUP BY (public.time_bucket('00:01:00'::interval, ldi_data."time")), ldi_data.eqp_id, ldi_data.factory, ldi_data.process, ldi_data.mo, ldi_data.fpn, ldi_data.layer_name;


--
-- Name: ldi_data_15m; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.ldi_data_15m AS
 SELECT _materialized_hypertable_15.bucket,
    _materialized_hypertable_15.eqp_id,
    _materialized_hypertable_15.factory,
    _materialized_hypertable_15.process,
    _materialized_hypertable_15.mo,
    _materialized_hypertable_15.fpn,
    _materialized_hypertable_15.layer_name,
    _materialized_hypertable_15.sample_count,
    _materialized_hypertable_15.avg_temperature,
    _materialized_hypertable_15.avg_humidity,
    _materialized_hypertable_15.avg_air_vacuum,
    _materialized_hypertable_15.avg_scan_speed,
    _materialized_hypertable_15.avg_thickness,
    _materialized_hypertable_15.avg_resist_dosage,
    _materialized_hypertable_15.avg_scale_x,
    _materialized_hypertable_15.avg_scale_y,
    _materialized_hypertable_15.avg_pe_1,
    _materialized_hypertable_15.avg_pe_2,
    _materialized_hypertable_15.avg_pe_3,
    _materialized_hypertable_15.avg_pe_4,
    _materialized_hypertable_15.avg_pe_5,
    _materialized_hypertable_15.avg_pe_6,
    _materialized_hypertable_15.avg_je_1,
    _materialized_hypertable_15.avg_je_2,
    _materialized_hypertable_15.avg_je_3,
    _materialized_hypertable_15.avg_je_4,
    _materialized_hypertable_15.avg_pe_setting,
    _materialized_hypertable_15.avg_je_setting
   FROM _timescaledb_internal._materialized_hypertable_15
  WHERE (_materialized_hypertable_15.bucket < COALESCE(_timescaledb_functions.to_timestamp(_timescaledb_functions.cagg_watermark(15)), '-infinity'::timestamp with time zone))
UNION ALL
 SELECT public.time_bucket('00:15:00'::interval, ldi_data_1m.bucket) AS bucket,
    ldi_data_1m.eqp_id,
    ldi_data_1m.factory,
    ldi_data_1m.process,
    ldi_data_1m.mo,
    ldi_data_1m.fpn,
    ldi_data_1m.layer_name,
    sum(ldi_data_1m.sample_count) AS sample_count,
    avg(ldi_data_1m.avg_temperature) AS avg_temperature,
    avg(ldi_data_1m.avg_humidity) AS avg_humidity,
    avg(ldi_data_1m.avg_air_vacuum) AS avg_air_vacuum,
    avg(ldi_data_1m.avg_scan_speed) AS avg_scan_speed,
    avg(ldi_data_1m.avg_thickness) AS avg_thickness,
    avg(ldi_data_1m.avg_resist_dosage) AS avg_resist_dosage,
    avg(ldi_data_1m.avg_scale_x) AS avg_scale_x,
    avg(ldi_data_1m.avg_scale_y) AS avg_scale_y,
    avg(ldi_data_1m.avg_pe_1) AS avg_pe_1,
    avg(ldi_data_1m.avg_pe_2) AS avg_pe_2,
    avg(ldi_data_1m.avg_pe_3) AS avg_pe_3,
    avg(ldi_data_1m.avg_pe_4) AS avg_pe_4,
    avg(ldi_data_1m.avg_pe_5) AS avg_pe_5,
    avg(ldi_data_1m.avg_pe_6) AS avg_pe_6,
    avg(ldi_data_1m.avg_je_1) AS avg_je_1,
    avg(ldi_data_1m.avg_je_2) AS avg_je_2,
    avg(ldi_data_1m.avg_je_3) AS avg_je_3,
    avg(ldi_data_1m.avg_je_4) AS avg_je_4,
    avg(ldi_data_1m.avg_pe_setting) AS avg_pe_setting,
    avg(ldi_data_1m.avg_je_setting) AS avg_je_setting
   FROM public.ldi_data_1m
  WHERE (ldi_data_1m.bucket >= COALESCE(_timescaledb_functions.to_timestamp(_timescaledb_functions.cagg_watermark(15)), '-infinity'::timestamp with time zone))
  GROUP BY (public.time_bucket('00:15:00'::interval, ldi_data_1m.bucket)), ldi_data_1m.eqp_id, ldi_data_1m.factory, ldi_data_1m.process, ldi_data_1m.mo, ldi_data_1m.fpn, ldi_data_1m.layer_name;


--
-- Name: sys_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sys_metrics (
    "time" timestamp with time zone NOT NULL,
    device_id text NOT NULL,
    cpu_cores integer,
    cpu_load_percent double precision,
    ram_total_mb double precision,
    ram_used_mb double precision,
    ram_free_mb double precision,
    disk_total_gb double precision,
    disk_used_gb double precision,
    disk_free_gb double precision,
    disk_description text DEFAULT ''::text,
    temp_c double precision DEFAULT 0,
    cpu_metrics jsonb DEFAULT '{}'::jsonb,
    temp_metrics jsonb DEFAULT '{}'::jsonb
);


--
-- Name: net_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.net_metrics (
    "time" timestamp with time zone NOT NULL,
    device_id text NOT NULL,
    iface_name text NOT NULL,
    rx_mbps double precision DEFAULT 0,
    tx_mbps double precision DEFAULT 0,
    rx_errors bigint DEFAULT 0,
    tx_errors bigint DEFAULT 0,
    rx_drops bigint DEFAULT 0,
    tx_drops bigint DEFAULT 0,
    status text DEFAULT 'UP'::text
);


--
-- Name: ldi_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ldi_metrics (
    "time" timestamp with time zone NOT NULL,
    device_id text NOT NULL,
    throughput double precision DEFAULT 0,
    temperature double precision DEFAULT 0,
    humidity double precision DEFAULT 0,
    pe_1 double precision DEFAULT 0,
    je_1 double precision DEFAULT 0,
    power_watt double precision DEFAULT 0,
    vibration double precision DEFAULT 0
);


--
-- Name: ldi_alarm_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ldi_alarm_log (
    logid character varying(50) NOT NULL,
    logdate timestamp with time zone NOT NULL,
    errorcode character varying(50),
    errortime character varying(50),
    equipmentid character varying(50),
    factory character varying(1),
    process character varying(50),
    related_log_id character varying(50)
);


--
-- Name: devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.devices (
    device_id text NOT NULL,
    hostname text NOT NULL,
    ip_address text DEFAULT ''::text NOT NULL,
    location text DEFAULT ''::text,
    device_type text DEFAULT 'server'::text,
    snmp_community text DEFAULT 'public'::text,
    snmp_port integer DEFAULT 161,
    poll_interval integer DEFAULT 1,
    enabled boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: ldi_alarm_ms_code; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ldi_alarm_ms_code (
    alarm_id character varying(15) NOT NULL,
    alarm_type character varying(50),
    alarm_code character varying(50),
    alarm_msg character varying(500),
    alarm_detail character varying(500)
);


--
-- Name: ldi_data_1h; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.ldi_data_1h AS
 SELECT _materialized_hypertable_16.bucket,
    _materialized_hypertable_16.eqp_id,
    _materialized_hypertable_16.factory,
    _materialized_hypertable_16.process,
    _materialized_hypertable_16.mo,
    _materialized_hypertable_16.fpn,
    _materialized_hypertable_16.layer_name,
    _materialized_hypertable_16.sample_count,
    _materialized_hypertable_16.avg_temperature,
    _materialized_hypertable_16.avg_humidity,
    _materialized_hypertable_16.avg_air_vacuum,
    _materialized_hypertable_16.avg_scan_speed,
    _materialized_hypertable_16.avg_thickness,
    _materialized_hypertable_16.avg_resist_dosage,
    _materialized_hypertable_16.avg_scale_x,
    _materialized_hypertable_16.avg_scale_y,
    _materialized_hypertable_16.avg_pe_1,
    _materialized_hypertable_16.avg_pe_2,
    _materialized_hypertable_16.avg_pe_3,
    _materialized_hypertable_16.avg_pe_4,
    _materialized_hypertable_16.avg_pe_5,
    _materialized_hypertable_16.avg_pe_6,
    _materialized_hypertable_16.avg_je_1,
    _materialized_hypertable_16.avg_je_2,
    _materialized_hypertable_16.avg_je_3,
    _materialized_hypertable_16.avg_je_4,
    _materialized_hypertable_16.avg_pe_setting,
    _materialized_hypertable_16.avg_je_setting
   FROM _timescaledb_internal._materialized_hypertable_16
  WHERE (_materialized_hypertable_16.bucket < COALESCE(_timescaledb_functions.to_timestamp(_timescaledb_functions.cagg_watermark(16)), '-infinity'::timestamp with time zone))
UNION ALL
 SELECT public.time_bucket('01:00:00'::interval, ldi_data_15m.bucket) AS bucket,
    ldi_data_15m.eqp_id,
    ldi_data_15m.factory,
    ldi_data_15m.process,
    ldi_data_15m.mo,
    ldi_data_15m.fpn,
    ldi_data_15m.layer_name,
    sum(ldi_data_15m.sample_count) AS sample_count,
    avg(ldi_data_15m.avg_temperature) AS avg_temperature,
    avg(ldi_data_15m.avg_humidity) AS avg_humidity,
    avg(ldi_data_15m.avg_air_vacuum) AS avg_air_vacuum,
    avg(ldi_data_15m.avg_scan_speed) AS avg_scan_speed,
    avg(ldi_data_15m.avg_thickness) AS avg_thickness,
    avg(ldi_data_15m.avg_resist_dosage) AS avg_resist_dosage,
    avg(ldi_data_15m.avg_scale_x) AS avg_scale_x,
    avg(ldi_data_15m.avg_scale_y) AS avg_scale_y,
    avg(ldi_data_15m.avg_pe_1) AS avg_pe_1,
    avg(ldi_data_15m.avg_pe_2) AS avg_pe_2,
    avg(ldi_data_15m.avg_pe_3) AS avg_pe_3,
    avg(ldi_data_15m.avg_pe_4) AS avg_pe_4,
    avg(ldi_data_15m.avg_pe_5) AS avg_pe_5,
    avg(ldi_data_15m.avg_pe_6) AS avg_pe_6,
    avg(ldi_data_15m.avg_je_1) AS avg_je_1,
    avg(ldi_data_15m.avg_je_2) AS avg_je_2,
    avg(ldi_data_15m.avg_je_3) AS avg_je_3,
    avg(ldi_data_15m.avg_je_4) AS avg_je_4,
    avg(ldi_data_15m.avg_pe_setting) AS avg_pe_setting,
    avg(ldi_data_15m.avg_je_setting) AS avg_je_setting
   FROM public.ldi_data_15m
  WHERE (ldi_data_15m.bucket >= COALESCE(_timescaledb_functions.to_timestamp(_timescaledb_functions.cagg_watermark(16)), '-infinity'::timestamp with time zone))
  GROUP BY (public.time_bucket('01:00:00'::interval, ldi_data_15m.bucket)), ldi_data_15m.eqp_id, ldi_data_15m.factory, ldi_data_15m.process, ldi_data_15m.mo, ldi_data_15m.fpn, ldi_data_15m.layer_name;


--
-- Name: ldi_data_hourly; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.ldi_data_hourly AS
 SELECT bucket,
    eqp_id,
    avg_temp,
    max_temp,
    avg_humidity,
    avg_max_pe,
    peak_pe,
    avg_scan_speed,
    avg_air_vacuum,
    sample_count
   FROM _timescaledb_internal._materialized_hypertable_13;


--
-- Name: ldi_hourly; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.ldi_hourly AS
 SELECT _materialized_hypertable_6.bucket,
    _materialized_hypertable_6.device_id,
    _materialized_hypertable_6.avg_throughput,
    _materialized_hypertable_6.max_temp,
    _materialized_hypertable_6.avg_humidity,
    _materialized_hypertable_6.avg_power,
    _materialized_hypertable_6.avg_vibration
   FROM _timescaledb_internal._materialized_hypertable_6
  WHERE (_materialized_hypertable_6.bucket < COALESCE(_timescaledb_functions.to_timestamp(_timescaledb_functions.cagg_watermark(6)), '-infinity'::timestamp with time zone))
UNION ALL
 SELECT public.time_bucket('01:00:00'::interval, ldi_metrics."time") AS bucket,
    ldi_metrics.device_id,
    avg(ldi_metrics.throughput) AS avg_throughput,
    max(ldi_metrics.temperature) AS max_temp,
    avg(ldi_metrics.humidity) AS avg_humidity,
    avg(ldi_metrics.power_watt) AS avg_power,
    avg(ldi_metrics.vibration) AS avg_vibration
   FROM public.ldi_metrics
  WHERE (ldi_metrics."time" >= COALESCE(_timescaledb_functions.to_timestamp(_timescaledb_functions.cagg_watermark(6)), '-infinity'::timestamp with time zone))
  GROUP BY (public.time_bucket('01:00:00'::interval, ldi_metrics."time")), ldi_metrics.device_id;


--
-- Name: net_hourly; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.net_hourly AS
 SELECT _materialized_hypertable_5.bucket,
    _materialized_hypertable_5.device_id,
    _materialized_hypertable_5.iface_name,
    _materialized_hypertable_5.avg_rx,
    _materialized_hypertable_5.max_rx,
    _materialized_hypertable_5.avg_tx,
    _materialized_hypertable_5.max_tx,
    _materialized_hypertable_5.total_errors,
    _materialized_hypertable_5.total_drops
   FROM _timescaledb_internal._materialized_hypertable_5
  WHERE (_materialized_hypertable_5.bucket < COALESCE(_timescaledb_functions.to_timestamp(_timescaledb_functions.cagg_watermark(5)), '-infinity'::timestamp with time zone))
UNION ALL
 SELECT public.time_bucket('01:00:00'::interval, net_metrics."time") AS bucket,
    net_metrics.device_id,
    net_metrics.iface_name,
    avg(net_metrics.rx_mbps) AS avg_rx,
    max(net_metrics.rx_mbps) AS max_rx,
    avg(net_metrics.tx_mbps) AS avg_tx,
    max(net_metrics.tx_mbps) AS max_tx,
    sum(net_metrics.rx_errors) AS total_errors,
    sum(net_metrics.rx_drops) AS total_drops
   FROM public.net_metrics
  WHERE (net_metrics."time" >= COALESCE(_timescaledb_functions.to_timestamp(_timescaledb_functions.cagg_watermark(5)), '-infinity'::timestamp with time zone))
  GROUP BY (public.time_bucket('01:00:00'::interval, net_metrics."time")), net_metrics.device_id, net_metrics.iface_name;


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version text NOT NULL,
    filename text NOT NULL,
    applied_at timestamp with time zone DEFAULT now(),
    checksum text
);


--
-- Name: sys_hourly; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.sys_hourly AS
 SELECT _materialized_hypertable_4.bucket,
    _materialized_hypertable_4.device_id,
    _materialized_hypertable_4.avg_cpu,
    _materialized_hypertable_4.max_cpu,
    _materialized_hypertable_4.avg_ram_used,
    _materialized_hypertable_4.avg_ram_total,
    _materialized_hypertable_4.avg_disk_used,
    _materialized_hypertable_4.avg_disk_total,
    _materialized_hypertable_4.max_temp
   FROM _timescaledb_internal._materialized_hypertable_4
  WHERE (_materialized_hypertable_4.bucket < COALESCE(_timescaledb_functions.to_timestamp(_timescaledb_functions.cagg_watermark(4)), '-infinity'::timestamp with time zone))
UNION ALL
 SELECT public.time_bucket('01:00:00'::interval, sys_metrics."time") AS bucket,
    sys_metrics.device_id,
    avg(sys_metrics.cpu_load_percent) AS avg_cpu,
    max(sys_metrics.cpu_load_percent) AS max_cpu,
    avg(sys_metrics.ram_used_mb) AS avg_ram_used,
    avg(sys_metrics.ram_total_mb) AS avg_ram_total,
    avg(sys_metrics.disk_used_gb) AS avg_disk_used,
    avg(sys_metrics.disk_total_gb) AS avg_disk_total,
    max(sys_metrics.temp_c) AS max_temp
   FROM public.sys_metrics
  WHERE (sys_metrics."time" >= COALESCE(_timescaledb_functions.to_timestamp(_timescaledb_functions.cagg_watermark(4)), '-infinity'::timestamp with time zone))
  GROUP BY (public.time_bucket('01:00:00'::interval, sys_metrics."time")), sys_metrics.device_id;


--
-- Name: v_fleet_health; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_fleet_health AS
 SELECT DISTINCT ON (d.device_id) d.device_id AS machine_id,
    round((s.cpu_load_percent)::numeric, 1) AS cpu_pct,
    round((((s.ram_used_mb / NULLIF(s.ram_total_mb, (0)::double precision)) * (100)::double precision))::numeric, 1) AS ram_pct,
    round((((s.disk_used_gb / NULLIF(s.disk_total_gb, (0)::double precision)) * (100)::double precision))::numeric, 1) AS disk_pct,
    round((s.temp_c)::numeric, 0) AS temp_c,
    (GREATEST((0)::double precision, ((((100)::double precision - (GREATEST((0)::double precision, (s.cpu_load_percent - (70)::double precision)) * (1.5)::double precision)) - (GREATEST((0)::double precision, (((s.ram_used_mb / NULLIF(s.ram_total_mb, (0)::double precision)) * (100)::double precision) - (75)::double precision)) * (2)::double precision)) - (GREATEST((0)::double precision, (((s.disk_used_gb / NULLIF(s.disk_total_gb, (0)::double precision)) * (100)::double precision) - (80)::double precision)) * (2)::double precision))))::numeric(5,1) AS health_score,
    s."time"
   FROM (public.sys_metrics s
     JOIN public.devices d ON ((d.device_id = s.device_id)))
  WHERE ((s."time" > (now() - '00:05:00'::interval)) AND (d.device_type = 'server'::text) AND (d.enabled = true))
  ORDER BY d.device_id, s."time" DESC;


--
-- Name: v_fleet_score; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_fleet_score AS
 SELECT 'Fleet Score'::text AS metric,
    round(avg(health_score), 1) AS value
   FROM public.v_fleet_health;


--
-- Name: v_ldi_alarm_category; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_ldi_alarm_category AS
 SELECT alarm_code,
        CASE
            WHEN ((alarm_code)::text = '91009'::text) THEN 'VACUUM'::text
            WHEN ((alarm_code)::text = '90005'::text) THEN 'REGISTRATION'::text
            WHEN ((alarm_code)::text = ANY ((ARRAY['90001'::character varying, '90004'::character varying, '90012'::character varying, '90013'::character varying])::text[])) THEN 'ALIGNMENT'::text
            WHEN ((alarm_code)::text = ANY ((ARRAY['93004'::character varying, '93007'::character varying])::text[])) THEN 'CALIBRATION'::text
            WHEN ((alarm_code)::text = ANY ((ARRAY['91008'::character varying, '91017'::character varying])::text[])) THEN 'ENVIRONMENT'::text
            WHEN ((alarm_code)::text = '70004'::text) THEN 'MOTION'::text
            WHEN ((alarm_code)::text = '10006'::text) THEN 'OPTICS'::text
            WHEN ((alarm_code)::text = ANY ((ARRAY['2'::character varying, '20'::character varying])::text[])) THEN 'DATA_QUALITY'::text
            ELSE 'UNCLASSIFIED'::text
        END AS category,
        CASE
            WHEN ((alarm_code)::text = '91009'::text) THEN 'air_vacuum'::text
            WHEN ((alarm_code)::text = '90005'::text) THEN 'pe_1..pe_6, je_1..je_4'::text
            WHEN ((alarm_code)::text = ANY ((ARRAY['90001'::character varying, '90004'::character varying, '90012'::character varying])::text[])) THEN 'scale_x, scale_y, pe_1..pe_6'::text
            WHEN ((alarm_code)::text = '91008'::text) THEN 'temperature, humidity'::text
            WHEN ((alarm_code)::text = '70004'::text) THEN 'scan_speed'::text
            ELSE NULL::text
        END AS related_columns
   FROM public.ldi_alarm_ms_code;


--
-- Name: VIEW v_ldi_alarm_category; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON VIEW public.v_ldi_alarm_category IS 'จับคู่รหัส alarm กับหมวดหมู่และคอลัมน์ใน ldi_data ที่ควรตรวจสอบ — ใช้สำหรับ RCA';


--
-- Name: v_ldi_alarm_context; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_ldi_alarm_context AS
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
    ((d.temperature < (20)::double precision) OR (d.temperature > (24)::double precision)) AS flag_thermal_out_of_spec,
    ((d.humidity < (50)::double precision) OR (d.humidity > (60)::double precision)) AS flag_humidity_out_of_spec,
    ((d.air_vacuum > ('-50'::integer)::double precision) OR (d.air_vacuum < ('-95'::integer)::double precision)) AS flag_vac_out_of_spec,
    ((abs(d.pe_1) > (10)::double precision) OR (abs(d.je_1) > (10)::double precision)) AS flag_pe_out_of_spec,
    ((d.scan_speed > (450)::double precision) OR (d.scan_speed <= (0)::double precision)) AS flag_scan_speed_out_of_spec,
    ((d.resist_dosage > (650)::double precision) OR (d.resist_dosage <= (0)::double precision)) AS flag_exposure_out_of_spec,
    ((d.temperature < (20)::double precision) OR (d.temperature > (24)::double precision) OR (d.humidity < (50)::double precision) OR (d.humidity > (60)::double precision)) AS flag_temp_out_of_spec,
    d.match_type
   FROM ((public.ldi_alarm_log a
     LEFT JOIN public.ldi_alarm_ms_code m ON (((a.errorcode)::text = (m.alarm_id)::text)))
     LEFT JOIN LATERAL ( SELECT d1.temperature,
            d1.humidity,
            d1.air_vacuum,
            d1.scan_speed,
            d1.resist_dosage,
            d1.pe_1,
            d1.je_1,
            'exact'::text AS match_type
           FROM public.ldi_data d1
          WHERE ((d1.log_id)::text = (a.related_log_id)::text)
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
          WHERE ((a.related_log_id IS NULL) AND ((d2.eqp_id)::text = (a.equipmentid)::text) AND (d2."time" <= a.logdate) AND (d2."time" >= (a.logdate - '00:05:00'::interval)))
          ORDER BY d2."time" DESC
         LIMIT 1)
 LIMIT 1) d ON (true));


--
-- Name: v_ldi_event_timeline; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_ldi_event_timeline AS
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


--
-- Name: v_ldi_machine_latest_full; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_ldi_machine_latest_full AS
 SELECT dev.device_id AS eqp_id,
    dev.hostname,
    dev.location,
    dev.enabled,
    (latest.eqp_id IS NOT NULL) AS has_data,
    ((latest.eqp_id IS NOT NULL) AND (latest."time" < (now() - '00:05:00'::interval))) AS is_stale,
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
   FROM (public.devices dev
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
          WHERE ((d.eqp_id)::text = dev.device_id)
          ORDER BY d."time" DESC
         LIMIT 1) latest ON (true))
  WHERE ((dev.device_type = 'ldi'::text) AND dev.enabled);


--
-- Name: v_ldi_machine_snapshot; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_ldi_machine_snapshot AS
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


--
-- Name: v_ldi_nelson_rules_detection; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_ldi_nelson_rules_detection AS
 WITH raw_pe AS (
         SELECT d."time",
            d.eqp_id,
            GREATEST(abs(COALESCE(d.pe_1, (0)::real)), abs(COALESCE(d.pe_2, (0)::real)), abs(COALESCE(d.pe_3, (0)::real)), abs(COALESCE(d.pe_4, (0)::real)), abs(COALESCE(d.pe_5, (0)::real)), abs(COALESCE(d.pe_6, (0)::real))) AS max_pe
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
    round(((ws.mu + ((3)::real * ws.sigma)))::numeric, 4) AS ucl,
    round(((ws.mu - ((3)::real * ws.sigma)))::numeric, 4) AS lcl,
        CASE
            WHEN ((ws.sigma > (0)::real) AND ((ws.max_pe > (ws.mu + ((3)::real * ws.sigma))) OR (ws.max_pe < (ws.mu - ((3)::real * ws.sigma))))) THEN 1
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
                WHEN (ws2.delta > (0)::real) THEN 1
                WHEN (ws2.delta < (0)::real) THEN '-1'::integer
                ELSE 0
            END) OVER (PARTITION BY ws2.eqp_id ORDER BY ws2."time" ROWS BETWEEN 5 PRECEDING AND CURRENT ROW) = ANY (ARRAY[(6)::bigint, ('-6'::integer)::bigint])) THEN 1
            ELSE 0
        END AS rule3_six_trend,
        CASE
            WHEN (((ws.sigma > (0)::real) AND ((ws.max_pe > (ws.mu + ((3)::real * ws.sigma))) OR (ws.max_pe < (ws.mu - ((3)::real * ws.sigma))))) OR (sum(
            CASE
                WHEN (ws2.side <> 0) THEN ws2.side
                ELSE 0
            END) OVER (PARTITION BY ws2.eqp_id ORDER BY ws2."time" ROWS BETWEEN 8 PRECEDING AND CURRENT ROW) = ANY (ARRAY[(9)::bigint, ('-9'::integer)::bigint])) OR (sum(
            CASE
                WHEN (ws2.delta > (0)::real) THEN 1
                WHEN (ws2.delta < (0)::real) THEN '-1'::integer
                ELSE 0
            END) OVER (PARTITION BY ws2.eqp_id ORDER BY ws2."time" ROWS BETWEEN 5 PRECEDING AND CURRENT ROW) = ANY (ARRAY[(6)::bigint, ('-6'::integer)::bigint]))) THEN 1
            ELSE 0
        END AS any_rule_triggered
   FROM (with_sides ws
     LEFT JOIN with_sides ws2 ON (((ws."time" = ws2."time") AND ((ws.eqp_id)::text = (ws2.eqp_id)::text))))
  ORDER BY ws.eqp_id, ws."time" DESC;


--
-- Name: v_ldi_rca_recent_window; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_ldi_rca_recent_window AS
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
           FROM (public.v_ldi_alarm_context c_1
             JOIN public.v_ldi_alarm_category cat ON (((cat.alarm_code)::text = (c_1.errorcode)::text)))
          WHERE (c_1.alarm_time > (now() - '24:00:00'::interval))
        ), baseline AS (
         SELECT round(((100.0 * (count(*) FILTER (WHERE ((ldi_data.temperature < (20)::double precision) OR (ldi_data.temperature > (24)::double precision))))::numeric) / (NULLIF(count(*), 0))::numeric), 1) AS thermal_pct,
            round(((100.0 * (count(*) FILTER (WHERE ((ldi_data.humidity < (50)::double precision) OR (ldi_data.humidity > (60)::double precision))))::numeric) / (NULLIF(count(*), 0))::numeric), 1) AS humidity_pct,
            round(((100.0 * (count(*) FILTER (WHERE ((abs(ldi_data.pe_1) > (10)::double precision) OR (abs(ldi_data.je_1) > (10)::double precision))))::numeric) / (NULLIF(count(*), 0))::numeric), 1) AS pe_pct,
            round(((100.0 * (count(*) FILTER (WHERE ((ldi_data.scan_speed > (450)::double precision) OR (ldi_data.scan_speed <= (0)::double precision))))::numeric) / (NULLIF(count(*), 0))::numeric), 1) AS motion_pct
           FROM public.ldi_data
          WHERE (ldi_data."time" > (now() - '24:00:00'::interval))
        ), cats AS (
         SELECT 'THERMAL (91008)'::text AS cat,
            round(((100.0 * (count(*) FILTER (WHERE alarm_ctx.flag_thermal_out_of_spec))::numeric) / (NULLIF(count(*), 0))::numeric), 1) AS alarm_pct,
            count(*) AS n
           FROM alarm_ctx
          WHERE (alarm_ctx.category = 'ENVIRONMENT'::text)
        UNION ALL
         SELECT 'HUMIDITY (91008)'::text,
            round(((100.0 * (count(*) FILTER (WHERE alarm_ctx.flag_humidity_out_of_spec))::numeric) / (NULLIF(count(*), 0))::numeric), 1) AS round,
            count(*) AS count
           FROM alarm_ctx
          WHERE (alarm_ctx.category = 'ENVIRONMENT'::text)
        UNION ALL
         SELECT 'ALIGNMENT/PE-JE (90001,90004,90005,90012,90013)'::text,
            round(((100.0 * (count(*) FILTER (WHERE alarm_ctx.flag_pe_out_of_spec))::numeric) / (NULLIF(count(*), 0))::numeric), 1) AS round,
            count(*) AS count
           FROM alarm_ctx
          WHERE (alarm_ctx.category = ANY (ARRAY['REGISTRATION'::text, 'ALIGNMENT'::text]))
        UNION ALL
         SELECT 'MOTION (70004)'::text,
            round(((100.0 * (count(*) FILTER (WHERE alarm_ctx.flag_scan_speed_out_of_spec))::numeric) / (NULLIF(count(*), 0))::numeric), 1) AS round,
            count(*) AS count
           FROM alarm_ctx
          WHERE (alarm_ctx.category = 'MOTION'::text)
        )
 SELECT c.cat AS alarm_category,
    c.alarm_pct AS alarm_window_pct,
        CASE
            WHEN (c.cat = 'THERMAL (91008)'::text) THEN b.thermal_pct
            WHEN (c.cat = 'HUMIDITY (91008)'::text) THEN b.humidity_pct
            WHEN (c.cat = 'MOTION (70004)'::text) THEN b.motion_pct
            ELSE b.pe_pct
        END AS baseline_pct,
    round((c.alarm_pct / NULLIF(
        CASE
            WHEN (c.cat = 'THERMAL (91008)'::text) THEN b.thermal_pct
            WHEN (c.cat = 'HUMIDITY (91008)'::text) THEN b.humidity_pct
            WHEN (c.cat = 'MOTION (70004)'::text) THEN b.motion_pct
            ELSE b.pe_pct
        END, (0)::numeric)), 2) AS lift,
    c.n AS event_count,
        CASE
            WHEN (c.n < 30) THEN 'LOW SAMPLE (n<30)'::text
            ELSE 'OK'::text
        END AS confidence
   FROM (cats c
     CROSS JOIN baseline b)
  ORDER BY (round((c.alarm_pct / NULLIF(
        CASE
            WHEN (c.cat = 'THERMAL (91008)'::text) THEN b.thermal_pct
            WHEN (c.cat = 'HUMIDITY (91008)'::text) THEN b.humidity_pct
            WHEN (c.cat = 'MOTION (70004)'::text) THEN b.motion_pct
            ELSE b.pe_pct
        END, (0)::numeric)), 2)) DESC NULLS LAST;


--
-- Name: v_machine_spc_fleet; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_machine_spc_fleet AS
 WITH pe_base AS (
         SELECT ldi_data.eqp_id,
            ldi_data.pe_1,
            ldi_data.pe_2,
            ldi_data.pe_3,
            ldi_data.pe_4,
            ldi_data.pe_5,
            ldi_data.pe_6,
            COALESCE(ldi_data.pe_setting, (25.0)::real) AS pe_val
           FROM public.ldi_data
          WHERE ((ldi_data.pe_1 IS NOT NULL) AND (COALESCE(ldi_data.pe_setting, (0)::real) > (2.0)::real) AND (ldi_data."time" > (now() - '24:00:00'::interval)))
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
            (pe_stats.setting_val / NULLIF(((3)::double precision * pe_stats.sigma), (0)::double precision)) AS cp_pe,
            LEAST(((pe_stats.setting_val - pe_stats.mu) / NULLIF(((3)::double precision * pe_stats.sigma), (0)::double precision)), ((pe_stats.mu + pe_stats.setting_val) / NULLIF(((3)::double precision * pe_stats.sigma), (0)::double precision))) AS cpk_pe
           FROM pe_stats
        ), je_base AS (
         SELECT ldi_data.eqp_id,
            ldi_data.je_1,
            ldi_data.je_2,
            ldi_data.je_3,
            ldi_data.je_4,
            COALESCE(ldi_data.je_setting, (25.0)::real) AS je_val
           FROM public.ldi_data
          WHERE ((ldi_data.je_1 IS NOT NULL) AND (COALESCE(ldi_data.je_setting, (0)::real) > (2.0)::real) AND (ldi_data."time" > (now() - '24:00:00'::interval)))
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
            (je_stats.setting_val / NULLIF(((3)::double precision * je_stats.sigma), (0)::double precision)) AS cp_je,
            LEAST(((je_stats.setting_val - je_stats.mu) / NULLIF(((3)::double precision * je_stats.sigma), (0)::double precision)), ((je_stats.mu + je_stats.setting_val) / NULLIF(((3)::double precision * je_stats.sigma), (0)::double precision))) AS cpk_je
           FROM je_stats
        )
 SELECT d.device_id AS eqp_id,
    d.location,
    p.n_pe,
    round((p.cp_pe)::numeric, 3) AS cp_pe,
    round((p.cpk_pe)::numeric, 3) AS cpk_pe,
    round(((100.0 * (p.pass_pe)::numeric) / (NULLIF(p.n_pe, 0))::numeric), 1) AS pe_pass_rate,
    j.n_je,
    round((j.cp_je)::numeric, 3) AS cp_je,
    round((j.cpk_je)::numeric, 3) AS cpk_je,
    round(((100.0 * (j.pass_je)::numeric) / (NULLIF(j.n_je, 0))::numeric), 1) AS je_pass_rate,
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


--
-- Name: v_machine_spc_ranking; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_machine_spc_ranking AS
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
            COALESCE(ldi_data.pe_setting, (25.0)::real) AS pe_val
           FROM public.ldi_data
          WHERE ((ldi_data.pe_1 IS NOT NULL) AND (COALESCE(ldi_data.pe_setting, (0)::real) > (2.0)::real) AND (ldi_data."time" > ( SELECT (max(ldi_data_1."time") - '02:00:00'::interval)
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
            (pe_stats.setting_val / NULLIF(((3)::double precision * pe_stats.sigma), (0)::double precision)) AS cp,
            LEAST(((pe_stats.setting_val - pe_stats.mu) / NULLIF(((3)::double precision * pe_stats.sigma), (0)::double precision)), ((pe_stats.mu + pe_stats.setting_val) / NULLIF(((3)::double precision * pe_stats.sigma), (0)::double precision))) AS cpk
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
            COALESCE(ldi_data.je_setting, (25.0)::real) AS je_val
           FROM public.ldi_data
          WHERE ((ldi_data.je_1 IS NOT NULL) AND (COALESCE(ldi_data.je_setting, (0)::real) > (2.0)::real) AND (ldi_data."time" > ( SELECT (max(ldi_data_1."time") - '02:00:00'::interval)
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
            (je_stats.setting_val / NULLIF(((3)::double precision * je_stats.sigma), (0)::double precision)) AS cp,
            LEAST(((je_stats.setting_val - je_stats.mu) / NULLIF(((3)::double precision * je_stats.sigma), (0)::double precision)), ((je_stats.mu + je_stats.setting_val) / NULLIF(((3)::double precision * je_stats.sigma), (0)::double precision))) AS cpk
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
            WHEN (p.cpk >= (2.0)::double precision) THEN 'World Class'::text
            WHEN (p.cpk >= (1.67)::double precision) THEN 'Excellent'::text
            WHEN (p.cpk >= (1.33)::double precision) THEN 'Capable'::text
            WHEN (p.cpk >= (1.0)::double precision) THEN 'Marginally Capable'::text
            ELSE 'Not Capable'::text
        END AS capability_class,
    j.sample_count AS sample_count_je,
    round((j.mu)::numeric, 3) AS mean_je,
    round((j.sigma)::numeric, 3) AS stddev_je,
    round((j.cp)::numeric, 3) AS cp_je,
    round((j.cpk)::numeric, 3) AS cpk_je,
        CASE
            WHEN (j.cpk IS NULL) THEN NULL::text
            WHEN (j.cpk >= (2.0)::double precision) THEN 'World Class'::text
            WHEN (j.cpk >= (1.67)::double precision) THEN 'Excellent'::text
            WHEN (j.cpk >= (1.33)::double precision) THEN 'Capable'::text
            WHEN (j.cpk >= (1.0)::double precision) THEN 'Marginally Capable'::text
            ELSE 'Not Capable'::text
        END AS capability_class_je
   FROM (pe_capability p
     FULL JOIN je_capability j ON ((((p.eqp_id)::text = (j.eqp_id)::text) AND ((p.factory)::text = (j.factory)::text) AND ((p.mo)::text = (j.mo)::text) AND ((p.fpn)::text = (j.fpn)::text) AND ((p.layer_name)::text = (j.layer_name)::text))))
  WHERE (COALESCE(p.sigma, j.sigma) > (0)::double precision)
  ORDER BY (round((p.cpk)::numeric, 3)) DESC NULLS LAST;


--
-- Name: v_process_stability; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_process_stability AS
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
            avg(GREATEST(abs(COALESCE(ldi_data.pe_1, (0)::real)), abs(COALESCE(ldi_data.pe_2, (0)::real)), abs(COALESCE(ldi_data.pe_3, (0)::real)), abs(COALESCE(ldi_data.pe_4, (0)::real)), abs(COALESCE(ldi_data.pe_5, (0)::real)), abs(COALESCE(ldi_data.pe_6, (0)::real)))) AS pe_mu,
            stddev(GREATEST(abs(COALESCE(ldi_data.pe_1, (0)::real)), abs(COALESCE(ldi_data.pe_2, (0)::real)), abs(COALESCE(ldi_data.pe_3, (0)::real)), abs(COALESCE(ldi_data.pe_4, (0)::real)), abs(COALESCE(ldi_data.pe_5, (0)::real)), abs(COALESCE(ldi_data.pe_6, (0)::real)))) AS pe_sigma,
            avg(GREATEST(abs(COALESCE(ldi_data.je_1, (0)::real)), abs(COALESCE(ldi_data.je_2, (0)::real)), abs(COALESCE(ldi_data.je_3, (0)::real)), abs(COALESCE(ldi_data.je_4, (0)::real)))) AS je_mu,
            stddev(GREATEST(abs(COALESCE(ldi_data.je_1, (0)::real)), abs(COALESCE(ldi_data.je_2, (0)::real)), abs(COALESCE(ldi_data.je_3, (0)::real)), abs(COALESCE(ldi_data.je_4, (0)::real)))) AS je_sigma
           FROM public.ldi_data
          WHERE ((ldi_data."time" > ( SELECT time_range.cutoff
                   FROM time_range)) AND (ldi_data.pe_1 IS NOT NULL))
          GROUP BY ldi_data.eqp_id
        )
 SELECT COALESCE(t.eqp_id, h.eqp_id, pe.eqp_id) AS eqp_id,
    (GREATEST((0)::double precision, ((33)::double precision - (COALESCE(t.temp_sigma, (99)::double precision) * (10)::double precision))))::numeric(5,1) AS temp_score,
    (GREATEST((0)::double precision, ((33)::double precision - (COALESCE(h.hum_sigma, (99)::double precision) * (10)::double precision))))::numeric(5,1) AS hum_score,
    (GREATEST((0)::double precision, (((34)::double precision - (COALESCE(pe.pe_sigma, (99)::double precision) * (5)::double precision)) - (COALESCE(pe.pe_mu, (99)::double precision) * (2)::double precision))))::numeric(5,1) AS pe_score,
    (GREATEST((0)::double precision, (((17)::double precision - (COALESCE(pe.je_sigma, (99)::double precision) * (5)::double precision)) - COALESCE(pe.je_mu, (99)::double precision))))::numeric(5,1) AS je_score,
    (GREATEST((0)::double precision, (((GREATEST((0)::double precision, ((33)::double precision - (COALESCE(t.temp_sigma, (99)::double precision) * (10)::double precision))) + GREATEST((0)::double precision, ((33)::double precision - (COALESCE(h.hum_sigma, (99)::double precision) * (10)::double precision)))) + GREATEST((0)::double precision, (((34)::double precision - (COALESCE(pe.pe_sigma, (99)::double precision) * (5)::double precision)) - (COALESCE(pe.pe_mu, (99)::double precision) * (2)::double precision)))) + GREATEST((0)::double precision, (((17)::double precision - (COALESCE(pe.je_sigma, (99)::double precision) * (5)::double precision)) - COALESCE(pe.je_mu, (99)::double precision))))))::numeric(5,1) AS stability_index
   FROM ((temp_stats t
     FULL JOIN hum_stats h ON (((t.eqp_id)::text = (h.eqp_id)::text)))
     FULL JOIN pe_stats pe ON (((COALESCE(t.eqp_id, h.eqp_id))::text = (pe.eqp_id)::text)))
  ORDER BY ((GREATEST((0)::double precision, (((GREATEST((0)::double precision, ((33)::double precision - (COALESCE(t.temp_sigma, (99)::double precision) * (10)::double precision))) + GREATEST((0)::double precision, ((33)::double precision - (COALESCE(h.hum_sigma, (99)::double precision) * (10)::double precision)))) + GREATEST((0)::double precision, (((34)::double precision - (COALESCE(pe.pe_sigma, (99)::double precision) * (5)::double precision)) - (COALESCE(pe.pe_mu, (99)::double precision) * (2)::double precision)))) + GREATEST((0)::double precision, (((17)::double precision - (COALESCE(pe.je_sigma, (99)::double precision) * (5)::double precision)) - COALESCE(pe.je_mu, (99)::double precision))))))::numeric(5,1)) DESC;


--
-- Name: v_uptime_summary; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_uptime_summary AS
 SELECT device_id AS machine_id,
    max("time") AS last_seen,
    (EXTRACT(epoch FROM (now() - max("time"))))::integer AS seconds_since_last,
        CASE
            WHEN (EXTRACT(epoch FROM (now() - max("time"))) <= (30)::numeric) THEN 'online'::text
            WHEN (EXTRACT(epoch FROM (now() - max("time"))) <= (300)::numeric) THEN 'stale'::text
            ELSE 'offline'::text
        END AS health_status,
    round((avg(cpu_load_percent))::numeric, 2) AS current_cpu,
    round((avg(temp_c))::numeric, 1) AS current_temp
   FROM public.sys_metrics s
  WHERE ("time" > (now() - '24:00:00'::interval))
  GROUP BY device_id;


--
-- Name: devices devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_pkey PRIMARY KEY (device_id);


--
-- Name: ldi_alarm_ms_code ldi_alarm_ms_code_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ldi_alarm_ms_code
    ADD CONSTRAINT ldi_alarm_ms_code_pkey PRIMARY KEY (alarm_id);


--
-- Name: ldi_alarm_log pk_ldi_alarm_data; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ldi_alarm_log
    ADD CONSTRAINT pk_ldi_alarm_data PRIMARY KEY (logdate, logid);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: idx_ldi_alarm_errorcode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ldi_alarm_errorcode ON public.ldi_alarm_log USING btree (errorcode);


--
-- Name: idx_ldi_alarm_log_equipment_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ldi_alarm_log_equipment_time ON public.ldi_alarm_log USING btree (equipmentid, logdate DESC);


--
-- Name: idx_ldi_alarm_logid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ldi_alarm_logid ON public.ldi_alarm_log USING btree (logid);


--
-- Name: idx_ldi_alarm_related_log_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ldi_alarm_related_log_id ON public.ldi_alarm_log USING btree (related_log_id);


--
-- Name: idx_ldi_data_eqp_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ldi_data_eqp_time ON public.ldi_data USING btree (eqp_id, "time" DESC);


--
-- Name: idx_ldi_data_layer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ldi_data_layer ON public.ldi_data USING btree (layer_name);


--
-- Name: idx_ldi_data_spc_ranking; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ldi_data_spc_ranking ON public.ldi_data USING btree (eqp_id, mo, fpn, "time" DESC);


--
-- Name: idx_ldi_device_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ldi_device_time ON public.ldi_metrics USING btree (device_id, "time" DESC);


--
-- Name: idx_logid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_logid ON public.ldi_data USING btree (log_id, "time" DESC);


--
-- Name: idx_net_device_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_net_device_time ON public.net_metrics USING btree (device_id, "time" DESC);


--
-- Name: idx_net_iface; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_net_iface ON public.net_metrics USING btree (device_id, iface_name, "time" DESC);


--
-- Name: idx_sys_device_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_sys_device_time ON public.sys_metrics USING btree (device_id, "time" DESC);


--
-- Name: ldi_alarm_log_logdate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ldi_alarm_log_logdate_idx ON public.ldi_alarm_log USING btree (logdate DESC);


--
-- Name: ldi_data_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ldi_data_time_idx ON public.ldi_data USING btree ("time" DESC);


--
-- Name: ldi_metrics_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ldi_metrics_time_idx ON public.ldi_metrics USING btree ("time" DESC);


--
-- Name: net_metrics_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX net_metrics_time_idx ON public.net_metrics USING btree ("time" DESC);


--
-- Name: sys_metrics_time_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sys_metrics_time_idx ON public.sys_metrics USING btree ("time" DESC);


--
-- Name: ldi_alarm_log trg_ldi_alarm_link_log_id; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ldi_alarm_link_log_id BEFORE INSERT OR UPDATE ON public.ldi_alarm_log FOR EACH ROW EXECUTE FUNCTION public.f_ldi_alarm_link_log_id();


--
-- Name: ldi_metrics ldi_metrics_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ldi_metrics
    ADD CONSTRAINT ldi_metrics_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.devices(device_id) ON DELETE CASCADE;


--
-- Name: net_metrics net_metrics_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.net_metrics
    ADD CONSTRAINT net_metrics_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.devices(device_id) ON DELETE CASCADE;


--
-- Name: sys_metrics sys_metrics_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sys_metrics
    ADD CONSTRAINT sys_metrics_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.devices(device_id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict 6HBdm7rODCMoofIHI3gg1W49FIv8we25UFVh200Nk9utPxy0z63EMBn8Zugiu9q

