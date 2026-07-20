-- ══════════════════════════════════════════════════════════════
-- LDI Correlated Mock Data — The "Masterpiece" Narrative
-- TRUNCATEs old data. Creates a story:
--   LDIA3-SM-LDI2: Perfectly healthy (22.3C, 55%, PE 92%)
--   LDI002-LD2: Catastrophic breakdown (25.8C, 66%, PE 40%)
--   with CORRELATED alarms at exact same timestamps.
-- ══════════════════════════════════════════════════════════════

-- ── 0. Purge old disjointed data ──────────────────────────────
TRUNCATE public.ldi_data RESTART IDENTITY;
TRUNCATE public.ldi_alarm_log RESTART IDENTITY;

-- ── 1. Ensure alarm codes exist ───────────────────────────────
INSERT INTO public.ldi_alarm_ms_code (alarm_code, alarm_type, alarm_msg, alarm_detail)
VALUES
  (1010001, 'Warning',  'Protocol is empty',             'Communication protocol not configured'),
  (1010002, 'Error',    'Exposure lamp intensity low',    'UV lamp power below threshold'),
  (1010003, 'Error',    'Vacuum pressure abnormal',       'Air vacuum sensor outside range'),
  (1010004, 'Warning',  'Humidity above threshold',       'Cleanroom humidity exceeds 60%'),
  (1010005, 'Error',    'Temperature sensor failure',     'Temp sensor returning null or OOR'),
  (1010006, 'Error',    'PE limit exceeded',              'Process efficiency above ceiling'),
  (1010007, 'Warning',  'Alignment drift detected',       'Scale X/Y drift exceeds tolerance'),
  (1010008, 'Error',    'Film break detected',            'Photoresist film break')
ON CONFLICT (alarm_code) DO NOTHING;

-- ── 2. LDIA3-SM-LDI2: PERFECTLY HEALTHY (60 rows) ───────────
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
  '3' AS factory, 'SM' AS process,
  'MO-2026-1001' AS mo,
  'FPN-A3-001' AS fpn,
  (ARRAY['Top Copper', 'Bottom Copper', 'Solder Mask'])[floor(random() * 3 + 1)::int] AS layer_name,
  122.0 + (random() * 4 - 2) AS resist_dosage,
  (random() * 0.001 - 0.0005) AS scale_x,
  (random() * 0.001 - 0.0005) AS scale_y,
  -- HEALTHY: 22.1 - 22.5 (tight around 22.3)
  22.3 + (random() * 0.4 - 0.2) AS temperature,
  -- HEALTHY: 54.5 - 55.5 (tight around 55.0)
  55.0 + (random() * 1.0 - 0.5) AS humidity,
  350.0 + (random() * 10 - 5) AS scan_speed,
  -95.0 + (random() * 2 - 1) AS air_vacuum,
  1.02 + (random() * 0.02 - 0.01) AS thickness,
  (s % 25) + 1 AS board_no,
  25 AS total_board,
  180.0 + (random() * 5 - 2.5) AS total_time,
  'FLM-001' AS filmno, 'BD-' || LPAD(((s % 25) + 1)::TEXT, 2, '0') AS board_id,
  0.90 + (random() * 0.05) AS resist,
  true AS state, 'Normal' AS scale_mode,
  91.0 + (random() * 4) AS pe_1, 90.5 + (random() * 4) AS pe_2,
  92.0 + (random() * 3) AS pe_3, 90.0 + (random() * 5) AS pe_4,
  91.5 + (random() * 4) AS pe_5, 90.0 + (random() * 5) AS pe_6,
  85.0 + (random() * 5) AS je_1, 84.0 + (random() * 6) AS je_2,
  86.0 + (random() * 4) AS je_3, 83.5 + (random() * 6) AS je_4,
  90.0 AS pe_setting, 85.0 AS je_setting,
  100000 + s AS log_id
FROM generate_series(0, 59) AS s;

