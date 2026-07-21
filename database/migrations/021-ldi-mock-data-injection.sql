-- ══════════════════════════════════════════════════════════════
-- 021: LDI 10-Machine Correlated Mock Data Injection
-- Requires: 020-ldi-production-schema.sql to have been run first.
-- SPC-correct: PE/JE values are µm alignment errors (not %).
-- ══════════════════════════════════════════════════════════════

-- 1. PURGE old data
TRUNCATE TABLE public.ldi_data, public.ldi_alarm_log;
DELETE FROM public.ldi_alarm_ms_code;

-- 2. Alarm Master Codes (VARCHAR per production schema)
INSERT INTO public.ldi_alarm_ms_code (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
VALUES
  ('A001', 'Critical', '0101', 'Laser Module Sync Error', 'Loss of communication with laser module'),
  ('A002', 'Warning',  '0202', 'Temperature Drift Detected', 'Cleanroom temperature exceeding safe band'),
  ('A003', 'Warning',  '0303', 'Humidity Spike Detected', 'Cleanroom RH exceeding safe band');

-- 3. HEALTHY MACHINES (6): stable in green zone, PE ±5µm
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
    '3', 'SM', m.name,
    'MO-' || LPAD(((m.idx * 100 + x) % 9999)::TEXT, 4, '0'),
    'FPN-' || LPAD(m.idx::TEXT, 3, '0'),
    (ARRAY['Top Copper', 'Bottom Copper', 'Solder Mask'])[floor(random() * 3 + 1)::int],
    120.0 + random() * 10,
    1.0000 + (random() * 0.001 - 0.0005), 1.0000 + (random() * 0.001 - 0.0005),
    22.0 + (random() * 0.5), 50.0 + (random() * 10.0),
    350.0 + random() * 10, -95.0 + random() * 2 - 1, 1.05 + random() * 0.1,
    (x % 25) + 1, 25, 7.0 + random() * 1.0,
    'FLM-' || LPAD(m.idx::TEXT, 3, '0'),
    'BD-' || LPAD(((x % 25) + 1)::TEXT, 2, '0'),
    'PM-' || m.name, true, 'Normal',
    -5.0 + random() * 10, -5.0 + random() * 10,
    -5.0 + random() * 10, -5.0 + random() * 10,
    -5.0 + random() * 10, -5.0 + random() * 10,
    -4.0 + random() * 8, -4.0 + random() * 8,
    -4.0 + random() * 8, -4.0 + random() * 8,
    25.0, 25.0,
    'LOG-' || LPAD(((m.idx * 10000 + x)::TEXT), 7, '0')
FROM generate_series(1, 60) AS x,
(VALUES (1, 'LDI-C-01'), (3, 'EXPOSURE LDI-2B'), (4, 'EXPOSURE LDI-2'),
         (5, 'LDI002-LD1'), (7, 'LDIA-01'), (9, 'LDIA3-SM-LDI1')
) AS m(idx, name);

-- 4. THERMAL DRIFT MACHINES (2): temp 22→25.5°C, PE drifts toward ±25µm
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
    '3', 'SM', m.name,
    'MO-' || LPAD(((m.idx * 100 + x) % 9999)::TEXT, 4, '0'),
    'FPN-' || LPAD(m.idx::TEXT, 3, '0'), 'Inner Layer',
    480.0 + random() * 5, 1.0005 + random() * 0.001, 1.0008 + random() * 0.001,
    22.0 + ((60.0 - x) / 60.0 * 3.5) + (random() * 0.2 - 0.1),
    54.0 + random() * 2.0, 330.0 + random() * 10,
    -90.0 + random() * 4 - 2, 1.08 + random() * 0.06,
    (x % 20) + 1, 20, 9.0 + random() * 1.0,
    'FLM-' || LPAD(m.idx::TEXT, 3, '0'),
    'BD-' || LPAD(((x % 20) + 1)::TEXT, 2, '0'),
    'PM-' || m.name, true, 'Normal',
    (-5.0 + (60.0 - x) / 60.0 * 25.0) + random() * 6,
    (-5.0 + (60.0 - x) / 60.0 * 22.0) + random() * 6,
    (-5.0 + (60.0 - x) / 60.0 * 28.0) + random() * 6,
    (-5.0 + (60.0 - x) / 60.0 * 24.0) + random() * 6,
    (-5.0 + (60.0 - x) / 60.0 * 26.0) + random() * 6,
    (-5.0 + (60.0 - x) / 60.0 * 23.0) + random() * 6,
    (-4.0 + (60.0 - x) / 60.0 * 20.0) + random() * 5,
    (-4.0 + (60.0 - x) / 60.0 * 18.0) + random() * 5,
    (-4.0 + (60.0 - x) / 60.0 * 22.0) + random() * 5,
    (-4.0 + (60.0 - x) / 60.0 * 19.0) + random() * 5,
    25.0, 25.0,
    'LOG-' || LPAD(((m.idx * 10000 + x)::TEXT), 7, '0')
FROM generate_series(1, 60) AS x,
(VALUES (2, 'LDI-C-02'), (10, 'LDIA3-SM-LDI2')) AS m(idx, name);

-- Correlated thermal drift alarms (temp > 24.5°C → x ≤ 17)
INSERT INTO public.ldi_alarm_log (logid, logdate, errorcode, errortime, equipmentid, factory, process)
SELECT 'ALG-' || LPAD(((m.idx * 10000 + x)::TEXT), 7, '0'),
    NOW() - (x * INTERVAL '1 minute'), '0202',
    (NOW() - (x * INTERVAL '1 minute'))::TEXT,
    m.name, '3', 'SM'
FROM generate_series(1, 17) AS x,
(VALUES (2, 'LDI-C-02'), (10, 'LDIA3-SM-LDI2')) AS m(idx, name);

-- 5. HUMIDITY SPIKE MACHINES (2): hum 55→66%, PE drifts
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
    '3', 'SM', m.name,
    'MO-' || LPAD(((m.idx * 100 + x) % 9999)::TEXT, 4, '0'),
    'FPN-' || LPAD(m.idx::TEXT, 3, '0'), 'Solder Mask',
    490.0 + random() * 5, 1.0002 + random() * 0.001, 1.0003 + random() * 0.001,
    22.5 + random() * 0.5,
    55.0 + ((60.0 - x) / 60.0 * 11.0) + (random() * 1.0 - 0.5),
    340.0 + random() * 10, -88.0 + random() * 6 - 3, 1.10 + random() * 0.05,
    (x % 18) + 1, 18, 11.0 + random() * 1.0,
    'FLM-' || LPAD(m.idx::TEXT, 3, '0'),
    'BD-' || LPAD(((x % 18) + 1)::TEXT, 2, '0'),
    'PM-' || m.name, true, 'Normal',
    (-5.0 + (60.0 - x) / 60.0 * 18.0) + random() * 6,
    (-5.0 + (60.0 - x) / 60.0 * 16.0) + random() * 6,
    (-5.0 + (60.0 - x) / 60.0 * 20.0) + random() * 6,
    (-5.0 + (60.0 - x) / 60.0 * 17.0) + random() * 6,
    (-5.0 + (60.0 - x) / 60.0 * 19.0) + random() * 6,
    (-5.0 + (60.0 - x) / 60.0 * 15.0) + random() * 6,
    (-4.0 + (60.0 - x) / 60.0 * 14.0) + random() * 5,
    (-4.0 + (60.0 - x) / 60.0 * 12.0) + random() * 5,
    (-4.0 + (60.0 - x) / 60.0 * 16.0) + random() * 5,
    (-4.0 + (60.0 - x) / 60.0 * 13.0) + random() * 5,
    25.0, 25.0,
    'LOG-' || LPAD(((m.idx * 10000 + x)::TEXT), 7, '0')
FROM generate_series(1, 60) AS x,
(VALUES (6, 'LDI002-LD2'), (8, 'LDIA-02')) AS m(idx, name);

-- Correlated humidity spike alarms (hum > 62% → x ≤ 21)
INSERT INTO public.ldi_alarm_log (logid, logdate, errorcode, errortime, equipmentid, factory, process)
SELECT 'ALG-' || LPAD(((m.idx * 10000 + x)::TEXT), 7, '0'),
    NOW() - (x * INTERVAL '1 minute'), '0303',
    (NOW() - (x * INTERVAL '1 minute'))::TEXT,
    m.name, '3', 'SM'
FROM generate_series(1, 21) AS x,
(VALUES (6, 'LDI002-LD2'), (8, 'LDIA-02')) AS m(idx, name);

-- 6. VERIFICATION
SELECT eqp_id, COUNT(*) AS rows,
  ROUND(AVG(temperature)::NUMERIC, 2) AS avg_temp,
  ROUND(MAX(ABS(pe_1))::NUMERIC, 1) AS max_abs_pe,
  (SELECT COUNT(*) FROM public.ldi_alarm_log al WHERE al.equipmentid = d.eqp_id) AS alarms
FROM public.ldi_data d GROUP BY eqp_id ORDER BY eqp_id;
