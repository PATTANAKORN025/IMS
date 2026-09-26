# CLAUDE.md

ไฟล์นี้ให้คำแนะนำแก่ Claude Code (claude.ai/code) เมื่อทำงานกับโค้ดใน repository นี้

> **อ่าน `AGENTS.md` ก่อนเสมอ** ไฟล์นั้นเป็นข้อกำหนดทางเทคนิคหลักสำหรับ AI agents ทั้งหมดใน repo นี้ (กฎสถาปัตยกรรมที่ไม่สามารถละเมิดได้, กฎการออกแบบ Grafana, ข้อจำกัดแซนด์บ็อกซ์ Node-RED, รูปแบบโทนเสียงตอบกลับ) ไฟล์นี้ครอบคลุมคำสั่งและภาพรวมสถาปัตยกรรม ส่วน `AGENTS.md` ครอบคลุมกฎเหล็กที่ห้ามละเมิดเด็ดขาด

## ภาพรวมโปรเจกต์

IMS (Industrial Monitoring System) — แพลตฟอร์มการตรวจสอบ telemetry ด้าน OT/IT ระบบนี้เป็น Docker Compose stack ไม่ใช่แอปพลิเคชันทั่วไป: "โค้ด" ส่วนใหญ่เป็น Node-RED flow JSON, SQL migrations, Grafana dashboard JSON และบริการ Node 2 ตัว ไม่มี bundler, ไม่มี test framework และไม่มี TypeScript build — การทดสอบเป็นไฟล์ `node script.js` ทั่วไปที่ exit non-zero เมื่อล้มเหลว

## คำสั่งการทำงาน (Commands)

การดำเนินงานประจำวันใช้ `make`. **Makefile มีคำสั่ง mixed-shell ไม่ได้เป็น portable ข้ามระบบทั้งหมด**: มีเพียง `verify` ที่แยกตาม `$(OS)` ส่วน `doctor` ใช้รูปแบบ cmd `2>NUL`; `deploy-flows` ต้องใช้ `jq` พร้อม bash process substitution `<(...)`; ส่วน `backup`, `restore`, `test-load`, `snapshot-flows` ต้องใช้ POSIX shell บน Windows ให้รันคำสั่งเหล่านี้จาก Git Bash

| คำสั่ง | หน้าที่ |
| --- | --- |
| `make doctor` | ตรวจสอบข้อกำหนดเบื้องต้น (docker, compose, node) |
| `make up` | `build-flows` แล้วรัน `docker compose up -d` บนไฟล์หลัก |
| `make up-prod` | เริ่มต้นด้วย `docker-compose.prod.yaml` overlay (จำกัด resource ระดับ production) |
| `make down` / `make restart` / `make logs` | หยุด / รีสตาร์ทคอนเทนเนอร์หลัก / ดูบันทึก Node-RED |
| `make verify` | ตรวจสุขภาพระบบเต็มรูปแบบ — คอนเทนเนอร์, ฐานข้อมูล, ไปป์ไลน์, การแจ้งเตือน |
| `make build-flows` | รวม `nodered_data/flows/*.json` เข้าสู่ `nodered_data/flows.json` |
| `make validate-flows` | สร้างแล้วตรวจสอบว่า flows.json เป็น array ที่ถูกต้องและไม่มี ID โหนดซ้ำ |
| `make deploy-flows` | POST โฟลว์ที่รวมแล้วไปยัง Node-RED ที่ `127.0.0.1:1880` |
| `make snapshot-flows` | สำรอง `flows.json` ไปยัง `backups/` ก่อน deploy |
| `make validate-dashboards` | ค้นหาโค้ดสี hex ที่เสียหายในแดชบอร์ด |
| `make test-unit` | ชุดทดสอบยูนิต 4 ตัวหลักสำหรับ parser และขอบเขตระบบ |
| `make test-load` | การทดสอบโหลด k6 (`tests/k6/pipeline-stress.js`) |
| `make test-visual` / `make test-visual-ldi` | ตรวจสอบความถดถอยของภาพหน้าจอแดชบอร์ดด้วย Playwright |
| `make backup` / `make restore FILE=<path>` | สำรอง / กู้คืนฐานข้อมูล |

### การรันการทดสอบเดี่ยว (Running a single test)

