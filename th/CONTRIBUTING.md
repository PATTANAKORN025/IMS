# การร่วมพัฒนา IMS

> **แนวทางสำหรับผู้ร่วมพัฒนา IMS**

---

<div align="center">

<img src="../docs/assets/icons/check-circle.svg" width="14" align="center"/> **การร่วมพัฒนา:** คู่มือ
<img src="../docs/assets/icons/check-circle.svg" width="14" align="center"/> **สัญญาอนุญาต:** MIT

</div>

---

## ขั้นตอนการพัฒนา

1. ผู้ดูแลสร้าง branch จาก `main` ล่าสุด ส่วนผู้ร่วมพัฒนาจากภายนอกให้ fork repository ก่อน
2. แก้ไขตามข้อตกลงของโปรเจกต์ด้านล่าง
3. commit โดย pre-commit hook ของ Husky จะรัน `node scripts/pre-commit.js` (unit test, linter ใน `tests/lint/`, การตรวจ JSON ของแดชบอร์ดและ flow) หากปิด hook ไว้ให้รันเอง
4. หากการเปลี่ยนแปลงกระทบ stack ที่รันอยู่ ให้รัน `make verify` กับ stack บนเครื่องก่อนเปิด pull request
5. เปิด pull request ไปที่ `main` ruleset ของ `main` กำหนดให้ต้องมีผู้อนุมัติ 1 คน (การอนุมัติเดิมจะถูกยกเลิกเมื่อ push ใหม่) ปิด review thread ครบ branch เป็นปัจจุบันและผ่าน status check `validate-architecture` และประวัติต้องเป็นเส้นตรง — merge แบบ **squash** หรือ **rebase** เท่านั้น ห้ามสร้าง merge commit การ force-push และการลบ `main` ถูกบล็อก

> [!NOTE]
> ปัจจุบันไม่มี job ใดใน `.github/workflows/` รายงาน check ชื่อ `validate-architecture` check ที่บังคับไว้จึงผ่านไม่ได้เลย และการ merge ต้องอาศัยสิทธิ์ข้ามของผู้ดูแลระบบ ให้เปลี่ยนชื่อ job ใน CI ให้ตรง หรือแก้ ruleset ให้ใช้ชื่อ job จริง (`lint`, `unit-tests`, ...)

