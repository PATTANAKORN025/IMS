<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>หน้าหลัก</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>ดัชนีเอกสาร</b></a>
</div>
<br/>

<div align="center">
  <h1>คู่มือการพัฒนาและการตั้งค่าระบบในเครื่อง (Local Development & Engineering Guide)</h1>
  <p><b>แนวทางการติดตั้งสภาพแวดล้อมจำลอง, การจัดการคอนเทนเนอร์, วิศวกรรมไปป์ไลน์ข้อมูล และการทดสอบระบบแบบครบวงจร</b></p>
  <p>
    <a href="../../../docs/developer/LOCAL_DEVELOPMENT.md">English</a> |
    <a href="LOCAL_DEVELOPMENT.md">ไทย</a> |
    <a href="../../../zh-CN/docs/developer/LOCAL_DEVELOPMENT.md">简体中文</a>
  </p>
</div>

---

## 1. เริ่มต้นใช้งานด่วนใน 5 นาที (Quick-Start Bootstrap)

รันระบบรวบรวมและวิเคราะห์ข้อมูลอุตสาหกรรม (IMS) ครบทั้งสแต็กบนเครื่องคอมพิวเตอร์ของคุณในไม่กี่นาที:

```bash
# 1. ทำการ Clone repository
git clone https://github.com/PATTANAKORN025/IMS.git
cd IMS

# 2. คัดลอกไฟล์ตั้งค่าสภาพแวดล้อม
cp .env.example .env

# 3. ตรวจสอบความพร้อมของเครื่องมือในเครื่อง
make doctor

# 4. ประกอบโฟลว์และเริ่มต้นรันคอนเทนเนอร์ทั้งหมด
make up

# 5. ตรวจสอบสถานะความพร้อมของทั้ง 14 เซอร์วิส
make verify
```

เมื่อระบบเริ่มทำงานเรียบร้อย สามารถเข้าใช้งานผ่านเบราว์เซอร์ได้ที่:
- **เกตเวย์หลัก (Grafana UI & APIs)**: `http://localhost:3000` (ผู้ใช้เริ่มต้น: `admin` / รหัสผ่านตามที่ตั้งใน `.env`)
- **เครื่องมือจัดการโฟลว์ Node-RED**: `http://localhost:1880`
- **ระบบมอนิเตอร์ Prometheus**: `http://localhost:9090`
- **ระบบกระจายแจ้งเตือน Alertmanager**: `http://localhost:9093`
- **จัดการฐานข้อมูล PgAdmin 4**: `http://localhost:5050` (ทางเลือกเสริม)

---

## 2. สิ่งที่จำเป็นต้องมีและเวอร์ชันที่รองรับ (Prerequisites)

| เครื่องมือ | เวอร์ชันขั้นต่ำ | เวอร์ชันแนะนำ | วัตถุประสงค์ |
|:-----------|:----------------|:--------------|:-------------|
| **Docker Engine** | 24.0+ | 26.0+ | รันคอนเทนเนอร์เซอร์วิสทั้งหมด |
| **Docker Compose** | v2.20+ | v2.27+ | ควบคุมและจัดระเบียบสแต็กหลายคอนเทนเนอร์ |
| **GNU Make** | 3.81+ | 4.4+ | คำสั่งอัตโนมัติสำหรับการบิลด์ รัน และทดสอบ |
| **Node.js** | 18.0.0 LTS | 20.x / 22.x LTS | รันสคริปต์ Lint, Unit Tests และสร้าง Mock Data |
| **npm** | 9.0+ | 10.0+ | ตัวจัดการแพ็กเกจไลบรารี |
| **Git** | 2.30+ | 2.45+ | ระบบควบคุมเวอร์ชันโค้ด |
| **k6** *(ทางเลือก)* | 0.45+ | ล่าสุด | ทดสอบการรับโหลดสูงและการทดสอบแรงกดดัน |
| **psql** *(ทางเลือก)* | 15.0+ | 16.0+ | ไคลเอนต์บรรทัดคำสั่งสำหรับฐานข้อมูล PostgreSQL |

