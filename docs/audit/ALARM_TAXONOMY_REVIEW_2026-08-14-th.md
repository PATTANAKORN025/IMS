<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>หน้าหลัก</b></a> &nbsp;|&nbsp;
  <a href="../../docs/README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>ดัชนีเอกสาร</b></a>
</div>
<br/>

# Alarm Taxonomy Review — 2026-08-14

> เป็นการทบทวนเฉพาะเอกสาร และแบบสอบถาม DB แบบอ่านอย่างเดียวกับ
> แค็ตตาล็อก `public.ldi_alarm_ms_code` ที่ใช้งานอยู่ ไม่มีการแตะต้องระบบรันไทม์ นี่
> เป็นการทบทวนการจัดหมวดหมู่/ความครอบคลุม ไม่ใช่การรัน
> `docs/audit/LDI_ALARM_FIDELITY_AUDIT.md` (2026-08-11) ซ้ำ -- การตรวจสอบนั้น
> ครอบคลุม _พฤติกรรม_ ของระบบจำลอง; สิ่งนี้ครอบคลุมตัว _ข้อมูลแค็ตตาล็อก_ 
> เอง ดู `docs/operations/SOP_COMPLETION_REVIEW.md` สำหรับ
> ข้อค้นพบเรื่องการเชื่อมโยง SOP ที่ทับซ้อนกัน ซึ่งไม่ทำซ้ำที่นี่

## Catalog size and severity distribution

```sql
SELECT severity, count(*) FROM public.ldi_alarm_ms_code GROUP BY severity ORDER BY count(*) DESC;
```

| Severity | Count | % of 1,820 |
| -------- | ----- | ---------- |
| Major    | 1,431 | 78.6%      |
| Warning  | 201   | 11.0%      |
| Minor    | 145   | 8.0%       |
| Critical | 43    | 2.4%       |

เป็นการกระจายข้อมูลจริงที่ได้จากผู้จำหน่าย (นำเข้าจากการผสานไฟล์ส่งออกจริง 892 แถว + งานแค็ตตาล็อก 1,820 รหัสก่อนหน้านี้) ไม่ใช่ผลลัพธ์ของระบบจำลอง
สัดส่วน 2.4% ของ Critical คือคุณสมบัติการจัดหมวดหมู่ที่แท้จริงของข้อมูลต้นทาง
แยกจากข้อค้นพบก่อนหน้าของการตรวจสอบความถูกต้องตรงกันที่ว่า
_ระบบจำลอง_ ไม่สามารถถึงระดับ Critical ได้ก่อนที่ Phase F จะเพิ่ม
`RARE_CRITICAL_CODES` -- ข้อค้นพบนั้นเกี่ยวกับพฤติกรรมของระบบจำลอง
ไม่ใช่ส่วนประกอบของแค็ตตาล็อก; แค็ตตาล็อกมีรหัส Critical จริงอยู่เสมอ
ระบบจำลองเพียงแค่ไม่ได้ใช้งานใดๆ จนกระทั่งถึง Phase F

## Structured-field coverage: real, but narrow by design

```sql
SELECT
 count(*) FILTER (WHERE cause IS NOT NULL AND cause <> '') AS has_cause,
 count(*) FILTER (WHERE sop_reference IS NOT NULL AND sop_reference <> '') AS has_sop
FROM public.ldi_alarm_ms_code;
-- has_cause=25, has_sop=0 (out of 1,820)
```

25 แถวที่เติมข้อมูล `cause`/`impact`/`recovery_action`
เกือบจะพอดีกับชุดรหัสที่ระบบจำลองใช้งานอยู่ (19-21 รหัสต่อ
`alarm-sync-linter.js`) รวมกับรหัส Critical เพิ่มเติมที่ถูกเลือกด้วยมือเพียงเล็กน้อย นี่คือ
**ความตั้งใจ, ขอบเขตที่ครอบคลุม** -- 1,795 แถวอื่น
คือรหัสผู้จำหน่ายจริงที่ระบบจำลองนี้อาจจะไม่เคยแจ้งเตือน
และการเขียนคำแนะนำที่มีโครงสร้างสำหรับ 1,820 แถวทั้งหมด จะเป็นความพยายามที่ใช้ไป
กับรหัสที่ไม่มีทางเกิดการทำงานในการไปปรากฏใน `ldi_alarm_log`
ไม่ใช่ช่องโหว่; แต่เป็นขอบเขตที่สมเหตุสมผล ซึ่งคุ้มค่าที่จะระบุอย่างชัดเจนเพื่อให้
ผู้ทบทวนในอนาคตไม่เข้าใจผิดว่า 25/1820 เป็นความผิดพลาดหลงลืม

