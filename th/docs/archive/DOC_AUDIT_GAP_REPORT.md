<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# Documentation Audit — Gap Report

> **ขอบเขต:** เอกสารปัจจุบันทั้งหมด (ที่ไม่ใช่ `docs/archive/`) ได้รับการตรวจสอบกับสถานะจริงของ repo — `docker-compose.yaml`, `docker-compose.prod.yaml`, `database/migrations/` (53 ไฟล์, จนถึง 078), `scripts/`, `monitoring/` configs และไฟล์ JSON แดชบอร์ดที่ใช้งานจริง 12 ไฟล์ เป็นการตรวจสอบแบบอ่านอย่างเดียว; ไม่มีการแก้ไขไฟล์ใดๆ เพื่อจัดทำรายงานฉบับนี้
>
> **ยกเว้นจากการติดแฟล็กซ้ำ (ได้รับการตรวจสอบและแก้ไขในรอบก่อนหน้าของเซสชันนี้แล้ว):** `docs/architecture/ARCHITECTURE.md`, `docs/architecture/SECURITY_MODEL.md`, `docs/user/USER_MANUAL.md`, `docs/operations/ALARM_PLAYBOOK.md`, `docs/architecture/IMS_PLATFORM_BOOK.md`, `docs/architecture/DASHBOARD_INVENTORY.md` และ `DATABASE_SCHEMA.md` (ทั้งคู่สร้างขึ้นอัตโนมัติ เป็นปัจจุบัน)
>
> **แหล่งข้อมูลจริง (Ground truth) ที่ใช้:** Grafana แดชบอร์ด 14 รายการ (โครงสร้างพื้นฐาน 6 รายการ + การผลิต 8 รายการ รวมถึง `ims-ldi-alarm-console` ใหม่และ `ims-ldi-alarm-dictionary` ที่มีอยู่เดิม); บริการ docker-compose 13 รายการ (รันต่อเนื่อง 12 รายการ + ทำงานครั้งเดียว `db-migrate` 1 รายการ) รวมถึง `alarm-api` และ `proxy` ใหม่; ไมเกรชัน 013–078 (53 ไฟล์); ปัจจุบัน Grafana ไม่มีพอร์ตโฮสต์เป็นของตัวเอง (อยู่หลัง `proxy`); `scripts/dr-test.sh` ดำเนินการ _การจับคู่ช่วง (bracketing)_ ของจำนวนแถว ไม่ใช่การจับคู่ที่ตรงกันทุกประการ

---

## P0 — Actively misleading (security/safety/data-integrity, or a broken procedure)

**`docs/admin/ADMIN_MANUAL.md:35-46`** — ตารางภาพรวมคอนเทนเนอร์ (Container Overview) ละเว้น `alarm-api` และ `proxy` โดยสิ้นเชิง และแสดง `ims-grafana | Grafana | 3000` ราวกับว่า Grafana ยังคงเปิดพอร์ต 3000 ไปยังโฮสต์โดยตรง
ข้อความปัจจุบัน: ตาราง 9 แถวที่ไม่มีแถว `proxy`/`alarm-api`, มีแถว `ims-grafana | Grafana | 3000 | Dashboard`
สิ่งที่ควรระบุ: Grafana ไม่มีพอร์ตโฮสต์ของตัวเองอีกต่อไป — ปัจจุบัน `proxy` (nginx) เป็นเพียงช่องทางเข้าเดียวที่เปิดพอร์ตบนโฮสต์ (3000) ซึ่งอยู่ด้านหน้าทั้ง Grafana และ `alarm-api` โดยป้องกัน API หลังไว้ด้วยการตรวจสอบ `auth_request` กับเซสชันของ Grafana ผู้ดูแลระบบไอทีที่ทำตามตารางนี้จะประเมินขอบเขตความน่าเชื่อถือของเครือข่ายสำหรับส่วนประกอบที่ละเอียดอ่อนต่อความปลอดภัย (พาธการเขียนการแจ้งเตือน) ผิดพลาด