### ข้อควรทราบในการติดตั้งแยกตามระบบปฏิบัติการ

- **Windows 10/11**: แนะนำให้ใช้ PowerShell 7+ หรือ WSL2 (Ubuntu 22.04+) หากใช้ PowerShell โดยตรง ตรวจสอบให้แน่ใจว่าได้เปิดสิทธิ์การรันสคริปต์ (`Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`)
- **Linux (Ubuntu/Debian)**: ติดตั้งเครื่องมือมาตรฐาน (`sudo apt-get install build-essential docker-compose-plugin nodejs npm`)
- **macOS (Apple Silicon / Intel)**: ติดตั้ง Docker Desktop และ Command Line Tools (`xcode-select --install`)

---

## 3. การกำหนดค่าสภาพแวดล้อมและความปลอดภัยของ Secrets

IMS ต้องการไฟล์ `.env` ที่โฟลเดอร์หลักของโปรเจกต์เสมอ ห้ามบันทึกหรือ commit ไฟล์ `.env` เข้าสู่ระบบ Git โดยเด็ดขาด

```bash
cp .env.example .env
```

### ตารางตัวแปรสภาพแวดล้อมหลัก

| ชื่อตัวแปร | จำเป็น | ตัวอย่างค่าเริ่มต้น | คำอธิบาย |
|:-----------|:-------|:--------------------|:---------|
| `POSTGRES_USER` | ใช่ | `ims_admin` | บัญชีผู้ดูแลระบบของ TimescaleDB |
| `POSTGRES_PASSWORD` | ใช่ | *รหัสผ่านที่ปลอดภัย* | รหัสผ่านผู้ดูแลระบบ TimescaleDB |
| `POSTGRES_DB` | ใช่ | `ims_telemetry` | ชื่อฐานข้อมูลหลักสำหรับจัดเก็บข้อมูล Telemetry |
| `GF_SECURITY_ADMIN_USER` | ใช่ | `admin` | ชื่อผู้ใช้สำหรับดูแลระบบ Grafana |
| `GF_SECURITY_ADMIN_PASSWORD` | ใช่ | *รหัสผ่าน Grafana* | รหัสผ่านผู้ดูแลระบบ Grafana |
| `INGEST_API_KEY` | ใช่ | *รหัสผ่านรับข้อมูล* | โทเคนสำหรับเรียกใช้งาน `POST /ldi-telemetry` |
| `NODE_RED_CREDENTIAL_SECRET` | ใช่ | *คีย์เข้ารหัสโฟลว์* | คีย์ AES สำหรับเข้ารหัสข้อมูลรับรองใน Node-RED |
| `ALERTMANAGER_LINE_TOKEN` | ไม่บังคับ | *LineToken...* | โทเคน LINE Notify สำหรับส่งการแจ้งเตือน |
| `ALERTMANAGER_TEAMS_WEBHOOK` | ไม่บังคับ | `https://...` | เว็บบุ๊กรับแจ้งเตือนของ Microsoft Teams |

> [!CAUTION]
> **นโยบายความปลอดภัยของข้อมูลลับ (Strict Secret Policy)**: ให้อ้างอิงตัวแปรสภาพแวดล้อมด้วยชื่อตัวแปรเท่านั้นในเอกสารและการส่งงาน การตั้งค่า Docker Compose ทุกจุดจะบังคับใช้ไวยากรณ์ `${VARIABLE:?set VARIABLE in .env}` เพื่อป้องกันการลืมตั้งค่ารหัสผ่าน

---

## 4. ตารางคำสั่งจัดการระบบผ่าน Make (Command Reference)

คำสั่งใน `Makefile` ของ IMS ครอบคลุมการทำงานทั่วไปในชีวิตประจำวันทั้งหมด:

