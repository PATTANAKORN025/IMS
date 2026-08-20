<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../docs/README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Documentation Quality Report

> IMS Enterprise Documentation Program — รายงานฉบับสมบูรณ์, 2026-08-10
>
> ขอบเขต: `docs/**`, `README.md`, `CONTRIBUTING.md`, `.github/**` (ยกเว้น `.github/skills/impeccable/` ซึ่งเป็นแพ็คเกจเครื่องมือจากภายนอก ไม่ใช่เอกสารของ IMS) ได้รับการตรวจสอบเทียบกับ `database/migrations/**`, `monitoring/grafana/dashboards/**` และ `nodered_data/flows/**` ไม่มีการแก้ไขโค้ดรันไทม์ ฐานข้อมูล Docker หรือลอจิกของ Node-RED ในรอบนี้ — ข้อค้นพบที่ต้องมีการอัปเดตโค้ด/สคีมาจะถูกจัดทำเอกสารไว้ใน System Constraints & Technical Boundaries

---

## Files audited

**ไฟล์ markdown จำนวน 43 ไฟล์** ภายใต้ `docs/` (ปัจจุบัน 9 ไฟล์อยู่ใน `docs/archive/`) รวมถึง `README.md`, `CONTRIBUTING.md`, `.github/CODEOWNERS`, เทมเพลต issue 2 รายการ, เทมเพลต PR 1 รายการ และเวิร์กโฟลว์ GitHub Actions 4 รายการ — **รวมทั้งหมด 51 ไฟล์** ทุกการกล่าวอ้างทางเทคนิคได้รับการตรวจสอบกับสิ่งใดสิ่งหนึ่งต่อไปนี้: ฐานข้อมูลจริงที่ใช้งานอยู่ (`docker exec ims-timescaledb psql`), ไฟล์ไมเกรชันจริง, JSON ของแดชบอร์ดจริง, JSON ของ flow Node-REDจริง หรือการรันการทดสอบ/lint จริง — โดยไม่ได้ตั้งสมมติฐานจากเอกสารที่มีอยู่ก่อน

## Files rewritten (9)