> [!IMPORTANT]
> repository นี้เป็นแบบสาธารณะ ก่อน push ทุกครั้งให้ตรวจ diff ว่าไม่มี secret ข้อมูลการผลิต ข้อมูลอาคารที่ได้จาก CAD รหัสเครื่องจักร/ไลน์จริง เลข lot ชื่อ host ภายใน และข้อมูลส่วนบุคคล — ดู [SECURITY.md](SECURITY.md#repository-นี้เป็นแบบสาธารณะ) ห้ามใช้ `git add .` ใน working tree ที่มีไฟล์ export ข้อมูลอยู่บนเครื่อง

---

## ข้อตกลงของโปรเจกต์

### Node-RED Flows

- `nodered_data/flows/*.json` คือ **ต้นฉบับจริง** แยกตามหน้าที่ (`ingestion.json`, `ldi_ingestion.json`, `ldi_simulator.json`, `ldi_alarm_simulator.json`, `alerting.json`) — ห้ามแก้ `nodered_data/flows.json` ด้วยมือ เพราะเป็น **ผลจากการ build**
- หลังแก้ไฟล์ flow ต้นฉบับ ให้รัน `node scripts/build-flows.js` (หรือ `make build-flows`) เพื่อสร้าง `nodered_data/flows.json` ใหม่ แล้ว `make restart` เพื่อให้มีผล
- function node ใช้ `global.get('parser')` / `global.get('circuitBreaker')` (จาก `nodered_data/lib/` ซึ่งเชื่อมไว้ใน `functionGlobalContext` ของ `settings.js`) — ใน VM แบบ sandbox ของ function node ใช้ `require()` กับแพ็กเกจ npm ใด ๆ ไม่ได้ ดูข้อจำกัดอื่นของ sandbox ใน `AGENTS.md` หัวข้อ 3
- ฟิลด์ `func` ใน `flows.json` เป็นสตริง JSON บรรทัดเดียว — ต้องคง escape `\n` ไว้หากจำเป็นต้องตรวจไฟล์ที่ build แล้วด้วยมือ บน Windows ให้แก้ JSON ของ flow ด้วย Node หรือ Python ห้ามใช้การแทนที่สตริงของ PowerShell

```bash
# Validate every source flow file is syntactically valid JSON
for f in nodered_data/flows/*.json; do
 node -e "const j=JSON.parse(require('fs').readFileSync('$f','utf8')); console.log('Valid:', j.length, 'nodes —', '$f')"
done
```

### ฐานข้อมูล

- ทุกวัตถุอยู่ใน schema `public`
- ห้าม query hypertable ดิบ (`ldi_data`, `sys_metrics`, `net_metrics`) จากแดชบอร์ดโดยตรง หากมี continuous aggregate หรือ materialized view สำหรับกรณีนั้นอยู่แล้ว — ดูรายการ view/CAGG ปัจจุบันใน `docs/architecture/DATABASE_SCHEMA.md` และ `tests/lint/query-budget-linter.js` บังคับกฎนี้
- migration ทุกไฟล์เป็นไฟล์ใหม่ที่ใส่หมายเลขตามลำดับใน `database/migrations/` (ปัจจุบันถึง `082` service `db-migrate` apply ตามลำดับ) **ห้ามแก้หรือเปลี่ยนหมายเลข migration หลัง merge แล้ว** — การแก้ไขต้องเป็นหมายเลข _ถัดไป_ เสมอ ดูนโยบายการกำหนดเวอร์ชันฉบับเต็มใน `docs/architecture/IMS_MANUFACTURING_PLATFORM_V2.md` §7
- ใช้ `sanitize()` (จาก `nodered_data/lib/parser.js` ซึ่ง export ผ่าน `global.get('parser')`) กับทุกสตริงจากผู้ใช้ที่ไปถึง SQL ใน function node — ไม่ยอมให้เกิด SQL injection แม้แต่น้อย ส่วน service ที่เขียนด้วย Node ใช้ parameterised query

### Grafana

- แก้ไฟล์ JSON ของแดชบอร์ดใน `monitoring/grafana/dashboards/infrastructure/` (NOC Overview, Engineering Drill-Down, AIOps & Capacity, Meta-Monitoring, Ingestion Latency) หรือ `monitoring/grafana/dashboards/manufacturing/` (ชุด LDI) — ดูขอบเขตโดเมนใน `docs/architecture/OWNERSHIP.md` และรายการทั้งหมดใน `docs/architecture/DASHBOARD_INVENTORY.md`
- ใช้ `ROUND(x::NUMERIC, N)` ใน SQL ของ panel — `ROUND()` แบบสองอาร์กิวเมนต์ของ PostgreSQL รับเฉพาะ `NUMERIC` ไม่รับ `DOUBLE PRECISION`
- datasource UID ต้องเป็น `timescaledb` ไม่ใช่ template variable หรือชื่ออื่น
- ใช้เฉพาะชุด token สีที่อนุมัติแล้ว (`docs/architecture/GRAFANA_DESIGN_SYSTEM.md` §2.1) — Check 15 ของ `dashboard-linter.js` บังคับตอน commit
- รัน `node tests/lint/dashboard-linter.js` ก่อน commit การแก้ JSON ของแดชบอร์ดทุกครั้ง (pre-commit hook รันให้อัตโนมัติ) และสร้าง inventory ใหม่ด้วย `node scripts/generate-dashboard-inventory.js` เมื่อเพิ่ม เปลี่ยนชื่อ หรือเปลี่ยนจำนวน panel ของแดชบอร์ด

### ความปลอดภัย

- ห้าม commit secret รหัสผ่าน หรือ API token ค่าจริงอยู่ใน `.env` (อยู่ใน .gitignore) เท่านั้น ส่วน `.env.example` เก็บเฉพาะค่าตัวอย่างที่เป็นสาธารณะ
- `.gitleaks.toml` ใช้ตั้งค่าการสแกน secret ใน CI แต่ปัจจุบันการสแกนนั้นไม่บล็อกการ build และตรวจเฉพาะ working tree — ให้รัน `gitleaks detect` กับประวัติทั้งหมดบนเครื่องก่อน push การเปลี่ยนแปลงที่อ่อนไหว
- รายงานปัญหาความปลอดภัยตามขั้นตอนใน `SECURITY.md` — ไม่ใช่ผ่าน issue สาธารณะบน GitHub
- เครื่องมือ AI ทั้งหมด (MCP server, skill, plugin) ต้องเป็นโอเพนซอร์ส (MIT/ISC/BSD/Apache-2.0) — ดูหัวข้อความปลอดภัยของเครื่องมือ AI ใน `SECURITY.md`

### เอกสาร

- เอกสารใน `docs/` เป็นภาษาอังกฤษ โดยมี `th/` และ `zh-CN/` เป็นฉบับแปล เมื่อแก้เอกสารที่ใช้งานอยู่ (README, คู่มือ, runbook, สถาปัตยกรรม) ให้แก้ทั้งสองฉบับแปลใน pull request เดียวกัน ส่วนบันทึกหลักฐานและผลตรวจสอบที่ระบุวันที่คงเป็นต้นฉบับภาษาอังกฤษ
- ห้ามพิมพ์ยอดรวมของแดชบอร์ด service หรือ migration เอง เพราะ `tests/lint/doc-overclaim-linter.js` จะปฏิเสธ ให้ใช้ตัวสร้างอัตโนมัติแทน

---

## ข้อความ Commit

commitlint ตรวจข้อความ commit ด้วย `@commitlint/config-conventional` ([Conventional Commits](https://www.conventionalcommits.org/)) ประเภทที่อนุญาต: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, `test`

| ประเภท | ใช้เมื่อ | ตัวอย่าง |
| --- | --- | --- |
| `feat:` | ฟีเจอร์ใหม่ | `feat(snmp): add LDI walker for manufacturing metrics` |
| `fix:` | แก้บั๊ก (รวมถึงการแก้ด้านความปลอดภัย โดยใช้ scope `security`) | `fix(security): remove hardcoded credentials` |
| `perf:` | ปรับปรุงประสิทธิภาพ | `perf(factory-twin): cache private geometry file reads` |
| `docs:` | เฉพาะเอกสาร | `docs(runbook): correct nginx reload command` |
| `refactor:` | ปรับโครงสร้างโค้ด | `refactor(flows): split ingestion and alerting` |
| `test:` | เพิ่มการทดสอบ | `test(k6): add database write stress test` |
| `ci:` / `build:` | ไปป์ไลน์ CI / การ build และ image | `ci: make gitleaks blocking` |
| `chore:` | งานบำรุงรักษา | `chore(repo): update .gitignore` |

### การตั้งชื่อ Branch

```text
feat/<topic>      # New features
fix/<topic>       # Bug fixes
perf/<topic>      # Performance work
chore/<topic>     # Maintenance
docs/<topic>      # Documentation
refactor/<topic>  # Code restructuring
test/<topic>      # Tests
security/<topic>  # Security fixes (commit type is still fix)
```

---

## การทดสอบ

```bash
# Full pre-commit suite: every wired unit test, the tests/lint linters, dashboard + flow JSON validation
node scripts/pre-commit.js

# All standalone unit test suites in tests/unit/ and services/alarm-api/
make test-unit

# Individual linters
node tests/lint/dashboard-linter.js
node tests/lint/alarm-sync-linter.js
node tests/lint/query-budget-linter.js
node tests/lint/rca-mapping-coverage.js
node tests/lint/private-data-leak-scanner.js

# Need a running stack
make verify
make test-load
node tests/lint/orphan-object-linter.js
node tests/e2e/golden-dataset-spc.js
```

ไฟล์ใหม่ใน `tests/unit/` จะไม่ถูกรวมเข้าอัตโนมัติ ต้องเพิ่มชื่อไฟล์ทั้งใน `scripts/pre-commit.js` และ `.github/workflows/ci.yml`

---

## โครงสร้างโปรเจกต์

```text
IMS/
├── docker-compose.yaml        # Main orchestration (16 services)
├── proxy/nginx.conf           # The single front door
├── nodered_data/
│ ├── flows/                   # Node-RED flows, split by concern (source of truth)
│ ├── lib/                     # circuit-breaker.js, parser.js, snmp-normalize.js, units.js
│ ├── flows.json               # Built by scripts/build-flows.js from flows/*.json -- don't hand-edit
│ ├── Dockerfile               # Custom build: installs npm dependencies
│ └── settings.js              # Runtime settings (adminAuth, functionGlobalContext)
├── postgres/init/             # DB schema bootstrap (fresh-deploy path)
├── database/migrations/       # TimescaleDB migrations, applied by the db-migrate service
├── services/
│ ├── alarm-api/               # Acknowledge/Resolve write path
│ └── factory-twin-3d/         # Floor 1 digital twin
├── monitoring/
│ ├── grafana/dashboards/
│ │ ├── infrastructure/        # NOC Overview, Engineering Drill-Down, AIOps & Capacity,
│ │ │                          # Meta-Monitoring, Ingestion Latency
│ │ └── manufacturing/         # Easy Overview, Manufacturing Command Center, Operator Andon,
│ │                            # Alarm Console/Response/Dictionary, Engineering Analytics,
│ │                            # Machine Snapshot, Factory Digital Twin, Data Readiness
│ ├── grafana/library-panels/  # Shared Grafana library panels
│ ├── grafana/provisioning/    # Datasources, dashboard providers, Grafana-managed alert rules
│ └── prometheus/rules/        # Prometheus alert rules
├── scripts/                   # Utility scripts
├── tests/
│ ├── lint/                    # Dashboard/alarm/query-budget/RCA/leak/orphan linters
│ ├── unit/                    # Parser, boundary and factory-twin contract tests
│ ├── e2e/                     # Panel data, query timing, golden-dataset checks
│ ├── k6/                      # Load tests
│ └── playwright/              # Visual/layout and factory-twin browser regression
└── docs/                      # Documentation -- start at docs/README.md; th/ and zh-CN/ mirror it
```

---

## รายการตรวจสำหรับ Code Review

- [ ] diff ไม่มี secret, credential, ข้อมูลการผลิต, ขนาดอาคารที่ได้จาก CAD, รหัสเครื่องจักรจริง หรือข้อมูลส่วนบุคคล
- [ ] SQL ใน function node ใช้ `sanitize()` (จาก `nodered_data/lib/parser.js`) กับข้อมูลจากผู้ใช้
- [ ] แก้ JSON ของ flow ใน `nodered_data/flows/*.json` แล้ว build ใหม่ด้วย `node scripts/build-flows.js`
- [ ] datasource UID ของ Grafana เป็น `timescaledb`
- [ ] JSON ของแดชบอร์ดผ่าน `node tests/lint/dashboard-linter.js`
- [ ] `node scripts/pre-commit.js` ผ่าน (และ `make verify` สำหรับการเปลี่ยนแปลงที่กระทบ stack ที่รันอยู่)
- [ ] ปรับเอกสารทั้งภาษาอังกฤษ ไทย และจีนตัวย่อเมื่อเอกสารที่ใช้งานอยู่เปลี่ยน — รวมถึงไฟล์ที่สร้างอัตโนมัติ `docs/architecture/DASHBOARD_INVENTORY.md` / `DATABASE_SCHEMA.md` (`node scripts/generate-dashboard-inventory.js` / `node scripts/generate-schema-inventory.js` ตรวจใน CI)

---

<div align="center">

**IMS Contributing Guide — เวอร์ชัน 2.1 ตรวจทานเทียบกับ `main` เมื่อ 2026-09-26**

</div>