```bash
# ควบคุมการทำงานของคอนเทนเนอร์
make up               # รวมไฟล์โฟลว์และเริ่มต้นรันคอนเทนเนอร์ทั้งหมดในพื้นหลัง
make up-prod          # รันคอนเทนเนอร์ด้วยการตั้งค่าแบบ Production Overlay
make down             # หยุดการทำงานและปิดคอนเทนเนอร์ทั้งหมด
make restart          # สั่งรีสตาร์ตเฉพาะ Node-RED, Grafana, Alertmanager และ Prometheus

# การจัดการโฟลว์ข้อมูล (IaC: Infrastructure as Code)
make build-flows      # รวมไฟล์ย่อย (nodered_data/flows/*.json) เข้าเป็น flows.json
make validate-flows   # ตรวจสอบความถูกต้องของ flows.json และตรวจจับ ID ซ้ำ
make deploy-flows     # ส่งโฟลว์ที่บิลด์แล้วไปยัง Node-RED ที่กำลังทำงานผ่าน API
make snapshot-flows   # บันทึกสำเนา flows.json เก็บไว้ใน backups/ พร้อมประทับเวลา

# ตรวจสอบสุขภาพระบบ
make verify           # รันสคริปต์ตรวจสุขภาพและการเชื่อมต่อของทั้งระบบอย่างละเอียด
make doctor           # ตรวจสอบเครื่องมือที่จำเป็นในเครื่อง (Docker, Compose, Node)
make validate-dashboards # ตรวจสอบไฟล์แดชบอร์ด Grafana เพื่อหาโค้ดสี Hex ที่ผิดรูปแบบ
make logs             # แสดงและติดตามบันทึกการทำงานของคอนเทนเนอร์ Node-RED

# สำรองและกู้คืนฐานข้อมูล
make backup           # สำรองข้อมูล TimescaleDB ออกมาเป็นไฟล์ SQL พร้อมประทับเวลา
make restore FILE=... # กู้คืนข้อมูลฐานข้อมูลจากไฟล์สำรองที่ระบุ

# การทดสอบและการรับประกันคุณภาพ (QA)
make test-unit        # รันการทดสอบ Unit Tests (การตรวจสอบขอบเขต, พาร์สเซอร์, ตัวนับ)
make test-load        # รันการทดสอบโหลดสูงของไปป์ไลน์ด้วย k6
make test-visual      # รันการทดสอบการแสดงผลหน้าจอแดชบอร์ดด้วย Playwright
make test-visual-ldi  # รันการทดสอบ Responsive ของหน้าจอ LDI ด้วย Playwright
```

---

## 5. การพัฒนาไปป์ไลน์ข้อมูล Node-RED (Pipeline Engineering)

Node-RED ทำหน้าที่เป็นหัวใจหลักในการรับข้อมูล, แปลงรูปแบบ และจัดคิวบันทึกข้อมูลความถี่สูง

### สถาปัตยกรรมโฟลว์แบบแยกไฟล์ (Split Flow Architecture)

เพื่อป้องกันปัญหาข้อขัดแย้งในการ Merge โค้ด JSON ขนาดใหญ่ใน Git ทางทีมวิศวกรรมจึงแยกโฟลว์ออกเป็นโมดูลย่อยใน `nodered_data/flows/`:

```
nodered_data/flows/
├── 01-snmp-poller.json       # รวบรวมข้อมูล SNMP และดึงตัวนับอินเทอร์เฟซเครือข่าย
├── 02-ldi-ingest.json        # ตรวจสอบความถูกต้องของสคีมา /ldi-telemetry และพาร์สข้อมูล
├── 03-alarm-engine.json      # ตรวจสอบเกณฑ์การแจ้งเตือนและส่งต่อไปยัง Alertmanager
└── 04-storage-writer.json    # รวมการเชื่อมต่อ PgBouncer และบันทึกข้อมูลแบบกลุ่มลงฐานข้อมูล
```

