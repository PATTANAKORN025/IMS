-- ══════════════════════════════════════════════════════════════
-- 079: categorize the 12 simulator codes with no physical-sensor
--      correlate (v_ldi_alarm_category coverage was 9/21 = 42.9%,
--      below the 45% floor rca-mapping-coverage.js enforces)
-- ══════════════════════════════════════════════════════════════
-- The 7 existing categories (VACUUM, REGISTRATION, ALIGNMENT,
-- CALIBRATION, ENVIRONMENT, MOTION, OPTICS) each name a physical
-- telemetry column an alarm's root cause correlates with. Forcing
-- these 12 codes into one of those would be a fabricated
-- correlation -- exactly what rca-mapping-coverage.js's own header
-- comment warns against. None of them touch a ldi_data sensor
-- column; real alarm_msg/cause text (from the 1,820-code import,
-- migration 061) puts them in three honest, distinct buckets
-- instead, each with NULL related_columns since none applies:
--
--   SAFETY        -- operator/interlock-triggered, not measurement-driven
--     01180016 Emergency Stop
--     0C020014 Safety sensor triggered (light curtain / area guard)
--
--   COMMUNICATION -- network/fieldbus/DB link faults
--     0106000C Failed to stop camera (comms/driver fault)
--     01060013 Found the same IP (duplicate address on station network)
--     0106001C stop trigger wait signal time out (I/O timing)
--     01100001 Failed to connect to PLC
--     01130002 Communication abnormality (cable/port/device fault)
--     80001    Waiting for subdrawing preparation data timeout
--     92013    Network connection timeout
--     97005    Database connection exception
--
--   CONFIGURATION -- station setup/registration faults, not runtime drift
--     01060009 Wrong camera serial number (station config vs. hardware)
--     010E0064 Motor type undefined (axis parameter never set)

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
        WHEN (alarm_code)::text = ANY (ARRAY['01180016'::character varying, '0C020014'::character varying]::text[]) THEN 'SAFETY'::text
        WHEN (alarm_code)::text = ANY (ARRAY['0106000C'::character varying, '01060013'::character varying, '0106001C'::character varying, '01100001'::character varying, '01130002'::character varying, '80001'::character varying, '92013'::character varying, '97005'::character varying]::text[]) THEN 'COMMUNICATION'::text
        WHEN (alarm_code)::text = ANY (ARRAY['01060009'::character varying, '010E0064'::character varying]::text[]) THEN 'CONFIGURATION'::text
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
