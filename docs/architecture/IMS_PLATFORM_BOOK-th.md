# IMS Platform Book

> **จุดเริ่มต้นสำหรับเอกสารประกอบ IMS ทั้งหมด** เอกสารฉบับนี้เป็นศูนย์รวมสำหรับการนำทาง (navigational hub) ไม่ใช่การคัดลอกเอกสารที่อ้างอิงถึง — แต่ละหัวข้อจะถูกจัดเก็บไว้ในที่เดียว และสมุดฉบับนี้จะเชื่อมโยงไปยังตำแหน่งนั้น หากมีข้อมูลใดในเอกสารฉบับนี้ไม่ตรงกับเอกสารที่เชื่อมโยงไป ให้ถือว่าเอกสารปลายทางเป็นข้อเท็จจริงหลัก (authoritative) สมุดฉบับนี้ทำหน้าที่เป็นเพียงแผนที่ ไม่ใช่พื้นที่จริง
>
> **แหล่งที่มา (Provenance):** รวบรวมเมื่อวันที่ 2026-08-10 หลังจากการตรวจสอบ (audit) และเขียนเอกสารใหม่ทั้งหมด (การเปิดใช้งาน (rollout) `docs/architecture/IMS_MANUFACTURING_PLATFORM_V2.md` ตลอดจนโครงการ Enterprise Documentation Program ระดับกว้างที่สมุดฉบับนี้เป็นส่วนหนึ่ง) ทุกข้อเท็จจริงที่ระบุโดยตรงในสมุดฉบับนี้ (ไม่ใช่แค่ลิงก์) ได้รับการตรวจสอบยืนยันกับระบบจริง (live system) ณ วันที่ดังกล่าวแล้ว

---

## บทสรุปผู้บริหาร (Executive summary)

IMS คือ monitoring platform ที่ครอบคลุมสองโดเมน ได้แก่ **infrastructure** (เซิร์ฟเวอร์, อุปกรณ์เครือข่าย) และ **LDI manufacturing** (สายการผลิต PCB Laser Direct Imaging) — โดยใช้งาน TimescaleDB ร่วมกันหนึ่งตัว, Grafana หนึ่งอินสแตนซ์ (15 แดชบอร์ด แบ่งออกเป็นโฟลเดอร์ `Infrastructure`/`Manufacturing`), และระบบ alerting ผ่านทั้งกฎเนทีฟของ Grafana และ Prometheus/Alertmanager ฝั่งการผลิตครอบคลุมการวิเคราะห์ (analytics) ทางด้าน SPC (กระบวนการวัดความสามารถ Cpk) และ RCA (ความสัมพันธ์ระหว่างการแจ้งเตือนกับพารามิเตอร์) ที่แท้จริง ไม่ใช่เป็นเพียงการแสดงผล telemetry เท่านั้น ทั้งสองโดเมนถูกแยกออกจากกันเชิงตรรกะ (logical separation) ด้วย (โฟลเดอร์, แท็ก, `CODEOWNERS`) แต่ใช้งาน infrastructure ร่วมกัน — ดู `docs/architecture/OWNERSHIP.md` สำหรับเหตุผลว่าทำไมการแยกโครงสร้างทางกายภาพ (physical split) จึงไม่คุ้มค่าสำหรับขนาดของระบบในปัจจุบัน

---

## เริ่มต้นที่นี่ ตามบทบาท (Start here, by role)

### ผู้จัดการโรงงาน / วิศวกรกระบวนการผลิต (Plant management / process engineering)

1. [`docs/product/PRODUCT.md`](../product/PRODUCT.md) — ระบบนี้ทำงานอย่างไรและทำเพื่อใคร
2. [`docs/architecture/LDI_SPC_GUIDE.md`](LDI_SPC_GUIDE.md) — ระเบียบวิธีวิจัยเรื่องความสามารถของกระบวนการ (process capability methodology)
3. [`docs/architecture/LDI_RCA_GUIDE.md`](LDI_RCA_GUIDE.md) — ระเบียบวิธีวิจัยการหาความสัมพันธ์ของสาเหตุรากฐาน (root-cause correlation methodology)
4. [`docs/architecture/ALARM_SEVERITY_GUIDE.md`](ALARM_SEVERITY_GUIDE.md) — อนุกรมวิธานของการแจ้งเตือน (alarm taxonomy)
5. [`docs/operations/SOP_OPERATOR.md`](../operations/SOP_OPERATOR.md) — ขั้นตอนการปฏิบัติงานมาตรฐาน (SOP) สำหรับพนักงานควบคุมเครื่องจักรหน้างาน (floor-operator)