ทุกการทดสอบเป็นสคริปต์ Node แบบสแตนด์อโลน — รันได้โดยตรง:

```bash
node tests/unit/factory-twin-alarm.test.js     # ทดสอบ unit test เดี่ยว
node tests/lint/query-budget-linter.js         # ทดสอบ linter เดี่ยว
npm run validate:floor1-geometry               # ตรวจสอบเรขาคณิตชั้น 1 (ข้ามอย่างปลอดภัยหากไม่มีไฟล์)
```

`tests/unit/` และ `tests/lint/` เป็นระดับการทดสอบที่เร็วและไม่ต้องพึ่งพาโครงสร้างพื้นฐาน — รันใน pre-commit hook และ CI และต้องไม่ต้องการฐานข้อมูลหรือเครือข่าย ส่วน `tests/e2e/`, `tests/smoke/`, `tests/data-quality/`, `tests/perf/`, `tests/resilience/`, `tests/disaster-recovery/` จำเป็นต้องเปิดระบบ stack ไว้ก่อน

### ตัวรันการประกันคุณภาพรวม (Aggregate assurance runner)

`scripts/production-assurance.js` รวมการทดสอบระดับที่หนักกว่าเข้าเป็นโพรไฟล์และบันทึก JSON รวมไว้ที่ `docs/evidence/runtime/`:

```bash
node scripts/production-assurance.js --profile=fast      # ค่าเริ่มต้น
node scripts/production-assurance.js --profile=release
node scripts/production-assurance.js --profile=full --allow-container-kill
```

โพรไฟล์อื่นๆ: `security` (`--full`), `load`, `dr` แต่ละโพรไฟล์จะไม่รันหมวดหมู่นอกเหนือจากรายการของตนเอง

### Pre-commit / CI

`.husky/pre-commit` รัน `node scripts/pre-commit.js`: unit tests, linters ใน `tests/lint/`, การตรวจสอบ JSON ของทุกแดชบอร์ด และ flow JSON validation `.github/workflows/ci.yml` รันชุดคล้ายกันร่วมกับ gitleaks, การตรวจสอบ compose, lint ของ config/rule ใน Prometheus และสแกนเนอร์ข้อมูลลับรั่วไหล **ทั้งสองส่วนระบุ path ของแต่ละการทดสอบไว้ตายตัว** — ไฟล์ใหม่ใน `tests/unit/` จะไม่ถูกดึงอัตโนมัติ ต้องเพิ่มเข้าไปใน `scripts/pre-commit.js` และ `.github/workflows/ci.yml` ข้อความ commit ตรวจสอบตามมาตรฐาน Conventional Commits (`commitlint.config.js`)

## สถาปัตยกรรม (Architecture)

### เส้นทางข้อมูล (Data path)

```text
SNMP devices / LDI machines (HTTP)
  -> Node-RED (ingestion, parsing, retry queue)
  -> PgBouncer (transaction pooling, plain auth, ห้าม prepared statements)
  -> TimescaleDB (hypertables ใน public schema + continuous aggregates)
  -> Grafana (dashboards) / Prometheus + Alertmanager (alerting ไปยัง LINE, Teams)
```

### ประตูหน้าจุดเดียว (The single front door)

ไม่มีบริการใดนอกจาก nginx ที่เปิดพอร์ตบน host สำหรับ UI `proxy/nginx.conf` ดักฟังที่ `${GRAFANA_PORT:-3000}` และกำหนดเส้นทาง same-origin เพื่อให้ทุก request ส่ง cookie เซสชันของ Grafana:

- `/` ส่งไปยัง `grafana:3000`
- `/alarm-api/` ส่งไปยัง `alarm-api:4000` (ตรวจสอบสิทธิ์ผ่าน nginx `auth_request` เทียบกับ `/api/user` ของ Grafana)
- `/factory-twin-3d/` ส่งไปยัง `factory-twin-3d:4100`
- `/ldi-telemetry`, `/inject` ส่งไปยัง `node-red:1880`

Grafana เอง**ไม่มี**พอร์ตเปิดตรงบน host เมื่อมีบางอย่างใช้งานได้ตรงไปยังคอนเทนเนอร์แต่ใช้ผ่าน `localhost:3000` ไม่ได้ ให้ตรวจสอบที่ nginx เป็นอันดับแรก ส่วน Prometheus, Alertmanager, Blackbox และ Node-RED ผูกกับ `127.0.0.1` เท่านั้น