1. **การปรับใช้โฟลว์ (Deploy)**:
   ```bash
   make deploy-flows
   ```
   *นำไฟล์ย่อยทั้งหมดมารวมเป็น `nodered_data/flows.json` และส่งผ่าน Admin API ของ Node-RED ทันที*
2. **การทำสำเนาโฟลว์ (Snapshot)**:
   ```bash
   make snapshot-flows
   ```
   *สร้างไฟล์สำรองในรูปแบบ `backups/flows-YYYYMMDD-HHMMSS.json` ก่อนทำการแก้ไขใหญ่*

### กฎเหล็กของแซนด์บ็อกซ์การทำงาน (Sandbox Rules)

โค้ด JavaScript ใน Function Node ของ Node-RED จะทำงานภายใต้สภาพแวดล้อมที่จำกัด:

- **ห้ามใช้ `require()`**: ระบบปิดการใช้งาน `require()` แบบไดนามิก ให้เรียกใช้โมดูลผ่าน `global.get('snmp')`, `global.get('pg')` หรือ `global.get('fs')`
- **ห้ามใช้ `structuredClone`**: ไม่มีฟังก์ชันนี้ในสภาพแวดล้อม ให้ใช้ `JSON.parse(JSON.stringify(obj))` สำหรับการ Deep Copy ข้อมูล
- **ต้องจัดการ Garbage Collection เองอย่างชัดเจน**: ข้อมูลอาร์เรย์ที่มีขนาดใหญ่ต้องถูกล้างทิ้งเพื่อป้องกันปัญหาหน่วยความจำ V8 เต็ม:
  ```javascript
  flatData.length = 0;
  msg.payload = null;
  ```
- **การประมวลผลต้องเป็น $O(N)$ ในรอบเดียว (Single-Pass)**: การแปลงข้อมูล Telemetry ต้องทำงานเป็นเส้นตรง ไม่มีการวนลูปซ้อนกันหลายชั้น

---

## 6. การจัดการฐานข้อมูล TimescaleDB และ PostgreSQL

ข้อมูล Telemetry ทั้งหมดจัดเก็บใน TimescaleDB (PostgreSQL 16 พร้อมส่วนขยาย TimescaleDB)

### กฎเกณฑ์โครงสร้างฐานข้อมูล

- **ต้องใช้สคีมา `public` เท่านั้น**: ตารางทั้งหมด ไฮเปอร์เทเบิล วิว และ Continuous Aggregates ต้องอยู่ใน `public` ห้ามสร้างหรืออ้างอิงสคีมา `ims.*`
- **การไมเกรชันแบบเรียงลำดับ**: สคริปต์การเปลี่ยนแปลงโครงสร้างต้องอยู่ใน `database/migrations/` และเรียงหมายเลขอย่างเคร่งครัด (`001-*.sql` ถึง `086-*.sql`)
- **จำนวนคอลัมน์และพารามิเตอร์ต้องตรงกันในคำสั่ง `INSERT`**: จำนวนฟิลด์ใน `INSERT INTO` ต้องเท่ากับตัวแทนข้อมูลใน `VALUES ()` เสมอ เมื่อมีการใช้ `NOW()` ใน `VALUES` คอลัมน์ `"time"` ต้องคงอยู่ในรายการฟิลด์ของคำสั่ง `INSERT`
- **ข้อกำหนดในการเชื่อมต่อผ่าน PgBouncer**:
  - โหมดการเชื่อมต่อ: `transaction` pooling
  - การยืนยันตัวตน: `AUTH_TYPE: plain`
  - การใช้งาน Prepared Statements: **ไม่อนุญาตให้ใช้งาน** เนื่องจาก PgBouncer ในโหมด transaction ไม่รองรับ

### การรันสคริปต์ Migration ในเครื่อง

