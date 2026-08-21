# Changelog

> **บันทึกการเปลี่ยนแปลง IMS (Infrastructure Monitoring System)**
> รูปแบบอ้างอิงจาก [Keep a Changelog](https://keepachangelog.com/)

---

<div align="center">

<img src="../docs/assets/icons/check-circle.svg" width="14" align="center"/> **Version:** 1.0.1
<img src="../docs/assets/icons/check-circle.svg" width="14" align="center"/> **Release:** Production
<img src="../docs/assets/icons/check-circle.svg" width="14" align="center"/> **Date:** 2026-08-21

</div>

---

## [1.0.1] - 2026-08-21 (World-Class Open Source Edition)

### จุดเด่น (Highlights)
- **ปลอดภัยระดับโลก 100% (Security Compliance)**: กวาดล้างประวัติ Git ย้อนหลังทั้งหมด 1,100+ Commits ลบข้อมูล IP จริง, ชื่อเครื่องจักร และรหัส Error ของ Vendor ออกแบบถอนรากถอนโคน
- **สถาปัตยกรรม V2 (V2 Normalized Architecture)**: ย้ายระบบนำเข้าข้อมูล Node-RED สู่โครงสร้าง JSON แบบบรรทัดฐาน และผูก Schema SQL Insert
- **ระบบตรวจสอบก่อน Commit (Pre-commit Suite)**: เพิ่ม Husky Hooks ที่บังคับผ่าน Unit tests, E2E tests, Dashboard Linters, Security Exceptions และการอัปเดตเอกสาร
- **รองรับทุกระบบปฏิบัติการ (Cross-Platform)**: แก้ไขบั๊ก CRLF ระหว่าง Windows/Linux ที่ทำให้ Node-RED แครช และปรับมาตรฐาน Path
- **เอกสาร 3 ภาษา (Multilingual Excellence)**: แปลและปรับปรุงเอกสารทั้งหมด รวมถึง README ให้ตรงกันเป๊ะทั้ง อังกฤษ, ไทย และจีนตัวย่อ
- **กราฟิกระดับ NOC (Cyberpunk NOC UI)**: เปลี่ยนรูปภาพสแตติกเป็นภาพ GIF แอนิเมชันสแกนเนอร์ 60 FPS สุดล้ำสำหรับหน้าจอบริหาร

### ความปลอดภัย (Security)
- **ระบบจัดการ CVE (CVE Exceptions Engine)**: สร้างกลไกจัดการช่องโหว่ (เช่น Grafana Go stdlib DoS) แบบมีวันหมดอายุที่ทำงานด้วยโค้ด (Programmatic Gate)
- **ทำลายข้อมูลจริง (Physical Data Scrub)**: ลบ Database Dumps และ Logs เก่าที่เก็บในเครื่อง (แม้จะอยู่ใน `.gitignore`) เพื่อป้องกันการหลุดรอดจากการก๊อปปี้ไฟล์
- **เสริมแกร่ง Nginx (Nginx Hardening)**: บังคับจำกัด Rate-limiting (`100r/s`) และขนาด Header (`16k`) บน Reverse Proxy

### การแก้ไขบั๊ก (Fixed)
- ปัญหา Script ตรวจสอบ `verify-deployment.ps1` ค้างบน Windows จากการ Resolve IPv6 `localhost`
- ปัญหา Dashboard ของ Grafana ทับซ้อนกัน (บังคับใช้กฎ Grid-24)
- ปัญหา Barrier Timeout ภายใน Node-RED AIOps Parser
- ปัญหานโยบาย Refresh ของ Continuous Aggregate (`sys_hourly`) ไม่ทำงาน
- แปลงโค้ดทดสอบที่ใช้ `as` ไปเป็น `@total-typescript/shoehorn`

## [1.0.0] — 2026-06-29 (Production Release)

### Highlights

- **5-Thread Parallel Walker** — CPU, Storage, Network, Temperature, LDI
- **Device Registry** — การจัดการเครื่องแบบใช้ฐานข้อมูล (1-1000+ เครื่อง)
- **4 Grafana Dashboards** — NOC, System, Engineering, Capacity Planning
- **38 Alert Rules** — มาตรฐาน AIOps, Predictive, SRE
- **K6 Load Test** — 1,000 VUs, ล้มเหลว 0%, p95 < 80ms
- **CI/CD Pipeline** — GitHub Actions พร้อมการสแกนความปลอดภัย

### Fixed

- OID ระดับองค์กรของ LDI ไม่ตรงกัน (9999 vs 99999)
- เส้นเชื่อมโหนด `bypass_error` ไม่เชื่อมต่อ (ทำให้เกิดปัญหา barrier timeout)
- `walk_ldi` ขาดหายไปจากขอบเขต `catch_walker`
- คำนวณ `ldiTemp` แล้วแต่ไม่ได้บันทึกลงฐานข้อมูล
- อัลกอริทึม heuristic การนับรอบ (wraparound) ของเคาน์เตอร์ไม่ถูกต้องสำหรับเคาน์เตอร์แบบ 64 บิต
- ข้อผิดพลาดของ escape sequence สำหรับอีโมจิในข้อความแจ้งเตือน
- พอร์ตโฮสต์ Docker ชนกัน (snmpsim 1161, pgbouncer 6432)
- ธุรกรรมการไมเกรตของ TimescaleDB ไม่รองรับ
- ปัญหาไฟล์ข้อมูลรับรองที่ตกค้างยังคงอยู่หลังจากใช้คำสั่ง `docker compose down -v`

### Added

- **Device Registry Pattern** — ตาราง `public.machines` รวมเข้ากับ SNMP walker
- **LINE Notify / MS Teams Webhooks** — การแจ้งเตือนที่แท้จริง
- **Database Migration System** — `database/migrations/` พร้อม SQL แบบ idempotent
- **23 Unit Tests** — ผ่านทั้งหมด, ครอบคลุมตรรกะการแยกข้อมูล (parsing logic)
- **CI/CD Secret Stubs** — ตรวจสอบ Compose ได้โดยไม่ต้องใช้ข้อมูลรับรองจริง
- **Gitleaks Allowlist** — `.env`, `.playwright-mcp/`, `nodered_data/`
- **Backup/Restore Scripts** — `scripts/backup-db.sh`, `scripts/restore-db.sh`
- **SECURITY.md** — ข้อจำกัดที่ทราบและรายการตรวจสอบเพื่อเสริมความปลอดภัย
- **CHANGELOG.md** — ไฟล์นี้
- **CONTRIBUTING.md** — แนวทางการพัฒนา
- **LICENSE** — สัญญาอนุญาต MIT
- **Makefile** — 8 เป้าหมาย (up, down, restart, verify, backup, restore, logs, test)
- **docker-compose.override.yaml** — ใช้สำหรับการพัฒนา (snmpsim)
- **docker-compose.prod.yaml** — ใช้สำหรับโปรดักชัน
- **Incident Response Runbook** — `docs/runbooks/incident-response.md`
- **Deployment Readiness Assessment** — `docs/deployment-readiness.md`
- **Scaling Plan** — `docs/scaling-plan.md`
- **Prometheus Exporter** — การกำหนดค่าการตรวจสอบตัวเองของ Node-RED

### Changed

- แยก `docker-compose.yaml` ออกเป็น base/dev/prod
- แหล่งที่มาหลักของ Flow: `node-red/flows/ingestion.json` + `alerting.json`
- walkers ทั้งหมดใช้ `msg.host`/`msg.community` แทนค่าแบบฮาร์ดโค้ด
- `walk_storage` อัปเกรดเป็นเครื่องยนต์คู่ (ใช้ subtree ในโปรดักชัน, ใช้ GET ในการพัฒนา)
- เพิ่ม `sysUpTime` OID ไปยัง `walk_net_get` สำหรับการตรวจจับการนับรอบของเคาน์เตอร์ (counter wraparound)
- ประเภทคอลัมน์ของ LDI เปลี่ยนจาก INT เป็น DOUBLE PRECISION
- สถาปัตยกรรมอัปเกรดเป็น 5-Thread Parallel Walker
- บริการทั้งหมดใช้ภายในเท่านั้น (ไม่มีการผูกพอร์ตโฮสต์)

### Security

- ยกเลิกการติดตาม `.mimocode/` และ `.playwright-mcp/` จาก git
- ลบ GitHub PAT ออกจากไฟล์ที่มีการติดตาม
- การตั้งค่า Node-RED adminAuth พร้อมใช้งาน
- พอร์ต PgBouncer ไม่ถูกเปิดเผยบนโฮสต์อีกต่อไป

---

## [0.9.0] — 2026-06-24 (Pre-Refactor Baseline)

### Added

- 5-Thread Bulletproof AIOps Parser v7
- Dual-Engine SNMP Walker (เฉพาะเครือข่าย)
- กฎการระงับของ Alertmanager (inhibition rules)

---

<div align="center">

**IMS Changelog — Version 1.0**

_รูปแบบอ้างอิงจาก [Keep a Changelog](https://keepachangelog.com/)_

</div>
