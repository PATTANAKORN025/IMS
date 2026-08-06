-- ══════════════════════════════════════════════════════════════
-- 053: v_ldi_alarm_context — exact event join (World-Class Audit Priority 3)
-- ══════════════════════════════════════════════════════════════
-- Previously always used a nearest-row-within-5-minutes LATERAL join to
-- find the telemetry context for an alarm. As of the alarm simulator
-- change accompanying this migration (nodered_data/flows/
-- ldi_alarm_simulator.json), condition-driven alarm codes (91008 thermal/
-- humidity, the ALIGN_CODES set, 70004 motion) are generated FROM the
-- same telemetry query that detects the out-of-spec condition, and now
-- carry that row's exact ldi_data.log_id as ldi_alarm_log.related_log_id
-- at write-time -- not inferred afterward.
--
-- This view now prefers that exact match when available, falling back to
-- the original nearest-time-window match only when related_log_id is
-- NULL -- background noise codes (91009, 93004, etc.) aren't tied to any
-- specific board by construction, so there's no "true" exact answer for
-- them; historical alarms from before this migration also fall back
-- (their related_log_id was populated by migration 051's trigger using
-- the same nearest-match heuristic, not authored by the simulator).
--
-- match_type ('exact' | 'nearest') makes the join quality auditable:
--   SELECT match_type, count(*) FROM v_ldi_alarm_context GROUP BY 1;
-- should show 100% 'exact' for the RCA-relevant categories (THERMAL,
-- HUMIDITY, ALIGNMENT/PE-JE, MOTION) going forward.

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
    ((d.air_vacuum > (-50)) OR (d.air_vacuum < (-95))) AS flag_vac_out_of_spec,
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
     WHERE d1.log_id = a.related_log_id)
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
