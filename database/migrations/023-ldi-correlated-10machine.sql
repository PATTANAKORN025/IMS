-- ══════════════════════════════════════════════════════════════
-- LDI 10-Machine Correlated Mock Data (Schema-Aligned)
-- Types match production: VARCHAR for IDs, FLOAT for metrics.
-- Healthy (01-06), Thermal Drift (07-08), Humidity Spike (09-10)
-- ══════════════════════════════════════════════════════════════

-- 1. PURGE OLD DATA
TRUNCATE TABLE public.ldi_data, public.ldi_alarm_log;
DELETE FROM public.ldi_alarm_ms_code;

-- 2. INSERT ALARM DICTIONARY (alarm_id VARCHAR(15), alarm_code VARCHAR(50))
INSERT INTO public.ldi_alarm_ms_code (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
VALUES
  ('A001', 'Critical', '01010001', 'Laser Module Communication Error', 'Loss of sync with laser module'),
  ('A002', 'Warning',  '0C050093', 'Temperature Drift Detected', 'Chiller struggling to maintain 22C'),
  ('A003', 'Warning',  '0C050094', 'Humidity Spike Detected', 'Cleanroom RH exceeded 60%'),
  ('A004', 'Critical', '0C050095', 'Process Efficiency Drop', 'PE dropped below 80% threshold');

-- 3. HEALTHY MACHINES (LDI-01 to LDI-06): stable in green zone
INSERT INTO public.ldi_data (
  "time", factory, process, eqp_id, mo, fpn, layer_name,
  resist_dosage, scale_x, scale_y, temperature, humidity,
  scan_speed, air_vacuum, thickness, board_no, total_board, total_time,
  filmno, board_id, resist, state, scale_mode,
  pe_1, pe_2, pe_3, pe_4, pe_5, pe_6,
  je_1, je_2, je_3, je_4, pe_setting, je_setting, log_id
)
SELECT
  NOW() - (x * INTERVAL '1 minute'),
  '3', 'SM',
  'LDI-0' || m,
  'MO-100' || m,
  'FPN-0' || m,
  'Top Copper',
  500.0 + random() * 5,
  1.0001, 1.0001,
  22.0 + (random() * 0.4 - 0.2),
  55.0 + (random() * 2 - 1),
  350.0 + random() * 10,
  -95.0 + random() * 2 - 1,
  1.1,
  15 + m, 25,
  7.2 + random() * 0.1,
  'FLM-001', 'BD-' || LPAD(((x % 25) + 1)::TEXT, 2, '0'),
  'PM-100' || m,
  true, 'Normal',
  90.0 + random() * 5, 89.0 + random() * 5, 91.0 + random() * 4,
  88.0 + random() * 6, 90.0 + random() * 5, 89.0 + random() * 5,
  82.0 + random() * 5, 83.0 + random() * 5, 81.0 + random() * 6, 84.0 + random() * 4,
  90.0, 85.0,
  'LOG-' || LPAD(((x * 100 + m)::TEXT), 7, '0')
FROM generate_series(1, 60) AS x, generate_series(1, 6) AS m;

-- 4. THERMAL DRIFT MACHINES (LDI-07, LDI-08) + CORRELATED ALARMS
INSERT INTO public.ldi_data (
  "time", factory, process, eqp_id, mo, fpn, layer_name,
  resist_dosage, scale_x, scale_y, temperature, humidity,
  scan_speed, air_vacuum, thickness, board_no, total_board, total_time,
  filmno, board_id, resist, state, scale_mode,
  pe_1, pe_2, pe_3, pe_4, pe_5, pe_6,
  je_1, je_2, je_3, je_4, pe_setting, je_setting, log_id
)
SELECT
  NOW() - (x * INTERVAL '1 minute'),
  '3', 'SM',
  'LDI-0' || m,
  'MO-200' || m,
  'FPN-0' || m,
  'Inner Layer',
  480.0 + random() * 5,
  1.0005, 1.0008,
  22.0 + ((60 - x) * 0.05) + (random() * 0.2),
  55.0 + random() * 1,
  330.0 + random() * 10,
  -90.0 + random() * 4 - 2,
  1.1,
  10 + m, 20,
  10.0 + random() * 0.5,
  'FLM-002', 'BD-' || LPAD(((x % 20) + 1)::TEXT, 2, '0'),
  'PM-200' || m,
  true, 'Normal',
  80.0 + random() * 5 - ((60 - x) * 0.2),
  79.0 + random() * 5 - ((60 - x) * 0.2),
  81.0 + random() * 4 - ((60 - x) * 0.15),
  78.0 + random() * 6 - ((60 - x) * 0.2),
  80.0 + random() * 5 - ((60 - x) * 0.18),
  79.0 + random() * 5 - ((60 - x) * 0.2),
  75.0 + random() * 5 - ((60 - x) * 0.15),
  74.0 + random() * 5 - ((60 - x) * 0.15),
  76.0 + random() * 4 - ((60 - x) * 0.12),
  73.0 + random() * 5 - ((60 - x) * 0.15),
  90.0, 85.0,
  'LOG-' || LPAD(((x * 100 + m + 200000)::TEXT), 7, '0')
FROM generate_series(1, 60) AS x, generate_series(7, 8) AS m;

-- Correlated alarms for LDI-07, LDI-08 (temp drift — VARCHAR errorcode)
INSERT INTO public.ldi_alarm_log (logid, logdate, errorcode, errortime, equipmentid, factory, process)
SELECT
  'ALG-' || LPAD(((x * 100 + m + 70000)::TEXT), 7, '0'),
  NOW() - (x * INTERVAL '1 minute'),
  '0C050093',
  (NOW() - (x * INTERVAL '1 minute'))::TEXT,
  'LDI-0' || m,
  '3', 'SM'
FROM generate_series(1, 20) AS x, generate_series(7, 8) AS m;

-- PE drop alarms for LDI-07, LDI-08
INSERT INTO public.ldi_alarm_log (logid, logdate, errorcode, errortime, equipmentid, factory, process)
SELECT
  'ALG-' || LPAD(((x * 100 + m + 80000)::TEXT), 7, '0'),
  NOW() - (x * INTERVAL '1 minute'),
  '0C050095',
  (NOW() - (x * INTERVAL '1 minute'))::TEXT,
  'LDI-0' || m,
  '3', 'SM'
FROM generate_series(25, 55) AS x, generate_series(7, 8) AS m;

-- 5. HUMIDITY SPIKE MACHINES (LDI-09, LDI-10) + CORRELATED ALARMS
INSERT INTO public.ldi_data (
  "time", factory, process, eqp_id, mo, fpn, layer_name,
  resist_dosage, scale_x, scale_y, temperature, humidity,
  scan_speed, air_vacuum, thickness, board_no, total_board, total_time,
  filmno, board_id, resist, state, scale_mode,
  pe_1, pe_2, pe_3, pe_4, pe_5, pe_6,
  je_1, je_2, je_3, je_4, pe_setting, je_setting, log_id
)
SELECT
  NOW() - (x * INTERVAL '1 minute'),
  '3', 'SM',
  'LDI-' || CASE WHEN m = 9 THEN '09' ELSE '10' END,
  'MO-300' || m,
  'FPN-' || m,
  'Solder Mask',
  490.0 + random() * 5,
  1.0002, 1.0002,
  22.5 + random() * 0.2,
  55.0 + ((60 - x) * 0.2) + (random() * 1),
  340.0 + random() * 10,
  -88.0 + random() * 6 - 3,
  1.1,
  5 + m, 18,
  11.5 + random() * 0.5,
  'FLM-003', 'BD-' || LPAD(((x % 18) + 1)::TEXT, 2, '0'),
  'PM-300' || m,
  true, 'Normal',
  75.0 + random() * 5 - ((60 - x) * 0.15),
  74.0 + random() * 5 - ((60 - x) * 0.15),
  76.0 + random() * 4 - ((60 - x) * 0.12),
  73.0 + random() * 5 - ((60 - x) * 0.15),
  75.0 + random() * 5 - ((60 - x) * 0.13),
  74.0 + random() * 5 - ((60 - x) * 0.14),
  70.0 + random() * 5 - ((60 - x) * 0.1),
  69.0 + random() * 5 - ((60 - x) * 0.1),
  71.0 + random() * 4 - ((60 - x) * 0.08),
  68.0 + random() * 5 - ((60 - x) * 0.1),
  90.0, 85.0,
  'LOG-' || LPAD(((x * 100 + m + 300000)::TEXT), 7, '0')
FROM generate_series(1, 60) AS x, generate_series(9, 10) AS m;

-- Correlated alarms for LDI-09, LDI-10 (humidity spike)
INSERT INTO public.ldi_alarm_log (logid, logdate, errorcode, errortime, equipmentid, factory, process)
SELECT
  'ALG-' || LPAD(((x * 100 + m + 90000)::TEXT), 7, '0'),
  NOW() - (x * INTERVAL '1 minute'),
  '0C050094',
  (NOW() - (x * INTERVAL '1 minute'))::TEXT,
  'LDI-' || CASE WHEN m = 9 THEN '09' ELSE '10' END,
  '3', 'SM'
FROM generate_series(1, 15) AS x, generate_series(9, 10) AS m;

-- 6. VERIFICATION
SELECT '=== DATA SUMMARY ===' AS report;
SELECT 'ldi_data' AS tbl, COUNT(*) AS rows FROM public.ldi_data
UNION ALL SELECT 'ldi_alarm_log', COUNT(*) FROM public.ldi_alarm_log
UNION ALL SELECT 'ldi_alarm_ms_code', COUNT(*) FROM public.ldi_alarm_ms_code;

SELECT '' AS blank;
SELECT eqp_id,
  COUNT(*) AS rows,
  ROUND(MIN(temperature)::NUMERIC, 2) AS min_temp,
  ROUND(AVG(temperature)::NUMERIC, 2) AS avg_temp,
  ROUND(MAX(temperature)::NUMERIC, 2) AS max_temp,
  ROUND(AVG(pe_1)::NUMERIC, 1) AS avg_pe,
  (SELECT COUNT(*) FROM public.ldi_alarm_log al WHERE al.equipmentid = d.eqp_id) AS alarms
FROM public.ldi_data d
GROUP BY eqp_id ORDER BY eqp_id;
