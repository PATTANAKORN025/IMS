# IMS — AI Agent Operating Instructions

> **กฎประจำ (Standing Rules):** ไฟล์นี้คือผู้มีอำนาจทางเทคนิคสำหรับ AI agents ทั้งหมด (Claude, Antigravity, Cursor ฯลฯ) ที่ทำงานกับ repository ของ IMS ให้อ่านไฟล์นี้เมื่อเริ่มต้นทุกเซสชัน

## 1. บริบทย่อยของระบบ (System Context)

**IMS (Industrial Monitoring System)** คือระบบตรวจสอบข้อมูลโทรมาตร

- **แหล่งที่มา:** อุปกรณ์ที่ถูกดึงข้อมูลผ่าน SNMP (เซิร์ฟเวอร์ Linux, สวิตช์ Juniper) และ HTTP (เครื่องผลิต PCB ของ LDI)
- **ไปป์ไลน์:** Node-RED (นำเข้าข้อมูล) → PgBouncer → TimescaleDB (การจัดเก็บ) → Grafana (แดชบอร์ด)
- **การแจ้งเตือน:** Prometheus + Alertmanager → LINE / MS Teams

## 2. ผลลัพธ์และน้ำเสียงของ Agent (Agent Output & Tone)

- **โหมดมนุษย์ถ้ำ (Caveman Mode):** ตอบแบบสั้นๆ กระชับเหมือนมนุษย์ถ้ำที่ฉลาด คงเนื้อหาทางเทคนิคไว้ทั้งหมด ตัดส่วนที่ไม่จำเป็นออกให้หมด ตัดคำนำหน้านาม (a/an/the) คำสร้อย (just/really/basically) คำทักทาย และการพูดอ้อมค้อม สามารถใช้ประโยคที่ไม่สมบูรณ์ได้
- *รูปแบบ:* `[สิ่งของ] [การกระทำ] [เหตุผล]. [ขั้นตอนถัดไป].`
- *ตัวอย่างที่ถูกต้อง:* "Bug in auth middleware. Fix:"
- *ความชัดเจนอัตโนมัติ (Auto-Clarity):* ยกเลิกโหมดมนุษย์ถ้ำสำหรับคำเตือนด้านความปลอดภัย การกระทำที่ย้อนกลับไม่ได้ หรือเมื่อผู้ใช้สับสน แล้วค่อยกลับมาใช้ใหม่หลังจากนั้น
- **ขอบเขต:** โค้ด/commits/PRs ต้องเขียนแบบปกติ
- **การจัดรูปแบบ:** ใช้ Markdown ใช้การแจ้งเตือนแบบ GitHub (`> [!WARNING]` ฯลฯ) สำหรับข้อมูลสำคัญ

## 3. กฎสถาปัตยกรรมเหล็ก (Ironclad Architectural Rules) (ห้ามละเมิดเด็ดขาด)

- **Database Schema:** ใช้ schema `public` เท่านั้น ห้ามใช้ `ims.*`
- **Node-RED Sandbox:** ไม่สามารถใช้ `require()` ในฟังก์ชันโหนดได้ ให้ใช้ `global.get('snmp')`, `global.get('pg')`, `global.get('fs')` ไม่สามารถใช้ `structuredClone` ให้ใช้ `JSON.parse(JSON.stringify(obj))`
- **การพาร์ส (Parsing) ใน Node-RED:** ใช้เวลา O(N) ทำในรอบเดียว (single-pass) จำเป็นต้องจัดการหน่วยความจำ (GC) อย่างชัดเจน: `flatData.length = 0` + `msg.payload = null`
- **Node-RED Flows:** `nodered_data/flows/*.json` (ไฟล์ย่อย) คือแหล่งข้อมูลหลัก (source of truth) พวกมันจะถูกนำมารวมกันเป็น `flows.json` ในตอนที่ทำการ deploy ด้วย `make deploy-flows` PowerShell จะแทนที่ `\n` ด้วย `\\n` ใน JSON flow — ให้ใช้สคริปต์ Python สำหรับการแก้ไขหลายไฟล์ที่ซับซ้อน
- **การเพิ่มข้อมูล (Database Inserts):** จำนวนคอลัมน์ใน INSERT ต้องเท่ากับจำนวนตัวแทน (placeholder) ใน VALUES เมื่อใช้ `NOW()` ใน VALUES คอลัมน์ `"time"` ต้องยังคงอยู่ในรายการ INSERT
- **PgBouncer:** `AUTH_TYPE: plain`, การพูลทรานแซกชัน (transaction pooling), ไม่ใช้ prepared statements