| File                                                             | What was wrong                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `CONTRIBUTING.md`                                                | คำแนะนำ source-of-truth ของ Node-RED ที่ย้อนแย้ง (พาธผิด, บอกผู้ร่วมสมทบไม่ให้แก้ไขไฟล์ซอร์สจริง); ฟังก์ชัน `safeStr()` ที่ไม่มีอยู่จริง (ชื่อจริง: `sanitize()`); พาธแดชบอร์ดที่ล้าสมัย                                                                             |
| `docs/operations/ALARM_PLAYBOOK.md`                              | รหัสการแจ้งเตือนที่แต่งขึ้นทั้งหมด (`SYS-001`, `NET-002`, `LDI-001`) ซึ่งไม่เคยมีอยู่ในระบบนี้ แทนที่ด้วยรหัสที่ใช้งานอยู่ในโปรแกรมจำลองจริง 19 รหัส และชื่อกฎการแจ้งเตือนจริง                                                                                         |
| `docs/architecture/ARCHITECTURE.md`                              | ข้อมูลที่ขัดแย้งกันเอง (ข้อความระบุ "9 แดชบอร์ด", แต่แผนภาพในเอกสารระบุ "10"); ตัวเลข RCA Lift แบบฮาร์ดโค้ดที่ล้าสมัยสองรายการ; การระบุถึง "Slack" ที่หลงเหลืออยู่ ในขณะที่เคยมีเพียงข้อมูลรับรองของ LINE/Teams เท่านั้นที่ถูกระบุไว้                                         |
| `docs/architecture/ARCHITECTURE_DIAGRAM.md`                      | ระบุ "LINE Notify" (API ที่ยกเลิกแล้ว) แทนที่จะเป็น LINE Messaging API; การระบุตัวจับเวลา 10 วินาที ทั้งที่ของจริงคือ 30 วินาที                                                                                                                                              |
| `docs/business/BUSINESS_VALUE_ROI.md`                            | จำนวนแดชบอร์ด (4→10), จำนวนคอนเทนเนอร์ (8→10), จำนวนกฎการแจ้งเตือน, การกล่าวอ้างเรื่อง load-test "ความล้มเหลว 0%" ที่เป็นเท็จ เมื่อเทียบกับ budget ความล้มเหลวที่กำหนดไว้ในสคริปต์ k6 จริง ข้อมูลทางการเงิน/ROI ยังคงไว้ตามข้อมูลทางธุรกิจเดิม — อยู่นอกเหนือสิ่งที่การตรวจสอบรอบนี้สามารถตรวจสอบได้อย่างอิสระ |
| `docs/product/PRODUCT.md`                                        | ละเว้นความสามารถด้าน LDI manufacturing/SPC/RCA ทั้งหมด; จำนวนแดชบอร์ดผิดพลาด; ช่องทางการแจ้งเตือนผิดพลาด (Slack ซึ่งไม่เคยเชื่อมต่อจริง); โทเค็นสีที่ล้าสมัย                                                                                                            |
| `docs/product/CONTEXT.md`                                        | อ้างอิงถึงไฟล์ 5 ไฟล์ที่ไม่มีอยู่ใน repo นี้; พาธ Node-RED ผิดพลาด; ช่องทางการแจ้งเตือนผิดพลาด (หมายเหตุ: ไฟล์นี้ถูก gitignore — การแก้ไขจึงมีผลเฉพาะในเครื่อง ไม่ได้เป็นส่วนหนึ่งของ repo ที่ถูกติดตาม)                                                                       |
| `README.md`                                                      | ตารางเอกสารขาดข้อมูลหนังสือแพลตฟอร์มและคู่มือใหม่ 8 รายการ; มีการอ้างอิง "LINE Notify"/"Slack" ที่ล้าสมัย 3 รายการ; จำนวนแดชบอร์ดและตัวเลขการเก็บรักษาข้อมูล (retention) ที่ล้าสมัย ซึ่งตรงกับค่าไมเกรชันที่ล้าสมัยมากกว่าฐานข้อมูลที่ใช้งานจริง                                     |
| `docs/user/USER_MANUAL.md`, `docs/operations/TROUBLESHOOTING.md` | คำศัพท์ "LINE Notify"; คำสั่งการกู้คืน Node-RED ที่อ้างอิงพาธที่ไม่มีอยู่จริง และหากทำตามจะทำให้ `flows.json` เสียหายมากยิ่งขึ้น                                                                                                                                              |

## Files added (10)

`docs/architecture/LDI_SPC_GUIDE.md`, `LDI_RCA_GUIDE.md`, `ALARM_SEVERITY_GUIDE.md`, `DATA_FLOW.md`, `DATA_RETENTION.md`, `SECURITY_MODEL.md`, `IMS_PLATFORM_BOOK.md`; `docs/operations/INCIDENT_RESPONSE.md`, `BACKUP_RESTORE.md`; `docs/archive/README.md` สูตรประกอบ รูปภาพ และแผนภาพทุกรายการมีที่มาจากการสืบค้นข้อมูลจริง การไมเกรชันจริง หรือการรันการทดสอบจริง — ไม่ได้อ้างอิงจากเอกสารฉบับก่อนหน้า (ที่บางส่วนแต่งขึ้น)

## Files archived (8)

ย้ายไปยังโฟลเดอร์ `docs/archive/` ใหม่ที่มีการติดตามด้วย git (ไม่ใช่ `ARCHIVES/` เดิมของ repo ซึ่งถูก gitignore และจะส่งผลให้ถูกลบออกจาก repo ที่แชร์): รายงานการตรวจสอบแบบระบุวันที่ 4 รายการ, รายงานเบนช์มาร์กเฟส-2 จำนวน 2 รายการ, ภาพรวมแผนการพัฒนา 1 รายการ และรายงานสรุปผลการฝึกงาน เอกสารแต่ละฉบับจะมีแบนเนอร์ระบุวันที่ และระบุว่าตัวเลขเป็นข้อมูลในอดีต ไม่ใช่ข้อมูลปัจจุบัน

