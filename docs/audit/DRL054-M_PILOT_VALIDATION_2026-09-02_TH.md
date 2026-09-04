# รายงานตรวจรับ Pilot เครื่อง DRL054-M

วันที่ตรวจสอบ: 2 กันยายน 2026

ขอบเขต: `public.machine_event` → Factory Twin 2D/3D → Grafana `IMS Drilling Machine Detail`

ผลรวม: **ผ่านแบบมีเงื่อนไข (CONDITIONAL PASS)**

## 1. ข้อสรุปสำหรับนำเสนอ

Pilot สามารถใช้แสดงสถานะล่าสุด ประวัติ RUN/STOP ระยะเวลาที่สังเกตได้
เหตุการณ์ดิบ และ Error ล่าสุดของ `DRL054-M` ได้โดยไม่สร้างข้อมูลจำลองเพิ่ม
สถานะล่าสุดคือ `RUN` เวลา `2026-08-31 08:30:58+07` และระบบเลือกแถวนี้
อย่างถูกต้องด้วยลำดับ `event_time DESC, id DESC`

ยังไม่ควรประกาศว่า Pilot รองรับ Active Alarm หรือสถานะเครื่องครบ 6 สี เพราะ
ข้อมูลปัจจุบันยืนยันได้เพียง `RUN` และ `STOP` และไม่มีสัญญา
Alarm trigger/reset/acknowledge สำหรับพิสูจน์ว่า Alarm ใดยัง Active อยู่

## 2. หลักฐานข้อมูลที่ใช้

| รายการ | ผลตรวจ |
|---|---:|
| ตาราง | `public.machine_event` |
| Machine ID | `DRL054-M` เพียงเครื่องเดียว |
| จำนวนข้อมูลทั้งหมด | 13,998 แถว |
| ช่วงเวลา Source | 27 ส.ค. 2026 11:15:56 ถึง 31 ส.ค. 2026 08:30:58 (`+07`) |
| `status` | 2,089 แถว |
| `event` | 10,802 แถว |
| `alarm` | 1,107 แถว |
| `RUN` | 2,002 แถว |
| `STOP` | 87 แถว |
| Alarm ระดับ `E` | 583 แถว |
| Alarm ระดับ `M` | 524 แถว |
| Decode สำเร็จ | 13,998/13,998 (`DECODED_MSGMANAGE`) |
| Source | `TBL_DR_EVENT` / `Event.fdb` |
| Decoder | `taliang-agent-1.2.22-dual-platform-ftp-audit` |
| Ingestion latency | median 2,930.8 ms, p95 3,034.4 ms, max 3,113.0 ms |

ชุดข้อมูลที่ใช้ตรวจเป็นไฟล์ส่งมอบภายนอก Repository และไม่ได้ถูกเพิ่มเข้า Git

## 3. การตรวจสถานะล่าสุด

ข้อมูลท้ายสุดมีสองสถานะที่เวลาเดียวกัน:

| ID | เวลา | สถานะ | ข้อความ |
|---:|---|---|---|
| 448915 | 2026-08-31 08:30:58+07 | `STOP` | Stop at hole 29 |
| 448916 | 2026-08-31 08:30:58+07 | `RUN` | Run Hits: 2 |

ดังนั้นห้ามเรียงด้วยเวลาเพียงอย่างเดียว Query ต้องเรียงด้วย
`event_time DESC, id DESC` เสมอ แถว `448916` เป็นข้อสังเกตสุดท้ายและทำให้
สถานะปัจจุบันเป็น `RUN`

ระบบใช้ **Latest known state** โดยไม่บังคับหมดอายุ 15 นาที ค่าเวลา Source และ
อายุข้อมูลยังคงแสดงเพื่อให้ผู้ใช้เห็นว่าข้อมูลล่าสุดเก่าเพียงใด หากต้องการ
Freshness policy ภายหลังจึงค่อยตั้ง `MACHINE_EVENT_STALE_SECONDS` มากกว่า `0`

## 4. การตรวจ KPI แบบคำนวณซ้ำ

คำนวณสถานะเรียงตาม `event_time, id` และให้แต่ละสถานะครอบคลุมถึงสถานะถัดไป
โดยหยุดที่เวลาของข้อมูลจริงแถวสุดท้าย ไม่ลากข้อมูลต่อถึงเวลาปัจจุบัน

