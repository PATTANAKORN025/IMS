<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Alarm Detail Style Guide — v1.1

> **ข้อมูลอ้างอิงพื้นฐาน (Baseline reference)** นี่คือรูปแบบมาตรฐานที่เป็นทางการสำหรับข้อความแจ้งเตือน (alarm-knowledge text) ของ `ldi_alarm_ms_code` — ภาษาอังกฤษ, สำหรับผู้ปฏิบัติงาน/วิศวกร, เน้นการใช้งานจริง (ไม่ใช่แค่การคัดลอก AlarmMsg ดั้งเดิมของผู้ผลิต) การเขียนใหม่ในอนาคตทั้งหมด ไม่ว่าจะเป็นในโปรแกรมจำลอง การย้ายข้อมูล หรือแดชบอร์ด ควรปฏิบัติตามรูปแบบนี้และเพิ่มเข้ามาที่นี่ โดยไม่ควรแต่งขึ้นมาเองโดยพลการ
>
> **v1.0** (2026-08-11): 15 รหัส, มีเพียง `alarm_detail` ที่เป็นประโยคเดียว
> **v1.1** (2026-08-11): รหัสทั้ง 21 รหัสในแคตตาล็อกจำลอง (mock-catalog) มี `alarm_detail` เป็นภาษาอังกฤษแล้ว (แปลจากภาษาไทยเพิ่มอีก 10 รหัส); เพิ่มฟิลด์ที่มีโครงสร้าง `cause` / `impact` / `recovery_action` สำหรับทั้ง 25 รหัสที่ครอบคลุมถึงตอนนี้ (21 รหัสจำลอง ไม่มีการหักออก บวกกับรหัส Critical ที่มีอยู่จริง 4 รหัสซึ่งไม่ได้อยู่ในแคตตาล็อกจำลอง); เพิ่มฟิลด์ `sop_reference` (รองรับสคีมาแล้ว แต่ตั้งใจเว้นว่างไว้ — ดู [§7](#7-sop--work-instruction-references--not-yet-populated))
>
> ดู [§8 Freeze & scope](#8-freeze--scope) สำหรับขอบเขตการทำงาน, และ [§9 Vendor specification requests for pending codes](#9-vendor-specification-request-for-pending-codes) สำหรับข้อมูลที่รอการนำเข้าจากภายนอก

---

## 1. รูปแบบประโยค (Sentence pattern)

ประกอบด้วยสองประโยค เรียงตามลำดับนี้ ไม่มีข้อยกเว้น:

1. **เกิดอะไรขึ้น (What happened)** — อธิบายเงื่อนไขความผิดปกติด้วยภาษาอังกฤษที่เข้าใจง่าย อ้างอิงถึงพารามิเตอร์ที่วัดจริงหรือระบบย่อยด้วยชื่อจริง (ไม่ใช่ชื่อเดิมจากผู้ผลิต หรือชื่อตัวแปร/คอลัมน์ภายใน — ดู §3) ระบุข้อเท็จจริง ใช้รูปประโยคปัจจุบัน/อดีต ไม่ใช้ภาษาที่เร้าอารมณ์
2. **สาเหตุที่เป็นไปได้ + สิ่งที่ต้องตรวจสอบ (Likely cause + what to check)** — สาเหตุที่เป็นไปได้หนึ่งหรือสองข้อ ตามด้วยคำสั่งเชิงบังคับ ("Check...", "Inspect...", "Verify...", "Confirm...") ประโยคนี้คือสิ่งที่ทำให้รายละเอียดนี้ควรอ่าน แทนที่จะแสดงแค่ AlarmMsg ซ้ำสองครั้ง

ความยาวเป้าหมาย: รวม 25–45 คำ หากจำเป็นต้องใช้ประโยคที่สาม อาจหมายถึงความผิดปกตินั้นแยกเป็นสองเรื่อง — ให้พิจารณารหัสใหม่ อย่าเขียนต่อเพียงอย่างเดียว

**แม่แบบ (Template):**

> [Condition], typically caused by [cause 1] or [cause 2]. [Imperative check/action] before [resuming / resetting / re-enabling].

## 2. คำศัพท์มาตรฐาน (Standard vocabulary)

ใช้คำศัพท์มาตรฐานหนึ่งคำต่อหนึ่งแนวคิด — ห้ามใช้คำพ้องความหมายสลับกันไปมาในแต่ละรายการ:

| แนวคิด (Concept)             | คำที่ควรใช้ (Use)                                                                                                         | คำที่ไม่ควรใช้ (Not)                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| อยู่นอกช่วงที่อนุญาต         | "is outside the configured range"                                                                                         | "out of control range", "exceeds tolerance", "abnormal" (คลุมเครือเกินไปหากใช้เดี่ยวๆ) |
| การหยุดเพื่อความปลอดภัย      | "halted" / "motion is halted"                                                                                             | "stopped" (กำกวมกับการหยุดทำงานปกติเมื่อเสร็จสิ้น)                                     |
| คำสั่งถึงผู้อ่าน             | "Check", "Inspect", "Verify", "Confirm"                                                                                   | "Please check" (ห้ามใช้ "please" — นี่คือคำสั่งทางเทคนิค ไม่ใช่คำขอร้อง), "You should" |
| เมตริกการจัดตำแหน่ง (แยกกัน) | "PE (position error)" / "JE (judgment error)" — ขยายคำเมื่อกล่าวถึงครั้งแรกของแต่ละรายการ หลังจากนั้นใช้ตัวย่อได้         | "the values"                                                                           |
| PE และ JE ร่วมกัน            | "registration error (PE/JE)" — นี่คือคำที่ผู้ผลิต/แคตตาล็อกจำลองใช้งานจริง (ดู AlarmMsg สำหรับ `90005`) ไม่ได้แต่งขึ้นเอง | "the metrics", หรือการประดิษฐ์คำรวมแบบใหม่                                             |
| สถานะที่สามารถทำงานต่อได้    | "resuming operation" / "resetting" / "re-enabling motion"                                                                 | "restarting" (กำกวมกับการรีบูตเครื่องใหม่ทั้งหมด)                                      |

**ห้าม** แต่งเกณฑ์ตัวเลขใดๆ ที่ไม่ได้กำหนดไว้แล้วในสเปกที่อื่นภายในคลังข้อมูล (repo) นี้ (เช่น `temperature (22±2°C) / humidity (55±5%)` เป็นค่าจริงที่ใช้แล้วใน `docs/architecture/DATA_FLOW.md` และในแคตตาล็อกจำลอง — การนำกลับมาใช้นั้นถูกต้อง; แต่การตั้งตัวเลขใหม่สำหรับรหัสที่ยังไม่มีบันทึกนั้นไม่ถูกต้อง)

**ห้าม** ใช้เครื่องหมายอัศเจรีย์ ตัวพิมพ์ใหญ่ทั้งหมด (ยกเว้นตัวย่อที่เป็นของจริง: PE, JE, DMD, PSO, HVAC) หรือสรรพนามบุรุษที่หนึ่ง

## 3. การจัดการคำศัพท์เทคนิคของผู้ผลิต (Vendor jargon handling)

ข้อความ AlarmMsg ดั้งเดิมของผู้ผลิตบางครั้งใช้ชื่อส่วนประกอบภายใน (`DMD`, `PSO`) หรือถ้อยคำที่รวบรัด (`JE / PE is abnormal`) ให้ขยายความตัวย่อเมื่อกล่าวถึงเป็นครั้งแรกในแต่ละรายการหากผู้ชมอาจไม่รู้จัก; และใช้คำย่อต่อไปหลังจากนั้น ห้ามตั้งชื่อใหม่ให้ดูเป็นมิตรขึ้นสำหรับส่วนประกอบที่มีอยู่จริง — `DMD` (digital micromirror device) คือสิ่งที่เอกสารบริการภาคสนามเรียก; ให้คงไว้ แค่อธิบายความหมายในครั้งแรก

## 4. ข้อกำหนดแหล่งที่มา (Provenance requirement)

ทุกรายการในคู่มือนี้ต้องอ้างอิงแหล่งที่มาของข้อเท็จจริง:

- **ความถี่ (Frequency)** — จำนวนที่แน่นอนจาก `data/real/ldi_alarm_log_clean.sql` (บันทึกการผลิตจริงในอดีต) ไม่ใช่การประเมิน
- **ข้อความต้นฉบับ (Source text)** — `AlarmMsg`/`AlarmType` จริงของผู้ผลิต จาก `data/real/[REDACTED_VENDOR_MANUAL]` หรือการส่งออกเสริมจาก `ldi_alarm_ms_code_clean.sql`
- **คำแนะนำเกี่ยวกับสาเหตุ/การตรวจสอบ (Cause/check guidance)** — อ้างอิงจากคอลัมน์การรับส่งข้อมูลระยะไกล (telemetry) และเกณฑ์ที่บันทึกไว้ในฐานโค้ดนี้ (`docs/architecture/DATA_FLOW.md`, `LDI_SPC_GUIDE.md`, คำอธิบายการทำงานที่มีอยู่แล้วของแคตตาล็อกจำลอง) ไม่ใช่การประดิษฐ์ขึ้นเอง

หากขาดสิ่งใดสิ่งหนึ่งในสามข้อนี้ รหัสจะถูกตั้งค่าสถานะสำหรับการอัปเดตในอนาคต (ดู §6)

---

## 5. รายการ v1.0 (15 รหัส)

### ระดับวิกฤต (Critical) (ข้อความจริงจากผู้ผลิต คัดเลือกตามความชัดเจน — **ไม่ได้** เรียงตามความถี่; ดู §6 ข้อมูลการผลิตจริงไม่พบการเกิดระดับ Critical)

| Code       | AlarmMsg (source)            | New AlarmDetail                                                                                                                                                                                                                         |
| ---------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01180016` | Emergency Stop               | Operator-initiated emergency stop halted all axes immediately. Inspect the work area for the cause before releasing the E-stop and resuming operation.                                                                                  |
| `0C020014` | Safety sensor triggered      | A safety sensor (light curtain or area guard) detected an intrusion into the machine's protected zone and halted motion. Clear the zone and confirm no personnel or foreign objects remain before resetting.                            |
| `0118000E` | Critical position error      | The measured axis position deviated from the commanded position beyond the critical threshold, indicating a possible mechanical obstruction, encoder fault, or servo tuning issue. Stop and inspect the affected axis before re-homing. |
| `01180011` | Overcurrent                  | The servo drive detected current draw beyond its rated limit on one or more axes, which can indicate a mechanical jam, a short circuit, or a failing motor/drive. Power down and inspect before resetting the drive.                    |
| `0C010001` | Double table collision error | The motion controller detected an imminent or actual collision between the two exposure stages and halted motion to prevent damage. Verify stage positions and clear any obstruction before resuming.                                   |
| `01180010` | Hyper Acceleration           | A commanded or measured axis acceleration exceeded the safety limit, usually indicating a corrupted motion profile or a mechanical fault causing an uncommanded jump. Stop and verify the axis before re-enabling motion.               |

### ระดับร้ายแรง (Major) (อ้างอิงตามความถี่)

| Code    | AlarmMsg (source)                               | Real freq. | New AlarmDetail                                                                                                                                                                                          |
| ------- | ----------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `10006` | Failed to set imaging device to protection mode | 1×         | The exposure head's imaging device (DMD) could not be switched into its protective state before an unsafe condition. Retry the operation; if it persists, check the DMD controller connection and power. |

### ระดับคำเตือน (Warning) (อ้างอิงตามความถี่, เรียงตามจำนวนที่เกิดขึ้นจริง)

| Code    | AlarmMsg (source)                                                            | Real freq. | New AlarmDetail                                                                                                                                                                                                         |
| ------- | ---------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `91009` | Vacuum pressure exceeds the control range                                    | 3,239×     | The vacuum hold-down pressure on the exposure table is outside the configured operating range. Check for a leak at the board edge, a clogged vacuum port, or a faulty vacuum sensor on this station.                    |
| `90005` | JE / PE is abnormal                                                          | 3,197×     | The measured registration error (PE/JE) exceeded the configured tolerance for this job. Check board flatness, alignment mark quality, and recent calibration history for this station.                                  |
| `90004` | Outer alignment to the grip point failed                                     | 1,525×     | The outer-layer alignment routine could not register the board to the mechanical grip point within tolerance. Check the alignment marks for contamination or damage and confirm the grip mechanism is seated correctly. |
| `93004` | Calibration exception (a calibration does not enter the calibration process) | 939×       | A scheduled or requested calibration cycle did not complete -- the machine did not enter the calibration process within the expected time. Check that no job is queued or running, then retry the calibration.          |
| `90001` | Inner alignment grip point failed                                            | 558×       | The inner-layer alignment routine could not register the board to the mechanical grip point within tolerance. Check the alignment marks for contamination or damage and confirm the grip mechanism is seated correctly. |
| `90012` | Alignment fails, and the user cancels the exposure                           | 69×        | The operator cancelled exposure after the automatic alignment routine failed to converge. Review the alignment marks and job setup before re-attempting; this is an operator action, not an automatic fault.            |
| `70004` | PSO overspeed                                                                | 45×        | The position-synchronized output (scan) speed exceeded the configured motion limit during exposure. Check the job's scan-speed parameter and the stage's mechanical condition before re-running.                        |
| `91008` | abnormal temperature and humidity                                            | 37×        | The cleanroom temperature or humidity reading is outside the configured process window (22±2°C / 55±5% RH). Check the HVAC system and the sensor for this station before resuming production.                           |

## 5b. ส่วนเพิ่มเติมใน v1.1 — รหัสที่เหลือจากแคตตาล็อกจำลองถูกแปลแล้ว (10 รหัส)

รหัสทั้ง 10 รหัสเหล่านี้ทำให้การครอบคลุมภาษาอังกฤษสำหรับ `alarm_detail` ครบสมบูรณ์สำหรับ **รหัสทั้ง 21 รหัสในแคตตาล็อกจำลอง** (การย้ายข้อมูล 036) แหล่งที่มา: คำอธิบายการทำงานในภาษาไทยดั้งเดิมของแคตตาล็อกจำลอง (ซึ่งได้ถูกอ้างอิงแล้ว — ดูส่วนหัวของการย้ายข้อมูล 036 — เป็น AlarmMsg/AlarmType จริง, แต่ปรับแต่งภาษาสำหรับผู้พูดภาษาไทยในตอนต้น), ได้รับการแปลและปรับรูปแบบตามคู่มือนี้ โดยไม่ได้เริ่มต้นใหม่ทั้งหมด

| Code       | AlarmMsg (source)                               | Severity | New AlarmDetail                                                                                                                                                                                       |
| ---------- | ----------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01060009` | Wrong camera serial number                      | Major    | The camera's detected serial number does not match the one configured for this station. Check that the correct camera is connected and reconfigure the station if a camera was recently swapped.      |
| `0106000C` | Failed to stop camera                           | Major    | The system could not stop the camera when commanded. Retry the stop command; if it persists, check the camera's connection and power.                                                                 |
| `0106001C` | Stop trigger wait signal timeout                | Minor    | The camera did not receive its stop-trigger signal within the expected time. Check the trigger source and cabling for this station.                                                                   |
| `01060013` | Found the same IP                               | Major    | A duplicate IP address was detected on the camera/device network, most likely from a network configuration error. Check the IP settings of all cameras and devices on this station's network segment. |
| `010E0064` | Motor type undefined                            | Major    | The system has no motor type configured for this axis. Check the axis configuration and set the correct motor type before continuing.                                                                 |
| `01100001` | Failed to connect to PLC                        | Major    | The station could not establish a connection to the PLC. Check the communication cable and network configuration between the station and the PLC.                                                     |
| `01130002` | Communication abnormality                       | Major    | Communication between two connected devices on this station failed or became unstable. Check the physical connection and communication settings between the affected devices.                         |
| `80001`    | Waiting for subdrawing preparation data timeout | Warning  | The station waited too long for the subdrawing (job image) preparation data to arrive. Check the job data source and network path feeding this station.                                               |
| `92013`    | Network connection timeout                      | Warning  | A network connection from this station timed out. Check the machine's network status and cabling.                                                                                                     |
| `97005`    | Database connection exception                   | Warning  | The station's connection to the database became abnormal or was lost. Check the database server status and this station's network path to it.                                                         |

---

## 6. ฟิลด์ความรู้แบบมีโครงสร้าง (v1.1): สาเหตุ (Cause) / ผลกระทบ (Impact) / การกู้คืน (Recovery Action)

นอกเหนือจาก `alarm_detail` ที่เป็นประโยคเดียว ตอนนี้แต่ละรหัสจาก 25 รหัสที่ครอบคลุมถึงปัจจุบันจะมีฟิลด์พื้นฐานอีกสามฟิลด์ — ฟิลด์ละหนึ่งอนุประโยค ห้ามใช้ประโยคความรวม:

- **`cause`** — สาเหตุที่แท้จริงที่เป็นไปได้มากที่สุด ต้องมีความเฉพาะเจาะจงและเป็นเชิงเทคนิค ไม่ใช่เพียงการเขียนซ้ำข้อความ AlarmMsg
- **`impact`** — ความหมายเชิงปฏิบัติการใน _ขณะนี้_: การผลิตถูกบล็อกหรือไม่ ผลลัพธ์น่าสงสัยหรือไม่ หรือเป็นเพียงแค่ความล่าช้า? นี่คือมิติที่ `alarm_detail` เพียงอย่างเดียวไม่เคยระบุไว้อย่างชัดเจน
- **`recovery_action`** — คำสั่งเชิงบังคับ มีเนื้อหาเดียวกับประโยคที่สองของ `alarm_detail` แต่ถูกแยกออกมาเป็นฟิลด์ของตัวเองเพื่อให้ UI สามารถแสดงเป็นบรรทัด "ฉันต้องทำอะไร (what do I do)" ได้อย่างชัดเจน

`alarm_detail` จะไม่มีการเปลี่ยนแปลงและยังคงเป็นข้อความสรุปประโยคเดียว (§1); สิ่งเหล่านี้คือส่วนเพิ่มเติม ไม่ใช่สิ่งทดแทน — แดชบอร์ดสามารถแสดงเพียง `alarm_detail` เพื่อการมองผ่านอย่างรวดเร็ว หรือจะแสดงทั้งสามฟิลด์ที่มีโครงสร้างเพื่อการตรวจสอบก็ได้

| Code       | Cause                                                                                                                                                                              | Impact                                                                                                                                               | Recovery Action                                                                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `01180016` | The operator (or an interlock) pressed or triggered the emergency stop control.                                                                                                    | All axis motion is immediately halted and the machine cannot resume until the E-stop is cleared and reset.                                           | Inspect the work area for the cause of the stop, then release the E-stop control and reset the machine before resuming.                               |
| `0C020014` | A person, object, or the machine's own moving parts crossed a light curtain or area guard boundary.                                                                                | Motion is halted on this station until the zone is confirmed clear and the safety circuit is reset.                                                  | Clear the protected zone, confirm no personnel or foreign objects remain, then reset the safety circuit before resuming.                              |
| `0118000E` | A mechanical obstruction, encoder fault, or servo tuning issue caused the actual axis position to diverge from the commanded position beyond the safety threshold.                 | The axis is disabled to prevent a crash or further position loss; the current job on this axis cannot continue.                                      | Stop and inspect the affected axis for obstructions or encoder faults, then re-home the axis before resuming.                                         |
| `01180011` | A mechanical jam, short circuit, or a failing motor/drive caused current draw to exceed the servo drive's rated limit.                                                             | The affected drive trips offline to protect the hardware, halting motion on that axis until reset.                                                   | Power down and inspect the affected axis and drive for a jam or electrical fault before resetting the drive.                                          |
| `0C010001` | A position error, timing fault, or sensor failure allowed the two exposure stages to approach each other beyond the safe separation distance.                                      | Motion is halted immediately to prevent physical damage to both stages; both stages are unavailable until cleared.                                   | Verify both stage positions and clear any obstruction before resuming; do not override without confirming actual stage separation.                    |
| `01180010` | A corrupted motion profile or a mechanical fault caused a commanded or measured axis acceleration to exceed the configured safety limit.                                           | The axis is disabled to prevent an uncontrolled motion event; the current job on this axis cannot continue.                                          | Stop and verify the axis and its motion profile before re-enabling motion.                                                                            |
| `10006`    | The DMD controller did not acknowledge the protection-mode command, likely a communication fault or a controller-side error.                                                       | The imaging device may remain in an unprotected state, which can risk damage during an unsafe condition; exposure is blocked until resolved.         | Retry the operation; if it persists, check the DMD controller connection and power.                                                                   |
| `91009`    | A leak at the board edge, a clogged vacuum port, or a faulty vacuum sensor on this station.                                                                                        | Board hold-down cannot be guaranteed, risking board shift or focus error during exposure on this station.                                            | Check for a leak at the board edge, a clogged vacuum port, or a faulty vacuum sensor on this station.                                                 |
| `90005`    | Board flatness, alignment mark quality, or drift in this station's calibration exceeded the job's configured registration tolerance.                                               | The current board's registration may be out of specification and should be flagged for downstream inspection.                                        | Check board flatness, alignment mark quality, and recent calibration history for this station.                                                        |
| `90004`    | Contamination or damage on the alignment marks, or a grip-mechanism seating issue, prevented registration to the mechanical grip point.                                            | The current board cannot proceed to outer-layer exposure until alignment succeeds.                                                                   | Check the alignment marks for contamination or damage and confirm the grip mechanism is seated correctly.                                             |
| `93004`    | A queued or running job blocked the calibration cycle from starting within the expected time window.                                                                               | The station's calibration is not current, which can degrade registration accuracy on subsequent jobs until calibration completes.                    | Check that no job is queued or running, then retry the calibration.                                                                                   |
| `90001`    | Contamination or damage on the alignment marks, or a grip-mechanism seating issue, prevented registration to the mechanical grip point.                                            | The current board cannot proceed to inner-layer exposure until alignment succeeds.                                                                   | Check the alignment marks for contamination or damage and confirm the grip mechanism is seated correctly.                                             |
| `90012`    | The automatic alignment routine could not converge within its retry limit, and the operator chose to cancel rather than continue retrying.                                         | The current board did not receive exposure and needs to be re-queued after the alignment issue is addressed.                                         | Review the alignment marks and job setup before re-attempting; this is an operator action, not an automatic fault.                                    |
| `70004`    | The job's scan-speed parameter or a mechanical issue with the stage caused the position-synchronized output speed to exceed the configured motion limit.                           | The current exposure pass may have inconsistent dosage due to the speed excursion and should be flagged for quality review.                          | Check the job's scan-speed parameter and the stage's mechanical condition before re-running.                                                          |
| `91008`    | The cleanroom HVAC system drifted outside its setpoint, or the environmental sensor for this station is faulty.                                                                    | Process results (registration, resist behavior) on this station may be affected until the environment returns to the configured window.              | Check the HVAC system and the sensor for this station before resuming production.                                                                     |
| `01060009` | A different camera unit is connected than the one registered for this station, or the station's camera configuration was not updated after a hardware swap.                        | The station cannot verify it is using the correct camera, so imaging is blocked until resolved.                                                      | Confirm the physically connected camera matches the configured serial number, then update the station configuration or reconnect the correct unit.    |
| `0106000C` | The camera did not respond to the stop command, likely due to a communication fault or a camera driver/firmware issue.                                                             | The camera may continue running or capturing after the station expected it to be idle, risking inconsistent state for the next operation.            | Retry the stop command; if the camera still doesn't respond, power-cycle the camera and check its cable connection.                                   |
| `0106001C` | The trigger signal from the controller or I/O board did not arrive in time, likely a timing, cabling, or I/O configuration issue.                                                  | The camera's current capture cycle did not stop as scheduled; the current job step may need to be retried.                                           | Check the trigger source and cabling for this station, then retry the operation.                                                                      |
| `01060013` | Two or more devices on this station's network are configured with the same IP address, typically from a manual misconfiguration or a device replaced without updating its address. | Network communication with the affected devices becomes unreliable or fails outright, which can stall imaging or data transfer.                      | Check the IP settings of all cameras and devices on this station's network segment and correct the duplicate.                                         |
| `010E0064` | The motor-type parameter for this axis was never set, or was cleared by a configuration reset.                                                                                     | The axis cannot be driven correctly since the controller doesn't know how to command this motor type; motion commands to this axis will be rejected. | Check the axis configuration and set the correct motor type before attempting to move this axis.                                                      |
| `01100001` | The PLC is powered off, unreachable on the network, or its communication parameters (IP/port/protocol) don't match the station's configuration.                                    | The station cannot exchange I/O or status with the PLC, which typically blocks the automated production sequence for this station.                   | Check the communication cable and network configuration between the station and the PLC, and confirm the PLC is powered on.                           |
| `01130002` | A cable fault, port misconfiguration, or a device-side fault interrupted communication between the affected devices.                                                               | Data or commands between the affected devices may be lost or delayed, which can stall the current operation.                                         | Check the physical connection and communication settings between the affected devices, then retry.                                                    |
| `80001`    | The upstream system preparing the job's subdrawing image did not deliver it within the expected time, likely due to a slow data source or a network delay.                         | The station cannot begin exposure until the subdrawing data arrives, delaying the current job.                                                       | Check the job data source and the network path feeding this station; retry once the data is confirmed available.                                      |
| `92013`    | The network path to a required service (job server, database, or peer device) was slow or unreachable within the timeout window.                                                   | The operation depending on that network connection did not complete and needs to be retried once connectivity is restored.                           | Check the machine's network status and cabling, then retry the operation.                                                                             |
| `97005`    | The database server is unreachable, overloaded, or the station's connection pool encountered an unexpected error.                                                                  | The station cannot read or write production data until the connection is restored, which can stall data logging or job lookups.                      | Check the database server status and this station's network path to it; the connection typically recovers automatically once the server is reachable. |

## 7. ข้อมูลอ้างอิง SOP / ขั้นตอนการทำงาน — ยังไม่ได้กรอกข้อมูล (SOP / work-instruction references — not yet populated)

`sop_reference` ถูกเพิ่มลงในสคีมา (การย้ายข้อมูล 073) เป็นฟิลด์เสริมที่จะแสดงบนพจนานุกรมการแจ้งเตือน (Alarm Dictionary) เมื่อมีข้อมูล ปัจจุบัน **จะเป็นค่าว่าง (NULL) สำหรับทุกรหัส** — คลังข้อมูลนี้ยังไม่มีเอกสารคู่มือปฏิบัติงานมาตรฐาน (SOP) หรือคำแนะนำการปฏิบัติงาน (Work Instruction) จริงเพื่อเชื่อมโยงไปถึง การสร้าง URL หรือหมายเลขเอกสารจำลองขึ้นมาจะขัดต่อกฎการอ้างอิงแหล่งที่มาข้อเดิมที่คู่มือทั้งหมดนี้ยึดถือ (§4) สิ่งนี้จงใจนำเสนอในฐานะความพร้อมของโครงสร้าง ไม่ใช่การอ้างสิทธิ์ความสมบูรณ์แบบชั่วคราว: เมื่อมีเอกสาร SOP/WI จริง (หรือระบบจัดการเอกสาร) การกรอกฟิลด์นี้คืองานบันทึกข้อมูล ไม่ใช่งานด้านวิศวกรรม — ไม่จำเป็นต้องเปลี่ยนสคีมาหรือแดชบอร์ด

---

## 8. การแช่แข็งและขอบเขต (Freeze & scope)

**สิ่งที่คู่มือนี้ครอบคลุม (v1.1):** 25 รหัสจากรหัสการแจ้งเตือนดั้งเดิมของผู้ผลิตทั้งหมดประมาณ 2,190 รหัสที่มี `alarm_detail` + `cause` + `impact` + `recovery_action` — นี่คือรหัสทั้งหมดที่โปรแกรมจำลองสามารถเข้าถึงได้ในปัจจุบัน (ทั้ง 21 รหัสในแคตตาล็อกจำลอง) รวมกับ 4 รหัสระดับ Critical ที่มีอยู่จริงซึ่งถูกเพิ่มเข้ามาเพื่อเป็นข้อมูลอ้างอิงใน v1.0 นี่ไม่ใช่ "50 อันดับแรก" — ดูเหตุผลได้ด้านล่าง

**ขีดจำกัดสูงสุดของข้อมูลจริงที่พบในระหว่าง v1.0:** บันทึกการผลิตจริงในอดีต (`data/real/ldi_alarm_log_clean.sql`, 10,000 แถว, ตั้งแต่ 2026-04-10 ถึง 2026-07-16, ได้รับการยืนยันว่าเป็นข้อมูลการผลิตของจริง — ไม่มี ID ที่ขึ้นต้นด้วย `SIM-` อยู่ในไฟล์) มีการบันทึก **รหัสแจ้งเตือนที่แตกต่างกันรวมเพียง 20 รหัสเท่านั้น** ไม่ใช่ 50 ไม่มีชุดข้อมูลความถี่จริงในระดับท้องถิ่นที่ใหญ่กว่านี้ให้คัดเลือก 50 อันดับแรกออกมาได้

**ช่องว่างที่เปิดอยู่ ซึ่งไม่เปลี่ยนแปลงใน v1.1:** จากรหัสจริง 20 รหัสนั้น **11 รหัสยังคงไม่มีรายการในแหล่งที่มาแคตตาล็อกผู้ผลิตทั้งสองแห่ง** (`[REDACTED_VENDOR_MANUAL]`, 2,190 รหัส, หรือจากบันทึกส่งออกส่วนเสริม `ldi_alarm_ms_code_clean.sql` แบบ 892 แถว): `90013`, `91012`, `91017`, `91020`, `91024`, `93007`, `91029`, `20`, `20021`, `97014`, `2` รหัสเหล่านี้เป็นรหัสจากการผลิตจริง (UUID จริง, วันที่จริง, รวม 390 จาก 10,000 แถวบันทึก) แต่กลับไม่มีข้อความต้นฉบับเลย จึงยังไม่มีการบันทึกข้อความลงไป — ดู §9, นี่คือช่องว่างที่คำร้องขอนั้นตั้งใจจะปิดลง

**รหัสระดับวิกฤตไม่ได้อ้างอิงตามความถี่:** บันทึกการผลิตจริงไม่พบการเกิดการแจ้งเตือนระดับวิกฤตในช่วงเวลาที่ตรวจสอบ ข้อมูลระดับ Critical 6 รายการมาจากข้อความจริงของผู้ผลิต คัดเลือกตามความชัดเจนของความหมาย (หลีกเลี่ยงรหัสที่ถูกตั้งค่าสถานะแล้วใน `docs/audit/LDI_ALARM_FIDELITY_AUDIT.md` §8 เนื่องจากเป็นคำหลักบวกเท็จหรือคู่ประเภท/ข้อความที่ขัดแย้งกันเอง) ไม่ใช่การจัดอันดับตามการเกิด

**สถานที่ที่มีการใช้งานสิ่งนี้:** `database/migrations/072-alarm-detail-style-guide-v1.sql` (v1.0, `alarm_detail` สำหรับ 15 รหัส) + `database/migrations/073-alarm-knowledge-structured-fields-v1.1.sql` (v1.1, `alarm_detail` สำหรับอีก 10 รหัส + โครงสร้างและเนื้อหาของ `cause`/`impact`/`recovery_action`/`sop_reference` สำหรับทั้งหมด 25 รหัส) — ทั้งสองปลอดภัยที่จะทำงานซ้ำได้หลายครั้ง ถูกเชื่อมต่อเข้ากับทั้งพาธ `scripts/switch-data-mode.sh mock` และ `real` ดังนั้นจึงคงอยู่ได้แม้จะมีการรีเซ็ตแคตตาล็อกในโหมดใดโหมดหนึ่งในอนาคต แดชบอร์ดพจนานุกรมการแจ้งเตือน (Alarm Dictionary) (`ims-ldi-alarm-dictionary.json`) อ่านข้อมูลจากคอลัมน์เหล่านี้โดยตรงแบบสดๆ

**ความไม่สมมาตรที่ทราบกันดี, ระบุไว้อย่างชัดเจน:** รหัสทั้ง 21 รหัสของแคตตาล็อกจำลองมีภาษาอังกฤษสำหรับ `alarm_detail`/`cause`/`impact`/`recovery_action` ตั้งแต่ v1.1. สำหรับรหัสอื่นๆ ประมาณ 2,165 รหัสในแคตตาล็อกจริงของผู้ผลิต (ซึ่งเกี่ยวข้องเฉพาะในโหมดข้อมูลจริงเท่านั้น) กลับไม่มี — นี่ไม่เคยเป็นการเขียนแคตตาล็อกใหม่ทั้งหมด, และหากจะทำให้ถูกต้อง (ตามกฎการอ้างอิงแหล่งที่มาของ §4) จะต้องใช้ข้อมูลความถี่จริงและข้อความต้นฉบับ ซึ่งการดำเนินการครั้งนี้ไม่มีให้สำหรับรหัสส่วนใหญ่เหล่านั้น

**สิ่งที่ไม่ขออ้างสิทธิ์โดยชัดเจน:** นี่ไม่ใช่การปฏิบัติตามมาตรฐาน ISA-18.2 (ดู Known Gaps ของการตรวจสอบครั้งก่อน), นี่ไม่ใช่การครอบคลุมแคตตาล็อกทั้งหมด, และ `sop_reference` ไม่ได้ถูกเติมด้วยเนื้อหาจริง (§7) นี่คือข้อมูลที่มีอยู่จริง อ้างอิงแหล่งที่มาได้ มีรูปแบบสอดคล้องกัน และมีความสมบูรณ์เชิงโครงสร้าง จำนวน 25 รายการ เพื่อเป็นรูปแบบอ้างอิงสำหรับการขยายความครอบคลุมในภายหลัง

## 9. คำร้องขอข้อมูลจำเพาะจากผู้ผลิตสำหรับรหัสที่รอดำเนินการ (Vendor specification request for pending codes)

นี่คือคำร้องขอถึงใครก็ตามที่ดูแลความสัมพันธ์กับผู้ผลิต ไม่ใช่สิ่งที่สามารถแก้ไขได้จากภายในฐานโค้ดนี้ รหัสทั้ง 11 รหัสข้างล่างนี้เกิดขึ้นจริงบนเครื่องจักรในการผลิต (บันทึกข้อมูลจริง 390 แถว, `data/real/ldi_alarm_log_clean.sql`) แต่กลับไม่ปรากฏในไฟล์แคตตาล็อกของผู้ผลิตที่มีอยู่ในปัจจุบันเลย การจะอุดช่องว่างนี้จำเป็นต้องมีสิ่งใดสิ่งหนึ่งดังนี้:

- ไฟล์ส่งออก "รายการรหัสข้อผิดพลาดของเครื่องจักร (Machine error code list)" ที่อัปเดต/สมบูรณ์ยิ่งขึ้นจากผู้ผลิตที่รวมรหัสเหล่านี้ หรือ
- การยืนยันโดยตรงจากทีมงานผู้ผลิต/ฝ่ายบริการภาคสนามว่ารหัสเหล่านี้หมายถึงอะไร เพื่อให้สามารถเขียนข้อมูลภายใต้กฎแหล่งที่มาตามปกติของคู่มือฉบับนี้ได้

**รหัส:** `90013`, `91012`, `91017`, `91020`, `91024`, `93007`, `91029`, `20`, `20021`, `97014`, `2` (จำนวนครั้งที่เกิดขึ้นจริง: 258, 37, 28, 23, 11, 9, 5, 16, 1, 1, 1 ตามลำดับ จากตัวอย่างบันทึกของจริงจำนวน 10,000 แถว)

จนกว่าจะมีการจัดหาข้อมูลมาให้ รหัส 11 รหัสเหล่านี้จะไม่มี `alarm_msg`, `alarm_detail`, `cause`, `impact`, หรือ `recovery_action` ในระบบนี้แต่อย่างใด — ถือว่ายังไม่ทราบข้อมูลจริงๆ ไม่ใช่การเดา