### คอนเทนเนอร์ (Containers)

มี 15 บริการใน `docker-compose.yaml` คอนเทนเนอร์ทั้งหมดใช้ชื่อนำหน้า `ims-*`: `timescaledb`, `pgbouncer`, `db-migrate` (รันการย้ายฐานข้อมูลครั้งเดียวผ่าน `scripts/migrate-entrypoint.sh` ซึ่งเป็นตัวรันหลักเพียงตัวเดียว), `node-red`, `grafana`, `renderer` (Grafana image renderer), `proxy`, `prometheus`, `alertmanager`, `blackbox-exporter`, `snmpsim`, `alarm-api`, `factory-twin-3d`, `observability-archiver`, `pgadmin`

ไฟล์หลัก**ไม่มีการคัดกรองด้วย `profiles:`** — ทั้ง `make up` และ `make up-prod` ต่างเริ่มทำงานทั้ง 15 บริการ รวมถึง SNMP simulator และ pgAdmin `docker-compose.dev.yaml` (ไฟล์เดียวที่วาง `snmpsim` ไว้หลังโปรไฟล์ `dev`) ไม่ได้ถูกอ้างอิงโดยเป้าหมายใดใน Makefile นอกจากประตูหน้า nginx แล้ว `pgadmin` เป็นบริการเดียวที่เปิดสู่ทุก interface (`5050:80`); พอร์ตอื่นที่เปิดทั้งหมดผูกกับ `127.0.0.1`

Secrets มาจาก `.env` ด้วยรูปแบบ `${VAR:?message}` — `.env.example` ระบุคีย์ทั้งหมด ค่าตัวอย่างเป็นสาธารณะ ห้ามนำกลับมาใช้ซ้ำนอกสภาพแวดล้อมทดสอบ

### Node-RED (`nodered_data/`)

`nodered_data/flows/*.json` คือ **แหล่งความจริงหลัก (source of truth)**; `flows.json` คือ artifact ที่สร้างโดย `scripts/build-flows.js` (รวมไฟล์ + ตรวจสอบ ID ซ้ำ) ห้ามแก้ไข `flows.json` ด้วยมือ ฟังก์ชันโหนดทำงานในแซนด์บ็อกซ์ที่ไม่มี `require()` และไม่มี `structuredClone` — ดู `AGENTS.md` ส่วนที่ 3 สำหรับฟังก์ชันทดแทนและรูปแบบการพาร์ส O(N) single-pass + explicit-GC ที่บังคับใช้

### ฐานข้อมูล (`database/migrations/`)

ไฟล์ SQL เรียงตามลำดับตัวเลข ใช้สำหรับเดินหน้าเท่านั้น ถูกรันโดยคอนเทนเนอร์ `db-migrate` ผ่าน `scripts/migrate-entrypoint.sh` ซึ่งบันทึกเวอร์ชันที่ถูกนำไปใช้ใน `public.schema_migrations` ตัวรันนี้เป็นตัวรันหลักเพียงตัวเดียว — `scripts/migrate.sh` เป็นเพียง wrapper เรียก `docker compose run --rm db-migrate` สำหรับการรันซ้ำด้วยตนเอง วัตถุทั้งหมดอยู่ใน `public` schema ตาราง raw hypertable ใช้คอลัมน์ `time`; continuous aggregates ใช้ `bucket` — ใน Grafana ใช้นามแฝง `bucket AS time` การคิวรีของแดชบอร์ดส่วนใหญ่ควรอ่านจาก CAGG ไม่ใช่ตารางดิบ; `tests/lint/query-budget-linter.js` บังคับใช้ข้อตกลงนี้

### Grafana (`monitoring/grafana/`)

แดชบอร์ดถูก provision แบบอ่านอย่างเดียวจาก `dashboards/infrastructure/` และ `dashboards/manufacturing/` การแก้ไขทำในไฟล์ JSON ผ่าน git ไม่ใช่ผ่านหน้า UI `tests/lint/dashboard-linter.js` บังคับใช้กฎ grid และ token จาก `AGENTS.md` ส่วนที่ 4 (ทุกแถวรวมได้ 24 คอลัมน์พอดี, ใช้เฉพาะ token สีมาตรฐาน, ครอบตัวแปร template ด้วย quote ใน SQL เสมอ)