## Broken links & references fixed

- พบและแก้ไขลิงก์ markdown แบบสัมพัทธ์ที่ใช้งานไม่ได้ 0 รายการ จากเอกสารที่ไม่ได้จัดเก็บ (archive) ทั้งหมด 36 ไฟล์ (ลิงก์ 131 รายการได้รับการตรวจสอบผ่านโปรแกรม)
- คำสั่งการกู้คืนที่ใช้งานไม่ได้จริง 1 รายการ (`TROUBLESHOOTING.md`, อ้างอิงพาธที่ไม่มีอยู่จริง และการดำเนินการกู้คืนที่ผิดพลาดโดยสิ้นเชิง)
- การอ้างอิงถึงไฟล์ที่ไม่มีอยู่จริง 5 รายการใน `CONTEXT.md` (`CLAUDE.md`, `GLOBAL-INSTRUCTIONS.md`, `TASKS.md`, `MEMORY.md`, `checkpoint.md`)

## Terminology corrections

| Wrong                                                                          | Correct                                           | Occurrences fixed    |
| ------------------------------------------------------------------------------ | ------------------------------------------------- | -------------------- |
| `node-red/flows/`                                                              | `nodered_data/flows/`                             | 3 files              |
| `safeStr()`                                                                    | `sanitize()`                                      | 1 file (2 mentions)  |
| LINE Notify (discontinued 2025)                                                | LINE Messaging API                                | 4 files              |
| Slack (never actually integrated)                                              | LINE Messaging API + MS Teams                     | 4 files              |
| "12 Grafana dashboards" / "4 dashboards" / "4 infrastructure, 8 manufacturing" | 14 dashboards, 6 infrastructure + 8 manufacturing | 6 files              |
| Fictional alarm codes (`SYS-001` etc.)                                         | Real numeric codes from `ldi_alarm_ms_code`       | 1 file, full rewrite |

อภิธานศัพท์มาตรฐาน (IMS, LDI, EAP, SPC, RCA, Andon, CAGG, Cpk, Lift) ตอนนี้อยู่ใน `docs/architecture/IMS_PLATFORM_BOOK.md`

## System Constraints & Technical Boundaries discovered (docs-only scope)

การตรวจสอบความถูกต้องของข้อมูลสำหรับคู่มือฉบับใหม่ พบข้อจำกัดทางเทคนิค 2 ประการ ซึ่งทั้งคู่ได้รับการบันทึกไว้ในส่วน System Constraints & Technical Boundaries ของ `ARCHITECTURE.md`:

1. **SPC test-coverage constraint:** ชุดทดสอบ regression ของ golden-dataset (`tests/e2e/golden-dataset-spc.js`) ไม่สามารถตรวจสอบสูตร Cpk ของ `v_machine_spc_fleet` ได้จริงตั้งแต่การไมเกรชัน 064 แปลงให้เป็น materialized view — การแทรกข้อมูลสังเคราะห์ระดับทรานแซกชันของการทดสอบไม่สามารถมองเห็นได้โดย materialized view การตรวจสอบ 5 จาก 7 รายการยังคงผ่าน (การติดตั้งใช้งานแบบ non-materialized); 2 รายการส่งคืนผลลัพธ์การแยกวิเคราะห์ (parse) ที่เป็นขยะ ไม่ใช่ข้อบกพร่องของสูตรที่ได้รับการยืนยัน
2. **Retention-policy drift:** `postgres/init/` (การเริ่มต้นระบบแบบ fresh-deploy) และ `database/migrations/016` (เส้นทางแบบ incremental) กำหนดค่าการเก็บรักษาข้อมูลที่แตกต่างกันสำหรับตารางเดียวกัน (30 วันเทียบกับ 14 วัน) ฐานข้อมูลที่ใช้งานจริงตรงกับ `postgres/init/` ซึ่งหมายความว่าการไมเกรชัน 016 อาจไม่เคยถูกนำไปใช้กับการปรับใช้นี้โดยเฉพาะ

