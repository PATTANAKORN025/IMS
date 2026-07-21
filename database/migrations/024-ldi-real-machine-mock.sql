-- ══════════════════════════════════════════════════════════════
-- LDI High-Fidelity Mock Data — Real Machine Names
-- 10 machines: LDI-C-01/02, EXPOSURE LDI-2B/2, LDI002-LD1/LD2,
-- LDIA-01/02, LDIA3-SM-LDI1/SM-LDI2
-- ══════════════════════════════════════════════════════════════

-- 1. PURGE
TRUNCATE TABLE public.ldi_data, public.ldi_alarm_log, public.ldi_alarm_ms_code RESTART IDENTITY CASCADE;

-- 2. ALARM CODES (VARCHAR per production schema)
INSERT INTO public.ldi_alarm_ms_code (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
VALUES
  ('A001', 'Critical', '0101', 'Laser Module Sync Error', 'Loss of communication with laser module'),
  ('A002', 'Warning',  '0202', 'Temperature Drift Detected', 'Cleanroom temperature exceeding safe band'),
  ('A003', 'Warning',  '0303', 'Humidity Spike Detected', 'Cleanroom RH exceeding safe band');

-- 3. HEALTHY MACHINES (LDI-C-01, EXPOSURE LDI-2B, EXPOSURE LDI-2, LDI002-LD1, LDIA-01, LDIA3-SM-LDI1)
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
  m.name,
  'MO-' || LPAD(((m.idx * 100 + x) % 9999)::TEXT, 4, '0'),
  'FPN-' || LPAD(m.idx::TEXT, 3, '0'),
  (ARRAY['Top Copper', 'Bottom Copper', 'Solder Mask', 'Silkscreen'])[floor(random() * 4 + 1)::int],
  500.0 + random() * 5,
  1.0000 + (random() * 0.001 - 0.0005),
  1.0000 + (random() * 0.001 - 0.0005),
  -- HEALTHY: tight band 22.0-22.5
  22.0 + (random() * 0.5),
  -- HEALTHY: tight band 50-55
  50.0 + (random() * 5.0),
  350.0 + random() * 10,
  -95.0 + random() * 2 - 1,
  1.05 + random() * 0.1,
  (x % 25) + 1, 25,
  7.0 + random() * 1.0,
  'FLM-' || LPAD(m.idx::TEXT, 3, '0'),
  'BD-' || LPAD(((x % 25) + 1)::TEXT, 2, '0'),
  'PM-' || m.name,
  true, 'Normal',
  90.0 + random() * 8, 89.0 + random() * 8, 91.0 + random() * 7,
  88.0 + random() * 9, 90.0 + random() * 8, 89.0 + random() * 8,
  82.0 + random() * 8, 83.0 + random() * 8, 81.0 + random() * 9, 84.0 + random() * 7,
  90.0, 85.0,
  'LOG-' || LPAD(((m.idx * 10000 + x)::TEXT), 7, '0')
FROM generate_series(1, 60) AS x,
(VALUES
  (1, 'LDI-C-01'),
  (3, 'EXPOSURE LDI-2B'),
  (4, 'EXPOSURE LDI-2'),
  (5, 'LDI002-LD1'),
  (7, 'LDIA-01'),
  (9, 'LDIA3-SM-LDI1')
) AS m(idx, name);

-- 4. THERMAL DRIFT MACHINES (LDI-C-02, LDIA3-SM-LDI2)
-- Temp climbs 22→25.5 over 60 minutes. Alarms fire when temp > 24.5
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
  m.name,
  'MO-' || LPAD(((m.idx * 100 + x) % 9999)::TEXT, 4, '0'),
  'FPN-' || LPAD(m.idx::TEXT, 3, '0'),
  'Inner Layer',
  480.0 + random() * 5,
  1.0005 + random() * 0.001,
  1.0008 + random() * 0.001,
  -- CLIMB: 22.0 → 25.5 over 60 minutes
  22.0 + ((60.0 - x) / 60.0 * 3.5) + (random() * 0.2 - 0.1),
  54.0 + random() * 2.0,
  330.0 + random() * 10,
  -90.0 + random() * 4 - 2,
  1.08 + random() * 0.06,
  (x % 20) + 1, 20,
  9.0 + random() * 1.0,
  'FLM-' || LPAD(m.idx::TEXT, 3, '0'),
  'BD-' || LPAD(((x % 20) + 1)::TEXT, 2, '0'),
  'PM-' || m.name,
  true, 'Normal',
  85.0 - ((60.0 - x) / 60.0 * 15) + random() * 4,
  84.0 - ((60.0 - x) / 60.0 * 14) + random() * 4,
  86.0 - ((60.0 - x) / 60.0 * 16) + random() * 5,
  83.0 - ((60.0 - x) / 60.0 * 13) + random() * 4,
  85.0 - ((60.0 - x) / 60.0 * 15) + random() * 4,
  84.0 - ((60.0 - x) / 60.0 * 14) + random() * 4,
  80.0 - ((60.0 - x) / 60.0 * 12) + random() * 3,
  79.0 - ((60.0 - x) / 60.0 * 11) + random() * 3,
  81.0 - ((60.0 - x) / 60.0 * 13) + random() * 4,
  78.0 - ((60.0 - x) / 60.0 * 10) + random() * 3,
  90.0, 85.0,
  'LOG-' || LPAD(((m.idx * 10000 + x)::TEXT), 7, '0')
FROM generate_series(1, 60) AS x,
(VALUES (2, 'LDI-C-02'), (10, 'LDIA3-SM-LDI2')) AS m(idx, name);

-- Thermal drift alarms: fire when temp > 24.5 (approximately minutes 0-20 from breach)
-- x=1 is oldest (60 min ago), x=60 is newest (now)
-- temp > 24.5 when (60-x)/60*3.5 > 2.5 => x < 60 - (2.5/3.5*60) => x < 17.1 => x <= 17
INSERT INTO public.ldi_alarm_log (logid, logdate, errorcode, errortime, equipmentid, factory, process)
SELECT
  'ALG-' || LPAD(((m.idx * 10000 + x)::TEXT), 7, '0'),
  NOW() - (x * INTERVAL '1 minute'),
  '0202',
  (NOW() - (x * INTERVAL '1 minute'))::TEXT,
  m.name,
  '3', 'SM'
FROM generate_series(1, 17) AS x,
(VALUES (2, 'LDI-C-02'), (10, 'LDIA3-SM-LDI2')) AS m(idx, name);

-- 5. HUMIDITY SPIKE MACHINES (LDI002-LD2, LDIA-02)
-- Hum climbs 55→66 over 60 minutes. Alarms fire when hum > 62%
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
  m.name,
  'MO-' || LPAD(((m.idx * 100 + x) % 9999)::TEXT, 4, '0'),
  'FPN-' || LPAD(m.idx::TEXT, 3, '0'),
  'Solder Mask',
  490.0 + random() * 5,
  1.0002 + random() * 0.001,
  1.0003 + random() * 0.001,
  22.5 + random() * 0.5,
  -- CLIMB: 55 → 66 over 60 minutes
  55.0 + ((60.0 - x) / 60.0 * 11.0) + (random() * 1.0 - 0.5),
  340.0 + random() * 10,
  -88.0 + random() * 6 - 3,
  1.10 + random() * 0.05,
  (x % 18) + 1, 18,
  11.0 + random() * 1.0,
  'FLM-' || LPAD(m.idx::TEXT, 3, '0'),
  'BD-' || LPAD(((x % 18) + 1)::TEXT, 2, '0'),
  'PM-' || m.name,
  true, 'Normal',
  78.0 - ((60.0 - x) / 60.0 * 10) + random() * 4,
  77.0 - ((60.0 - x) / 60.0 * 9) + random() * 4,
  79.0 - ((60.0 - x) / 60.0 * 11) + random() * 5,
  76.0 - ((60.0 - x) / 60.0 * 8) + random() * 4,
  78.0 - ((60.0 - x) / 60.0 * 10) + random() * 4,
  77.0 - ((60.0 - x) / 60.0 * 9) + random() * 4,
  72.0 - ((60.0 - x) / 60.0 * 7) + random() * 3,
  71.0 - ((60.0 - x) / 60.0 * 6) + random() * 3,
  73.0 - ((60.0 - x) / 60.0 * 8) + random() * 4,
  70.0 - ((60.0 - x) / 60.0 * 5) + random() * 3,
  90.0, 85.0,
  'LOG-' || LPAD(((m.idx * 10000 + x)::TEXT), 7, '0')
FROM generate_series(1, 60) AS x,
(VALUES (6, 'LDI002-LD2'), (8, 'LDIA-02')) AS m(idx, name);

-- Humidity spike alarms: fire when hum > 62 (approximately x <= 21)
-- 55 + (60-x)/60*11 > 62 => (60-x)/60*11 > 7 => (60-x) > 38.2 => x < 21.8 => x <= 21
INSERT INTO public.ldi_alarm_log (logid, logdate, errorcode, errortime, equipmentid, factory, process)
SELECT
  'ALG-' || LPAD(((m.idx * 10000 + x)::TEXT), 7, '0'),
  NOW() - (x * INTERVAL '1 minute'),
  '0303',
  (NOW() - (x * INTERVAL '1 minute'))::TEXT,
  m.name,
  '3', 'SM'
FROM generate_series(1, 21) AS x,
(VALUES (6, 'LDI002-LD2'), (8, 'LDIA-02')) AS m(idx, name);

-- 6. VERIFICATION
SELECT '=== DATA SUMMARY ===' AS report;
SELECT 'ldi_data' AS tbl, COUNT(*) AS rows FROM public.ldi_data
UNION ALL SELECT 'ldi_alarm_log', COUNT(*) FROM public.ldi_alarm_log
UNION ALL SELECT 'ldi_alarm_ms_code', COUNT(*) FROM public.ldi_alarm_ms_code;

SELECT '' AS blank;
SELECT eqp_id, COUNT(*) AS rows,
  ROUND(MIN(temperature)::NUMERIC, 2) AS min_temp,
  ROUND(AVG(temperature)::NUMERIC, 2) AS avg_temp,
  ROUND(MAX(temperature)::NUMERIC, 2) AS max_temp,
  ROUND(MIN(humidity)::NUMERIC, 2) AS min_hum,
  ROUND(AVG(humidity)::NUMERIC, 2) AS avg_hum,
  ROUND(MAX(humidity)::NUMERIC, 2) AS max_hum,
  ROUND(AVG(pe_1)::NUMERIC, 1) AS avg_pe,
  (SELECT COUNT(*) FROM public.ldi_alarm_log al WHERE al.equipmentid = d.eqp_id) AS alarms
FROM public.ldi_data d
GROUP BY eqp_id ORDER BY eqp_id;