**`docs/operations/DR_TEST_PLAN.md:9`** — เกณฑ์ผ่านการทดสอบที่ระบุของ Drill 1 ขัดแย้งกับการดำเนินการจริงและเอกสารอื่นๆ ของ repo นี้เอง
ข้อความปัจจุบัน: "เปรียบเทียบจำนวนแถวบน `devices`/`ldi_data`/`ldi_alarm_log` ระหว่างระบบจริงและระบบที่กู้คืน... เกณฑ์ผ่านการทดสอบ: **จำนวนแถวตรงกันทุกประการ (exact row-count match)**"
สิ่งที่ควรระบุ: `scripts/dr-test.sh` (บรรทัด 46-96) ได้นำไปปฏิบัติและระบุป้ายอย่างชัดเจนว่าคือ _การจับคู่ช่วง_ — `VERDICT: PASS -- restored row counts fall within the [before-dump, after-dump] live bracket` ไม่ใช่การจับคู่ที่ตรงกันทุกประการ `docs/operations/BACKUP_RESTORE.md` (ไม่อยู่ในรายการที่ต้องติดแฟล็กของการตรวจสอบนี้ แต่ถูกตรวจสอบข้าม) ระบุไว้อย่างชัดเจนว่าการจับคู่ที่ตรงกันทุกประการนั้นเป็นบั๊กจริงที่พบระหว่างการทดสอบ DR ของระบบนี้เอง เนื่องจากเป็นระบบที่มีการดึงข้อมูลสด (live-ingesting) ซึ่งจำนวนข้อมูลจะคลาดเคลื่อนระหว่างขั้นตอน dump และ restore เสมอ ผู้ปฏิบัติงานที่ปฏิบัติตามเกณฑ์ที่ระบุใน `DR_TEST_PLAN.md` ระหว่างการฝึกซ้อมจริงอาจประเมินการกู้คืนที่ผ่านเกณฑ์ว่าล้มเหลว (FAIL) ได้

**`docs/operations/TROUBLESHOOTING.md:107-403`** — ไฟล์นี้มี "คู่มือการตอบสนองต่อเหตุการณ์ (Incident Response Runbook)" ส่วนที่สองที่มีโครงสร้างแตกต่างกันต่อท้ายเนื้อหาการแก้ปัญหาของตนเอง (บรรทัด 107: `# Incident Response Runbook`) ด้วย **การจำแนกระดับความรุนแรงที่แตกต่างกัน** กับไฟล์ `docs/operations/INCIDENT_RESPONSE.md` ของจริง
ข้อความปัจจุบัน: `TROUBLESHOOTING.md` บรรทัด 136-142 กำหนดความรุนแรงเป็น **Critical / Warning / Info** (เวลาตอบสนอง <15 นาที/<1 ชั่วโมง/<4 ชั่วโมง); แต่ `docs/operations/INCIDENT_RESPONSE.md` จริงซึ่งเป็นไฟล์แยกต่างหาก (ไฟล์ที่มีแหล่งที่มาชัดเจนและมีตัวอย่างที่ใช้ได้จริงจากประวัติการทำงานของระบบ) กำหนดระดับความรุนแรงเป็น **SEV-1 / SEV-2 / SEV-3 / SEV-4** ระบบทั้งสองนี้ไม่สามารถจับคู่กันได้อย่างลงตัวและให้คำแนะนำในการยกระดับปัญหา (escalation) ที่ขัดแย้งกันสำหรับเหตุการณ์เดียวกัน
สิ่งที่ควรระบุ: `TROUBLESHOOTING.md` ไม่ควรมีกรอบการทำงานสำหรับการตอบสนองต่อเหตุการณ์ชุดที่สองเลย — แต่ควรชี้ไปยัง `docs/operations/INCIDENT_RESPONSE.md` (ซึ่งมันก็ทำได้อย่างถูกต้องแล้ว ภายในส่วน "เอกสารที่เกี่ยวข้อง" ของ `INCIDENT_RESPONSE.md` ที่ชี้กลับไปที่ `TROUBLESHOOTING.md` สำหรับ "คำสั่งแก้ปัญหา SRE ทั่วไป" — การแบ่งหน้าที่อย่างชัดเจนนั้นมีอยู่ แต่ `TROUBLESHOOTING.md` ไม่ได้ปฏิบัติตาม; กลับทำซ้ำและขัดแย้งกันแทน) นี่คือความเสี่ยงที่แท้จริงระหว่างเกิดเหตุการณ์จริง ซึ่งผู้ตอบสนองอาจตรวจสอบไฟล์ใดไฟล์หนึ่งและได้รับคำตอบเรื่องความรุนแรง/เวลาตอบสนองที่แตกต่างกัน ไม่ได้เกิดจากการเปลี่ยนแปลงในเซสชันนี้ — เป็นข้อบกพร่องเชิงโครงสร้างที่มีอยู่ก่อนแล้ว แต่เป็นของจริงและได้รับการยืนยันแล้ว

