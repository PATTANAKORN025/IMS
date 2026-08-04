-- ══════════════════════════════════════════════════════════════
-- Migration 045: extend RCA correlation flags — scan speed, exposure,
--                 split thermal/humidity
-- ══════════════════════════════════════════════════════════════
-- v_ldi_alarm_context (migration 039) had 3 flags: flag_temp_out_of_spec
-- (actually temperature OR humidity combined), flag_vac_out_of_spec,
-- flag_pe_out_of_spec. This migration:
--   1. Splits the combined temp+humidity flag into flag_thermal_out_of_spec
--      and flag_humidity_out_of_spec, so THERMAL and HUMIDITY can be
--      correlated as separate RCA categories instead of one blended one.
--   2. Adds flag_scan_speed_out_of_spec, correlatable against the real
--      alarm code 70004 ("Position-synchronised output overspeed" ->
--      MOTION category in v_ldi_alarm_category).
--   3. Adds flag_exposure_out_of_spec (resist_dosage) for completeness —
--      NOTE: no alarm code in ldi_alarm_ms_code currently mentions
--      exposure/dosage (checked all 20 codes' alarm_msg/alarm_detail),
--      so there is nothing to JOIN it against yet. The flag exists so a
--      future exposure-related alarm code has somewhere to land; the RCA
--      dashboard panels do NOT surface an EXPOSURE category in this
--      migration since it would always show zero events — that would be
--      fabricated coverage, not real.
--
-- scan_speed and resist_dosage have no _setting column (unlike PE/JE),
-- and in current data are exactly constant per machine (stddev = 0 for
-- both, verified live) -- a per-machine statistical deviation flag would
-- divide by zero. Used a fixed absolute ceiling instead (headroom above
-- the observed legitimate range, 101.8-435.0 mm/s and 15.0-595.3 mJ/cm2
-- across all 10 machines), matching how vacuum/PE thresholds already
-- work in this view. Provisional pending a real QA-defined limit, same
-- caveat the design doc already carries for the Temperature threshold
-- (docs/GRAFANA_DESIGN_SYSTEM.md SS2.2: "adjust to real machine spec once
-- known").

DROP VIEW IF EXISTS v_ldi_alarm_context;
CREATE VIEW v_ldi_alarm_context AS
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
    (d.temperature < 20 OR d.temperature > 24) AS flag_thermal_out_of_spec,
    (d.humidity < 50 OR d.humidity > 60) AS flag_humidity_out_of_spec,
    (d.air_vacuum > -50 OR d.air_vacuum < -95) AS flag_vac_out_of_spec,
    (ABS(d.pe_1) > 10 OR ABS(d.je_1) > 10) AS flag_pe_out_of_spec,
    (d.scan_speed > 450 OR d.scan_speed <= 0) AS flag_scan_speed_out_of_spec,
    (d.resist_dosage > 650 OR d.resist_dosage <= 0) AS flag_exposure_out_of_spec,
    -- kept for backward compatibility with any existing consumer of the
    -- old combined flag name
    (d.temperature < 20 OR d.temperature > 24 OR d.humidity < 50 OR d.humidity > 60) AS flag_temp_out_of_spec
FROM ldi_alarm_log a
LEFT JOIN ldi_alarm_ms_code m ON a.errorcode = m.alarm_id
LEFT JOIN LATERAL (
    SELECT temperature, humidity, air_vacuum, scan_speed, resist_dosage, pe_1, je_1
    FROM ldi_data d
    WHERE d.eqp_id = a.equipmentid
      AND d.time <= a.logdate
      AND d.time >= a.logdate - INTERVAL '5 minutes'
    ORDER BY d.time DESC
    LIMIT 1
) d ON true;