| KPI | ผลคำนวณอิสระ | ความหมาย |
|---|---:|---|
| Observed duration | 335,658 วินาที | ช่วงที่มีหลักฐานสถานะครอบคลุม |
| RUN duration | 293,127 วินาที | 3 วัน 9 ชม. 25 นาที 27 วินาที |
| STOP duration | 42,531 วินาที | 11 ชม. 48 นาที 51 วินาที |
| RUN Ratio | **87.3%** | `RUN / (RUN + STOP)` |

ค่า 87.3% **ไม่ใช่** Vendor Shift Utilization และไม่ควรเทียบตรงกับ Rate1/Rate2
บนหน้าจอเครื่อง เพราะยังไม่มี Shift schedule, Online time และนิยาม Stop ของ
Vendor ในตารางนี้

## 5. การตรวจ Panel ใน Grafana

Dashboard: `IMS Drilling Machine Detail` (`uid=ims-drilling-machine-detail`)

| Panel | ผล | หมายเหตุ |
|---|---|---|
| Current Operational State | ผ่าน | ใช้สถานะล่าสุดโดยเรียงเวลาและ ID; Alarm ไม่บังคับให้เป็น Down |
| Latest Status Timestamp | ผ่าน | แสดงเวลา Source โดยไม่ผูกกับช่วงเวลา Dashboard |
| Age of Latest Status | ผ่าน | ใช้เพื่อแจ้งความเก่าของข้อมูล ไม่ใช้ลบสถานะ |
| Event Records in Range | ผ่าน | นับข้อมูลตาม Machine และช่วงเวลา Grafana |
| Run Ratio (Observed) | ผ่าน | คำนวณซ้ำได้ 87.3%; ชื่อระบุขอบเขตว่า Observed |
| Run Time / Stop Time | ผ่าน | หยุดการคำนวณที่ข้อมูลจริงล่าสุด ไม่ลากถึงเวลาปัจจุบัน |
| Status Records | ผ่าน | เก็บแถวเวลาเดียวกันและใช้ ID เป็น tie-breaker |
| Latest Error Record | ผ่านบางส่วน | เป็น Historical only ถูกต้อง แต่การจัด Category/Phase ใน Grafana ยังเป็น heuristic จาก code family |
| Operational Status History | ผ่าน | เลือกสถานะสุดท้ายใน bucket 15 นาทีเพื่อจำกัดความหนาแน่น; ไม่ใช่การหมดอายุข้อมูล |
| Event / Tool / Alarm Records | ผ่านบางส่วน | Event ดิบแสดงได้ แต่คอลัมน์ `tool_no`, `magazine_no`, `spindle` ยังไม่มีค่าจาก decoder |
| Source Traceability | ผ่าน | แสดง Source, file, decoder, เวลา sent/received และ Layout mapping |
| Data Boundary | ผ่าน | แจ้งข้อมูลที่ยังไม่มีอย่างชัดเจน |

Dashboard มี 19 panel objects เมื่อรวม Row และ Scope banner; มี 13 panel ที่
แสดงข้อมูลหรือคำอธิบายจริง

## 6. การตรวจ Error ล่าสุด

Error ระดับ `E` ล่าสุด:

| รายการ | ค่า |
|---|---|
| เวลา | 2026-08-31 08:29:26+07 |
| Code | `E0409` |
| ข้อความจริง | Spindle #5, Diameter error, T176M165, C1.910 |
| Category | Spindle / Tool |
| Phase | Tool change / measurement |
| Risk action | Stop and inspect |
| Lifecycle | Historical reference only |

คำอธิบายและวิธีแก้มาจากข้อมูล decoder/Alarm sheet ที่บันทึกในแถว ไม่ได้สร้าง
จาก Dashboard เอง และสอดคล้องกับคู่มือ DG Series หน้า Error message:
ตรวจผลวัด Tool เปลี่ยน Tool ที่ผิดปกติ แล้วจึงเริ่มทำงานต่อ

พบ Alarm code ระดับ `E` ทั้งหมด 13 code ในข้อมูล ตัวอย่างที่อยู่นอกช่วงรหัส
ในคู่มือหลัก เช่น `0424`, `0425`, `0610`, `0617` มีคำอธิบายจาก Alarm sheet
แต่ยังควรให้ Vendor/เจ้าของข้อมูลยืนยัน taxonomy ก่อนประกาศ Category และ
ระดับความเสี่ยงเป็นมาตรฐานกลาง

## 7. การตรวจสถานะ 6 สี