---

## P1 — Materially wrong technical claims

**`docs/admin/ADMIN_MANUAL.md:33`** — "ระบบทำงานบน Docker Compose ที่มีบริการรวม 10 บริการ (รันต่อเนื่อง 9 บริการ + ตัวรันไมเกรชันแบบครั้งเดียว 1 บริการ...)"
ความจริง: รวมทั้งหมด 12 บริการ (รันต่อเนื่อง 11 บริการ + ตัวทำงานครั้งเดียว `db-migrate` 1 บริการ): `timescaledb, pgbouncer, prometheus, alertmanager, grafana, proxy, renderer, snmpsim, blackbox-exporter, alarm-api, node-red` + `db-migrate`

**`docs/admin/ADMIN_MANUAL.md:100-102`** — "`database/migrations/` ปัจจุบันมีไฟล์ที่เรียงลำดับ 40 ไฟล์ (`013` ถึง `064`...)"
ความจริง: 53 ไฟล์, `013` ถึง `078` (โดยข้าม/จัดเก็บตัวเลขบางหมายเลข)

**`docs/admin/ADMIN_MANUAL.md:314`** — ขั้นตอนการตรวจสอบ SRE ที่ 3: "ตรวจสอบคอนเทนเนอร์ (รันต่อเนื่อง 9 บริการ + ims-db-migrate ซึ่งควรมีสถานะ Exited (0))"
มีข้อผิดพลาดเรื่องจำนวนเช่นเดียวกับ `:33` ด้านบน — ควรเป็น รันต่อเนื่อง 11 บริการ + ทำงานครั้งเดียว 1 บริการ

**`docs/admin/ADMIN_MANUAL.md:122-147`** — รายการตรวจสอบความปลอดภัยก่อนเข้าสู่ Production ("ข้อมูลรับรองเริ่มต้นทั้งหมดต้องเปลี่ยน") ระบุเพียง `INGEST_API_KEY`, `POSTGRES_PASSWORD`, `GRAFANA_ADMIN_PASSWORD`
สิ่งที่ขาดหายไป: `ALARM_API_DB_PASSWORD` — ข้อมูลรับรองสำหรับบทบาท DB `alarm_api_writer` (การไมเกรชัน `078-alarm-api-writer-role.sql`) ซึ่งใช้รูปแบบค่าเริ่มต้น `change-me-please` ใน `.env.example` แบบเดียวกับ 3 รายการที่กล่าวไว้แล้ว สคริปต์การหมุนเวียน (บรรทัด 135-150) ก็ไม่ได้หมุนเวียนรหัสผ่านของบทบาทใหม่นี้ ในแบบเดียวกับที่ทำกับ `grafana_reader`

