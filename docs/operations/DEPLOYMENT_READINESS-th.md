<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../docs/assets/icons/home.svg" width="16" align="center" /> <b>หน้าแรก</b></a> &nbsp;|&nbsp;
  <a href="../../docs/README.md"><img src="../../docs/assets/icons/book.svg" width="16" align="center" /> <b>ดัชนีเอกสาร</b></a>
</div>
<br/>

# การประเมินความพร้อมในการติดตั้งใช้งาน (Deployment Readiness Assessment)

> **เอกสารประเมินความพร้อมในการติดตั้งใช้งานระบบ IMS บน Production**
> อัปเดตล่าสุด: 2026-06-29

---

<div align="center">

<img src="../assets/icons/check-circle.svg" width="14" align="center"/> **สถานะ:** พร้อมสำหรับใช้งานบน Production
<img src="../assets/icons/check-circle.svg" width="14" align="center"/> **เวอร์ชัน:** 1.0.0
<img src="../assets/icons/check-circle.svg" width="14" align="center"/> **ประเมินล่าสุด:** 2026-06-29

</div>

---

## สารบัญ

1. [ความเข้ากันได้ของเวอร์ชัน (Version Compatibility)](#ความเข้ากันได้ของเวอร์ชัน-version-compatibility)
2. [รายการตรวจสอบก่อนการติดตั้ง (Pre-Deployment Checklist)](#รายการตรวจสอบก่อนการติดตั้ง-pre-deployment-checklist)
3. [การแก้ไขปัญหาในการใช้งานจริง (Real-World Troubleshooting)](#การแก้ไขปัญหาในการใช้งานจริง-real-world-troubleshooting)
4. [ความน่าเชื่อถือของรูปแบบข้อมูล (Data Format Confidence)](#ความน่าเชื่อถือของรูปแบบข้อมูล-data-format-confidence)
5. [รายการตรวจสอบเมื่อเริ่มเปิดใช้งาน (Go-Live Checklist)](#รายการตรวจสอบเมื่อเริ่มเปิดใช้งาน-go-live-checklist)

---

## ความเข้ากันได้ของเวอร์ชัน (Version Compatibility)

### เวอร์ชันของสแต็กปัจจุบัน (Current Stack Versions)

| ส่วนประกอบ (Component) | ปัจจุบัน (Current) | ล่าสุด (Latest) | ความเสี่ยง (Risk) | หมายเหตุ (Notes)                             |
| ---------------------- | ------------------ | --------------- | ----------------- | -------------------------------------------- |
| **Node-RED**           | 4.0.5              | 5.0             | สูง (HIGH)        | ล้าหลัง 2 เวอร์ชันหลัก ต้องการ Node.js 22.9+ |
| **TimescaleDB**        | PostgreSQL 16      | PG 17           | ต่ำ (LOW)         | v16 ยังคงได้รับการสนับสนุนถึงปี 2028         |
| **Grafana**            | 11.x               | 11.x            | ไม่มี (NONE)      | เวอร์ชันปัจจุบัน                             |
| **Prometheus**         | v2.55.x            | 3.x             | ต่ำ (LOW)         | v2.x ยังคงได้รับการดูแลรักษา                 |
| **K6**                 | ไม่ได้ระบุ         | ปัจจุบัน        | ไม่มี (NONE)      | ใช้งานได้ดี                                  |
| **Docker**             | v4.0+              | v4.0+           | ไม่มี (NONE)      | เสถียร                                       |

### เส้นทางการอัปเกรด Node-RED

> **คำเตือน (WARNING)**: Node-RED 5.0 (วางจำหน่าย 9 มิถุนายน 2026) เป็นการเปลี่ยนแปลง Editor ครั้งใหญ่ที่สุดในประวัติศาสตร์

| ข้อกำหนด (Requirement)                      | ปัจจุบัน (Current)    | จำเป็นสำหรับ v5.0 (Required for v5.0) |
| ------------------------------------------- | --------------------- | ------------------------------------- |
| Node.js                                     | 18.x                  | 22.9+                                 |
| Docker Base Image                           | node:18-alpine        | node:22-alpine                        |
| Editor UI                                   | รุ่นดั้งเดิม (Legacy) | โฉมใหม่ด้วย React (New React-based)   |
| ความเข้ากันได้ของ Flow (Flow Compatibility) |                       | ทดสอบก่อน (Test first)                |

**เส้นทางการอัปเกรดที่แนะนำ:**

1. ทดสอบในสภาพแวดล้อม staging ก่อน
2. อ่านคู่มือการอัปเกรดอย่างเป็นทางการให้ละเอียด
3. สำรองข้อมูล flow ทั้งหมดก่อนการอัปเกรด
4. ตรวจสอบความเข้ากันได้ของ custom nodes

---

## รายการตรวจสอบก่อนการติดตั้ง (Pre-Deployment Checklist)

### ระยะที่ 1: การเตรียมความพร้อมของเครือข่าย

| #   | งาน (Task)                                      | สถานะ (Status) | ผู้รับผิดชอบ (Owner)           |
| --- | ----------------------------------------------- | -------------- | ------------------------------ |
| 1   | รับ IP address ของเครื่องเป้าหมาย               |                | ทีมเครือข่าย (Network Team)    |
| 2   | ยืนยัน SNMP community strings                   |                | ทีมความปลอดภัย (Security Team) |
| 3   | ตรวจสอบว่าเปิดใช้งาน SNMP บนเครื่องเป้าหมายแล้ว |                | ทีมเซิร์ฟเวอร์ (Server Team)   |
| 4   | ตรวจสอบว่า UDP 161 ไม่ถูกบล็อกโดยไฟร์วอลล์      |                | ทีมเครือข่าย (Network Team)    |
| 5   | ทดสอบการเชื่อมต่อเครือข่าย (ping)               |                | ทีมไอที (IT Team)              |

**การเปิดใช้งาน SNMP บน Windows:**

```powershell
# Enable SNMP via Windows Features
Enable-WindowsOptionalFeature -Online -FeatureName "SNMP" -All

# Or via GUI: Control Panel → Programs → Turn Windows features on/off → Simple Network Management Protocol (SNMP)
```

**การเปิดใช้งาน SNMP บน Linux:**

```bash
# Debian/Ubuntu
sudo apt update && sudo apt install snmpd

# Enable and start service
sudo systemctl enable snmpd
sudo systemctl start snmpd
```

### ระยะที่ 2: การติดตั้ง Docker

| #   | งาน (Task)                        | สถานะ (Status) | คำสั่ง (Command)                                                      |
| --- | --------------------------------- | -------------- | --------------------------------------------------------------------- |
| 1   | คัดลอก repository (Clone)         |                | `git clone https://github.com/PATTANAKORN025/IMS.git`                 |
| 2   | สร้าง secrets                     |                | `mkdir -p secrets && echo "password" > secrets/postgres_password.txt` |
| 3   | คัดลอก environment                |                | `cp .env.example .env`                                                |
| 4   | เริ่มบริการต่างๆ (Start services) |                | `docker compose up -d`                                                |
| 5   | รอจนกว่าระบบจะเริ่มทำงาน          |                | `sleep 40`                                                            |
| 6   | ตรวจสอบ containers                |                | `docker compose ps`                                                   |

### ระยะที่ 3: การลงทะเบียนอุปกรณ์

| #   | งาน (Task)                   | สถานะ (Status) | คำสั่ง (Command)                                                                                                |
| --- | ---------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------- |
| 1   | อัปเดตตาราง `public.devices` |                | `INSERT INTO public.devices (device_id, hostname, ip_address, snmp_community, snmp_port, enabled) VALUES (...)` |
| 2   | ทดสอบการเชื่อมต่อ SNMP       |                | `snmpwalk -v2c -c <community> <ip> 1.3.6.1.2.1.1`                                                               |
| 3   | ตรวจสอบการไหลของข้อมูล       |                | ตรวจสอบบนแดชบอร์ด Grafana (Check Grafana dashboards)                                                            |

### ระยะที่ 4: การรักษาความปลอดภัย

| #   | งาน (Task)                                | สถานะ (Status) | ข้อมูลอ้างอิง (Reference)                                                                                        |
| --- | ----------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1   | นำโฮสต์พอร์ตของ PgBouncer ออก             |                | ไม่เคยเผยแพร่ใน `docker-compose.yaml` พื้นฐาน -- ไม่ใช่การเปลี่ยนแปลงใน prod-overlay                             |
| 2   | เปิดใช้งาน Node-RED adminAuth             |                | สร้าง bcrypt hash                                                                                                |
| 3   | Grafana ไม่สามารถเข้าถึงได้โดยตรงจากโฮสต์ |                | ไม่มีโฮสต์พอร์ตใน compose พื้นฐาน; `proxy` (nginx) เป็นจุดเชื่อมต่อเดียว, ซึ่งอยู่ด้านหน้า Grafana + `alarm-api` |
| 4   | ตรวจสอบ SECURITY.md                       |                | ดูรายการตรวจสอบความปลอดภัย (security checklist)                                                                  |

---

## การแก้ไขปัญหาในการใช้งานจริง (Real-World Troubleshooting)

### การวิเคราะห์ความล้มเหลวตามระดับความสำคัญ

| ความสำคัญ (Priority) | ปัญหา (Issue)                       | อาการ (Symptom)                                   | การวินิจฉัย (Diagnosis)               | การแก้ไข (Fix)                                                          |
| -------------------- | ----------------------------------- | ------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------- |
| **P1**               | บริการ SNMP ถูกปิดใช้งาน            | walkers ทั้งหมดคืนค่าว่าง/หมดเวลา (empty/timeout) | `snmpwalk` ไม่ส่งค่าใดๆกลับมา         | เปิดใช้งาน SNMP ใน Windows Features หรือ `apt install snmpd`            |
| **P2**               | ไฟร์วอลล์บล็อก UDP 161              | การเชื่อมต่อหมดเวลาหลังจากผ่านไป 3 วินาที         | `telnet <ip> 161` ล้มเหลว             | เปิด UDP 161 ระหว่าง Node-RED container และเป้าหมาย                     |
| **P3**               | Community string ไม่ตรงกัน          | การยืนยันตัวตนล้มเหลว                             | `snmpwalk` คืนค่า "No such name"      | จับคู่การกำหนดค่า flow ให้ตรงกับ community ของเป้าหมาย                  |
| **P4**               | OID จริง ≠ OID จำลอง                | ข้อมูลเป็นศูนย์สำหรับเมตริก LDI                   | แผงแสดงผล LDI แสดง "No Data"          | ขอไฟล์ MIB จริงจากผู้ขาย (vendor), อัปเดต walkers OID                   |
| **P5**               | โฮสต์ถูกฮาร์ดโค้ดเป็น `ims-snmpsim` | ระบบอ่านค่าซิมูเลเตอร์แม้ในเครื่องจริง            | ข้อมูลแสดงค่าจำลอง (simulator values) | ใช้ device registry (ระยะที่ 4) หรืออัปเดตการตั้งค่า walker             |
| **P6**               | ความหน่วงของเครือข่ายโรงงาน         | หมดเวลาจากที่ตั้งไว้ 3 วินาที                     | ข้อมูลขาดหายเป็นช่วงๆ                 | เพิ่มระยะเวลาหมดเวลาของ SNMP (timeout) เป็น 5-10 วินาทีสำหรับไซต์ทางไกล |

### คำสั่งวิเคราะห์เบื้องต้นอย่างรวดเร็ว (Quick Diagnostic Commands)

```bash
# Test SNMP connectivity
snmpwalk -v2c -c <community> <ip> 1.3.6.1.2.1.1

# Check UDP port
nc -zuv <ip> 161

# Test from Node-RED container
docker exec ims-node-red node -e "
const snmp = require('net-snmp');
const session = snmp.createSession('<ip>', '<community>', {port: 161, timeout: 5000});
session.get(['1.3.6.1.2.1.1.1.0'], (err, varbinds) => {
 if (err) console.error('ERROR:', err.message);
 else console.log('OK:', varbinds[0].value.toString());
 session.close();
});
"
```

---

## ความน่าเชื่อถือของรูปแบบข้อมูล (Data Format Confidence)

### การประเมินประเภทเครื่องจักร (Machine Type Assessment)

| ประเภทเครื่อง (Machine Type) | แบบจำลองเทียบกับของจริง (Simulated vs Real) | มาตรฐาน MIB (MIB Standard) | ความน่าเชื่อถือ (Confidence)                                                                                  | หมายเหตุ (Notes)        |
| ---------------------------- | ------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------- |
| **Ubuntu (SNMP)**            | MIB มาตรฐาน                                 | HOST-RESOURCES-MIB         | <img src="../assets/icons/check-circle.svg" width="14" align="center"/> **สถานะ:** แข็งแรง สูง (Healthy HIGH) | มีแนวโน้มสูงที่จะตรงกัน |
| **Windows (SNMP)**           | MIB มาตรฐาน                                 | HOST-RESOURCES-MIB         | <img src="../assets/icons/check-circle.svg" width="14" align="center"/> **สถานะ:** แข็งแรง สูง (Healthy HIGH) | มีแนวโน้มสูงที่จะตรงกัน |
| **LDI (YSPhotec)**           | MIB `.9999` แบบกำหนดเอง                     | Private Enterprise         | **ยังไม่ได้รับการพิสูจน์ (UNPROVEN)**                                                                         | เป็นข้อสันนิษฐานทั้งหมด |

### ข้อควรพิจารณาสำหรับเครื่องจักร LDI

> **วิกฤต (CRITICAL)**: เครื่อง YSPhotec ถูกควบคุมผ่านระบบของผู้ขาย (Bender)

| คำถาม (Question)                    | คำตอบ (Answer) | สิ่งที่ต้องดำเนินการ (Action Required)         |
| ----------------------------------- | -------------- | ---------------------------------------------- |
| LDI รองรับ SNMP หรือไม่?            | ไม่ทราบ        | ยืนยันกับผู้ขาย/ทีมวิศวกรรม (Engineering team) |
| OID ของจริงคืออะไร?                 | ไม่ทราบ        | ขอไฟล์ MIB จริงจากผู้ขาย                       |
| ค่าต่างๆ ถูกหารด้วย 100 ใช่หรือไม่? | สันนิษฐานเอา   | ตรวจสอบรูปแบบค่าที่แท้จริง                     |
| จำเป็นต้องใช้เกตเวย์ SNMP หรือไม่?  | เป็นไปได้      | ประเมินเกตเวย์ PLC-to-SNMP หรือ Bender API     |

**ห้ามสันนิษฐานว่ามี SNMP จนกว่าจะได้รับการยืนยันจากผู้ขาย**

---

## รายการตรวจสอบเมื่อเริ่มเปิดใช้งาน (Go-Live Checklist)

### วันก่อนเปิดใช้งาน (Day Before Go-Live)

| #   | งาน (Task)                                         | ผู้รับผิดชอบ (Owner)           | ลงนามอนุมัติ (Sign-off) |
| --- | -------------------------------------------------- | ------------------------------ | ----------------------- |
| 1   | งานทั้งหมดก่อนการติดตั้งเสร็จสมบูรณ์               | ทีมไอที (IT Team)              |                         |
| 2   | สำรองระบบตรวจสอบที่มีอยู่เดิม (ถ้ามี)              | ทีมไอที (IT Team)              |                         |
| 3   | แจ้งผู้มีส่วนได้ส่วนเสียเกี่ยวกับช่วงเวลาซ่อมบำรุง | ผู้จัดการฝ่ายไอที (IT Manager) |                         |
| 4   | เตรียมแผนการย้อนกลับ (rollback plan)               | ทีมไอที (IT Team)              |                         |

### วันเปิดใช้งาน (Go-Live Day)

| #   | งาน (Task)                              | เวลา (Time) | ผู้รับผิดชอบ (Owner) |
| --- | --------------------------------------- | ----------- | -------------------- |
| 1   | เริ่มใช้งานระบบ Docker (Docker stack)   | T+0         | ทีมไอที (IT Team)    |
| 2   | รอ 40 วินาทีเพื่อให้ระบบทำงาน           | T+40s       | —                    |
| 3   | ตรวจสอบว่า containers ทั้งหมดกำลังทำงาน | T+45s       | ทีมไอที (IT Team)    |
| 4   | ตรวจสอบการไหลของข้อมูล                  | T+90s       | ทีมไอที (IT Team)    |
| 5   | ตรวจสอบการโหลดข้อมูลของแดชบอร์ด         | T+2min      | ทีมไอที (IT Team)    |
| 6   | ทดสอบการแจ้งเตือน (จำลองการแจ้งเตือน)   | T+5min      | ทีมไอที (IT Team)    |
| 7   | เฝ้าระวังเป็นเวลา 24 ชั่วโมง            | T+24h       | ทีม NOC (NOC Team)   |

### วันหลังจากเปิดใช้งาน (Day After Go-Live)

| #   | งาน (Task)                                           | ผู้รับผิดชอบ (Owner)           |
| --- | ---------------------------------------------------- | ------------------------------ |
| 1   | ตรวจสอบข้อมูลการเฝ้าระวังตลอด 24 ชั่วโมง             | ทีมไอที (IT Team)              |
| 2   | จัดการกับการแจ้งเตือนที่ผิดพลาด (false-positive)     | ทีมไอที (IT Team)              |
| 3   | บันทึกปัญหาใดๆ ที่พบเจอ                              | ทีมไอที (IT Team)              |
| 4   | กำหนดเวลาสำหรับการประชุมทบทวนหลังจากผ่านไป 1 สัปดาห์ | ผู้จัดการฝ่ายไอที (IT Manager) |

---

<div align="center">

**ความพร้อมในการติดตั้งใช้งานระบบ IMS — เวอร์ชัน 1.0**

_ได้รับการประเมินแล้วสำหรับการใช้งานบน Production_

</div>