**`sop_reference` ที่ 0/1820 (รวมถึง 25 แถวที่คัดสรรมา) คือ
ช่องโหว่จริง** -- ครอบคลุมอยู่ใน `SOP_COMPLETION_REVIEW.md` ไม่ทำซ้ำ
ที่นี่

## Alarm type coverage

```sql
SELECT count(*) FILTER (WHERE alarm_type IS NOT NULL AND alarm_type <> '') FROM public.ldi_alarm_ms_code;
-- 1820 / 1820
```

100% -- ทุกแถวมีการจัดประเภท `alarm_type` ไม่มีช่องโหว่ที่นี่

## Simulator-to-catalog sync

```text
$ node tests/lint/alarm-sync-linter.js
[+] Simulator (nodered_data/flows.json): Found 21 alarm codes
[+] Master (live DB, ldi_alarm_ms_code): Found 1820 alarm codes
```

Linter รายงานรหัสของระบบจำลอง 21 รหัสในการรันนี้ (การตรวจสอบความถูกต้องตรงกัน
การรัน 2026-08-11 รายงาน 19 -- ส่วนต่าง 2 รหัส คือการเพิ่ม
`RARE_CRITICAL_CODES` ของ Phase F, `01180016`/`0C020014` นำมาใช้หลังจาก
การตรวจสอบนั้น) รหัสระบบจำลองทุกตัวมีอยู่ในแค็ตตาล็อกหลัก, 0
orphan -- ส่วนนี้ของการจัดหมวดหมู่นั้นแข็งแกร่งและได้รับการยืนยันการทำงานจริงซ้ำ
ไม่ได้ทึกทักเอาจากการตรวจสอบรุ่นเก่า

## What this review does not cover

- ว่าข้อความ `alarm_msg`/`alarm_detail` ของรหัสที่ไม่ได้คัดสรร 1,795 รหัสนั้น
  มีความถูกต้องตามแหล่งที่มาของผู้จำหน่ายจริงหรือไม่ -- นั่นเป็นงาน
  กระบวนการนำเข้า (การผสาน 892 แถว, การสร้างแค็ตตาล็อก 1,820 รหัส) ไม่ได้
  ถูกตรวจสอบซ้ำที่นี่
- _พฤติกรรม_ การแจ้งเตือน (อัตราการเกิด, ประสิทธิผลการหน่วงเวลา (debounce), คุณภาพ
  สหสัมพันธ์) -- นั่นคือขอบเขตของ `LDI_ALARM_FIDELITY_AUDIT.md` และ
  คะแนนของมัน (58/100) ถือว่าล้าสมัยตามที่ทราบอิงตาม `BACKLOG_SIMULATOR_REALISM_AND_ALERT_HYGIENE.md`,
  ไม่ได้รันซ้ำที่นี่ เนื่องจากการทบทวนนี้เป็นการตรวจสอบข้อมูลแค็ตตาล็อกเท่านั้น

## Summary

โครงสร้าง Taxonomy นั้นสมบูรณ์: การกระจายระดับความรุนแรงเป็นข้อมูลผู้จำหน่าย
จริง, การจัดประเภท alarm-type ครบถ้วน, การซิงค์เครื่องจำลอง/ต้นฉบับ
สะอาดโดยมี 0 orphans ช่องโหว่หนึ่งเดียวที่ดำเนินการได้จริงคือ `sop_reference`
-- ถูกระบุเป็นข้อเสนอแนะใน `SOP_COMPLETION_REVIEW.md`, ไม่
นำมาทำซ้ำเป็นรายการเปิดที่สองที่นี่
