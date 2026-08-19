# การร่วมพัฒนา IMS

> **Guidelines สำหรับการร่วมพัฒนา IMS**

---

<div align="center">

<img src="docs/assets/icons/check-circle.svg" width="14" align="center"/> **การร่วมพัฒนา:** คู่มือ
<img src="docs/assets/icons/check-circle.svg" width="14" align="center"/> **สัญญาอนุญาต:** MIT

</div>

---

## ขั้นตอนการพัฒนา (Development Workflow)

1. Fork repository
2. สร้าง feature branch จาก `main`
3. แก้ไขโค้ดโดยปฏิบัติตามข้อตกลงของโปรเจกต์ (project conventions)
4. รัน `make verify` ก่อนทำการ commit
5. สร้าง pull request

---

## ข้อตกลงของโปรเจกต์ (Project Conventions)

### Node-RED Flows

- `nodered_data/flows/*.json` คือ **source of truth** (แหล่งข้อมูลหลัก) โดยแบ่งตามความรับผิดชอบ (`ingestion.json`, `ldi_ingestion.json`, `ldi_simulator.json`, `ldi_alarm_simulator.json`, `alerting.json`) — ห้ามแก้ไข `nodered_data/flows.json` ด้วยตัวเองเด็ดขาด เพราะมันคือ **build artifact** (ไฟล์ที่ได้จากการ build)
- หลังจากแก้ไขไฟล์ source flow ให้รัน `node scripts/build-flows.js` เพื่อสร้าง `nodered_data/flows.json` ใหม่ จากนั้นรัน `make restart` เพื่อใช้งาน
- Function nodes ใช้ `global.get('parser')` / `global.get('circuit-breaker')` (จาก `nodered_data/lib/`) — ไม่สามารถใช้ `require()` สำหรับ npm packages ทั่วไปใน sandboxed function VM ของ Node-RED ได้
- ฟิลด์ `func` ใน `flows.json` เป็น JSON string บรรทัดเดียว — โปรดคง escape sequences `\n` ไว้ หากคุณจำเป็นต้องตรวจสอบไฟล์ที่ถูก build ด้วยตาเปล่า

```bash
# Validate every source flow file is syntactically valid JSON
for f in nodered_data/flows/*.json; do
 node -e "const j=JSON.parse(require('fs').readFileSync('$f','utf8')); console.log('Valid:', j.length, 'nodes —', '$f')"
done
```

### Database

- ออบเจกต์ทั้งหมดอยู่ใน schema `public`
- ห้าม query raw hypertables (`ldi_data`, `sys_metrics`, `net_metrics`) โดยตรงจาก dashboard เมื่อมี continuous aggregate หรือ materialized view อยู่แล้วสำหรับกรณีใช้งานนั้น — ดู `docs/architecture/DATABASE_SCHEMA.md` สำหรับรายการ view/CAGG ปัจจุบัน `tests/lint/query-budget-linter.js` จะบังคับใช้กฎข้อนี้
- ทุกการย้ายฐานข้อมูล (migration) จะเป็นไฟล์ใหม่ที่มีหมายเลขเรียงลำดับใน `database/migrations/` (ปัจจุบัน 013–081 ซึ่งจะถูกนำไปใช้ตามลำดับโดยบริการ `db-migrate`) **ห้ามแก้ไขหรือเปลี่ยนหมายเลขการ migration หลังจากที่ merge แล้ว** — การแก้ไขจะต้องใช้หมายเลข _ถัดไป_ เสมอ ดูนโยบายการจัดการเวอร์ชันฉบับเต็มได้ที่ `docs/architecture/IMS_MANUFACTURING_PLATFORM_V2.md` §7
- ใช้ `sanitize()` (จาก `nodered_data/lib/parser.js` ซึ่ง export ผ่าน `global.get('parser')`) สำหรับสตริงจากผู้ใช้ใดๆ ที่ส่งไปถึง SQL — ไม่อนุญาตให้มีช่องโหว่ SQL injection โดยเด็ดขาด

### Grafana

- แก้ไขไฟล์ JSON ของ dashboard ใน `monitoring/grafana/dashboards/infrastructure/` (NOC, Capacity, Engineering Drill-Down, Meta-Monitoring) หรือ `monitoring/grafana/dashboards/manufacturing/` (ชุด LDI) — ดูขอบเขตของโดเมนที่ `docs/architecture/OWNERSHIP.md` และรายการทั้งหมดที่ `docs/architecture/DASHBOARD_INVENTORY.md`
- ใช้ `ROUND(x::NUMERIC, N)` ใน SQL ของพาเนล — `ROUND()` ของ PostgreSQL รองรับเฉพาะ `NUMERIC` ไม่รองรับ `DOUBLE PRECISION`
- UID ของ datasource ต้องเป็น `timescaledb` เท่านั้น ไม่ใช่ template variable หรือชื่ออื่น
- ใช้เฉพาะชุดสี (color token set) ที่ได้รับการอนุมัติเท่านั้น (`docs/architecture/GRAFANA_DESIGN_SYSTEM.md` §2.1) — การตรวจสอบข้อ 15 ของ `dashboard-linter.js` จะบังคับใช้กฎนี้ขณะ commit
- รัน `node tests/lint/dashboard-linter.js` ก่อนที่จะ commit การเปลี่ยนแปลงใดๆ ใน dashboard JSON; pre-commit hook จะรันคำสั่งนี้โดยอัตโนมัติ

### Security