```bash
# ส่งคำสั่งไมเกรชันเข้าสู่ TimescaleDB ผ่าน docker exec
docker exec -i ims-timescaledb psql -U ims_admin -d ims_telemetry < database/migrations/086-add-custom-telemetry.sql
```

### การใช้งาน Continuous Aggregates (CAGGs)

คิวรีสำหรับแดชบอร์ดต้องดึงข้อมูลผ่านมุมมอง Continuous Aggregates (เช่น `public.ldi_data_15m`) เพื่อให้ได้ความเร็วในการตอบสนองระดับ Sub-second:

```sql
SELECT
  bucket AS "time",
  machine_id,
  ROUND(avg_temperature::numeric, 2) AS temperature
FROM public.ldi_data_15m
WHERE machine_id = 'LDI-01'
  AND bucket > NOW() - INTERVAL '24 hours'
ORDER BY bucket ASC;
```

---

## 7. การสร้างข้อมูลจำลองสังเคราะห์ (CNC Drilling & VCP Plating)

เพื่อทดสอบแดชบอร์ดงานเจาะ CNC (4 แดชบอร์ด) และงานชุบ VCP (3 แดชบอร์ด) โดยไม่ต้องอาศัยข้อมูลจริงของโรงงาน ให้ใช้งานเครื่องมือสร้างข้อมูลจำลอง:

```bash
# 1. สร้างข้อมูลการทำงานสังเคราะห์ย้อนหลัง 7 วัน (168 ชั่วโมง)
node scripts/mock/eap-mock-data.js --hours=168 --apply

# 2. ตรวจสอบการคิวรีและจำนวนแถวข้อมูลของทุกพาเนลในแดชบอร์ด
node scripts/mock/verify-mock-dashboards.js --container=ims-timescaledb --psql-user=ims_admin
```

> [!NOTE]
> ข้อมูลจำลองจะถูกบันทึกแยกไว้ในฐานข้อมูล `eap_backup` อย่างปลอดภัย ทำให้สามารถทดสอบฟังก์ชันการทำงานและการแสดงผลของแดชบอร์ดทั้งหมด 22 ตัวได้อย่างสมบูรณ์

อ่านรายละเอียดเพิ่มเติมได้ที่ [Synthetic Mock Data Framework](../data/MOCK_DATA.md)

---

## 8. ข้อกำหนดและมาตรฐานในการพัฒนาแดชบอร์ด Grafana

แดชบอร์ดทั้งหมดถูกจัดเก็บในรูปแบบไฟล์ JSON ภายใต้โฟลเดอร์ `monitoring/grafana/dashboards/`:
- `infrastructure/` (5 แดชบอร์ด)
- `manufacturing/` (10 แดชบอร์ด)
- `drilling/` (4 แดชบอร์ด)
- `vcp/` (3 แดชบอร์ด)

### กฎการออกแบบแดชบอร์ด

1. **ระเบียบ Grid-24**:
   - ผลรวมความกว้างของแต่ละแถวต้องเท่ากับ **24 คอลัมน์** พอดี
   - การคำนวณตำแหน่งแถวถัดไป: $\text{Next Y} = \text{Prev Y} + \text{Prev H}$
2. **ใช้ชุดโทเคนสีมาตรฐาน (Canonical Color Tokens) เท่านั้น**:
   - ข้อมูลหลักและสถานะปกติ: `#00F2FE` (Electric Cyan)
   - ความสำเร็จและสถานะปกติสมบูรณ์: `#00FF87` (Spring Green)
   - การแจ้งเตือนระดับวิกฤตและความผิดปกติ: `#FF003C` (Crimson Red)
   - การเตือนที่ต้องเฝ้าระวัง: `#FFB300` (Amber)
   - เส้นกราฟวิเคราะห์เสริม: `#7928CA` (Neon Purple)
   - ห้ามใช้ชุดสีเริ่มต้นของ Grafana
