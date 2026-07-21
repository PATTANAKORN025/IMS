-- ══════════════════════════════════════════════════════════════
-- LDI Complete Schema Rebuild + 10-Machine Correlated Data
-- Drop → Recreate → Inject. Single-script execution.
-- ══════════════════════════════════════════════════════════════

-- ══════════════════════════════════════════════════════════════
-- STEP 1: DROP EXISTING TABLES
-- ══════════════════════════════════════════════════════════════
DROP TABLE IF EXISTS public.ldi_data CASCADE;
DROP TABLE IF EXISTS public.ldi_alarm_log CASCADE;
DROP TABLE IF EXISTS public.ldi_alarm_ms_code CASCADE;

-- ══════════════════════════════════════════════════════════════
-- STEP 2: RECREATE PRODUCTION SCHEMAS (Exact DDL)
-- ══════════════════════════════════════════════════════════════

-- 2a. ldi_alarm_ms_code (reference table, no hypertable)
CREATE TABLE IF NOT EXISTS public.ldi_alarm_ms_code (
    alarm_id    VARCHAR(15) NOT NULL,
    alarm_type  VARCHAR(50),
    alarm_code  VARCHAR(50),
    alarm_msg   VARCHAR(500),
    alarm_detail VARCHAR(500),
    CONSTRAINT ldi_alarm_ms_code_pkey PRIMARY KEY (alarm_id)
);

GRANT SELECT ON public.ldi_alarm_ms_code TO grafana_reader;

-- 2b. ldi_data (TimescaleDB hypertable, partitioned by "time")
CREATE TABLE IF NOT EXISTS public.ldi_data (
    "time"          TIMESTAMPTZ     NOT NULL,
    factory         VARCHAR(10)     NOT NULL,
    process         VARCHAR(250)    NOT NULL,
    eqp_id          VARCHAR(250)    NOT NULL,
    mo              VARCHAR(50)     NOT NULL,
    fpn             VARCHAR(50)     NOT NULL,
    layer_name      VARCHAR(250)    NOT NULL,
    resist_dosage   DOUBLE PRECISION,
    scale_x         DOUBLE PRECISION,
    scale_y         DOUBLE PRECISION,
    temperature     DOUBLE PRECISION,
    humidity        DOUBLE PRECISION,
    scan_speed      DOUBLE PRECISION,
    air_vacuum      DOUBLE PRECISION,
    thickness       DOUBLE PRECISION,
    board_no        SMALLINT,
    total_board     SMALLINT,
    total_time      DOUBLE PRECISION,
    filmno          VARCHAR(250),
    board_id        VARCHAR(250),
    resist          VARCHAR(250),
    state           BOOLEAN,
    scale_mode      VARCHAR(250),
    pe_1            DOUBLE PRECISION,
    pe_2            DOUBLE PRECISION,
    pe_3            DOUBLE PRECISION,
    pe_4            DOUBLE PRECISION,
    pe_5            DOUBLE PRECISION,
    pe_6            DOUBLE PRECISION,
    je_1            DOUBLE PRECISION,
    je_2            DOUBLE PRECISION,
    je_3            DOUBLE PRECISION,
    je_4            DOUBLE PRECISION,
    pe_setting      DOUBLE PRECISION,
    je_setting      DOUBLE PRECISION,
    log_id          VARCHAR(50)     NOT NULL
);

SELECT create_hypertable('public.ldi_data', 'time',
    chunk_time_interval => INTERVAL '1 day',
    if_not_exists => TRUE);

-- Unique index matching production: (log_id, time DESC)
CREATE UNIQUE INDEX IF NOT EXISTS idx_logid
    ON public.ldi_data (log_id ASC NULLS LAST, "time" DESC NULLS FIRST);

-- Time index matching production
CREATE INDEX IF NOT EXISTS ldi_data_time_idx
    ON public.ldi_data ("time" DESC NULLS FIRST);

-- Eqipment index for dashboard queries
CREATE INDEX IF NOT EXISTS idx_ldi_data_eqp_time
    ON public.ldi_data (eqp_id, "time" DESC);

GRANT SELECT ON public.ldi_data TO grafana_reader;

-- 2c. ldi_alarm_log (TimescaleDB hypertable, partitioned by logdate)
CREATE TABLE IF NOT EXISTS public.ldi_alarm_log (
    logid       VARCHAR(50)     NOT NULL,
    logdate     TIMESTAMPTZ     NOT NULL,
    errorcode   VARCHAR(50),
    errortime   VARCHAR(50),
    equipmentid VARCHAR(50),
    factory     VARCHAR(1),
    process     VARCHAR(50),
    CONSTRAINT pk_ldi_alarm_data PRIMARY KEY (logdate, logid)
);

SELECT create_hypertable('public.ldi_alarm_log', 'logdate',
    chunk_time_interval => INTERVAL '7 days',
    if_not_exists => TRUE);

-- Indexes matching production
CREATE INDEX IF NOT EXISTS idx_ldi_alarm_logid
    ON public.ldi_alarm_log (logid ASC NULLS LAST);

CREATE INDEX IF NOT EXISTS ldi_alarm_log_logdate_idx
    ON public.ldi_alarm_log (logdate DESC NULLS FIRST);

GRANT SELECT ON public.ldi_alarm_log TO grafana_reader;

-- ══════════════════════════════════════════════════════════════
-- STEP 3: INJECT CORRELATED 10-MACHINE MOCK DATA
-- ══════════════════════════════════════════════════════════════

