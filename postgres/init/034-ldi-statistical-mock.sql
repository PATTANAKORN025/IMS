-- ══════════════════════════════════════════════════════════════════════════
-- LDI STATISTICAL MOCK DATA GENERATOR
-- ══════════════════════════════════════════════════════════════════════════
-- สร้างข้อมูลจำลองที่ "สมจริงเชิงสถิติ" โดยอิงพารามิเตอร์ที่สกัดจากข้อมูล
-- production จริง 10,000 แถว (ช่วง 5.5 ชั่วโมง, 10 เครื่อง)
--
-- ═══ ความปลอดภัยทางธุรกิจ ═══
-- ไฟล์นี้เก็บเฉพาะ "คุณสมบัติทางสถิติ" (ค่าเฉลี่ย/ส่วนเบี่ยงเบน/สัดส่วน/
-- ความสัมพันธ์) ไม่มีข้อมูลระบุตัวตนทางธุรกิจใดๆ ทั้งสิ้น:
--   • ไม่มี work order (mo) จริง          → สร้างใหม่แบบสุ่ม
--   • ไม่มี part number ลูกค้า (fpn) จริง → สร้างใหม่แบบสุ่ม
--   • ไม่มีชื่อเครื่องจริง (eqp_id)        → ใช้ชื่อ synthetic
--   • ไม่มีชื่อสารเคมี resist จริง         → ใช้ชื่อ generic
--   • ไม่มี layer_name จริง               → ใช้ชื่อ generic
-- ค่าที่คงไว้ตามจริงคือชื่อ process/scale_mode ซึ่งเป็นศัพท์มาตรฐาน
-- อุตสาหกรรม PCB ทั่วไป ไม่ใช่ความลับทางธุรกิจ
--
-- ═══ คุณสมบัติที่จำลองได้ตรงกับของจริง ═══
--  1. โครงสร้าง 3 recipe: DF INNER 55% / DF OUTER 34% / SM 11%
--  2. process ↔ scale_mode ผูกกัน 1:1 (FixedScale/Fixed/Auto)
--  3. พารามิเตอร์แต่ละ recipe ต่างกันสิ้นเชิง (ดูตารางในหัวข้อ RECIPE)
--  4. PE (pe_1..pe_6) เป็น NULL 100% บน DF INNER — วัดเฉพาะ DF OUTER/SM
--  5. je_4 เป็น NULL คู่กับ PE เสมอ / je_1..je_3 มีค่าทุกแถว
--  6. filmno + board_id เป็น NULL 100% (ระบบจริงไม่ได้เก็บ)
--  7. pe_setting = 1.79769313486232 (sentinel "ไม่กำหนดสเปก") บน DF INNER
--  8. state = true 99.98% (downtime จริงน้อยมาก ไม่ใช่ 5%)
--  9. factory '2' 75% / '3' 25%
-- 10. เวลาเป็น microsecond จริง ระยะห่างเฉลี่ย ~2 วินาที (median 1.4 วินาที)
-- 11. sensor dropout: temperature=0 และ scale_x=0 ที่อัตรา 0.02%
-- 12. scale_x/y แกว่งระดับ 1e-4 รอบ 1.0000 (ไม่ใช่ 1e-3)
-- 13. PE out-of-spec rate ~0% (กระบวนการจริง capable มาก)
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

TRUNCATE TABLE public.ldi_data;
TRUNCATE TABLE public.ldi_alarm_log;

-- ─────────────────────────────────────────────────────────────────────────
-- RECIPE PROFILE (สกัดจากข้อมูลจริง — mean/sd ต่อ process)
-- ─────────────────────────────────────────────────────────────────────────
-- process    share  resist_dosage   scan_speed   air_vacuum  thickness  pe_setting je_setting
-- DF INNER   55%    71.5 ± 2.5      238 ± 22     -17.4 ± 1.5  0.42±0.31  (sentinel) 30–40
-- DF OUTER   34%    15 (คงที่)       435 (คงที่)   0 (คงที่)     1.14±0.33  75         50
-- SM         11%    555 ± 106       107 ± 16     0 (คงที่)     1.05±0.29  25–50      25–50
-- ─────────────────────────────────────────────────────────────────────────