-- ── 3. LDI002-LD2: CATASTROPHIC BREAKDOWN (60 rows) ──────────
-- Temperature ramps from 23.5 to 25.8, Humidity ramps to 66%
-- PE degrades from 85% to 40%, multiple correlated alarms
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
  '3' AS factory, 'SM' AS process,
  'MO-2026-2001' AS mo,
  'FPN-B2-001' AS fpn,
  (ARRAY['Layer 1', 'Layer 2', 'Layer 3'])[floor(random() * 3 + 1)::int] AS layer_name,
  115.0 + (random() * 10 - 3) AS resist_dosage,
  -- Scale drifts as machine degrades
  0.002 + (s / 60.0 * 0.008) + (random() * 0.001) AS scale_x,
  -0.003 + (s / 60.0 * 0.006) + (random() * 0.001) AS scale_y,
  -- CATASTROPHIC: 23.5 -> 25.8 (crosses 24 amber, 25 red)
  23.5 + (s / 60.0 * 2.3) + (random() * 0.2 - 0.1) AS temperature,
  -- CATASTROPHIC: 57 -> 66% (crosses 60 amber, 65 red)
  57.0 + (s / 60.0 * 9.0) + (random() * 0.8 - 0.4) AS humidity,
  320.0 + (random() * 30 - 15) AS scan_speed,
  -88.0 + (random() * 6 - 3) AS air_vacuum,
  1.08 + (random() * 0.06 - 0.03) AS thickness,
  (s % 18) + 1 AS board_no,
  18 AS total_board,
  210.0 + (random() * 20 - 5) AS total_time,
  'FLM-002' AS filmno, 'BD-' || LPAD(((s % 18) + 1)::TEXT, 2, '0') AS board_id,
  0.80 + (random() * 0.1) AS resist,
  true AS state, 'Normal' AS scale_mode,
  -- PE CRASHES: 85 -> 40 (catastrophic degradation)
  85.0 - (s / 60.0 * 45) + (random() * 3) AS pe_1,
  83.0 - (s / 60.0 * 43) + (random() * 3) AS pe_2,
  80.0 - (s / 60.0 * 48) + (random() * 4) AS pe_3,
  84.0 - (s / 60.0 * 44) + (random() * 3) AS pe_4,
  82.0 - (s / 60.0 * 46) + (random() * 4) AS pe_5,
  81.0 - (s / 60.0 * 42) + (random() * 3) AS pe_6,
  78.0 - (s / 60.0 * 38) + (random() * 3) AS je_1,
  76.0 - (s / 60.0 * 36) + (random() * 3) AS je_2,
  74.0 - (s / 60.0 * 40) + (random() * 4) AS je_3,
  77.0 - (s / 60.0 * 37) + (random() * 3) AS je_4,
  90.0 AS pe_setting, 85.0 AS je_setting,
  200000 + s AS log_id
FROM generate_series(0, 59) AS s;

-- ── 4. CORRELATED ALARMS for LDI002-LD2 ──────────────────────
-- Alarms fire at the EXACT SAME timestamps as the telemetry
-- anomalies. This is the "story" — temp spikes AND alarms together.
INSERT INTO public.ldi_alarm_log (logdate, errorcode, equipmentid, factory, process)
SELECT
  NOW() - (s * INTERVAL '1 minute') AS logdate,
  CASE
    WHEN s BETWEEN 10 AND 20 THEN 1010001   -- Protocol empty (early warning)
    WHEN s BETWEEN 20 AND 30 THEN 1010004   -- Humidity above threshold
    WHEN s BETWEEN 30 AND 40 THEN 1010005   -- Temperature sensor failure
    WHEN s BETWEEN 35 AND 45 THEN 1010003   -- Vacuum pressure abnormal
    WHEN s BETWEEN 40 AND 50 THEN 1010006   -- PE limit exceeded
    WHEN s BETWEEN 45 AND 55 THEN 1010007   -- Alignment drift
    WHEN s BETWEEN 50 AND 59 THEN 1010002   -- Exposure lamp low
    WHEN s BETWEEN 55 AND 59 THEN 1010008   -- Film break
    ELSE 1010001
  END AS errorcode,
  'LDI002-LD2' AS equipmentid,
  '3' AS factory,
  'SM' AS process
FROM generate_series(0, 59) AS s
WHERE s BETWEEN 10 AND 59;  -- Alarms start after minute 10 (when drift begins)

-- ── 5. Verification ───────────────────────────────────────────
SELECT '=== DATA SUMMARY ===' AS report;
SELECT 'ldi_data' AS tbl, COUNT(*) AS rows FROM public.ldi_data
UNION ALL SELECT 'ldi_alarm_log', COUNT(*) FROM public.ldi_alarm_log
UNION ALL SELECT 'ldi_alarm_ms_code', COUNT(*) FROM public.ldi_alarm_ms_code;

SELECT '' AS blank;
SELECT '=== MACHINE PROFILES ===' AS report;
SELECT eqp_id,
  COUNT(*) AS rows,
  ROUND(MIN(temperature)::NUMERIC, 2) AS min_temp,
  ROUND(AVG(temperature)::NUMERIC, 2) AS avg_temp,
  ROUND(MAX(temperature)::NUMERIC, 2) AS max_temp,
  ROUND(MIN(humidity)::NUMERIC, 2) AS min_hum,
  ROUND(AVG(humidity)::NUMERIC, 2) AS avg_hum,
  ROUND(MAX(humidity)::NUMERIC, 2) AS max_hum,
  ROUND(AVG((pe_1+pe_2+pe_3+pe_4+pe_5+pe_6)/6.0)::NUMERIC, 1) AS avg_pe,
  CASE
    WHEN AVG(temperature) BETWEEN 20 AND 24 AND AVG(humidity) BETWEEN 50 AND 60 THEN 'HEALTHY'
    WHEN AVG(temperature) > 25 OR AVG(humidity) > 65 THEN 'CATASTROPHIC'
    ELSE 'DEGRADING'
  END AS status
FROM public.ldi_data
GROUP BY eqp_id ORDER BY eqp_id;

SELECT '' AS blank;
SELECT '=== CORRELATED ALARMS ===' AS report;
SELECT equipmentid, COUNT(*) AS alarm_count,
  MIN(logdate)::TEXT AS first_alarm,
  MAX(logdate)::TEXT AS last_alarm
FROM public.ldi_alarm_log
GROUP BY equipmentid ORDER BY equipmentid;