**`README.md:180`** — "แดชบอร์ด 12 รายการใน 2 โดเมน: โครงสร้างพื้นฐาน 4 รายการ... + การผลิต 6 รายการ (LDI Manufacturing, Operator Andon, Engineering Analytics & SPC, Machine Snapshot, Data Readiness, Fleet at a Glance)"
ข้อผิดพลาดทางคณิตศาสตร์ภายใน: 4+6=10, ไม่ใช่ 12 นอกจากนี้รายการการผลิตยังขาด `IMS LDI - Alarm Console` และ `IMS LDI - Alarm Dictionary` (ทั้งคู่มีอยู่จริง และใช้งานในปัจจุบัน) — จำนวนแดชบอร์ดการผลิตจริงคือ 8

**`README.md:188`** — "12 แดชบอร์ด — โครงสร้างพื้นฐาน 4 รายการ, การผลิต 6 รายการ..."
ข้อผิดพลาด 4+6=10≠12 แบบเดียวกัน ขัดแย้งโดยตรงกับ **บรรทัดที่ 220 ในไฟล์เดียวกัน**: "12 แดชบอร์ด (โครงสร้างพื้นฐาน 4 รายการ + การผลิต 8 รายการ)" — ซึ่งเป็นข้อมูลที่ถูกต้อง ปัจจุบัน `README.md` ระบุจำนวนรายละเอียดของแดชบอร์ดสองแบบที่ขัดแย้งกันเอง

**`CONTRIBUTING.md:46`** — "ทุกๆ ไมเกรชันคือไฟล์ใหม่ที่มีหมายเลขเรียงตามลำดับใน `database/migrations/` (ปัจจุบันคือ 013–068...)"
ช่วงปัจจุบันตามความเป็นจริง: 013–078

**`docs/product/PRODUCT.md:17`** — "...ถูกแสดงผลผ่าน 6 แดชบอร์ด (Manufacturing Command Center, Operator Andon Board, Engineering Analytics & SPC, Machine Snapshot, Data Readiness, Fleet Overview)..."
ขาด `Alarm Console` และ `Alarm Dictionary`; จำนวนแดชบอร์ดการผลิตจริงคือ 8 ไม่ใช่ 6

---

## P2 — Stale but not actively harmful

**`docs/operations/TROUBLESHOOTING.md:31-50`** — ตารางรูปแบบความล้มเหลวและบล็อกคำสั่ง "เริ่มบริการเดียว (Restart a single service) ใหม่" ครอบคลุมถึง `node-red`, `grafana`, `prometheus`, `pgbouncer`, `blackbox`/`snmpsim` — ไม่มีรายการใดในไฟล์ที่กล่าวถึงรูปแบบความล้มเหลวของ `alarm-api` หรือ `proxy` แม้ว่าจะเป็น "SRE runbook หลักสำหรับการปฏิบัติงาน IMS monitoring stack ในเวลา 3:00 น." ก็ตาม หากบริการใหม่ตัวใดตัวหนึ่งล่ม เอกสารนี้จะไม่มีคำแนะนำใดๆ ให้

**`SECURITY.md:33`** และ **`docs/operations/DEPLOYMENT_READINESS.md:115`** — ทั้งคู่ระบุว่า "ผูก Grafana ไว้ที่ localhost เท่านั้น (ดำเนินการแล้วใน prod compose)" / "ดำเนินการแล้วใน prod compose"
ตรวจสอบเทียบกับ `docker-compose.prod.yaml` ฉบับเต็ม (43 บรรทัด): ไม่มีส่วน override พอร์ตสำหรับ `grafana` ในไฟล์นั้นเลย — การกล่าวอ้างนี้ดูเหมือนจะมีมาก่อนเซสชันนี้และน่าจะไม่ถูกต้องอยู่แล้ว ขณะนี้การกล่าวอ้างนี้ถูกแทนที่แล้ว: ปัจจุบัน Grafana ไม่มีพอร์ตโฮสต์เลยใน `docker-compose.yaml` พื้นฐาน (อยู่หลัง `proxy` แทน) — เป็นการป้องกันที่แน่นหนากว่า "การผูกกับ localhost" แต่ไม่ใช่สิ่งที่รายการตรวจสอบทั้งสองอธิบายไว้ ทั้งสองส่วนควรอัปเดตเพื่ออธิบายถึงวิธีการป้องกันจริงในปัจจุบัน (proxy + การตรวจสอบ `auth_request`) แทนที่จะเป็น "การผูก localhost" ซึ่งไม่เคยดำเนินการในไฟล์ที่ถูกอ้างอิง

