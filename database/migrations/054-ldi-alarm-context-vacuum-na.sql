-- ══════════════════════════════════════════════════════════════
-- 054: v_ldi_alarm_context — air_vacuum "not applicable" is NULL, not 0.0
-- ══════════════════════════════════════════════════════════════
-- Data-realism audit (2026-08-06): DF OUTER and SM machines don't measure
-- vacuum at all -- the simulator (nodered_data/flows.json, LDI LIVE
-- SIMULATOR node) has always sent a 0.0 sentinel for those 6/10 machines
-- to mean "not applicable". flag_vac_out_of_spec's threshold
-- (air_vacuum > -50 OR air_vacuum < -95) reads 0.0 as *always* out of
-- spec, so the baseline violation rate for alarm code 91009 (VACUUM) is
-- 100% of all rows -- confirmed live. With the condition permanently
-- true, RCA lift for 91009 is mathematically pinned near 1 regardless of
-- alarm timing; this was flagged as a known, unresolved issue in the
-- alarm simulator's own code comments since the RCA Truth Test work.
--
-- The correct fix is the same one already used for PE (pe_1..6 are NULL,
-- not 0, for DF INNER machines that don't measure it): "not applicable"
-- should be NULL, not a sentinel that accidentally satisfies a threshold.
-- This migration accompanies a simulator change (same commit) that now
-- sends NULL air_vacuum for DF OUTER/SM, and updates this view so NULL
-- is correctly excluded from the out-of-spec flag rather than counted as
-- a violation.
--
-- Existing rows written before this change still have the old 0.0
-- sentinel and will keep reading as out-of-spec until they age out under
-- the existing 180-day retention policy on ldi_data -- not backfilled,
-- consistent with how this repo has treated other simulator-only
-- historical data corrections this session.

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
    ((d.air_vacuum IS NOT NULL) AND ((d.air_vacuum > (-50)) OR (d.air_vacuum < (-95)))) AS flag_vac_out_of_spec,
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