### วิศวกรความน่าเชื่อถือของไซต์ / ปฏิบัติการ (SRE / operations)

1. [`docs/architecture/ARCHITECTURE.md`](ARCHITECTURE.md) — โทโพโลยีของระบบ (system topology), รายการคอนเทนเนอร์, **ข้อกำหนดและขอบเขตทางเทคนิค (System Constraints & Technical Boundaries)**
2. [`docs/architecture/DATA_FLOW.md`](DATA_FLOW.md) — แผนภาพไปป์ไลน์ (pipeline diagrams) แบบ end-to-end
3. [`docs/operations/INCIDENT_RESPONSE.md`](../operations/INCIDENT_RESPONSE.md) — ตัวอย่างเหตุการณ์ (incident) จริงพร้อมสาเหตุรากฐานที่ได้รับการแก้ไขแล้ว
4. [`docs/operations/ALARM_PLAYBOOK.md`](../operations/ALARM_PLAYBOOK.md) — ขั้นตอนการตอบสนองเบื้องต้นต่อแต่ละการแจ้งเตือน
5. [`docs/operations/BACKUP_RESTORE.md`](../operations/BACKUP_RESTORE.md) / [`docs/operations/DR_TEST_PLAN.md`](../operations/DR_TEST_PLAN.md) — ขั้นตอนการกู้คืนระบบจากภัยพิบัติ (disaster-recovery procedures) ที่ใช้ได้จริงและมีหลักฐานอ้างอิง
6. [`docs/operations/TROUBLESHOOTING.md`](../operations/TROUBLESHOOTING.md) — คำสั่ง debugging เบื้องต้นสำหรับ SRE
7. [`docs/admin/ADMIN_MANUAL.md`](../admin/ADMIN_MANUAL.md) — การจัดการคอนเทนเนอร์ (container ops), การลงทะเบียนอุปกรณ์, การทำไมเกรชัน (migrations)

### การประกันคุณภาพ / การตรวจสอบ / การปฏิบัติตามข้อกำหนด (QA / audit / compliance)