## Remaining items

- `docs/operations/SCALING_PLAN.md`, `docs/product/ONBOARDING_SCRIPT.md` — ตรวจสอบแบบสุ่ม พบว่าไม่มีข้อผิดพลาดที่ได้รับการยืนยัน แต่ยังไม่ได้ตรวจสอบซ้ำเชิงลึกบรรทัดต่อบรรทัด แนะนำให้มีการตรวจสอบเพิ่มเติม
- `.github/workflows/ci.yml` และ `ci-flows.yml` ทั้งคู่ใช้ชื่อแสดงผลว่า `CI` — ทำให้สับสนแต่ไม่ได้ซ้ำซ้อนกันอย่างแท้จริง (ทั้งคู่ตรวจสอบสิ่งที่แตกต่างกัน) ยังไม่ได้แก้ไข; จำเป็นต้องแก้ไขไฟล์เวิร์กโฟลว์ซึ่งอยู่นอกเหนือขอบเขตของเอกสาร
- ช่องว่างของนโยบายการรีสตาร์ทคอนเทนเนอร์ที่พบจากการทดสอบ DR และทริกเกอร์ที่ไม่น่าเชื่อถือของ Node-RED watchdog สำหรับโหมดความล้มเหลวนั้น ยังคงเป็นปัญหาทางวิศวกรรมที่เปิดอยู่ (บันทึกไว้ใน `ARCHITECTURE.md`, `INCIDENT_RESPONSE.md`, `BACKUP_RESTORE.md`) — การแก้ไขที่แท้จริงต้องมีการเปลี่ยนแปลงโค้ดซึ่งอยู่นอกขอบเขตของรอบนี้
- ระยะ Soak Test ของ `IMS_MANUFACTURING_PLATFORM_V2.md` ยังคงรวบรวมตัวอย่างจริงผ่านงานที่กำหนดเวลาไว้; ไม่สามารถปิดเพื่อสรุปผลได้จนกว่าเวลาในโลกแห่งความเป็นจริงจะผ่านไปตามกำหนด
- DR Drill 3 (การสร้าง stack ใหม่แบบทำลายล้างเต็มรูปแบบ) ยังไม่ได้ดำเนินการ เพื่อรอการยืนยันอย่างชัดเจนจากสิ่งที่ Drill 2 ค้นพบเกี่ยวกับความน่าเชื่อถือของการกู้คืน

## Quality bar assessment

ทุกเอกสารที่สร้างขึ้นหรือเขียนใหม่จำนวนมากในรอบนี้ มีคำประกาศที่มา (ตรวจสอบอะไร, เทียบกับอะไร, ในวันที่เท่าไร) — ซึ่งเป็นมาตรฐานหลักฐานเดียวกันกับที่เซสชันนี้กำหนดไว้สำหรับ `LDI_VALIDATION_PROTOCOL.md` และหลักฐานการทดสอบ DR/Soak ตัวเลขที่คาดเดาได้ว่าจะเปลี่ยนแปลงเมื่อเวลาผ่านไป (ตัวเลข RCA Lift, นโยบายการเก็บรักษาข้อมูลปัจจุบัน) จะถูกระบุอย่างชัดเจนว่าเป็นข้อมูลแบบ point-in-time snapshot พร้อมด้วยคำสั่งสืบค้น (query) ที่จำเป็นในการตรวจสอบซ้ำ แทนที่จะนำเสนอเป็นข้อเท็จจริงถาวร นี่คือมาตรฐานที่แนะนำต่อไปสำหรับเอกสารการปฏิบัติงานใหม่ใดๆ ใน repo นี้
