-- ══════════════════════════════════════════════════════════════
-- 062: v_ldi_alarm_context exposes severity; retire dead code refs
-- ══════════════════════════════════════════════════════════════
-- Migration 061 imported the real 1,820-code Alarm Master list and added
-- a severity column (Critical/Major/Minor/Warning) to ldi_alarm_ms_code.
-- v_ldi_alarm_context is the one place every alarm-facing dashboard panel
-- reads alarm_msg from -- add severity right alongside it so panels can
-- filter/color by severity without a second join.
--
-- Also: the real import doesn't contain 3 codes this system's category
-- mapping (v_ldi_alarm_category) and simulator used to reference --
-- 90013 (a 5th, redundant ALIGNMENT code; 4 real ones already cover the
-- category), 91017 (a 2nd, purely-noise ENVIRONMENT code alongside the
-- condition-driven 91008 -- would have diluted the THERMAL/HUMIDITY RCA
-- baseline the same way stale 91009 data once did), and 93007 (a 2nd,
-- purely-noise CALIBRATION code alongside 93004). The simulator no longer
-- generates any of the three (migration accompanying this one, same
-- commit); this drops the now-dead branches from the category CASE
-- rather than leaving unreachable code. DATA_QUALITY's two codes ('2',
-- '20') were never real either and are retired the same way -- nothing
-- reads that category label downstream.

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
    d.match_type,
    m.severity
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

CREATE OR REPLACE VIEW public.v_ldi_alarm_category AS
SELECT
    alarm_code,
    CASE
        WHEN (alarm_code)::text = '91009'::text THEN 'VACUUM'::text
        WHEN (alarm_code)::text = '90005'::text THEN 'REGISTRATION'::text
        WHEN (alarm_code)::text = ANY (ARRAY['90001'::character varying, '90004'::character varying, '90012'::character varying]::text[]) THEN 'ALIGNMENT'::text
        WHEN (alarm_code)::text = '93004'::text THEN 'CALIBRATION'::text
        WHEN (alarm_code)::text = '91008'::text THEN 'ENVIRONMENT'::text
        WHEN (alarm_code)::text = '70004'::text THEN 'MOTION'::text
        WHEN (alarm_code)::text = '10006'::text THEN 'OPTICS'::text
        ELSE 'UNCLASSIFIED'::text
    END AS category,
    CASE
        WHEN (alarm_code)::text = '91009'::text THEN 'air_vacuum'::text
        WHEN (alarm_code)::text = '90005'::text THEN 'pe_1..pe_6, je_1..je_4'::text
        WHEN (alarm_code)::text = ANY (ARRAY['90001'::character varying, '90004'::character varying, '90012'::character varying]::text[]) THEN 'scale_x, scale_y, pe_1..pe_6'::text
        WHEN (alarm_code)::text = '91008'::text THEN 'temperature, humidity'::text
        WHEN (alarm_code)::text = '70004'::text THEN 'scan_speed'::text
        ELSE NULL::text
    END AS related_columns
FROM public.ldi_alarm_ms_code;

GRANT SELECT ON public.v_ldi_alarm_category TO grafana_reader;
