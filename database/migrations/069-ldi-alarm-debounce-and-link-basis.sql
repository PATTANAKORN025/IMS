-- ══════════════════════════════════════════════════════════════
-- 069: alarm debounce state + explicit correlation link_basis
-- ══════════════════════════════════════════════════════════════
-- LDI Alarm Fidelity Audit (docs/audit/LDI_ALARM_FIDELITY_AUDIT.md,
-- 2026-08-11), findings #6 and #7:
--
-- #6 burst/flood: nothing previously stopped the simulator from re-firing
-- the same (machine, code) on every eligible 10s tick while a condition
-- held -- one machine hit 479 repeats of the same code with <15s gaps
-- over 3 days. ldi_alarm_state gives almsim_gen (nodered_data/flows.json)
-- a place to check/record "is this (machine, code) still in its cooldown
-- window" before inserting a new row.
--
-- #7 correlation semantics: migration 051's trigger backfills
-- related_log_id for ANY alarm whose caller left it NULL, using a
-- nearest-in-time heuristic -- which made v_ldi_alarm_context.match_type
-- report 'exact' for 100% of alarms, including noise codes with no
-- designed relationship to the linked telemetry row. link_basis makes the
-- distinction explicit and caller-supplied instead of inferred: 'causal'
-- for condition-driven/critical codes whose related_log_id is the actual
-- triggering row, 'nearest' for background noise codes.

CREATE TABLE IF NOT EXISTS public.ldi_alarm_state (
    equipmentid VARCHAR(50) NOT NULL,
    errorcode   VARCHAR(50) NOT NULL,
    first_fired TIMESTAMPTZ NOT NULL,
    last_fired  TIMESTAMPTZ NOT NULL,
    fire_count  INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (equipmentid, errorcode)
);
COMMENT ON TABLE public.ldi_alarm_state IS
    'Debounce state for the LDI alarm simulator -- one row per (machine, code) tracking when it last fired, so almsim_gen can suppress re-firing within a cooldown window. Not a general-purpose alarm-active table; simulator-internal.';

ALTER TABLE public.ldi_alarm_log ADD COLUMN IF NOT EXISTS link_basis VARCHAR(10)
    CHECK (link_basis IS NULL OR link_basis IN ('causal', 'nearest'));
COMMENT ON COLUMN public.ldi_alarm_log.link_basis IS
    'How related_log_id was determined: causal = the generator knew the exact triggering telemetry row (condition-driven/critical codes); nearest = migration 051''s trigger backfilled the closest-in-time row for a code with no designed telemetry relationship (noise codes). NULL for rows inserted before this migration.';

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
    d.total_board,
    a.link_basis
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
GRANT SELECT ON public.ldi_alarm_state TO grafana_reader;