- ห้าม commit ข้อมูลความลับ รหัสผ่าน หรือ API tokens เด็ดขาด โดย `.gitleaks.toml` จะสแกนหาข้อผิดพลาดนี้ใน CI
- ใช้ Docker secrets (ไดเรกทอรี `secrets/` ซึ่งถูกกำหนดให้อยู่ใน gitignore) สำหรับค่าที่มีความละเอียดอ่อน
- รายงานปัญหาด้านความปลอดภัยตามกระบวนการรายงานช่องโหว่ใน `SECURITY.md` — ห้ามสร้างเป็น GitHub Issue สาธารณะ
- เครื่องมือ AI ทั้งหมด (MCP servers, skills, plugins) ต้องเป็นโอเพนซอร์ส (MIT/ISC/BSD/Apache-2.0) — ดูหัวข้อ AI Tooling Security ใน `SECURITY.md`

---

## รูปแบบ Commit Message (Commit Messages)

ปฏิบัติตาม [Conventional Commits](https://www.conventionalcommits.org/):

| ประเภท (Type) | การใช้งาน (Usage) | ตัวอย่าง (Example)                                     |
| ------------- | ----------------- | ------------------------------------------------------ |
| `feat:`       | ฟีเจอร์ใหม่       | `feat(snmp): add LDI walker for manufacturing metrics` |
| `fix:`        | แก้ไขบั๊ก         | `fix(parser): correct counter wraparound detection`    |
| `docs:`       | เอกสารเท่านั้น    | `docs: upgrade enterprise documentation suite`         |
| `refactor:`   | ปรับโครงสร้างโค้ด | `refactor(flows): split ingestion and alerting`        |
| `chore:`      | การบำรุงรักษา     | `chore(ci): add Gitleaks security scanning`            |
| `test:`       | เพิ่มการทดสอบ     | `test(k6): add database write stress test`             |
| `security:`   | แก้ไขความปลอดภัย  | `security: remove hardcoded credentials`               |

### การตั้งชื่อ Branch (Branch Naming)

```text
feat/<topic>  # ฟีเจอร์ใหม่
fix/<topic>  # แก้ไขบั๊ก
chore/<topic>  # การบำรุงรักษา
docs/<topic>  # เอกสาร
refactor/<topic> # ปรับโครงสร้างโค้ด
test/<topic>  # การทดสอบ
security/<topic> # แก้ไขความปลอดภัย
```

---

## การทดสอบ (Testing)

```bash
# Unit tests (5 files, 99 assertions)
make test-unit

# K6 load tests
make test-load

# Full deployment verification
make verify

# Dashboard/alarm/query-budget/RCA-coverage linters
node tests/lint/dashboard-linter.js
node tests/lint/alarm-sync-linter.js
node tests/lint/query-budget-linter.js
node tests/lint/rca-mapping-coverage.js
node tests/lint/orphan-object-linter.js

# Golden-dataset SPC formula check
node tests/e2e/golden-dataset-spc.js
```

---

## โครงสร้างโปรเจกต์ (Project Structure)

```text
IMS/
├── docker-compose.yaml   # Main orchestration
├── nodered_data/
│ ├── flows/     # Node-RED flows, split by concern (Source of Truth)
│ ├── lib/      # circuit-breaker.js, parser.js, snmp-normalize.js, units.js
│ ├── flows.json    # Built by scripts/build-flows.js from flows/*.json -- don't hand-edit
│ ├── Dockerfile    # Custom build: installs npm dependencies
│ └── settings.js    # Runtime settings
├── postgres/init/    # DB schema bootstrap (fresh-deploy path)
├── database/migrations/   # TimescaleDB migrations, applied by the db-migrate service
├── monitoring/
│ ├── grafana/dashboards/
│ │ ├── infrastructure/  # NOC, Capacity, Engineering Drill-Down, Meta-Monitoring (4)
│ │ └── manufacturing/  # LDI Manufacturing, Andon, Engineering Analytics, Machine
│ │       # Snapshot, Data Readiness, Fleet at a Glance (6)
│ ├── grafana/library-panels/ # Shared Grafana Library Panels
│ └── prometheus/rules/  # Alert rules
├── scripts/      # Utility scripts
├── tests/
│ ├── lint/     # Dashboard/alarm/query-budget/RCA/orphan linters
│ ├── unit/     # Parser & counter unit tests
│ ├── e2e/      # Panel data, query timing, golden-dataset checks
│ ├── k6/      # Load tests
│ └── playwright/    # Visual/layout regression
└── docs/      # Documentation -- start at docs/architecture/IMS_PLATFORM_BOOK.md
```

---

## รายการตรวจสอบการรีวิวโค้ด (Code Review Checklist)

- [ ] ไม่มีข้อมูลความลับหรือรหัสผ่านในโค้ด
- [ ] SQL ใช้ `sanitize()` (จาก `nodered_data/lib/parser.js`) สำหรับข้อมูลที่รับจากผู้ใช้
- [ ] ไฟล์ Flow JSON ถูกแก้ไขใน `nodered_data/flows/*.json` จากนั้น build ใหม่ผ่าน `node scripts/build-flows.js`
- [ ] UID ของ Grafana datasource คือ `timescaledb`
- [ ] ไฟล์ Dashboard JSON ผ่านการตรวจสอบด้วย `node tests/lint/dashboard-linter.js`
- [ ] ผ่านการทดสอบทั้งหมด (`make verify`)
- [ ] เอกสารถูกอัปเดตถ้าจำเป็น — รวมถึง `docs/architecture/DASHBOARD_INVENTORY.md` / `DATABASE_SCHEMA.md` (ทั้งคู่สร้างขึ้นอัตโนมัติด้วย: `node scripts/generate-dashboard-inventory.js` / `node scripts/generate-schema-inventory.js` ซึ่งถูกตรวจสอบโดย CI)

---

<div align="center">

**คู่มือการร่วมพัฒนา IMS — เวอร์ชัน 2.0, อัปเดตล่าสุด 2026-08-10**

</div>
