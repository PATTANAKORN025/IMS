-- ══════════════════════════════════════════════════════════════════════════
-- LDI ALARM MASTER — Mock Seed (ปลอดภัยต่อทรัพย์สินทางปัญญาของผู้ผลิต)
-- ══════════════════════════════════════════════════════════════════════════
-- แนวคิดด้านความปลอดภัย:
--   • เอกสารรหัส alarm ของผู้ผลิตมี 1,820 รายการ — ไฟล์นี้ "ไม่" คัดลอกมาทั้งหมด
--   • ใช้เฉพาะรหัสที่ simulator (nodered_data/flows.json, almsim_gen) สร้างขึ้นจริง
--     ครอบคลุม 100% ของรหัสที่ dashboard จะพบเจอในโหมด mock โดยไม่ต้อง
--     เผยแพร่แคตตาล็อกของผู้ผลิต
--   • ข้อความ alarm_msg/alarm_detail เขียนขึ้นใหม่เป็นคำอธิบายเชิงหน้าที่
--     (functional description) ไม่ใช่การคัดลอกข้อความจากเอกสารผู้ผลิต
--   • ตัวรหัสเป็นเพียงตัวเลขระบุเหตุการณ์ ไม่ใช่ความลับทางธุรกิจ
--
-- schema ตรงกับ production 100% (severity เพิ่มโดย migration 061, ALTER
-- TABLE ... ADD COLUMN IF NOT EXISTS ที่นั่นครอบคลุมกรณีนี้แล้ว)
--
-- Mock↔real switch (2026-08-07): re-synced against the LIVE simulator.
-- Migration 100 (nodered_data/flows.json) swapped almsim_gen's noise-pool
-- codes 91012/91017/91020/91024/93007/91029/97014/20/20021/2 (invented for
-- early prototyping, never in the real vendor list) 1:1 for real generic-
-- fault codes the real machines actually use -- but never came back to
-- update this file, so scripts/switch-data-mode.sh mock would have left 10
-- of the simulator's 19 codes unresolvable via v_ldi_alarm_context (no
-- Alarm Master row -> no message/severity). This version has exactly the
-- 19 codes almsim_gen can currently emit (NOISE_CUM + ALIGN_CODES +
-- condition-driven literals '91008'/'70004'/'91009') -- 9 carried over
-- unchanged, 10 new ones added with fresh functional descriptions (their
-- real vendor text, e.g. "Failed to connect to PLC", is itself already a
-- generic technical phrase, not proprietary content, but detail text below
-- is still an independent rewrite per this file's stated policy).
--
-- LDI Alarm Fidelity Audit fix #8 (2026-08-11): 2 more codes added --
-- '01180016'/'0C020014', both real Critical-severity vendor codes, fired
-- by almsim_gen's new RARE_CRITICAL branch. 21 codes total as of this
-- revision.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

TRUNCATE TABLE public.ldi_alarm_ms_code;

INSERT INTO public.ldi_alarm_ms_code (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail) VALUES
-- ── กลุ่ม 9xxxx: Process / Quality (รหัสที่เครื่องจริงใช้บ่อยที่สุด) ──────
('91009','W','91009','Vacuum pressure out of control range',
 'แรงดันสุญญากาศบนโต๊ะดูดแผ่นหลุดออกนอกช่วงที่ตั้งไว้ ตรวจสอบคอลัมน์ air_vacuum'),
('90005','W','90005','Registration error (PE/JE) out of tolerance',
 'ค่าความคลาดเคลื่อนของตำแหน่ง PE หรือ JE เกินสเปกที่ตั้งไว้ ตรวจสอบ pe_1..pe_6 / je_1..je_4'),
('90004','W','90004','Outer layer alignment to grip point failed',
 'การจัดตำแหน่งชั้นนอกกับจุดจับยึดล้มเหลว มักสัมพันธ์กับ scale_x/scale_y และค่า PE'),
('93004','W','93004','Calibration cycle exception',
 'รอบการสอบเทียบไม่สมบูรณ์หรือไม่ได้เริ่มตามกำหนด'),
('90001','W','90001','Inner layer alignment to grip point failed',
 'การจัดตำแหน่งชั้นในกับจุดจับยึดล้มเหลว ตรวจสอบค่า PE ของชั้นใน'),
('90012','W','90012','Alignment failed and operator cancelled exposure',
 'ผู้ปฏิบัติงานยกเลิกการฉายแสงหลังการจัดตำแหน่งล้มเหลว'),
('91008','W','91008','Ambient temperature or humidity abnormal',
 'อุณหภูมิหรือความชื้นในห้องหลุดสเปก ตรวจสอบคอลัมน์ temperature (22±2°C) / humidity (55±5%)'),
-- ── กลุ่ม 7xxxx: Motion ────────────────────────────────────────────────
('70004','W','70004','Position-synchronised output overspeed',
 'ความเร็วสแกนเกินขีดจำกัดของระบบซิงค์ตำแหน่ง ตรวจสอบคอลัมน์ scan_speed'),
-- ── กลุ่ม 1xxxx: Optics ────────────────────────────────────────────────
('10006','A','10006','Failed to set imaging device to protection mode',
 'ตั้งค่าอุปกรณ์สร้างภาพเข้าสู่โหมดป้องกันไม่สำเร็จ'),
-- ── Camera / vision subsystem ────────────────────────────────────────
('01060009','A','01060009','Wrong camera serial number',
 'หมายเลขซีเรียลกล้องที่ตรวจพบไม่ตรงกับที่ตั้งค่าไว้ในระบบ'),
('0106000C','A','0106000C','Failed to stop camera',
 'สั่งหยุดการทำงานของกล้องไม่สำเร็จ'),
('0106001C','A','0106001C','Stop trigger wait signal timeout',
 'รอสัญญาณ trigger เพื่อหยุดการทำงานนานเกินกำหนด'),
-- ── Network / connectivity ────────────────────────────────────────────
('01060013','A','01060013','Found the same IP',
 'ตรวจพบ IP ซ้ำกันบนเครือข่ายกล้อง/อุปกรณ์ อาจเกิดจากการตั้งค่าเครือข่ายผิดพลาด'),
('92013','W','92013','Network connection timeout',
 'การเชื่อมต่อเครือข่ายหมดเวลา ตรวจสอบสถานะเครือข่ายของเครื่อง'),
-- ── Motor / PLC / general comms ──────────────────────────────────────
('010E0064','A','010E0064','Motor type undefined',
 'ยังไม่ได้กำหนดชนิดของมอเตอร์ในระบบ'),
('01100001','A','01100001','Failed to connect to PLC',
 'เชื่อมต่อกับ PLC ไม่สำเร็จ ตรวจสอบสายสัญญาณ/การตั้งค่าเครือข่ายกับ PLC'),
('01130002','A','01130002','Communication abnormality',
 'การสื่อสารระหว่างอุปกรณ์ผิดปกติ'),
-- ── Process / data pipeline ──────────────────────────────────────────
('80001','W','80001','Waiting for subdrawing preparation data timeout',
 'รอข้อมูลเตรียมภาพย่อย (subdrawing) นานเกินกำหนด'),
('97005','W','97005','Database connection exception',
 'การเชื่อมต่อฐานข้อมูลผิดปกติ'),
-- ── Critical (LDI Alarm Fidelity Audit fix #8, 2026-08-11): the mock
-- catalog previously had 0 Critical-severity codes, so the top of the
-- severity taxonomy was unreachable under normal simulation. These 2 are
-- real vendor codes (alarm_type/alarm_msg match migration 061's real
-- import verbatim -- both are already generic short technical phrases,
-- not proprietary text, per this file's stated IP policy), fired by
-- almsim_gen's RARE_CRITICAL branch at a low, independent rate. ──
('01180016','E','01180016','Emergency Stop',
 'มีการกดปุ่มหยุดฉุกเฉิน (E-Stop) เครื่องหยุดทำงานทันที ต้องตรวจสอบก่อนรีเซ็ต'),
('0C020014','A','0C020014','Safety sensor triggered',
 'เซนเซอร์นิรภัยถูกกระตุ้น มีวัตถุ/บุคคลเข้าใกล้พื้นที่อันตรายของเครื่อง ต้องตรวจสอบก่อนดำเนินการต่อ');

-- ══════════════════════════════════════════════════════════════════════════
-- VIEW: จับคู่ alarm กับ "คอลัมน์ที่ควรตรวจสอบ" ใน ldi_data
-- ══════════════════════════════════════════════════════════════════════════
-- ไม่แก้ schema ของ ldi_alarm_ms_code (ต้องตรงกับ production)
-- แต่เพิ่มชั้น mapping แยกไว้สำหรับ Root Cause Analysis โดยเฉพาะ
CREATE OR REPLACE VIEW public.v_ldi_alarm_category AS
SELECT alarm_code,
    CASE
        WHEN alarm_code IN ('91009')                       THEN 'VACUUM'
        WHEN alarm_code IN ('90005')                       THEN 'REGISTRATION'
        WHEN alarm_code IN ('90001','90004','90012')       THEN 'ALIGNMENT'
        WHEN alarm_code IN ('93004')                       THEN 'CALIBRATION'
        WHEN alarm_code IN ('91008')                       THEN 'ENVIRONMENT'
        WHEN alarm_code IN ('70004')                       THEN 'MOTION'
        WHEN alarm_code IN ('10006','01060009','0106000C','0106001C')
                                                            THEN 'CAMERA'
        WHEN alarm_code IN ('01060013','92013')            THEN 'NETWORK'
        WHEN alarm_code IN ('010E0064')                    THEN 'MOTOR'
        WHEN alarm_code IN ('01100001')                    THEN 'PLC'
        WHEN alarm_code IN ('01130002')                    THEN 'COMMUNICATION'
        WHEN alarm_code IN ('97005')                       THEN 'DATABASE'
        WHEN alarm_code IN ('80001')                       THEN 'PROCESS'
        ELSE 'UNCLASSIFIED'
    END AS category,
    CASE
        WHEN alarm_code = '91009' THEN 'air_vacuum'
        WHEN alarm_code = '90005' THEN 'pe_1..pe_6, je_1..je_4'
        WHEN alarm_code IN ('90001','90004','90012') THEN 'scale_x, scale_y, pe_1..pe_6'
        WHEN alarm_code = '91008' THEN 'temperature, humidity'
        WHEN alarm_code = '70004' THEN 'scan_speed'
        ELSE NULL
    END AS related_columns
FROM public.ldi_alarm_ms_code;

COMMENT ON VIEW public.v_ldi_alarm_category IS
 'จับคู่รหัส alarm กับหมวดหมู่และคอลัมน์ใน ldi_data ที่ควรตรวจสอบ — ใช้สำหรับ RCA';

COMMIT;

-- ══════════════════════════════════════════════════════════════════════════
-- ตรวจสอบหลังรัน
-- ══════════════════════════════════════════════════════════════════════════
-- SELECT category, COUNT(*) FROM public.v_ldi_alarm_category GROUP BY 1 ORDER BY 2 DESC;
--
-- อัตราการจับคู่ไม่ได้ (ควรเป็น 0% เมื่อใช้กับ simulator):
-- SELECT ROUND(100.0*COUNT(*) FILTER (WHERE m.alarm_code IS NULL)/NULLIF(COUNT(*),0),2)
--        AS unmapped_pct
-- FROM public.ldi_alarm_log a
-- LEFT JOIN public.ldi_alarm_ms_code m ON a.errorcode::TEXT = m.alarm_code::TEXT;