1. [`docs/architecture/DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md) — เอกสารอ้างอิงของ ตาราง/คอลัมน์/วิว ที่สร้างอัตโนมัติ (auto-generated) และผ่านการตรวจสอบโดย CI (CI-checked)
2. [`docs/architecture/DASHBOARD_INVENTORY.md`](DASHBOARD_INVENTORY.md) — เอกสารอ้างอิงของ dashboard/panel ที่สร้างอัตโนมัติและผ่านการตรวจสอบโดย CI
3. [`docs/architecture/DATA_RETENTION.md`](DATA_RETENTION.md) — นโยบายการจัดเก็บข้อมูล (retention policy) บนระบบจริง รวมถึงช่องว่างด้านธรรมาภิบาลข้อมูล (governance gap) ที่มีการบันทึกไว้
4. [`docs/architecture/SECURITY_MODEL.md`](SECURITY_MODEL.md) + [`SECURITY.md`](../../SECURITY.md) — ขอบเขตความน่าเชื่อถือ (trust boundaries) และนโยบายความปลอดภัย (security policy)
5. [`docs/operations/LDI_VALIDATION_PROTOCOL.md`](../operations/LDI_VALIDATION_PROTOCOL.md) — ขั้นตอนการอนุมัติเพื่อขึ้นระบบจริง (production sign-off procedure) พร้อมหลักฐานการตรวจสอบจากระบบจริง
6. [`docs/operations/DEPLOYMENT_READINESS.md`](../operations/DEPLOYMENT_READINESS.md), [`RELEASE_CHECKLIST.md`](../operations/RELEASE_CHECKLIST.md) — เกณฑ์เงื่อนไขก่อนการรีลีส (pre-release gates)

### นักพัฒนาใหม่ (New developers)

1. [`CONTRIBUTING.md`](../../CONTRIBUTING.md) — ขั้นตอนการทำงาน (workflow), ธรรมเนียมปฏิบัติ (conventions), โครงสร้างของโปรเจกต์
2. [`docs/architecture/ARCHITECTURE.md`](ARCHITECTURE.md) — ควรอ่านไฟล์นี้ก่อนทำการเปลี่ยนแปลงใดๆ
3. [`docs/architecture/DATA_FLOW.md`](DATA_FLOW.md) — ข้อมูลเคลื่อนย้ายได้อย่างไรในความเป็นจริง
4. [`docs/architecture/OWNERSHIP.md`](OWNERSHIP.md) — ใครเป็นเจ้าของส่วนไหน
5. [`docs/architecture/GRAFANA_DESIGN_SYSTEM.md`](GRAFANA_DESIGN_SYSTEM.md) — ธรรมเนียมปฏิบัติของ dashboard ซึ่งถูกบังคับใช้ (enforced) โดย CI

---

## แผนผังเอกสารฉบับเต็ม (Full document map)

### สถาปัตยกรรมและการออกแบบโดเมน (Architecture & domain design)

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — โทโพโลยีของระบบ (system topology), รายการคอนเทนเนอร์, ข้อกำหนดและขอบเขตทางเทคนิค (System Constraints & Technical Boundaries)
- [`ARCHITECTURE_DIAGRAM.md`](ARCHITECTURE_DIAGRAM.md) — แผนภาพ Mermaid C4
- [`DATA_FLOW.md`](DATA_FLOW.md) — แผนภาพแสดงการไหลของข้อมูล (data flow diagrams) แบบ end-to-end
- [`IMS_MANUFACTURING_PLATFORM_V2.md`](IMS_MANUFACTURING_PLATFORM_V2.md) — แผนการนำการแบ่งแยกโดเมน infra/manufacturing ไปใช้งานจริง (rollout plan) และบันทึกหลักฐานการทดสอบ (Phases A/B/C, Soak Test, DR Test)
- [`MANUFACTURING_DOMAIN.md`](MANUFACTURING_DOMAIN.md) — รูปแบบ (pattern) ของ schema และ dashboard สำหรับ LDI และวิธีการออนบอร์ดกระบวนการผลิตประเภทอื่นในอนาคต (AOI, การชุบ (plating), การกัดกรด (etching), การเจาะ (drilling))
- [`EAP_ARCHITECTURE.md`](EAP_ARCHITECTURE.md) — อะแดปเตอร์การรวมการทำงานของอุปกรณ์ (equipment integration adapters) (SNMP, HTTP/JSON และ ข้อกำหนดของ SECS/GEM ที่ยังไม่ได้พัฒนาขึ้น (unimplemented))
- [`OWNERSHIP.md`](OWNERSHIP.md) — ขอบเขตของโดเมน infra/manufacturing ซึ่งบังคับใช้ผ่าน `CODEOWNERS`
- [`SECURITY_MODEL.md`](SECURITY_MODEL.md) — ขอบเขตความน่าเชื่อถือ (trust boundaries)

### คู่มือโดเมนการผลิต (LDI) (Manufacturing (LDI) domain guides)

- [`LDI_SPC_GUIDE.md`](LDI_SPC_GUIDE.md) — ระเบียบวิธีวิจัยด้านความสามารถของกระบวนการ (Cpk methodology)
- [`LDI_RCA_GUIDE.md`](LDI_RCA_GUIDE.md) — ระเบียบวิธีวิจัยความสัมพันธ์ของสาเหตุรากฐาน (Lift/Confidence methodology)
- [`ALARM_SEVERITY_GUIDE.md`](ALARM_SEVERITY_GUIDE.md) — อนุกรมวิธานของความรุนแรงระดับ 4-tier (4-tier severity taxonomy) และขอบเขตของ ISA-18.2
- [`DATA_RETENTION.md`](DATA_RETENTION.md) — นโยบายการจัดเก็บข้อมูล/การบีบอัดข้อมูล (retention/compression policy) บนระบบจริง
- [`FUTURE_ANALYTICS.md`](FUTURE_ANALYTICS.md) — แนวคิดที่มีเฉพาะบน roadmap (การเบี่ยงเบนเชิงพยากรณ์ (predictive drift), การให้คะแนน AI/ความผิดปกติ (anomaly scoring), RCA แบบหลายปัจจัย (multi-factor RCA)) ซึ่งมีการระบุอย่างชัดเจนว่า **ยังไม่ได้ถูกพัฒนา (not implemented)** — จะไม่มีสิ่งใดในไฟล์นี้ที่เป็นเรื่องจริงจนกว่าจะมีการสร้างชุดทดสอบด้วย golden-dataset เฉพาะของสิ่งนั้น ซึ่งต้องมีมาตรฐานเดียวกันกับการคำนวณ SPC/RCA ทุกตัวที่มีการส่งมอบไปแล้ว

### ระบบการออกแบบ (Design system)

- [`GRAFANA_DESIGN_SYSTEM.md`](GRAFANA_DESIGN_SYSTEM.md) — โทเค็นสี (color tokens), การจัดการตัวพิมพ์ (typography), ธรรมเนียมปฏิบัติของ panel ซึ่งบังคับใช้โดย `dashboard-linter.js`
- [`PANEL_TOKENS.md`](PANEL_TOKENS.md) — ข้อกำหนดรายละเอียดของโทเค็น (token spec) สำหรับหน่วย/ขีดจำกัด (unit/threshold)

### เอกสารที่สร้างโดยอัตโนมัติ (ตรวจสอบโดย CI, ห้ามแก้ไขด้วยตนเองเด็ดขาด) (Auto-generated (CI-checked, never hand-edit))

- [`DASHBOARD_INVENTORY.md`](DASHBOARD_INVENTORY.md) — `node scripts/generate-dashboard-inventory.js`
- [`DATABASE_SCHEMA.md`](DATABASE_SCHEMA.md) — `node scripts/generate-schema-inventory.js`

### ฝ่ายปฏิบัติการ (Operations)

- [`../operations/SOP_OPERATOR.md`](../operations/SOP_OPERATOR.md) — SOP สำหรับผู้ปฏิบัติงานหน้างาน (floor operator SOP)
- [`../operations/ALARM_PLAYBOOK.md`](../operations/ALARM_PLAYBOOK.md) — การตอบสนองต่อการแจ้งเตือนในขั้นแรก (alert first-response)
- [`../operations/INCIDENT_RESPONSE.md`](../operations/INCIDENT_RESPONSE.md) — โครงร่างระดับความรุนแรงของเหตุการณ์ (incident severity framework) และตัวอย่างที่เกิดขึ้นจริง
- [`../operations/BACKUP_RESTORE.md`](../operations/BACKUP_RESTORE.md) — ขั้นตอนการสำรองข้อมูล/กู้คืนข้อมูล (backup/restore procedure) พร้อมระบุเวลาดำเนินการจริง
- [`../operations/DR_TEST_PLAN.md`](../operations/DR_TEST_PLAN.md) — การซ้อมแผนกู้คืนระบบจากภัยพิบัติ (disaster-recovery drills)
- [`../operations/TROUBLESHOOTING.md`](../operations/TROUBLESHOOTING.md) — การดีบักทั่วไปสำหรับ SRE
- [`../operations/SCALING_PLAN.md`](../operations/SCALING_PLAN.md) — การขยายระบบ (scaling) จากเครื่องจักร 1 เครื่องเป็น 1000+ เครื่อง
- [`../operations/LDI_VALIDATION_PROTOCOL.md`](../operations/LDI_VALIDATION_PROTOCOL.md) — ขั้นตอนการอนุมัติการทำงานจริง (production sign-off procedure)
- [`../operations/DEPLOYMENT_READINESS.md`](../operations/DEPLOYMENT_READINESS.md), [`RELEASE_CHECKLIST.md`](../operations/RELEASE_CHECKLIST.md) — เกณฑ์เงื่อนไขก่อนการรีลีส (release gates)
- [`../REAL-DATA-IMPORT.md`](../REAL-DATA-IMPORT.md) — การใช้งานโหมดข้อมูลจริงเปรียบเทียบกับข้อมูลสมมติ (real vs. mock data mode)

### คู่มือต่างๆ (Manuals)

- [`../user/USER_MANUAL.md`](../user/USER_MANUAL.md) — คู่มือแนะนำ dashboard และแหล่งอ้างอิงค่าเมตริก (metric reference)
- [`../admin/ADMIN_MANUAL.md`](../admin/ADMIN_MANUAL.md) — การปฏิบัติการของคอนเทนเนอร์ (container ops), การลงทะเบียนอุปกรณ์, การทำไมเกรชัน (migrations), การสำรองข้อมูล/การกู้คืนข้อมูล (backup/recovery)

### ธรรมาภิบาลและกระบวนการ (Governance & process)

- [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md) — เวิร์กโฟลว์ของการพัฒนา (development workflow)
- [`../../SECURITY.md`](../../SECURITY.md) — นโยบายความปลอดภัย (security policy)
- [`../../.github/CODEOWNERS`](../../.github/CODEOWNERS) — การบังคับใช้ขอบเขตความเป็นเจ้าของ (enforced ownership boundaries)

### บริบทด้านผลิตภัณฑ์และธุรกิจ (Product & business context)

- [`../product/PRODUCT.md`](../product/PRODUCT.md) — สรุปรายละเอียดผลิตภัณฑ์ในหนึ่งหน้ากระดาษ (product one-pager)
- [`../product/ONBOARDING_SCRIPT.md`](../product/ONBOARDING_SCRIPT.md) — สตอรี่บอร์ดสำหรับบันทึกวิดีโอ/GIF
- [`../business/BUSINESS_VALUE_ROI.md`](../business/BUSINESS_VALUE_ROI.md) — เรื่องราวสรุปตัวชี้วัดผลตอบแทนจากการลงทุนระดับผู้บริหาร (executive ROI narrative)

### บันทึกประวัติศาสตร์ (Historical record)

- [`../archive/`](../archive/) — ภาพรวม (snapshots) ณ เวลาต่างๆ ที่ลงวันที่ไว้ (รายงานการตรวจสอบ (audit reports), รายงานผลการประเมินเทียบเคียง (benchmark reports), บทสรุปผลการฝึกงานของนักศึกษาฝึกงาน) ไฟล์เหล่านี้ไม่ใช่เอกสารที่ยังใช้งานอยู่ (Not living documentation) — ดู `docs/archive/README.md`
- [`../DOCUMENTATION_QUALITY_REPORT.md`](../DOCUMENTATION_QUALITY_REPORT.md) — รายงานการตรวจสอบ/เขียนเอกสารใหม่ ซึ่งเป็นต้นกำเนิดของการทำสมุดฉบับนี้

---

## คำศัพท์เฉพาะทาง (Terminology)

ดูส่วนโดเมนของไฟล์ `docs/architecture/ARCHITECTURE.md` สำหรับบริบทแบบเต็ม รูปแบบย่อของอภิธานศัพท์ (glossary):

| คำศัพท์ (Term)    | ความหมาย (Meaning)                                                                                                                                                                                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **IMS**           | แพลตฟอร์มโดยรวม — รวมทั้งโดเมนโครงสร้างพื้นฐาน (infrastructure) และโดเมนการผลิต LDI                                                                                                                                                                        |
| **LDI**           | Laser Direct Imaging — กระบวนการฉายแสงสร้างวงจร (exposure process) สำหรับ PCB ซึ่งถูกมอนิเตอร์โดยโดเมนการผลิตของระบบนี้                                                                                                                                                         |
| **EAP**           | Equipment Automation Program — การรวบรวมอุปกรณ์ (equipment integration) ในรูปแบบ SECS/GEM (ดู `EAP_ARCHITECTURE.md`); ไม่ใช่ "Enterprise Application Platform"                                                                                                              |
| **SPC**           | Statistical Process Control — การติดตามความสามารถของกระบวนการตามดัชนี Cpk (ดู `LDI_SPC_GUIDE.md`)                                                                                                                                                        |
| **RCA**           | Root Cause Analysis — การหาความสัมพันธ์ระหว่างการแจ้งเตือนกับพารามิเตอร์ของกระบวนการ (alarm-to-process-parameter correlation) ผ่านค่าเมตริก Lift (ดู `LDI_RCA_GUIDE.md`) ไม่ใช่การวิเคราะห์เพื่อแก้ปัญหาความผิดปกติของอุปกรณ์ (equipment fault diagnosis)                                                                                                            |
| **Andon**         | The Operator Andon Board — หน้าจอสำหรับดูสถานะบนพื้นโรงงาน (floor display) เพียงชำเลืองมอง, อ้างอิงตามมาตรฐาน ISA-101 (การออกแบบ HMI) อย่าสับสนกับมาตรฐาน ISA-18.2 (การจัดการการแจ้งเตือน) หน้าจอนี้ออกแบบมาเพื่อไม่ให้มีการโต้ตอบอย่างตั้งใจ (TV-wall kiosk); ดูส่วน Alarm Console สำหรับเส้นทางการเขียนข้อมูล (write-path) ของพนักงานควบคุมเครื่องจักร |
| **Alarm Console** | `IMS LDI - Alarm Console` — dashboard ที่เกิดการดำเนินการแบบ Acknowledge/Resolve ซึ่งจะมีการบันทึกข้อมูลไปยัง `public.ldi_alarm_lifecycle` ผ่าน `services/alarm-api` เครื่องมือนี้เป็นส่วนควบ (Companion) กับบอร์ด Andon แบบอ่านอย่างเดียว ไม่ใช่เครื่องมือสำหรับใช้งานทดแทน                     |
| **CAGG**          | TimescaleDB Continuous Aggregate — การสรุปผลรวมที่ถูกคำนวณไว้ล่วงหน้า (pre-computed rollup) ซึ่งจะมีการอัปเดตแบบเพิ่มทีละส่วน (incrementally updates) (ดูส่วนของ rollup chain ในไฟล์ `DATA_FLOW.md`)                                                                                                                             |
| **Cpk**           | Process capability index (ดัชนีชี้วัดความสามารถของกระบวนการ) — ดูสมการที่ใช้จริงที่นี่ในไฟล์ `LDI_SPC_GUIDE.md`                                                                                                                                                                   |
| **Lift**          | เมตริกเพื่อหาความสัมพันธ์ด้านความแข็งแกร่ง (correlation strength metric) สำหรับการทำ RCA — ดู `LDI_RCA_GUIDE.md`                                                                                                                                                                                        |

## ข้อกำหนดและขอบเขตทางเทคนิค (System Constraints & Technical Boundaries)

ส่วนข้อกำหนดและขอบเขตทางเทคนิคใน `docs/architecture/ARCHITECTURE.md` ถือเป็นเอกสารยืนยันข้อเท็จจริงหลักเพียงหนึ่งเดียวของข้อกำหนดในระบบนี้:

- ขอบเขตความครอบคลุมของการทดสอบ (test-coverage boundaries) สำหรับชุดการทดสอบการถดถอยของ golden-dataset ภายใน SPC
- ข้อกำหนดนโยบายการเก็บรักษาข้อมูล (retention-policy definitions) ระหว่าง `postgres/init/` กับ `database/migrations/`
- ข้อกำหนดนโยบายการเริ่มทำงานใหม่ของคอนเทนเนอร์ (container restart-policy behavior) ซึ่งประเมินในระหว่างการทดสอบ DR
- พารามิเตอร์ที่ถูกสงวนไว้สำหรับการรวมระบบในอนาคตสำหรับ `ldi_metrics`
- ขอบเขตที่แม่นยำของ ISA-18.2 (เกี่ยวข้องกับรูปแบบของงาน)
