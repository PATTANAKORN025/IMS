<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../../docs/README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

# CONTEXT — ตัวโหลดเริ่มต้นเซสชัน (Session Start Loader)

> โครงร่างการเริ่มต้นเซสชันสำหรับ AI-agent ไม่ใช่เอกสารสำหรับผู้อ่านที่เป็นมนุษย์ — เป็นการแนะนำโปรเจกต์อย่างรวดเร็วสำหรับเครื่องมือ AI ใดๆ ก็ตามที่โหลดไฟล์นี้เป็นครั้งแรกในเซสชัน สำหรับเอกสารระบบที่แท้จริง โปรดเริ่มต้นที่ `docs/architecture/IMS_PLATFORM_BOOK.md` แทน
>
> **แก้ไขเมื่อ 2026-08-10:** ไฟล์นี้เคยอ้างอิงถึงไฟล์ 5 ไฟล์ที่ไม่มีอยู่ในที่เก็บข้อมูล (repository) นี้ (`CLAUDE.md`, `GLOBAL-INSTRUCTIONS.md`, `TASKS.md`, `MEMORY.md`, `checkpoint.md`) รวมถึงข้อมูลทางเทคนิคที่ล้าสมัยบางประการ ได้รับการแก้ไขแล้วด้านล่าง; รายการ "อ่านตามลำดับนี้" ถูกลบออกเนื่องจากเป้าหมายไม่มีอยู่ — มีเพียง `ABOUT-ME.md` และ `START.md` เท่านั้นที่เป็นไฟล์สองไฟล์จากรายการเดิมที่ยืนยันแล้วว่ามีอยู่จริง

## ภาพรวมโปรเจกต์

- **IMS** — แพลตฟอร์มการตรวจสอบที่ครอบคลุมสองโดเมน: โครงสร้างพื้นฐาน (เซิร์ฟเวอร์, อุปกรณ์เครือข่าย, การดึงข้อมูลผ่าน SNMP) และการผลิต LDI (สายการผลิต PCB Laser Direct Imaging, โทรมาตร (telemetry) แบบ HTTP/JSON พร้อมการวิเคราะห์ SPC/RCA)
- **ไปป์ไลน์อิสระสองเส้นทาง**, ใช้งาน TimescaleDB ร่วมกันหนึ่งตัว: โครงสร้างพื้นฐาน (SNMP → Node-RED → PgBouncer → TimescaleDB) และ LDI (HTTP POST `/ldi-telemetry` → Node-RED → PgBouncer → TimescaleDB), ทั้งสองส่วนแสดงผลใน Grafana (12 แดชบอร์ด, แบ่งเป็นโฟลเดอร์ `Infrastructure`/`Manufacturing`), แจ้งเตือนผ่านกฎของ Grafana เอง + Prometheus/Alertmanager
- ดู `docs/architecture/ARCHITECTURE.md` สำหรับบริบทของระบบโดยสมบูรณ์ และ `docs/architecture/IMS_MANUFACTURING_PLATFORM_V2.md` สำหรับการแบ่งโดเมนโครงสร้างพื้นฐาน/การผลิต

## แผนผังพื้นที่ทำงาน (Workspace map)

| โฟลเดอร์ | การใช้งาน |
|--------|-----|
| `INPUTS/` | วัตถุดิบตั้งต้นสำหรับการทำงาน |
| `OUTPUTS/` | ผลงานที่เสร็จสมบูรณ์ |
| `TEMPLATES/` | เทมเพลต prompt/workflow ที่นำกลับมาใช้ใหม่ได้ |
| `ARCHIVES/` | แหล่งเก็บข้อมูลระยะยาว / ไฟล์ที่ถูกแทนที่ (เฉพาะในเครื่อง, ถูกละเว้นโดย git — ไม่เหมือนกับ `docs/archive/` ที่ถูกติดตาม) |
| `SKILLS/` | บันทึกทักษะ + การจับคู่ (mapping) |
| `docs/` | แผนหลัก, ข้อกำหนด, รายงาน, สถาปัตยกรรม — เริ่มต้นที่ `docs/architecture/IMS_PLATFORM_BOOK.md` |
| `monitoring/` | การตั้งค่า (configs) ของ grafana, prometheus, alertmanager, snmpsim |
| `nodered_data/` | Node-RED runtime — `flows/*.json` คือไฟล์ต้นฉบับ, `flows.json` คืออาร์ติแฟกต์ที่สร้างขึ้น (`node scripts/build-flows.js`) |

## วิธีเริ่มต้นเซสชันอย่างรวดเร็ว

ดู `START.md` สำหรับลำดับการบูต