**`docker-compose.prod.yaml`** (ไม่ใช่เอกสาร แต่ถูกติดแฟล็กเนื่องจากมิติการตรวจสอบ "deployment drift") — มี resource-limit overrides สำหรับ `node-red`, `grafana`, `timescaledb`, `prometheus` แต่ไม่มีสำหรับบริการใหม่ `alarm-api` หรือ `proxy` การปรับใช้ production ที่ใช้ overlay นี้จะไม่ได้รับการปรับแต่งใดๆ สำหรับบริการใหม่ทั้งสองรายการ

---

## P3 — Cosmetic / minor

**`docs/admin/ADMIN_MANUAL.md:373-386`** — ส่วน "การสำรองข้อมูลการกำหนดค่า (Configuration Backup)" แจกแจงถึง `docker-compose.yaml`, `docker-compose.prod.yaml`, การกำหนดค่า Prometheus, และแดชบอร์ด Grafana สำหรับกระบวนการสำรองข้อมูลที่ใช้ `cp` แต่ไม่ได้กล่าวถึง `proxy/nginx.conf` — ซึ่งเป็นไฟล์กำหนดค่าใหม่ในหมวดหมู่เดียวกัน (ขนาดเล็ก, มีการติดตามใน git, และเอกสารนี้ได้ระบุรายการไฟล์อื่นๆ ที่มีการติดตามด้วย git เพื่อความสอดคล้อง/ครบถ้วนอยู่แล้ว)

---

## Explicitly checked and found clean (no drift)

