-- ══════════════════════════════════════════════════════════════
-- LDI 10-Machine Factory Simulation
-- Clears existing mock data, injects 1hr telemetry for 10
-- machines across 3 operating profiles + 50 alarm events.
-- ══════════════════════════════════════════════════════════════

-- ── 0. Clear old mock data ────────────────────────────────────
DELETE FROM public.ldi_alarm_log;
DELETE FROM public.ldi_data;

-- ── 1. Alarm Master Codes (ensure present) ────────────────────
INSERT INTO public.ldi_alarm_ms_code (alarm_code, alarm_type, alarm_msg, alarm_detail)
VALUES
  (1010001, 'Warning',  'Protocol is empty',             'Communication protocol not configured'),
  (1010002, 'Error',    'Exposure lamp intensity low',    'UV lamp power below minimum threshold'),
  (1010003, 'Error',    'Vacuum pressure abnormal',       'Air vacuum sensor outside range'),
  (1010004, 'Warning',  'Humidity above threshold',       'Cleanroom humidity exceeds 60%'),
  (1010005, 'Error',    'Temperature sensor failure',     'Temp sensor returning null or OOR'),
  (1010006, 'Error',    'PE limit exceeded',              'Process efficiency above configured ceiling'),
  (1010007, 'Warning',  'Alignment drift detected',       'Scale X/Y drift exceeds 0.005mm tolerance'),
  (1010008, 'Error',    'Film break detected',            'Photoresist film break — stop and reload')
ON CONFLICT (alarm_code) DO NOTHING;

-- ── 2. Healthy Line (LDI-01 to LDI-06): stable in green zone ──
-- Uses a CTE to generate 10 machines x 60 rows = 600 rows
INSERT INTO public.ldi_data (
  "time", eqp_id, factory, process, mo, fpn, layer_name,
  resist_dosage, scale_x, scale_y, temperature, humidity,
  scan_speed, air_vacuum, thickness, board_no, total_board, total_time,
  filmno, board_id, resist, state, scale_mode,
  pe_1, pe_2, pe_3, pe_4, pe_5, pe_6,
  je_1, je_2, je_3, je_4, pe_setting, je_setting, log_id
)
WITH machines AS (
  SELECT 'LDI-0' || g AS eqp_id, g AS mnum
  FROM generate_series(1, 6) AS g
),
ticks AS (
  SELECT generate_series(0, 59) AS s
)
SELECT
  NOW() - (t.s * INTERVAL '1 minute') AS "time",
  m.eqp_id,
  '3' AS factory,
  'SM' AS process,
  'MO-' || LPAD((1000 + m.mnum * 100 + (t.s % 30))::TEXT, 5, '0') AS mo,
  'FPN-LDI-' || m.eqp_id || '-' || LPAD((100 + (t.s % 10))::TEXT, 3, '0') AS fpn,
  (ARRAY['Top Copper', 'Bottom Copper', 'Solder Mask', 'Silkscreen'])[floor(random() * 4 + 1)::int] AS layer_name,
  120.0 + (random() * 10 - 5) AS resist_dosage,
  (random() * 0.002 - 0.001) AS scale_x,
  (random() * 0.002 - 0.001) AS scale_y,
  -- Healthy: 21.5-22.5C (tight around 22)
  22.0 + (random() * 1.0 - 0.5) AS temperature,
  -- Healthy: 53.5-56.5% (tight around 55)
  55.0 + (random() * 3.0 - 1.5) AS humidity,
  350.0 + (random() * 30 - 15) AS scan_speed,
  -95.0 + (random() * 5 - 2.5) AS air_vacuum,
  1.02 + (random() * 0.06 - 0.03) AS thickness,
  (t.s % 25) + 1 AS board_no,
  25 AS total_board,
  180.0 + (random() * 20 - 10) AS total_time,
  'FLM-' || m.eqp_id || '-' || LPAD((5000 + t.s)::TEXT, 5, '0') AS filmno,
  'BD-' || LPAD((t.s % 25 + 1)::TEXT, 2, '0') AS board_id,
  0.85 + (random() * 0.1) AS resist,
  true AS state,
  'Normal' AS scale_mode,
  -- PE: 85-95 (green zone)
  86.0 + (random() * 8) AS pe_1,
  85.5 + (random() * 9) AS pe_2,
  87.0 + (random() * 7) AS pe_3,
  84.5 + (random() * 10) AS pe_4,
  86.5 + (random() * 8) AS pe_5,
  85.0 + (random() * 9) AS pe_6,
  78.0 + (random() * 10) AS je_1,
  79.5 + (random() * 8) AS je_2,
  77.0 + (random() * 11) AS je_3,
  80.0 + (random() * 7) AS je_4,
  85.0 AS pe_setting,
  85.0 AS je_setting,
  100000 + m.mnum * 10000 + t.s AS log_id