-- 3a. Alarm Master Codes
INSERT INTO public.ldi_alarm_ms_code (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail)
VALUES
  ('A001', 'Critical', '0101', 'Laser Module Sync Error', 'Loss of communication with laser module'),
  ('A002', 'Warning',  '0202', 'Temperature Drift Detected', 'Cleanroom temperature exceeding safe band'),
  ('A003', 'Warning',  '0303', 'Humidity Spike Detected', 'Cleanroom RH exceeding safe band');

-- 3b. HEALTHY MACHINES (6): stable in green zone
-- PE/JE in µm: ±5 range (well within ±25 tolerance)
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
    (ARRAY['Top Copper', 'Bottom Copper', 'Solder Mask'])[floor(random() * 3 + 1)::int],
    120.0 + random() * 10,
    1.0000 + (random() * 0.001 - 0.0005),
    1.0000 + (random() * 0.001 - 0.0005),
    22.0 + (random() * 0.5),
    50.0 + (random() * 10.0),
    350.0 + random() * 10,
    -95.0 + random() * 2 - 1,
    1.05 + random() * 0.1,
    (x % 25) + 1, 25,
    7.0 + random() * 1.0,
    'FLM-' || LPAD(m.idx::TEXT, 3, '0'),
    'BD-' || LPAD(((x % 25) + 1)::TEXT, 2, '0'),
    'PM-' || m.name,
    true, 'Normal',
    -5.0 + random() * 10, -5.0 + random() * 10,
    -5.0 + random() * 10, -5.0 + random() * 10,
    -5.0 + random() * 10, -5.0 + random() * 10,
    -4.0 + random() * 8, -4.0 + random() * 8,
    -4.0 + random() * 8, -4.0 + random() * 8,
    25.0, 25.0,
    'LOG-' || LPAD(((m.idx * 10000 + x)::TEXT), 7, '0')
FROM generate_series(1, 60) AS x,
(VALUES
    (1, 'LDI-C-01'), (3, 'EXPOSURE LDI-2B'), (4, 'EXPOSURE LDI-2'),
    (5, 'LDI002-LD1'), (7, 'LDIA-01'), (9, 'LDIA3-SM-LDI1')
) AS m(idx, name);

-- 3c. THERMAL DRIFT MACHINES (2): temp 22→25.5°C, PE drifts
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

-- Thermal drift alarms (temp > 24.5°C → x ≤ 17)
INSERT INTO public.ldi_alarm_log (logid, logdate, errorcode, errortime, equipmentid, factory, process)
SELECT
    'ALG-' || LPAD(((m.idx * 10000 + x)::TEXT), 7, '0'),
    NOW() - (x * INTERVAL '1 minute'),
    '0202',
    (NOW() - (x * INTERVAL '1 minute'))::TEXT,
    m.name, '3', 'SM'
FROM generate_series(1, 17) AS x,
(VALUES (2, 'LDI-C-02'), (10, 'LDIA3-SM-LDI2')) AS m(idx, name);

-- 3d. HUMIDITY SPIKE MACHINES (2): hum 55→66%, PE drifts
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

-- Humidity spike alarms (hum > 62% → x ≤ 21)
INSERT INTO public.ldi_alarm_log (logid, logdate, errorcode, errortime, equipmentid, factory, process)
SELECT
    'ALG-' || LPAD(((m.idx * 10000 + x)::TEXT), 7, '0'),
    NOW() - (x * INTERVAL '1 minute'),
    '0303',
    (NOW() - (x * INTERVAL '1 minute'))::TEXT,
    m.name, '3', 'SM'
FROM generate_series(1, 21) AS x,
(VALUES (6, 'LDI002-LD2'), (8, 'LDIA-02')) AS m(idx, name);

-- ══════════════════════════════════════════════════════════════
-- VERIFICATION
-- ══════════════════════════════════════════════════════════════
SELECT '=== SCHEMA CHECK ===' AS status;
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_name LIKE 'ldi_%'
ORDER BY table_name;

SELECT '' AS blank;
SELECT '=== DATA SUMMARY ===' AS status;
SELECT 'ldi_data' AS tbl, COUNT(*) AS rows FROM public.ldi_data
UNION ALL SELECT 'ldi_alarm_log', COUNT(*) FROM public.ldi_alarm_log
UNION ALL SELECT 'ldi_alarm_ms_code', COUNT(*) FROM public.ldi_alarm_ms_code;

SELECT '' AS blank;
SELECT '=== MACHINE PROFILES ===' AS status;
SELECT eqp_id, COUNT(*) AS rows,
  ROUND(AVG(temperature)::NUMERIC, 2) AS avg_temp,
  ROUND(MAX(ABS(pe_1))::NUMERIC, 1) AS max_abs_pe1,
  ROUND(AVG(ABS(pe_1))::NUMERIC, 1) AS avg_abs_pe1,
  (SELECT COUNT(*) FROM public.ldi_alarm_log al WHERE al.equipmentid = d.eqp_id) AS alarms
FROM public.ldi_data d
GROUP BY eqp_id ORDER BY eqp_id;

SELECT '' AS blank;
SELECT '=== COLUMN TYPES CHECK ===' AS status;
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'ldi_data'
  AND column_name IN ('resist', 'log_id', 'eqp_id')
ORDER BY ordinal_position;
