-- ══════════════════════════════════════════════════════════════
-- 063: v_ldi_alarm_context — expose process/mo/board_no/total_board
-- ══════════════════════════════════════════════════════════════
-- Extends the same LATERAL-matched telemetry row (exact log_id match, or
-- nearest-time fallback -- unchanged from migration 062) with a few more
-- columns from ldi_data, for the "Recent Alarm Events" panel's Process
-- and board-traceability columns: process (DF INNER/DF OUTER/SM -- the
-- MACHINE's real process from its matched telemetry row, not
-- ldi_alarm_log.process, which the simulator assigns uniformly at random
-- per alarm regardless of which machine fired it and is not a reliable
-- signal), mo (job) and board_no/total_board (which board, out of how
-- many, was in the machine at the moment of the alarm).

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
    m.severity,
    d.process,
    d.mo,
    d.board_no,
    d.total_board
FROM public.ldi_alarm_log a
LEFT JOIN public.ldi_alarm_ms_code m ON ((a.errorcode)::text = (m.alarm_id)::text)
LEFT JOIN LATERAL (
    (SELECT d1.temperature, d1.humidity, d1.air_vacuum, d1.scan_speed, d1.resist_dosage, d1.pe_1, d1.je_1,
            'exact'::text AS match_type, d1.process, d1.mo, d1.board_no, d1.total_board
     FROM public.ldi_data d1
     WHERE d1.log_id = a.related_log_id
       AND d1."time" >= (a.logdate - INTERVAL '10 minutes')
       AND d1."time" <= (a.logdate + INTERVAL '1 minute'))
    UNION ALL
    (SELECT d2.temperature, d2.humidity, d2.air_vacuum, d2.scan_speed, d2.resist_dosage, d2.pe_1, d2.je_1,
            'nearest'::text AS match_type, d2.process, d2.mo, d2.board_no, d2.total_board
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