FROM machines m CROSS JOIN ticks t;

-- ── 3. Thermal Warning Drift (LDI-07 to LDI-08) ───────────────
-- Temperature drifts from 22C up to 24.8C, crossing amber/red
INSERT INTO public.ldi_data (
  "time", eqp_id, factory, process, mo, fpn, layer_name,
  resist_dosage, scale_x, scale_y, temperature, humidity,
  scan_speed, air_vacuum, thickness, board_no, total_board, total_time,
  filmno, board_id, resist, state, scale_mode,
  pe_1, pe_2, pe_3, pe_4, pe_5, pe_6,
  je_1, je_2, je_3, je_4, pe_setting, je_setting, log_id
)
WITH machines AS (
  SELECT 'LDI-0' || g AS eqp_id, g AS mnum
  FROM generate_series(7, 8) AS g
),
ticks AS (
  SELECT generate_series(0, 59) AS s
)
SELECT
  NOW() - (t.s * INTERVAL '1 minute') AS "time",
  m.eqp_id,
  '3' AS factory,
  'SM' AS process,
  'MO-' || LPAD((2000 + m.mnum * 100 + (t.s % 20))::TEXT, 5, '0') AS mo,
  'FPN-LDI-' || m.eqp_id || '-' || LPAD((200 + (t.s % 8))::TEXT, 3, '0') AS fpn,
  (ARRAY['Layer 1', 'Layer 2', 'Layer 3'])[floor(random() * 3 + 1)::int] AS layer_name,
  115.0 + (random() * 15 - 5) AS resist_dosage,
  0.002 + (random() * 0.004) AS scale_x,
  -0.003 + (random() * 0.005) AS scale_y,
  -- DRIFT: 22.0C -> 24.8C over 60 minutes (crosses 24 amber, 25 red)
  22.0 + (t.s / 60.0 * 2.8) + (random() * 0.3 - 0.15) AS temperature,
  -- Humidity stable green
  55.0 + (random() * 2.0 - 1.0) AS humidity,
  330.0 + (random() * 40 - 20) AS scan_speed,
  -90.0 + (random() * 8 - 4) AS air_vacuum,
  1.05 + (random() * 0.08 - 0.04) AS thickness,
  (t.s % 20) + 1 AS board_no,
  20 AS total_board,
  200.0 + (random() * 30 - 10) AS total_time,
  'FLM-' || m.eqp_id || '-' || LPAD((8000 + t.s)::TEXT, 5, '0') AS filmno,
  'BD-' || LPAD((t.s % 20 + 1)::TEXT, 2, '0') AS board_id,
  0.80 + (random() * 0.15) AS resist,
  true AS state,
  'Normal' AS scale_mode,
  -- PE degrades as temp drifts (85 -> ~72)
  86.0 - (t.s / 60.0 * 12) + (random() * 4) AS pe_1,
  85.5 - (t.s / 60.0 * 11) + (random() * 4) AS pe_2,
  87.0 - (t.s / 60.0 * 14) + (random() * 5) AS pe_3,
  84.5 - (t.s / 60.0 * 10) + (random() * 4) AS pe_4,
  86.5 - (t.s / 60.0 * 13) + (random() * 5) AS pe_5,
  85.0 - (t.s / 60.0 * 11) + (random() * 4) AS pe_6,
  78.0 - (t.s / 60.0 * 8) + (random() * 5) AS je_1,
  79.5 - (t.s / 60.0 * 7) + (random() * 5) AS je_2,
  77.0 - (t.s / 60.0 * 9) + (random() * 6) AS je_3,
  80.0 - (t.s / 60.0 * 8) + (random() * 5) AS je_4,
  85.0 AS pe_setting,
  85.0 AS je_setting,
  200000 + m.mnum * 10000 + t.s AS log_id
FROM machines m CROSS JOIN ticks t;