3. **ป้องกันช่องโหว่ SQL Injection**:
   - พาเนลที่ไม่ทำซ้ำ (Non-repeated): `machine_id IN (${machine_id:singlequote})`
   - พาเนลที่ทำซ้ำ (Repeated): `eqp_id = ${machine_id:singlequote}`
   - **ห้าม** ใช้ตัวแปร `${machine_id}` โดยไม่มีเครื่องหมายคำพูดเดี่ยวครอบ
4. **การปัดเศษทศนิยมด้วย PostgreSQL ROUND**:
   - ต้องแปลงชนิดข้อมูลเป็นตัวเลขก่อนเสมอ: `ROUND(value::NUMERIC, 2)`

---

## 9. ชุดเครื่องมือทดสอบและการประกันคุณภาพ (QA Suite)

ก่อนทำการ commit โค้ดหรือเปิด Pull Request ให้รันชุดคำสั่งตรวจสอบคุณภาพ:

```bash
# 1. รันชุดทดสอบ Pre-commit ครบ 53 รายการ
node scripts/pre-commit.js

# 2. ตรวจสอบความถูกต้องของลิงก์และ Anchor ในเอกสาร Markdown ทั้งหมด
node scripts/check-all-links.js

# 3. ตรวจสอบความสอดคล้องของตัวเลขสถิติในเอกสารกับโค้ดจริง
node tests/lint/doc-overclaim-linter.js

# 4. ตรวจสอบและสแกนการรั่วไหลของข้อมูลลับหรือข้อมูลจริงของโรงงาน
node tests/lint/private-data-leak-scanner.js

# 5. ตรวจสอบความสมบูรณ์ของรายการแดชบอร์ดและสคีมาฐานข้อมูล
node scripts/generate-dashboard-inventory.js --check
node scripts/generate-schema-inventory.js --check
node scripts/generate-docs-readme-index.js --check
```

---

## 10. ข้อตกลงการใช้งาน Git และขั้นตอนการส่งงาน (Git Workflow)

### รูปแบบการตั้งชื่อ Branch

- `feat/<ชื่อฟีเจอร์>`: ฟีเจอร์ใหม่ แดชบอร์ดใหม่ หรือการเพิ่มขีดความสามารถ
- `fix/<ชื่อปัญหา>`: การแก้ไขบักหรือข้อผิดพลาดในการทำงาน
- `perf/<การปรับปรุง>`: การปรับแต่งประสิทธิภาพของคิวรีหรือไปป์ไลน์
- `docs/<หัวข้อ>`: การปรับปรุงหรือแปลเนื้อหาเอกสาร

### รูปแบบ Conventional Commits

ข้อความ commit ต้องเป็นไปตามมาตรฐาน Conventional Commits:

```
<type>(<optional scope>): <description>

[optional body]

[optional footer(s)]
```

*ตัวอย่าง:*
- `feat(drilling): add spindle vibration anomaly detection panel`
- `fix(pipeline): prevent counter wraparound on 64-bit snmp octets`
- `docs(api): document alarm lifecycle ack and resolve endpoints`

### รายการตรวจสอบก่อนส่ง Pull Request (PR Checklist)

- [ ] คำสั่ง `node scripts/pre-commit.js` รันผ่านสมบูรณ์โดยไม่มีข้อผิดพลาด (0 failures)
- [ ] ไม่มีข้อมูล CAD จริง, ชื่อผู้ผลิตเครื่องจักร หรือความลับของโรงงานหลุดเข้าไปในโค้ด
- [ ] เนื้อหาเอกสารได้รับการอัปเดตตรงกันทั้ง 3 ภาษา (อังกฤษ `docs/`, ไทย `th/`, จีนตัวย่อ `zh-CN/`)
- [ ] ลิงก์ทั้งหมดในเอกสารผ่านการตรวจสอบด้วย `check-all-links.js` เรียบร้อย