| สถานะ | แหล่งข้อมูลปัจจุบัน | ผล |
|---|---|---|
| Run | `event_type=RUN` | ยืนยันแล้ว |
| Initial,PM,Stop | `event_type=STOP` | ยืนยันแบบรวม; ยังแยก Initial/PM/Stop ไม่ได้ |
| Off | ไม่มี field ที่ยืนยัน | ยังไม่รองรับ |
| Down | ไม่มี lifecycle/field ที่ยืนยัน | ยังไม่รองรับ |
| Idle | ไม่มี field ที่ยืนยัน | ยังไม่รองรับ |
| Undefine | fallback เมื่อไม่มี/ไม่รู้จักข้อมูล | รองรับแล้ว |

การไม่เปลี่ยน Alarm history ให้เป็น `Down` เป็นพฤติกรรมที่ถูกต้อง เพราะ STOP
อาจเกิดจากการหยุดปกติ การเปลี่ยน Tool หรือการหยุดโดยผู้ปฏิบัติงานได้

## 8. จุดที่ยังขาดและระดับความสำคัญ

### P0 — ต้องมีก่อนเปิด Active Alarm

1. นิยาม Alarm trigger, reset/clear และการจับคู่เหตุการณ์
2. ความหมาย `level=E` และ `level=M` เทียบกับ Critical/Major/Minor/Warning
3. กติกา acknowledge/resolve และผู้รับผิดชอบ

### P1 — ต้องมีก่อนขยายสถานะครบ 6 สี

1. Raw status หรือ API ที่แยก Off, Down, Idle, Initial, PM, Stop และ Run
2. Heartbeat/online signal เพื่อแยก Off ออกจากข้อมูลขาดหาย
3. Owner ยืนยัน Mapping `DRL054-M` ↔ `APEX3-F1-DRILL-054` และพิกัดจริง

### P2 — ต้องมีหากต้องการ KPI ใกล้เคียง Vendor

1. Shift calendar และ planned production time
2. Hits/cycle counter และนิยามการ reset ตัวนับ
3. Program name, total holes, current hole และ progress
4. Online/Stop duration ตามนิยาม Vendor
5. Tool number, magazine, spindle และ tool life เป็น field แยก ไม่ใช่ข้อความ

## 9. Acceptance Checklist

| เงื่อนไขตรวจรับ | สถานะ |
|---|---|
| ใช้ข้อมูลจริงเฉพาะ DRL054-M | ผ่าน |
| ไม่มี Mock data ในโหมด real | ผ่าน |
| สถานะล่าสุด deterministic เมื่อเวลาเท่ากัน | ผ่าน |
| 2D และ 3D ใช้สถานะแหล่งเดียวกัน | ผ่าน |
| Machine Detail เปิดตาม Machine context | ผ่าน — ตรวจจาก Browser จริงทั้งการเปิด Side Panel จากเครื่องบนแปลนและลิงก์ Grafana drill-down |
| KPI คำนวณซ้ำได้จากข้อมูลต้นทาง | ผ่านสำหรับ Observed RUN/STOP |
| Error history ไม่ถูกอ้างเป็น Active Alarm | ผ่าน |
| สถานะครบ 6 สีจากข้อมูลจริง | ยังไม่ผ่าน — มีจริง 2 สถานะ |
| Active Alarm lifecycle | ยังไม่ผ่าน — ไม่มี Trigger/Reset |
| เทียบเท่า Dashboard Vendor | ไม่ใช่ขอบเขต Pilot ปัจจุบัน |

## 10. คำตัดสิน

`DRL054-M` พร้อมเป็นต้นแบบสำหรับ **latest-known operational state,
RUN/STOP history, observed duration, raw event inspection และ historical error
context** แล้ว

Side Panel ของ Factory Twin แสดงหลักฐานล่าสุดจาก Source แยกตามเวลา ได้แก่
`RUN` code `0201`, `Run Hits: 2`, PROGRAM_LOAD ล่าสุด, Tool `T200` และค่า
diameter ที่สังเกตได้ 6 ค่า รวมถึง Error `E0409` แบบ Historical only ส่วนข้อมูล
จากคู่มือติดป้าย `REFERENCE SPEC`; ค่า Maximum RPM ยังคง `Not confirmed`
เพราะยังไม่มีหลักฐานยืนยันรุ่นของเครื่อง `DRL054-M`

ยังไม่พร้อมใช้ตัดสิน **Active Alarm, Down/Off/Idle, Shift utilization,
production progress หรือประสิทธิภาพเทียบ Vendor** จนกว่าจะได้รับข้อมูลตาม
P0–P2 ข้างต้น เครื่องอื่นต้องคง `Undefine` และห้ามคัดลอกสถานะของ DRL054-M
ไปใช้แทน
