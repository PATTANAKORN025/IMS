# การเชื่อมสถานะ DG Drilling จาก `machine_event`

## ขอบเขตปัจจุบัน

หน้า 2D และ 3D ใช้แหล่งสถานะเดียวกัน เครื่อง `DRL054-M` ถูกผูกกับตำแหน่ง
`APEX3-F1-DRILL-054` ในไฟล์ Layout ส่วนตัวเท่านั้น เครื่องอื่นยังไม่มี
แหล่งสถานะที่ยืนยันได้ และต้องแสดง `Undefine` จนกว่าจะได้รับทะเบียนและ
แหล่งข้อมูลจริงของเครื่องนั้น

ไฟล์ Layout ส่วนตัวและพิกัดโรงงานไม่อยู่ใน Git และไม่ถูกส่งขึ้น Pull Request

## กติกาสถานะ

| `machine_event.event_type` | สถานะ 6 สี | เหตุผล |
|---|---|---|
| `RUN` | `Run` (เขียว) | ระบบเครื่องรายงานว่ากำลังทำงาน |
| `STOP` | `Initial,PM,Stop` (ฟ้า) | แหล่งข้อมูลยืนยันเพียงการหยุด ไม่ได้ยืนยันว่าเครื่องเสีย |
| ค่าอื่น | `Undefine` (ขาว) | ห้ามเดาความหมายจากค่าที่ไม่อยู่ในสัญญา |
| ไม่มีข้อมูลสถานะเลย | `Undefine` (ขาว) | ไม่มีหลักฐานให้แสดงสี |

ค่าเริ่มต้นใช้ `Latest known state`: แสดงสถานะล่าสุดที่มีอยู่โดยไม่หมดอายุและ
แสดงเวลา Source ให้ผู้ใช้เห็นเสมอ ตั้ง `MACHINE_EVENT_STALE_SECONDS` เป็นจำนวน
วินาทีที่มากกว่า 0 ได้เมื่อหน้างานต้องการบังคับ freshness window; ค่า `0`
หมายถึงไม่หมดอายุ

การเลือกสถานะล่าสุดต้องเรียงทั้งเวลาและลำดับแถว:

```sql
SELECT DISTINCT ON (equipment_id) *
FROM public.machine_event
WHERE message_type = 'status'
ORDER BY equipment_id, event_time DESC, id DESC;
```

ต้องใช้ `id DESC` เพราะหลักฐานตัวอย่างมี `STOP` และ `RUN` ที่เวลาเดียวกัน โดย
แถว `RUN` ซึ่งมี `id` มากกว่าเป็นข้อมูลสุดท้ายของกลุ่มเวลานั้น

## การใช้คู่มือ DG Series

ตรวจคู่มือครบทุกหน้าแล้วและใช้ยืนยันขอบเขตข้อมูลต่อไปนี้:

- หน้าจอ AUTO แยกสถานะ Error, Standby และ Production ออกจากกัน
- หน้า Message แยก Error ปัจจุบัน, History และ Event DB
- `F10 STOP` ทำให้แกน Z กลับระดับปลอดภัยและหยุดการทำงาน จึงไม่ควรตีความ
  `STOP` เป็น `Down` โดยอัตโนมัติ
- กลุ่ม Error ครอบคลุม Emergency/Air/Drive, Axis motion/limit, Tool/Spindle,
  Program, H/Z safety และ reset safety
- Error `E0409` ระบุปัญหาขนาดดอกกัด/ดอกเจาะ และขั้นตอนให้ตรวจผลการวัดก่อน
  เปลี่ยน Tool และเริ่มต่อ ซึ่งตรงกับรายละเอียดที่ decoder บันทึกในตัวอย่าง

ระบบใช้ `error_description` และ `troubleshooting_method` ที่ decoder บันทึกใน
ฐานข้อมูลเป็นข้อความหลัก ไม่เติมคำอธิบายจากเลขรหัสอย่างเดียว เนื่องจากพบว่า
เลข `0204` ในชุดข้อมูลตัวอย่างถูกใช้กับข้อความระยะเวลา Alarm ซึ่งอาจชนกับ
รหัส `E0204` ในคู่มือได้

## ขอบเขต Alarm ที่ยังไม่ยืนยัน

ตารางที่ได้รับมีเหตุการณ์ `alarm` แต่ยังไม่มีสัญญา trigger/reset ที่พิสูจน์ว่า
Alarm ใดยัง Active อยู่ จึงใช้กติกา fail-closed:

- แสดง Error ล่าสุดเป็น `HISTORICAL_REFERENCE_ONLY`
- ไม่เปิดเส้นขอบแดง Active Alarm
- ไม่เปลี่ยนสถานะเครื่องเป็น `Down`
- ไม่ถือ `level = E/M` เป็น Critical/Major จนกว่าเจ้าของข้อมูลยืนยันความหมาย

เมื่อได้รับ trigger/reset จริง ต้องเพิ่ม lifecycle query และทดสอบการจับคู่
เหตุการณ์ก่อนเปิด Active Alarm overlay

## รายละเอียด P0 ที่แสดงได้จากข้อมูลปัจจุบัน

สำหรับ `DRL054-M` หน้า 2D/3D แสดงข้อมูลที่มีหลักฐานจาก `machine_event` เท่านั้น:

- สถานะ `RUN`/`STOP` และเวลาของสถานะล่าสุด
- เวลา Source และป้าย `LATEST KNOWN`; ข้อมูลเก่ายังคงแสดงสถานะล่าสุด
- Error ล่าสุดในฐานะประวัติ ไม่ใช่ Active Alarm
- กลุ่มปัญหา: Safety, Spindle/Tool, Axis หรือ Program/Tool table
- ช่วงการทำงาน: Startup, Home/Reset, Program selection,
  Tool change/measurement หรือ Drilling
- ระดับการตอบสนองเบื้องต้น เช่น Stop and secure, Stop and inspect หรือ
  Validate before restart

การหาช่วงการทำงานใช้ข้อความ Error ร่วมกับ Event/Status ก่อนหน้าไม่เกิน 10 นาที
และไม่ใช้เลข Error เพียงอย่างเดียว ตัวอย่าง `E0409` ของ `DRL054-M` มีลำดับ
Tool diameter/run-out, ATC ที่ Hole 0 และ Diameter error จึงจัดเป็น
`TOOL_CHANGE_MEASUREMENT` ไม่ใช่ Error ระหว่างกำลังเจาะ

ข้อมูล Program name, Progress, Hits, Shift rate และ Utilization ยังไม่อยู่ใน
แหล่งข้อมูลนี้และต้องไม่สร้างค่าจำลองในโหมดจริง

## การตั้งค่า Local Preview

```yaml
environment:
  MACHINE_STATUS_MODE: real
  MACHINE_EVENT_STALE_SECONDS: 0
```

ตัว service ใช้สิทธิ์อ่านอย่างเดียว และไม่เขียนข้อมูลกลับ `machine_event`
