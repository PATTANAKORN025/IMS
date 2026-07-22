-- Migration 031: v_ldi_event_timeline — Unified event sequence for RCA
-- Combines machine state transitions (from ldi_data) with alarms (from ldi_alarm_log)
-- into a single chronological event stream. No duration/MTTR fabrication.

CREATE OR REPLACE VIEW public.v_ldi_event_timeline AS

-- Query 1: Machine State Transitions (TRUE->FALSE = Stop, FALSE->TRUE = Start)
WITH state_changes AS (
    SELECT
        d."time"       AS event_time,
        d.eqp_id,
        CASE
            WHEN d.state = false AND LAG(d.state) OVER (PARTITION BY d.eqp_id ORDER BY d."time") = true
                THEN 'Machine Stop'
            WHEN d.state = true AND LAG(d.state) OVER (PARTITION BY d.eqp_id ORDER BY d."time") = false
                THEN 'Machine Start'
            ELSE NULL
        END AS event_type,
        'ldi_data' AS source,
        CASE
            WHEN d.state = false AND LAG(d.state) OVER (PARTITION BY d.eqp_id ORDER BY d."time") = true
                THEN 'state changed to DOWN'
            WHEN d.state = true AND LAG(d.state) OVER (PARTITION BY d.eqp_id ORDER BY d."time") = false
                THEN 'state changed to RUNNING'
            ELSE NULL
        END AS description
    FROM public.ldi_data d
),

-- Query 2: Alarms from ldi_alarm_log + ldi_alarm_ms_code
alarms AS (
    SELECT
        al.logdate      AS event_time,
        al.equipmentid  AS eqp_id,
        'Alarm'         AS event_type,
        'alarm_log'     AS source,
        COALESCE(m.alarm_msg, al.errorcode::TEXT) AS description
    FROM public.ldi_alarm_log al
    LEFT JOIN public.ldi_alarm_ms_code m
        ON al.errorcode::TEXT = m.alarm_code::TEXT
)

-- Combine, filter out NULL state transitions, order by time
SELECT event_time, eqp_id, event_type, source, description
FROM state_changes
WHERE event_type IS NOT NULL

UNION ALL

SELECT event_time, eqp_id, event_type, source, description
FROM alarms

ORDER BY event_time DESC;
