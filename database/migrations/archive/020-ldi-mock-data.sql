-- ══════════════════════════════════════════════════════════════
-- LDI Mock Data Injection Script
-- Populates ldi_alarm_ms_code, ldi_alarm_log, and ldi_data
-- with realistic manufacturing telemetry to bring the 15-panel
-- Grafana dashboard to life.
-- ══════════════════════════════════════════════════════════════

-- ── Task 1: Alarm Master Codes ────────────────────────────────
INSERT INTO public.ldi_alarm_ms_code (alarm_code, alarm_type, alarm_msg, alarm_detail)
VALUES
  (1010001, 'Warning',  'Protocol is empty',               'Communication protocol not configured for this equipment'),
  (1010002, 'Error',    'Exposure lamp intensity low',      'UV lamp power below minimum threshold — replace or recalibrate'),
  (1010003, 'Error',    'Vacuum pressure abnormal',         'Air vacuum sensor reading outside acceptable range'),
  (1010004, 'Warning',  'Humidity above threshold',         'Cleanroom humidity exceeds 60% — check HVAC system'),
  (1010005, 'Error',    'Temperature sensor failure',       'Temperature sensor returning null or out-of-range values')
ON CONFLICT (alarm_code) DO NOTHING;

-- ── Task 2: Alarm Logs (30 records over 24h) ──────────────────
INSERT INTO public.ldi_alarm_log (logdate, errorcode, equipmentid, factory, process)
SELECT
  NOW() - (random() * INTERVAL '24 hours') AS logdate,
  (ARRAY[1010001, 1010002, 1010003, 1010004, 1010005])[floor(random() * 5 + 1)::int] AS errorcode,
  (ARRAY['LDIA3-SM-LDI2', 'LDI002-LD2'])[floor(random() * 2 + 1)::int] AS equipmentid,
  'FAB-3' AS factory,
  'PCB-Photoresist' AS process
FROM generate_series(1, 30);

-- ── Task 3: Healthy Machine (LDIA3-SM-LDI2) ───────────────────
-- 60 rows: 1 per minute for the last hour, temp ~22C, hum ~55%
INSERT INTO public.ldi_data (
  "time", eqp_id, factory, process, mo, fpn, layer_name,
  resist_dosage, scale_x, scale_y, temperature, humidity,
  scan_speed, air_vacuum, thickness, board_no, total_board, total_time,
  filmno, board_id, resist, state, scale_mode,
  pe_1, pe_2, pe_3, pe_4, pe_5, pe_6,
  je_1, je_2, je_3, je_4, pe_setting, je_setting, log_id
)
SELECT
  NOW() - (s * INTERVAL '1 minute') AS "time",
  'LDIA3-SM-LDI2' AS eqp_id,
  'FAB-3' AS factory,
  'PCB-Photoresist' AS process,
  'MO-2026-' || LPAD((2000 + (s % 50))::TEXT, 4, '0') AS mo,
  'FPN-LDI-A3-' || LPAD((100 + (s % 10))::TEXT, 3, '0') AS fpn,
  (ARRAY['Top Copper', 'Bottom Copper', 'Solder Mask', 'Silkscreen'])[floor(random() * 4 + 1)::int] AS layer_name,
  120.0 + (random() * 10 - 5) AS resist_dosage,
  0.001 + (random() * 0.002 - 0.001) AS scale_x,
  -0.001 + (random() * 0.002 - 0.001) AS scale_y,
  21.8 + (random() * 0.6) AS temperature,
  54.0 + (random() * 2.0) AS humidity,
  350.0 + (random() * 30 - 15) AS scan_speed,
  -95.0 + (random() * 5 - 2.5) AS air_vacuum,
  1.02 + (random() * 0.06 - 0.03) AS thickness,
  (s % 25) + 1 AS board_no,
  25 AS total_board,
  180.0 + (random() * 20 - 10) AS total_time,
  'FLM-' || LPAD((5000 + s)::TEXT, 5, '0') AS filmno,
  'BD-' || LPAD((s % 25 + 1)::TEXT, 2, '0') AS board_id,
  0.85 + (random() * 0.1) AS resist,
  true AS state,
  'Normal' AS scale_mode,
  85.0 + (random() * 8) AS pe_1,
  84.5 + (random() * 9) AS pe_2,
  86.0 + (random() * 7) AS pe_3,
  83.5 + (random() * 10) AS pe_4,
  85.5 + (random() * 8) AS pe_5,
  84.0 + (random() * 9) AS pe_6,
  78.0 + (random() * 10) AS je_1,
  79.5 + (random() * 8) AS je_2,
  77.0 + (random() * 11) AS je_3,
  80.0 + (random() * 7) AS je_4,
  90.0 AS pe_setting,
  85.0 AS je_setting,
  100000 + s AS log_id