- ข้ออ้างเกี่ยวกับ kiosk ที่ติดตั้งบนเพดานว่ามี "3 แดชบอร์ด" ใน `docs/architecture/GRAFANA_DESIGN_SYSTEM.md` (NOC, Easy Overview, Andon) — ตรวจสอบเทียบกับอ็อบเจ็กต์ `MAX_HEIGHT` ของ `tests/lint/dashboard-linter.js` แล้ว; ถูกต้อง
- `docs/architecture/DATA_FLOW.md`, `docs/product/CONTEXT.md` — ทั้งคู่ระบุ "12 แดชบอร์ด" อย่างถูกต้องแล้ว
- ลิงก์ `http://localhost:3000/d/...` ทั้งหมดใน `SOP_OPERATOR.md`, `ONBOARDING_SCRIPT.md`, `LDI_VALIDATION_PROTOCOL.md`, `README.md` — ไม่เสียหาย; `proxy` จะส่งต่อทราฟฟิก `GET` ไปยัง Grafana บนพอร์ตเดียวกันอย่างโปร่งใส ดังนั้น URL เหล่านี้จึงยังคงใช้งานได้ตามปกติสำหรับผู้ใช้ปลายทางในเบราว์เซอร์
- การอ้างถึง "AI-Assisted" ใน `docs/architecture/FUTURE_ANALYTICS.md` — ถูกต้องตามบริบท (อธิบายว่าพาเนลนี้ถูกเปลี่ยนชื่อ _มาจาก_ อะไร) ไม่ใช่การกล่าวอ้างในปัจจุบัน
- "10 Grafana dashboards" ในบรรทัดที่ 19 ของ `docs/architecture/IMS_MANUFACTURING_PLATFORM_V2.md` — อยู่ในส่วนที่ระบุชัดเจนว่า "Baseline (verified 2026-08-10)" ซึ่งเป็นข้อมูล ณ จุดเวลาตามธรรมเนียมของไฟล์นั้น (หมวดหมู่เดียวกับ `docs/archive/` และ `docs/audit/`) — คงไว้เป็นบันทึกทางประวัติศาสตร์อย่างถูกต้อง ไม่ใช่ความคลาดเคลื่อนที่ยังใช้งานอยู่
- การตรวจสอบสุ่มตัวอย่างหมายเลขไมเกรชันใน `EAP_ARCHITECTURE.md` (067), `MANUFACTURING_DOMAIN.md` (013, 064, 067), `DATA_RETENTION.md` (016), `DATA_FLOW.md` (065) — ทั้งหมดมีอยู่จริงและตรงกับเนื้อหาที่อธิบายไว้
- `docs/operations/BACKUP_RESTORE.md`, `docs/operations/RELEASE_CHECKLIST.md`, `docs/operations/SCALING_PLAN.md`, `docs/operations/LDI_VALIDATION_PROTOCOL.md`, `docs/architecture/EAP_ARCHITECTURE.md`, `docs/architecture/MANUFACTURING_DOMAIN.md`, `docs/architecture/OWNERSHIP.md`, `docs/architecture/DATA_RETENTION.md`, `docs/architecture/ALARM_DETAIL_STYLE_GUIDE.md`, `docs/architecture/ARCHITECTURE_DIAGRAM.md`, `docs/architecture/LDI_RCA_GUIDE.md`, `docs/architecture/LDI_SPC_GUIDE.md`, `docs/architecture/PANEL_TOKENS.md`, `docs/business/BUSINESS_VALUE_ROI.md` (ได้แก้ไขจำนวนแดชบอร์ดโดย commit ก่อนหน้าแล้ว), `docs/DOCUMENTATION_QUALITY_REPORT.md`, `docs/product/ONBOARDING_SCRIPT.md`, `docs/REAL-DATA-IMPORT.md`, `CHANGELOG.md`, `ABOUT-ME.md`, `START.md`, `AGENTS.md` — ถูกอ่าน/grep สำหรับข้อเท็จจริงที่ทราบว่าเปลี่ยนแปลงไปจากการตรวจสอบ (alarm-api, proxy, จำนวนแดชบอร์ด/ไมเกรชัน/บริการ, OEE-as-live, การอ้างสิทธิ์การโต้ตอบของ Andon); ไม่พบความคลาดเคลื่อนเมื่อเทียบกับสถานะปัจจุบันของ repo

---

## Summary

| Severity | Count |
| -------- | ----- |
| P0       | 3     |
| P1       | 7     |
| P2       | 3     |
| P3       | 1     |

**สถานะ: ข้อค้นพบระดับ P0/P1/P2/P3 ทั้งหมดในรายงานนี้ได้รับการแก้ไขแล้วในวันที่ 2026-08-13** (commit `docs: reconcile runtime architecture and DR guidance`) ยกเว้นปัญหาเรื่องเนื้อหาซ้ำซ้อนที่มีอยู่แล้วใน `TROUBLESHOOTING.md`/`INCIDENT_RESPONSE.md` ซึ่งได้รับการแก้ไขโดยการลบเนื้อหาที่ซ้ำออกจาก `TROUBLESHOOTING.md` และใช้เป็นพอยน์เตอร์ชี้เป้าหมายแทน ไม่ใช่โดยการแก้ไข `INCIDENT_RESPONSE.md` (ซึ่งถูกต้องอยู่แล้ว) รายงานฉบับนี้ถูกเก็บไว้เพื่อเป็นบันทึกของสิ่งที่พบและสิ่งที่แก้ไข และไม่ได้ถูกลบในภายหลัง