### บริการ (`services/`)

- **`alarm-api/`** — Express + `pg` เป็นช่องทางเดียวที่ operator ใช้เขียนข้อมูล: `POST /alarms/ack`, `POST /alarms/resolve` ภายใต้การตรวจสอบผู้กระทำ พร้อมด้วย `GET /healthz`
- **`factory-twin-3d/`** — ดิจิทัลทวินของชั้น 1 ระดับโปรดักชัน (Express, ~7k บรรทัด) ตรรกะทางธุรกิจอยู่ใน `lib/*.js` (`mapping`, `telemetry`, `alarm`, `analytics`, `evidence`, `wire`, `schematic`, `floors`, `spc`, `eap-map`, `predictive`, …); ตัวแสดงผลบนเบราว์เซอร์อยู่ใน `public/` กฎสำคัญ: **เรขาคณิตและเอกลักษณ์ต้องผ่านการยืนยันด้วยหลักฐาน** — หากไม่มีการจับคู่อุปกรณ์กับ CAD ที่ยืนยันได้ จะไม่มีการเชื่อมโยงสถานะสดไม่ว่าจะมี telemetry ใดก็ตาม `tests/lint/floor1-cad-reconciliation.js` และ `floor1-orientation.js` เปรียบเทียบโมเดลที่ให้บริการกลับไปยังบันทึก CAD

ข้อมูล CAD ต้นฉบับของชั้น 1 เป็นความลับและอยู่นอก git; `tests/lint/private-data-leak-scanner.js` รันเป็นตัวแรกใน CI และตัวตรวจสอบเรขาคณิตจะข้ามไปอย่างปลอดภัยเมื่อไม่มีข้อมูลดังกล่าว เอกสารสาธารณะระบุได้เฉพาะจำนวน กฎ และข้อสรุปที่ได้จาก CAD ห้ามระบุขนาด พิกัด พื้นที่ ชื่อ layer หรือข้อความบนป้ายโดยเด็ดขาด

## ข้อควรทราบเพิ่มเติม

- **ตัวเลขในเอกสารมี linter ตรวจสอบ** `tests/lint/doc-overclaim-linter.js` ปฏิเสธข้อความที่ระบุจำนวนแดชบอร์ด/บริการ/การย้ายข้อมูลแบบฮาร์ดโค้ด ให้ใช้ตัวสร้างอัตโนมัติ (`scripts/generate-dashboard-inventory.js --check`, `generate-schema-inventory.js`, `generate-docs-readme-index.js --check`) แทนการเขียนผลรวมด้วยมือ
- **เอกสารรองรับ 3 ภาษา** `docs/` (ภาษาอังกฤษ) มีฉบับจำลองใน `th/` และ `zh-CN/` เอกสารที่มีผลใช้งาน (README, คู่มือ, runbooks, สถาปัตยกรรม) แปลอย่างสมบูรณ์ ส่วนหลักฐานและผลการตรวจสอบที่ระบุวันที่คงภาษาอังกฤษเป็นหลักพร้อมหมายเหตุภาษาท้องถิ่น การแก้ไขเอกสารโดยไม่ทำคู่ขนานจะทำให้เกิดความคลาดเคลื่อน
- **หลักฐานสำคัญกว่าคำกล่าวอ้าง** ข้อความอ้างอิงในเอกสารต้องได้รับการสนับสนุนจาก artifacts ใน `docs/evidence/`; ตัวรันการประกันคุณภาพจะเขียนผลลัพธ์ใหม่ลงในนั้น อย่าสร้างเกณฑ์ผ่าน/ไม่ผ่านสำหรับรายการที่ตั้งใจไม่ให้มีเกณฑ์ (ดูความคิดเห็นใน `tests/e2e/runner.js`)
- **ข้อพึงระวังบน Windows** PowerShell ทำให้ `\n` เสียหายใน flow JSON — ให้ใช้สคริปต์ Python หรือ Node ในการแก้ไขโฟลว์หลายไฟล์ ห้ามใช้การแทนที่สตริงของ PowerShell โดยเด็ดขาด