FROM generate_series(0, 59) AS s;

-- ── Task 4: Anomalous Machine (LDI002-LD2) ────────────────────
-- 60 rows: temp drifts from 23.5 to 25.5C, humidity drifts to 62%
INSERT INTO public.ldi_data (
  "time", eqp_id, factory, process, mo, fpn, layer_name,
  resist_dosage, scale_x, scale_y, temperature, humidity,
  scan_speed, air_vacuum, thickness, board_no, total_board, total_time,
  filmno, board_id, resist, state, scale_mode,
  pe_1, pe_2, pe_3, pe_4, pe_5, pe_6,
  je_1, je_2, je_3, je_4, pe_setting, je_setting, log_id
)
SELECT
  NOW() - (s * INTERVAL '1 minute') AS "time",
  'LDI002-LD2' AS eqp_id,
  'FAB-3' AS factory,
  'PCB-Photoresist' AS process,
  'MO-2026-' || LPAD((3000 + (s % 30))::TEXT, 4, '0') AS mo,
  'FPN-LDI-B2-' || LPAD((200 + (s % 8))::TEXT, 3, '0') AS fpn,
  (ARRAY['Layer 1', 'Layer 2', 'Layer 3'])[floor(random() * 3 + 1)::int] AS layer_name,
  115.0 + (random() * 15 - 5) AS resist_dosage,
  0.003 + (random() * 0.006) AS scale_x,
  -0.004 + (random() * 0.005) AS scale_y,
  -- Temperature drifts from 23.5C to 25.5C over the hour (RED zone)
  23.5 + (s / 60.0 * 2.0) + (random() * 0.3 - 0.15) AS temperature,
  -- Humidity drifts from 57% to 62% (YELLOW/RED zone)
  57.0 + (s / 60.0 * 5.0) + (random() * 1.0 - 0.5) AS humidity,
  330.0 + (random() * 40 - 20) AS scan_speed,
  -90.0 + (random() * 8 - 4) AS air_vacuum,
  1.05 + (random() * 0.08 - 0.04) AS thickness,
  (s % 20) + 1 AS board_no,
  20 AS total_board,
  200.0 + (random() * 30 - 10) AS total_time,
  'FLM-' || LPAD((8000 + s)::TEXT, 5, '0') AS filmno,
  'BD-' || LPAD((s % 20 + 1)::TEXT, 2, '0') AS board_id,
  0.80 + (random() * 0.15) AS resist,
  true AS state,
  'Normal' AS scale_mode,
  -- PE degrades as temperature drifts (70-82 range, some below warning)
  70.0 + (s / 60.0 * -8) + (random() * 5) AS pe_1,
  72.0 + (s / 60.0 * -6) + (random() * 5) AS pe_2,
  68.0 + (s / 60.0 * -10) + (random() * 6) AS pe_3,
  71.0 + (s / 60.0 * -7) + (random() * 5) AS pe_4,
  69.0 + (s / 60.0 * -9) + (random() * 6) AS pe_5,
  73.0 + (s / 60.0 * -5) + (random() * 4) AS pe_6,
  -- JE also degrades
  65.0 + (s / 60.0 * -8) + (random() * 5) AS je_1,
  67.0 + (s / 60.0 * -6) + (random() * 5) AS je_2,
  63.0 + (s / 60.0 * -10) + (random() * 6) AS je_3,
  66.0 + (s / 60.0 * -7) + (random() * 5) AS je_4,
  90.0 AS pe_setting,
  85.0 AS je_setting,
  200000 + s AS log_id
FROM generate_series(0, 59) AS s;

-- ── Verification ───────────────────────────────────────────────
SELECT 'ldi_alarm_ms_code' AS table_name, COUNT(*) AS rows FROM public.ldi_alarm_ms_code
UNION ALL
SELECT 'ldi_alarm_log',     COUNT(*) FROM public.ldi_alarm_log
UNION ALL
SELECT 'ldi_data',          COUNT(*) FROM public.ldi_data;

SELECT eqp_id, COUNT(*) AS rows,
       ROUND(MIN(temperature)::NUMERIC, 2) AS min_temp,
       ROUND(AVG(temperature)::NUMERIC, 2) AS avg_temp,
       ROUND(MAX(temperature)::NUMERIC, 2) AS max_temp,
       ROUND(MIN(humidity)::NUMERIC, 2) AS min_hum,
       ROUND(AVG(humidity)::NUMERIC, 2) AS avg_hum,
       ROUND(MAX(humidity)::NUMERIC, 2) AS max_hum
FROM public.ldi_data
GROUP BY eqp_id
ORDER BY eqp_id;
