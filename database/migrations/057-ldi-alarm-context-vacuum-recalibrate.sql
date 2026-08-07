-- ══════════════════════════════════════════════════════════════
-- 057: v_ldi_alarm_context — recalibrate flag_vac_out_of_spec threshold
-- ══════════════════════════════════════════════════════════════
-- Data-realism audit (2026-08-06), continued from migration 054: fixing
-- the DF OUTER/SM 0.0-sentinel-to-NULL issue turned out not to be
-- sufficient. The threshold itself (air_vacuum > -50 OR air_vacuum <
-- -95, i.e. "in spec" is only the closed band [-95, -50] kPa) doesn't
-- match ANY value the simulator has ever produced -- not even DF
-- INNER's real recipe constants (-16.08, -17.21, -19.15, -17.86),
-- confirmed live: `air_vacuum > -50` is true for every one of those.
-- So alarm code 91009 (VACUUM) was structurally 100% "out of spec"
-- regardless of the NULL fix, and its RCA correlation stayed
-- meaningless.
--
-- No real vendor vacuum spec is available for this system, and
-- inventing a plausible-looking threshold just to make a correlation
-- number look good would be the opposite of "realistic data". Instead,
-- per explicit direction: the "in spec" band is recalibrated around the
-- simulator's own DF INNER recipe range (comfortably bounding -16 to
-- -19 kPa) -- this is clearly a simulator-derived approximation, not a
-- sourced vendor spec, and should be replaced with the real spec if one
-- ever becomes available. The accompanying simulator change
-- (nodered_data/flows.json, ldisim_gen) now injects rare weak-vacuum
-- fault events on DF INNER machines so there is a genuine excursion for
-- 91009 (now condition-driven, see almsim_gen) to correlate against,
-- the same pattern already proven for 70004 (MOTION).

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
