# Changelog

> **บันทึกการเปลี่ยนแปลง IMS (Infrastructure Monitoring System)**
> รูปแบบอ้างอิงจาก [Keep a Changelog](https://keepachangelog.com/)

---

<div align="center">

<img src="docs/assets/icons/check-circle.svg" width="14" align="center"/> **เวอร์ชัน (Version):** 1.0.0
<img src="docs/assets/icons/check-circle.svg" width="14" align="center"/> **รุ่นการเปิดตัว (Release):** การผลิต (Production)
<img src="docs/assets/icons/check-circle.svg" width="14" align="center"/> **วันที่ (Date):** 2026-06-29

</div>

---

## [1.0.0] — 2026-06-29 (Production Release)

### จุดเด่น (Highlights)

- **5-Thread Parallel Walker** — CPU, Storage, Network, Temperature, LDI
- **Device Registry** — ระบบจัดการเครื่องแบบขับเคลื่อนด้วยฐานข้อมูล (1-1000+ เครื่อง)
- **4 Grafana Dashboards** — NOC, System, Engineering, Capacity Planning
- **38 Alert Rules** — AIOps, Predictive, มาตรฐาน SRE
- **K6 Load Test** — 1,000 VUs, อัตราล้มเหลว 0%, p95 < 80ms
- **CI/CD Pipeline** — GitHub Actions พร้อมสแกนความปลอดภัย

### แก้ไขแล้ว (Fixed)

- ข้อมูล LDI enterprise OID ไม่ตรงกัน (9999 กับ 99999)
- โหนด `bypass_error` ไม่เชื่อมต่อกัน (สาเหตุทำให้หมดเวลาที่ barrier)
- ขาดฟังก์ชัน `walk_ldi` จากขอบเขต `catch_walker`
- คำนวณ `ldiTemp` แล้วแต่ไม่ถูกบันทึกลงในฐานข้อมูล
- ระบบตรวจจับการวนรอบของตัวนับ (Counter wraparound heuristic) ไม่ถูกต้องสำหรับตัวนับแบบ 64 บิต
- ข้อผิดพลาด emoji escape sequence ในข้อความแจ้งเตือน
- ความขัดแย้งของพอร์ต Docker host (snmpsim 1161, pgbouncer 6432)
- ความเข้ากันไม่ได้ในการอัปเดตธุรกรรมฐานข้อมูล (migration transaction) สำหรับ TimescaleDB
- ปัญหาไฟล์ข้อมูลรับรองยังคงค้างอยู่ (persistence) ถึงแม้จะรันคำสั่ง `docker compose down -v` ก็ตาม

### เพิ่มเติม (Added)

- **Device Registry Pattern** — ตาราง `public.machines` ร่วมกับการใช้งาน SNMP walker
- **LINE Notify / MS Teams Webhooks** — ระบบแจ้งเตือนที่ใช้งานได้จริง
- **Database Migration System** — โฟลเดอร์ `database/migrations/` กับสคริปต์ SQL ชนิด idempotent
- **23 Unit Tests** — ผ่านทั้งหมด, ครอบคลุมชุดคำสั่งการแยกวิเคราะห์ (parsing logic)
- **CI/CD Secret Stubs** — ตรวจสอบ Compose โดยไม่ต้องใช้ข้อมูลรับรอง (credentials) จริง
- **Gitleaks Allowlist** — `.env`, `.playwright-mcp/`, `nodered_data/`
- **Backup/Restore Scripts** — `scripts/backup-db.sh`, `scripts/restore-db.sh`
- **SECURITY.md** — ข้อจำกัดที่เป็นที่ทราบแล้วและรายการตรวจสอบเสริมความปลอดภัย (hardening checklist)
- **CHANGELOG.md** — ไฟล์นี้
- **CONTRIBUTING.md** — คำแนะนำในการพัฒนา
- **LICENSE** — สัญญาอนุญาตแบบ MIT
- **Makefile** — รองรับ 8 คำสั่ง (up, down, restart, verify, backup, restore, logs, test)
- **docker-compose.override.yaml** — สำหรับการพัฒนาซ้อนทับ (snmpsim)
- **docker-compose.prod.yaml** — สำหรับการผลิตซ้อนทับ
- **Incident Response Runbook** — `docs/runbooks/incident-response.md`
- **Deployment Readiness Assessment** — `docs/deployment-readiness.md`
- **Scaling Plan** — `docs/scaling-plan.md`
- **Prometheus Exporter** — การกำหนดค่าตรวจสอบตัวเอง (self-monitoring) ของ Node-RED

### เปลี่ยนแปลง (Changed)

- แยกไฟล์ `docker-compose.yaml` ออกเป็น base/dev/prod
- ชุดกำหนด flow หลัก (Flow source of truth): `node-red/flows/ingestion.json` และ `alerting.json`
- walker ทั้งหมดใช้ตัวแปร `msg.host`/`msg.community` แทนการฝังค่าตรง (hardcoded values)
- ปรับปรุง `walk_storage` ให้เป็นแบบ dual-engine (ใช้ subtree ในการผลิต, และ GET สำหรับการพัฒนา)
- เพิ่ม `sysUpTime` OID ไปที่ `walk_net_get` สำหรับตรวจสอบการวนรอบของตัวนับ (counter wraparound detection)
- เปลี่ยนประเภทคอลัมน์ของ LDI จาก INT เป็น DOUBLE PRECISION
- อัปเกรดสถาปัตยกรรมไปใช้ระบบ 5-Thread Parallel Walker
- บริการทั้งหมดจำกัดให้ใช้เฉพาะระบบภายใน (ไม่มีการกำหนดพอร์ตโฮสต์)

### ความปลอดภัย (Security)

- ยกเลิกการติดตาม (untracked) โฟลเดอร์ `.mimocode/` และ `.playwright-mcp/` ออกจาก git
- นำ GitHub PAT ออกจากไฟล์ที่ถูกติดตามในระบบ
- จัดเตรียมการตั้งค่า adminAuth ของ Node-RED เรียบร้อย
- เลิกเปิดเผยพอร์ต PgBouncer ออกสู่โฮสต์

---

## [0.9.0] — 2026-06-24 (Pre-Refactor Baseline)

### เพิ่มเติม (Added)

- 5-Thread Bulletproof AIOps Parser v7
- Dual-Engine SNMP Walker (สำหรับ Network เท่านั้น)
- กฎการระงับของ Alertmanager (Alertmanager inhibition rules)

---

<div align="center">

**บันทึกการเปลี่ยนแปลง IMS — เวอร์ชัน 1.0**

_รูปแบบอ้างอิงจาก [Keep a Changelog](https://keepachangelog.com/)_

</div>
