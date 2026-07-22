-- Migration 030: v_ldi_machine_snapshot — Digital Twin unified view
-- Joins ldi_data with nearest alarm for a single-source-of-truth snapshot.
-- Uses LATERAL JOIN to get the closest alarm within ±2 minutes per telemetry row.

-- Index for LATERAL JOIN performance on ldi_alarm_log
CREATE INDEX IF NOT EXISTS idx_ldi_alarm_log_equipment_time
    ON public.ldi_alarm_log (equipmentid, logdate DESC);

-- The Digital Twin snapshot view
CREATE OR REPLACE VIEW public.v_ldi_machine_snapshot AS
SELECT
    d."time",
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
    d.pe_1, d.pe_2, d.pe_3, d.pe_4, d.pe_5, d.pe_6,
    d.je_1, d.je_2, d.je_3, d.je_4,
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
    a.errorcode        AS alarm_errorcode,
    a.errortime        AS alarm_errortime,
    a.logid            AS alarm_logid,
    m.alarm_type,
    m.alarm_msg,
    m.alarm_detail
FROM public.ldi_data d
LEFT JOIN LATERAL (
    SELECT le.errorcode, le.errortime, le.logid
    FROM public.ldi_alarm_log le
    WHERE le.equipmentid = d.eqp_id
      AND le.logdate >= d."time" - INTERVAL '2 minutes'
      AND le.logdate <= d."time" + INTERVAL '2 minutes'
    ORDER BY ABS(EXTRACT(EPOCH FROM (le.logdate - d."time")))
    LIMIT 1
) a ON true
LEFT JOIN public.ldi_alarm_ms_code m
    ON a.errorcode::TEXT = m.alarm_code::TEXT;
