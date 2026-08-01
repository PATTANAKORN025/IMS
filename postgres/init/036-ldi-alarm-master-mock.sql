-- ══════════════════════════════════════════════════════════════════════════
-- LDI ALARM MASTER — Mock Seed (ปลอดภัยต่อทรัพย์สินทางปัญญาของผู้ผลิต)
-- ══════════════════════════════════════════════════════════════════════════
-- แนวคิดด้านความปลอดภัย:
--   • เอกสารรหัส alarm ของผู้ผลิตมี 1,820 รายการ — ไฟล์นี้ "ไม่" คัดลอกมาทั้งหมด
--   • ใช้เฉพาะ 20 รหัสที่ปรากฏจริงใน production log ซึ่งครอบคลุม 100% ของ
--     เหตุการณ์ที่เกิดขึ้นจริง → ได้คุณค่าเชิงวิเคราะห์ครบ 100% โดยไม่ต้อง
--     เผยแพร่แคตตาล็อกของผู้ผลิต
--   • ข้อความ alarm_msg/alarm_detail เขียนขึ้นใหม่เป็นคำอธิบายเชิงหน้าที่
--     (functional description) ไม่ใช่การคัดลอกข้อความจากเอกสารผู้ผลิต
--   • ตัวรหัสเป็นเพียงตัวเลขระบุเหตุการณ์ ไม่ใช่ความลับทางธุรกิจ
--
-- schema ตรงกับ production 100% (5 คอลัมน์, ไม่เพิ่ม ไม่ลด)
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
('90013','W','90013','Alignment sequence aborted (code not in vendor catalog 2025-07)',
 'พบในระบบจริงแต่ยังไม่มีในเอกสารรหัสเวอร์ชัน 2025-07-23 — ต้องขอเอกสารรุ่นใหม่จากผู้ผลิต'),
('90012','W','90012','Alignment failed and operator cancelled exposure',
 'ผู้ปฏิบัติงานยกเลิกการฉายแสงหลังการจัดตำแหน่งล้มเหลว'),
('91012','W','91012','Process parameter deviation (code not in vendor catalog 2025-07)',
 'พบในระบบจริงแต่ยังไม่มีในเอกสารรหัสเวอร์ชัน 2025-07-23'),
('91008','W','91008','Ambient temperature or humidity abnormal',
 'อุณหภูมิหรือความชื้นในห้องหลุดสเปก ตรวจสอบคอลัมน์ temperature (22±2°C) / humidity (55±5%)'),
('91017','W','91017','Environmental control deviation (code not in vendor catalog 2025-07)',
 'พบในระบบจริงแต่ยังไม่มีในเอกสารรหัสเวอร์ชัน 2025-07-23'),
('91020','W','91020','Process interlock triggered (code not in vendor catalog 2025-07)',
 'พบในระบบจริงแต่ยังไม่มีในเอกสารรหัสเวอร์ชัน 2025-07-23'),
('91024','W','91024','Process supervision event (code not in vendor catalog 2025-07)',
 'พบในระบบจริงแต่ยังไม่มีในเอกสารรหัสเวอร์ชัน 2025-07-23'),
('93007','W','93007','Calibration verification event (code not in vendor catalog 2025-07)',
 'พบในระบบจริงแต่ยังไม่มีในเอกสารรหัสเวอร์ชัน 2025-07-23'),
('91029','W','91029','Process condition warning (code not in vendor catalog 2025-07)',
 'พบในระบบจริงแต่ยังไม่มีในเอกสารรหัสเวอร์ชัน 2025-07-23'),
('97014','W','97014','Auxiliary subsystem warning (code not in vendor catalog 2025-07)',
 'พบในระบบจริงแต่ยังไม่มีในเอกสารรหัสเวอร์ชัน 2025-07-23'),
-- ── กลุ่ม 7xxxx: Motion ────────────────────────────────────────────────
('70004','W','70004','Position-synchronised output overspeed',
 'ความเร็วสแกนเกินขีดจำกัดของระบบซิงค์ตำแหน่ง ตรวจสอบคอลัมน์ scan_speed'),
-- ── กลุ่ม 1xxxx: Optics ────────────────────────────────────────────────
('10006','A','10006','Failed to set imaging device to protection mode',
 'ตั้งค่าอุปกรณ์สร้างภาพเข้าสู่โหมดป้องกันไม่สำเร็จ'),
-- ── รหัสผิดรูปแบบที่พบในระบบจริง (เก็บไว้เพื่อให้ dashboard สะท้อนความจริง) ──
('20','A','20','Malformed alarm code (truncated at source)',
 'รหัสสั้นผิดรูปแบบ เกิดจากข้อมูลถูกตัดที่ระบบต้นทาง — เป็นปัญหาคุณภาพข้อมูล ไม่ใช่ alarm จริง'),
('20021','A','20021','Unclassified equipment event',
 'เหตุการณ์ที่ยังไม่ถูกจัดหมวด'),
('2','A','2','Malformed alarm code (truncated at source)',
 'รหัสหลักเดียว เกิดจากข้อมูลถูกตัดที่ระบบต้นทาง — เป็นปัญหาคุณภาพข้อมูล');

-- ══════════════════════════════════════════════════════════════════════════
-- VIEW: จับคู่ alarm กับ "คอลัมน์ที่ควรตรวจสอบ" ใน ldi_data
-- ══════════════════════════════════════════════════════════════════════════
-- ไม่แก้ schema ของ ldi_alarm_ms_code (ต้องตรงกับ production)
-- แต่เพิ่มชั้น mapping แยกไว้สำหรับ Root Cause Analysis โดยเฉพาะ
CREATE OR REPLACE VIEW public.v_ldi_alarm_category AS
SELECT alarm_code,
    CASE
        WHEN alarm_code IN ('91009')                   THEN 'VACUUM'
        WHEN alarm_code IN ('90005')                   THEN 'REGISTRATION'
        WHEN alarm_code IN ('90001','90004','90012','90013') THEN 'ALIGNMENT'
        WHEN alarm_code IN ('93004','93007')           THEN 'CALIBRATION'
        WHEN alarm_code IN ('91008','91017')           THEN 'ENVIRONMENT'
        WHEN alarm_code IN ('70004')                   THEN 'MOTION'
        WHEN alarm_code IN ('10006')                   THEN 'OPTICS'
        WHEN alarm_code IN ('2','20')                  THEN 'DATA_QUALITY'
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