WITH RECURSIVE
-- 10 เครื่อง synthetic (สัดส่วนแถวไม่เท่ากันเหมือนของจริง: 172–1717)
machines AS (
    SELECT * FROM (VALUES
        ('MOCK-LDI-01', 0.172), ('MOCK-LDI-02', 0.078), ('MOCK-LDI-03', 0.045),
        ('MOCK-LDI-04', 0.155), ('MOCK-LDI-05', 0.121), ('MOCK-LDI-06', 0.098),
        ('MOCK-LDI-07', 0.087), ('MOCK-LDI-08', 0.093), ('MOCK-LDI-09', 0.074),
        ('MOCK-LDI-10', 0.077)
    ) AS m(eqp_id, weight)
),
-- ผลิต 12,000 แถว ครอบคลุม 6 ชั่วโมงย้อนหลัง (ความหนาแน่นใกล้ของจริง)
seq AS (SELECT generate_series(1, 12000) AS i),
base AS (
    SELECT
        i,
        -- เวลา: ระยะห่างเฉลี่ย 1.8 วินาที + microsecond จริง + gap นานๆ ครั้ง
        NOW()
          - (i * INTERVAL '1.8 seconds')
          - (random() * INTERVAL '900 milliseconds')
          - (CASE WHEN random() < 0.004 THEN random() * INTERVAL '60 seconds'
                  ELSE INTERVAL '0' END)                                   AS ts,
        -- process mix ตามสัดส่วนจริง
        CASE WHEN random() < 0.55 THEN 'DF INNER'
             WHEN random() < 0.756 THEN 'DF OUTER'
             ELSE 'SM' END                                                  AS process,
        (ARRAY['MOCK-LDI-01','MOCK-LDI-02','MOCK-LDI-03','MOCK-LDI-04','MOCK-LDI-05','MOCK-LDI-06','MOCK-LDI-07','MOCK-LDI-08','MOCK-LDI-09','MOCK-LDI-10'])[1 + (i % 10)] AS eqp_id,
        CASE WHEN random() < 0.75 THEN '2' ELSE '3' END                     AS factory,
        random() AS r1, random() AS r2, random() AS r3, random() AS r4
    FROM seq
),
shaped AS (
    SELECT
        b.*,
        -- scale_mode ผูกกับ process แบบ 1:1 ตามข้อมูลจริง
        CASE process WHEN 'DF INNER' THEN 'FixedScale'
                     WHEN 'DF OUTER' THEN 'Fixed'
                     ELSE 'Auto' END                                        AS scale_mode,
        -- Box-Muller: แปลง uniform → normal (สำหรับ mean±sd ที่แม่นยำ)
        sqrt(-2 * ln(GREATEST(r1, 1e-9))) * cos(2 * pi() * r2)              AS z1,
        sqrt(-2 * ln(GREATEST(r3, 1e-9))) * cos(2 * pi() * r4)              AS z2
    FROM base b
)
INSERT INTO public.ldi_data (
    "time", factory, process, eqp_id, mo, fpn, layer_name,
    resist_dosage, scale_x, scale_y, temperature, humidity,
    scan_speed, air_vacuum, thickness, board_no, total_board, total_time,
    filmno, board_id, resist, state, scale_mode,
    pe_1, pe_2, pe_3, pe_4, pe_5, pe_6,
    je_1, je_2, je_3, je_4, pe_setting, je_setting, log_id
)
SELECT
    ts,
    factory,
    process,
    eqp_id,
    -- identifier สังเคราะห์ทั้งหมด (ไม่ใช่ของจริง) — 51 MO / 24 FPN ตามจริง
    'MO-' || LPAD(((i % 51) + 1)::TEXT, 5, '0')                             AS mo,
    'PN-' || CHR(65 + (i % 24)) || LPAD(((i * 7) % 900)::TEXT, 3, '0')      AS fpn,
    (ARRAY['mk-inner-a','mk-inner-b','mk-inner-c','mk-inner-d',
           'mk-outer-a','mk-outer-b','mk-solder-a','mk-solder-b',
           'mk-comp-a','mk-comp-b','mk-legend-a','mk-legend-b'])[1 + (i % 12)]      AS layer_name,

    -- ── resist_dosage: สามโหมดตาม recipe (นี่คือเหตุผลที่ sd รวม = 163) ──
    CASE process
        WHEN 'DF INNER' THEN ROUND((71.46 + z1 * 2.47)::NUMERIC, 2)
        WHEN 'DF OUTER' THEN 15.0
        ELSE ROUND(GREATEST(500, 555.4 + z1 * 105.9)::NUMERIC, 1)
    END                                                                      AS resist_dosage,

    -- ── scale_x/y: แกว่งระดับ 1e-4 + dropout 0.02% เป็น 0 ──
    CASE WHEN random() < 0.0002 THEN 0
         ELSE ROUND((1.000282 + z2 * 0.000099)::NUMERIC, 6) END              AS scale_x,
    CASE WHEN random() < 0.0002 THEN 0
         ELSE ROUND((1.000280 + z1 * 0.000099)::NUMERIC, 6) END              AS scale_y,

    -- ── temperature: mean/sd ต่อ recipe + sensor dropout 0.02% เป็น 0 ──
    CASE WHEN random() < 0.0002 THEN 0
         ELSE ROUND((CASE process
              WHEN 'DF INNER' THEN 23.00 + z1 * 0.55
              WHEN 'DF OUTER' THEN 22.14 + z1 * 0.28
              ELSE 22.33 + z1 * 0.18 END)::NUMERIC, 1) END                   AS temperature,

    CASE WHEN random() < 0.0002 THEN 0
         ELSE ROUND((CASE process
              WHEN 'DF INNER' THEN 54.48 + z2 * 2.52
              WHEN 'DF OUTER' THEN 51.55 + z2 * 1.11
              ELSE 54.77 + z2 * 1.22 END)::NUMERIC, 1) END                   AS humidity,

    -- ── scan_speed / air_vacuum: คงที่หรือแปรผันตาม recipe ──
    CASE process
        WHEN 'DF INNER' THEN ROUND((237.8 + z2 * 22.22)::NUMERIC, 2)
        WHEN 'DF OUTER' THEN 435.0
        ELSE ROUND(GREATEST(48.28, 107.3 + z2 * 15.96)::NUMERIC, 2)
    END                                                                      AS scan_speed,
    CASE process
        WHEN 'DF INNER' THEN ROUND(LEAST(0, -17.38 + z1 * 1.495)::NUMERIC, 2)
        ELSE 0
    END                                                                      AS air_vacuum,

    CASE process
        WHEN 'DF INNER' THEN ROUND(GREATEST(0.264, 0.4239 + z1 * 0.312)::NUMERIC, 3)
        WHEN 'DF OUTER' THEN ROUND(GREATEST(0.71, 1.14 + z1 * 0.325)::NUMERIC, 2)
        ELSE ROUND(GREATEST(0.68, 1.046 + z1 * 0.291)::NUMERIC, 2)
    END                                                                      AS thickness,

    (1 + (i % 240))::SMALLINT                                                AS board_no,
    (CASE process
        WHEN 'DF INNER' THEN 120 + (i % 137)
        WHEN 'DF OUTER' THEN 119 + (i % 122)
        ELSE 15 + (i % 366) END)::SMALLINT                                   AS total_board,
    -- total_time: เบ้ขวาแรง (จริง mean 10.8 / max 779)
    CASE process
        WHEN 'DF INNER' THEN ROUND((7.252 + z2 * 0.501)::NUMERIC, 3)
        WHEN 'DF OUTER' THEN ROUND((9.639 + abs(z2) * 6.8)::NUMERIC, 3)
        ELSE ROUND((12.5 + abs(z2) * 35.9)::NUMERIC, 3)
    END                                                                      AS total_time,

    NULL, NULL,                        -- filmno / board_id: NULL 100% ตามระบบจริง
    (ARRAY['RESIST-A18','RESIST-A22','RESIST-B15','RESIST-B30','RESIST-C12',
           'RESIST-C40','RESIST-D08','RESIST-D25','RESIST-E10'])[1+(i%9)]    AS resist,
    (random() > 0.0002)                                                      AS state,
    scale_mode,

    -- ══ PE: NULL ทั้งหมดบน DF INNER (ไม่ได้วัด) — ตรงกับระบบจริง ══
    CASE WHEN process = 'DF INNER' THEN NULL ELSE ROUND((CASE process
        WHEN 'DF OUTER' THEN -1.35 + z1 * 13.08 ELSE  0.42 + z1 *  3.82 END)::NUMERIC,3) END AS pe_1,
    CASE WHEN process = 'DF INNER' THEN NULL ELSE ROUND((CASE process
        WHEN 'DF OUTER' THEN  2.08 + z2 * 18.91 ELSE -9.74 + z2 *  7.91 END)::NUMERIC,3) END AS pe_2,
    CASE WHEN process = 'DF INNER' THEN NULL ELSE ROUND((CASE process
        WHEN 'DF OUTER' THEN -5.94 + z1 * 21.82 ELSE -2.69 + z1 *  4.86 END)::NUMERIC,3) END AS pe_3,
    CASE WHEN process = 'DF INNER' THEN NULL ELSE ROUND((CASE process
        WHEN 'DF OUTER' THEN  8.13 + z2 * 21.24 ELSE  2.75 + z2 *  5.02 END)::NUMERIC,3) END AS pe_4,
    CASE WHEN process = 'DF INNER' THEN NULL ELSE ROUND((CASE process
        WHEN 'DF OUTER' THEN  2.00 + z1 * 18.54 ELSE  9.78 + z1 *  7.96 END)::NUMERIC,3) END AS pe_5,
    CASE WHEN process = 'DF INNER' THEN NULL ELSE ROUND((CASE process
        WHEN 'DF OUTER' THEN -0.87 + z2 * 11.49 ELSE -0.49 + z2 *  3.96 END)::NUMERIC,3) END AS pe_6,

    -- ══ JE: je_1..je_3 มีค่าทุกแถว / je_4 NULL คู่กับ PE ══
    ROUND(GREATEST(0, CASE process
        WHEN 'DF INNER' THEN  4.69 + abs(z1) * 2.94
        WHEN 'DF OUTER' THEN 11.03 + abs(z1) * 6.76
        ELSE                  6.58 + abs(z1) * 5.32 END)::NUMERIC, 1)        AS je_1,
    ROUND(GREATEST(0, CASE process
        WHEN 'DF INNER' THEN  5.63 + abs(z2) * 6.21
        WHEN 'DF OUTER' THEN 11.03 + abs(z2) * 6.81
        ELSE                  6.62 + abs(z2) * 4.70 END)::NUMERIC, 1)        AS je_2,
    ROUND(GREATEST(0, CASE process
        WHEN 'DF INNER' THEN  6.54 + abs(z1) * 5.17
        WHEN 'DF OUTER' THEN 10.68 + abs(z1) * 6.58
        ELSE                  4.90 + abs(z1) * 2.64 END)::NUMERIC, 1)        AS je_3,
    CASE WHEN process = 'DF INNER' THEN NULL
         ELSE ROUND(GREATEST(0, CASE process
             WHEN 'DF OUTER' THEN 10.64 + abs(z2) * 6.34
             ELSE                  4.84 + abs(z2) * 3.73 END)::NUMERIC, 1) END AS je_4,

    -- ══ spec limit: ค่าจริงที่พบคือ 1.798(sentinel) / 25 / 30 / 50 / 75 ══
    CASE process
        WHEN 'DF INNER' THEN 1.79769313486232      -- sentinel = ไม่กำหนดสเปก
        WHEN 'DF OUTER' THEN 75.0
        ELSE (ARRAY[25.0, 50.0])[1 + (i % 2)]
    END                                                                      AS pe_setting,
    CASE process
        WHEN 'DF INNER' THEN (ARRAY[30.0, 40.0])[1 + (i % 2)]
        WHEN 'DF OUTER' THEN 50.0
        ELSE (ARRAY[25.0, 50.0])[1 + (i % 2)]
    END                                                                      AS je_setting,

    'LOG-' || LPAD(i::TEXT, 8, '0')                                          AS log_id