## 4. กฎสำหรับ Grafana และ แดชบอร์ด (Grafana & Dashboard Rules)

- **กฎ Grid-24 (Grid-24 Discipline):** ทุกแถวต้องมีผลรวมคอลัมน์เท่ากับ 24 พอดี. Next Y = Prev Y + Prev H.
- **ระบบการออกแบบ (Design System):** ใช้ Canonical Color Tokens เท่านั้น (เช่น `#00F2FE` สีฟ้า, `#00FF87` สีเขียว, `#FF003C` สีแดง) ห้ามใช้สีเริ่มต้นของ Grafana เด็ดขาด
- **TimescaleDB Queries:** ใช้ continuous aggregates ทับตารางข้อมูลดิบเท่าที่เป็นไปได้
- **การตั้งชื่อคอลัมน์:** ตารางข้อมูลดิบใช้ `time`. CAGGs ใช้ `bucket`. Grafana ใช้นามแฝง (aliases) เป็น `bucket AS time` ในการคิวรี
- **การป้องกัน SQL Injection:**
  - พาเนลที่ไม่เกิดซ้ำ: `machine_id IN (${machine_id:singlequote})`
  - พาเนลที่เกิดซ้ำ: `eqp_id = ${machine_id:singlequote}`
  - **ห้าม** ใช้ `${machine_id}` โดยไม่มีเครื่องหมายอัญประกาศเด็ดขาด
- **PostgreSQL ROUND:** ต้องแปลงชนิดข้อมูลเป็นตัวเลข (numeric): `ROUND(value::NUMERIC, N)`
- **State Timeline:** การจับคู่ค่าเพื่อกำหนดรหัสสี (0=แดง/CRIT, 1=เหลือง/WARN, 2=เขียว/OK)

## 5. เวิร์กโฟลว์การพัฒนาและคำสั่ง (Development Workflow & Commands)

- `make up` — เริ่ม stack สำหรับการพัฒนา (โปรไฟล์ SNMP simulator)
- `make up-prod` — เริ่ม overlay สำหรับการผลิต
- `make restart` — รีสตาร์ท Node-RED, Grafana, Alertmanager, Prometheus
- `make verify` — ตรวจสอบสถานะการทำงานอย่างเต็มรูปแบบ (containers, DB, pipeline, alerts)
- `make deploy-flows` — นำไฟล์ flow ย่อยมารวมกัน → flows.json → POST ไปยัง Node-RED
- `make test-unit` / `make test-load` / `make test-visual` — ชุดการทดสอบ ให้ทดสอบส่วนที่แคบที่สุดก่อน

## 6. ความปลอดภัย (Safety & Security)

- **ความลับ (Secrets):** ห้ามอ่านออกเสียง, พิมพ์, บันทึกใน log, หรือ commit ไฟล์ `.env` ให้อ้างอิงด้วยชื่อเท่านั้น
- **ตัวแปรสภาพแวดล้อมที่จำเป็น (Required Env Vars):** ใช้รูปแบบ `:?err` สำหรับ secrets ที่ต้องการใน compose (เช่น `${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}`)
- **ค่าเริ่มต้น:** ต้องถามเสมอในกรณีที่เป็นการกระทำที่ส่งผลเสียร้ายแรง (เปลี่ยน schema ของฐานข้อมูล, `git push --force`, การเขียนทับไฟล์ที่ไม่ใช่ผลลัพธ์)

## 7. ทักษะที่มีอยู่ (Available Skills)

มีทักษะมากกว่า 90 รายการให้ใช้งานผ่าน MCP และ `.agents/skills/` ใช้ `/skill-name` เพื่อเรียกใช้
ทักษะสำคัญที่ทำงานภายในเครื่อง ได้แก่: `verify-database-state`, `update-aiops-parser`, `modify-grafana-dashboard`, `batch-dashboard-edit`
