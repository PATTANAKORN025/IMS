-- ══════════════════════════════════════════════════════════════
-- 058: v_ldi_alarm_context — bound the exact-match LATERAL by time
-- ══════════════════════════════════════════════════════════════
-- World-Class QA pass (2026-08-06): the "exact" match branch (WHERE
-- d1.log_id = a.related_log_id) had no time predicate at all, so
-- TimescaleDB's chunk exclusion couldn't skip any ldi_data chunk -- the
-- planner had to check every chunk for a matching log_id. This was
-- always suboptimal but invisible while every chunk was uncompressed
-- (an index-backed lookup, just against more chunks than necessary).
-- It became a real regression once the compress_after: 7 days policy
-- compressed its first chunks: `EXPLAIN ANALYZE` on "Recent Alarms
-- (last 50)" (ims-easy-overview.json) showed a 1.6+ second query,
-- because a log_id equality filter against a *compressed* chunk can't
-- use a per-row index -- it decompresses and scans whole segments,
-- and it was doing that across every chunk in the hypertable.
--
-- related_log_id is, by construction, always the log_id of a telemetry
-- row queried within the same few minutes as the alarm that references
-- it (nodered_data/flows.json, almsim_gen: telemetry is read via `time
-- > NOW() - INTERVAL '3 minutes'` at the moment the alarm fires). Adding
-- a generous +/-10 minute bound around alarm_time changes nothing about
-- which row matches -- log_id equality still identifies exactly one row
-- -- it just lets ChunkAppend exclude every chunk outside that window
-- up front, the same way the "nearest" fallback branch already does.

CREATE OR REPLACE VIEW public.v_ldi_alarm_context AS
SELECT
    a.logdate AS alarm_time,
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
    ((d.air_vacuum IS NOT NULL) AND ((d.air_vacuum > (-8)) OR (d.air_vacuum < (-30)))) AS flag_vac_out_of_spec,
    ((abs(d.pe_1) > 10) OR (abs(d.je_1) > 10)) AS flag_pe_out_of_spec,
    ((d.scan_speed > 450) OR (d.scan_speed <= 0)) AS flag_scan_speed_out_of_spec,
    ((d.resist_dosage > 650) OR (d.resist_dosage <= 0)) AS flag_exposure_out_of_spec,
    ((d.temperature < 20) OR (d.temperature > 24) OR (d.humidity < 50) OR (d.humidity > 60)) AS flag_temp_out_of_spec,
    d.match_type
FROM public.ldi_alarm_log a
LEFT JOIN public.ldi_alarm_ms_code m ON ((a.errorcode)::text = (m.alarm_id)::text)
LEFT JOIN LATERAL (
    (SELECT d1.temperature, d1.humidity, d1.air_vacuum, d1.scan_speed, d1.resist_dosage, d1.pe_1, d1.je_1,
            'exact'::text AS match_type
     FROM public.ldi_data d1
     WHERE d1.log_id = a.related_log_id
       AND d1."time" >= (a.logdate - INTERVAL '10 minutes')
       AND d1."time" <= (a.logdate + INTERVAL '1 minute'))
    UNION ALL
    (SELECT d2.temperature, d2.humidity, d2.air_vacuum, d2.scan_speed, d2.resist_dosage, d2.pe_1, d2.je_1,
            'nearest'::text AS match_type
     FROM public.ldi_data d2
     WHERE a.related_log_id IS NULL
       AND d2.eqp_id = a.equipmentid
       AND d2."time" <= a.logdate
       AND d2."time" >= (a.logdate - INTERVAL '5 minutes')
     ORDER BY d2."time" DESC
     LIMIT 1)
    LIMIT 1
) d ON true;

GRANT SELECT ON public.v_ldi_alarm_context TO grafana_reader;