-- ── 4. Humidity Spike & Faulty (LDI-09 to LDI-10) ─────────────
-- Humidity spikes to 62-66%, PE drops, frequent alarms
INSERT INTO public.ldi_data (
  "time", eqp_id, factory, process, mo, fpn, layer_name,
  resist_dosage, scale_x, scale_y, temperature, humidity,
  scan_speed, air_vacuum, thickness, board_no, total_board, total_time,
  filmno, board_id, resist, state, scale_mode,
  pe_1, pe_2, pe_3, pe_4, pe_5, pe_6,
  je_1, je_2, je_3, je_4, pe_setting, je_setting, log_id
)
WITH machines AS (
  SELECT 'LDI-' || LPAD(g::TEXT, 2, '0') AS eqp_id, g AS mnum
  FROM generate_series(9, 10) AS g
),
ticks AS (
  SELECT generate_series(0, 59) AS s
)
SELECT
  NOW() - (t.s * INTERVAL '1 minute') AS "time",
  m.eqp_id,
  '3' AS factory,
  'SM' AS process,
  'MO-' || LPAD((3000 + m.mnum * 100 + (t.s % 15))::TEXT, 5, '0') AS mo,
  'FPN-LDI-' || m.eqp_id || '-' || LPAD((300 + (t.s % 6))::TEXT, 3, '0') AS fpn,
  (ARRAY['Copper Layer', 'Dielectric', 'Surface Finish'])[floor(random() * 3 + 1)::int] AS layer_name,
  110.0 + (random() * 20 - 5) AS resist_dosage,
  -- Scale drift worse on faulty machines
  0.003 + (random() * 0.008) AS scale_x,
  -0.005 + (random() * 0.010) AS scale_y,
  -- Temp slightly elevated (22.5-23.5)
  23.0 + (random() * 1.0 - 0.5) AS temperature,
  -- HUMIDITY SPIKE: 55 -> 62-66% (crosses amber 60, red 65)
  57.0 + (t.s / 60.0 * 9.0) + (random() * 1.5 - 0.75) AS humidity,
  -- Scan speed more variable
  320.0 + (random() * 60 - 30) AS scan_speed,
  -88.0 + (random() * 10 - 5) AS air_vacuum,
  1.08 + (random() * 0.12 - 0.06) AS thickness,
  (t.s % 18) + 1 AS board_no,
  18 AS total_board,
  210.0 + (random() * 40 - 10) AS total_time,
  'FLM-' || m.eqp_id || '-' || LPAD((9000 + t.s)::TEXT, 5, '0') AS filmno,
  'BD-' || LPAD((t.s % 18 + 1)::TEXT, 2, '0') AS board_id,
  0.75 + (random() * 0.2) AS resist,
  true AS state,
  'Normal' AS scale_mode,
  -- PE severely degraded (70-82, some below warning)
  75.0 - (t.s / 60.0 * 8) + (random() * 5) AS pe_1,
  73.0 - (t.s / 60.0 * 6) + (random() * 5) AS pe_2,
  72.0 - (t.s / 60.0 * 10) + (random() * 6) AS pe_3,
  74.0 - (t.s / 60.0 * 7) + (random() * 5) AS pe_4,
  71.0 - (t.s / 60.0 * 9) + (random() * 6) AS pe_5,
  73.5 - (t.s / 60.0 * 8) + (random() * 5) AS pe_6,
  68.0 - (t.s / 60.0 * 7) + (random() * 5) AS je_1,
  66.0 - (t.s / 60.0 * 6) + (random() * 5) AS je_2,
  64.0 - (t.s / 60.0 * 8) + (random() * 6) AS je_3,
  67.0 - (t.s / 60.0 * 7) + (random() * 5) AS je_4,
  85.0 AS pe_setting,
  85.0 AS je_setting,
  300000 + m.mnum * 10000 + t.s AS log_id
FROM machines m CROSS JOIN ticks t;

-- ── 5. Alarm Events (50 across LDI-07 to LDI-10, last 24h) ────
INSERT INTO public.ldi_alarm_log (logdate, errorcode, equipmentid, factory, process)
WITH alarm_machines AS (
  SELECT 'LDI-0' || g AS eqp_id
  FROM generate_series(7, 10) AS g
),
alarm_ticks AS (
  SELECT
    generate_series(1, 50) AS seq,
    NOW() - (random() * INTERVAL '24 hours') AS logdate,
    (ARRAY[1010001, 1010002, 1010003, 1010004, 1010005, 1010006, 1010007, 1010008])[floor(random() * 8 + 1)::int] AS errorcode,
    (ARRAY['LDI-07', 'LDI-08', 'LDI-09', 'LDI-10'])[floor(random() * 4 + 1)::int] AS equipmentid
)
SELECT logdate, errorcode, equipmentid, '3' AS factory, 'SM' AS process
FROM alarm_ticks
ORDER BY logdate;

-- ── 6. Verification ───────────────────────────────────────────
SELECT 'Summary' AS report;
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
       ROUND(AVG((pe_1+pe_2+pe_3+pe_4+pe_5+pe_6)/6.0)::NUMERIC, 1) AS avg_pe,
       CASE
         WHEN AVG(temperature) BETWEEN 20 AND 24 AND AVG(humidity) BETWEEN 50 AND 60 THEN 'HEALTHY'
         WHEN AVG(temperature) > 24 OR AVG(humidity) > 60 THEN 'CRITICAL'
         ELSE 'WARNING'
       END AS status
FROM public.ldi_data
GROUP BY eqp_id
ORDER BY eqp_id;

SELECT '' AS blank;
SELECT equipmentid, COUNT(*) AS alarm_count
FROM public.ldi_alarm_log
GROUP BY equipmentid
ORDER BY equipmentid;