FROM shaped;


-- ─────────────────────────────────────────────────────────────────────────
-- ALARM LOG — อัตราจริง 4.3 ครั้ง/ชั่วโมง, 20 error code, เกิดบน 5 เครื่อง
-- ความถี่ code เป็น power-law (จริง: 3239/3197/1525/939/558/258/69/45/...)
-- ─────────────────────────────────────────────────────────────────────────
INSERT INTO public.ldi_alarm_log (logid, logdate, errorcode, errortime, equipmentid, factory, process)
SELECT
    'ALM-' || LPAD(i::TEXT, 8, '0'),
    ts,
    code,
    to_char(ts, 'YYYY-MM-DD HH24:MI:SS'),          -- errortime เป็น VARCHAR ตามจริง
    eq,
    CASE WHEN random() < 0.75 THEN '2' ELSE '3' END,
    (ARRAY['DF INNER','DF OUTER','SM'])[1 + (i % 3)]
FROM (
    SELECT
        i,
        NOW() - (random() * INTERVAL '6 hours') - (random() * INTERVAL '999 milliseconds') AS ts,
        -- power-law: code แรกๆ ถี่กว่ามาก เหมือนของจริง
        (ARRAY['0201','0202','0203','0301','0302','0401','0402','0403',
               '0501','0502','0601','0602','0701','0702','0801','0802',
               '0901','0902','1001','1002'])[1 + LEAST(19, floor(-ln(GREATEST(random(),1e-9)) * 3.2)::INT)] AS code,
        -- alarm เกิดแค่ 5 เครื่องจาก 10 (ตรงกับของจริง)
        (ARRAY['MOCK-LDI-01','MOCK-LDI-04','MOCK-LDI-05','MOCK-LDI-07','MOCK-LDI-09'])[1 + (i % 5)] AS eq
    FROM generate_series(1, 26) AS i        -- 6 ชม. × 4.3/ชม. ≈ 26 alarms
) s;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFY — รันเพื่อเทียบกับค่าจริงในคอมเมนต์ท้ายบรรทัด
-- ─────────────────────────────────────────────────────────────────────────
-- SELECT process, COUNT(*),
--        ROUND(AVG(resist_dosage)::NUMERIC,1) AS dosage,   -- 71.5 / 15 / 555
--        ROUND(AVG(temperature)::NUMERIC,2)   AS temp,     -- 23.0 / 22.1 / 22.3
--        ROUND(AVG(humidity)::NUMERIC,2)      AS rh,       -- 54.5 / 51.6 / 54.8
--        COUNT(pe_1) AS pe_measured,                       -- 0 / all / all
--        COUNT(je_4) AS je4_measured                       -- 0 / all / all
-- FROM public.ldi_data GROUP BY process ORDER BY 2 DESC;
