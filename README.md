# 🏭 IMS (Infrastructure Monitoring System) - APEX Circuit

![Status](https://img.shields.io/badge/Status-Production%20Ready-success)
![Scale](https://img.shields.io/badge/Scale-1000%2B%20Nodes-blue)
![Docker](https://img.shields.io/badge/Docker-Compose-blue?logo=docker)
![Grafana](https://img.shields.io/badge/Grafana-Dashboard-orange?logo=grafana)
![Node-RED](https://img.shields.io/badge/Node-RED-Flow-red?logo=nodered)
![License](https://img.shields.io/badge/License-Proprietary-red)

## 🚀 Project Overview & Objectives

**IMS (Infrastructure Monitoring System)** คือ ระบบ Monitoring แบบ Real-time สำหรับ Infrastructure ในองค์กร ออกแบบมาเพื่อ **APEX Circuit** โดยเฉพาะ สำหรับตรวจสอบและเฝ้าระวังสถานะของเครื่องจักร **LDI (Laser Direct Imaging)** ในสายการผลิต PCB

ระบบดึงข้อมูลผ่านโปรโตคอล **Out-of-Band SNMP** (Read-Only 100%) ซึ่งมั่นใจได้ว่า **ปลอดภัย 100% และไม่รบกวนการทำงานของเครื่องจักร** รองรับการขยายได้ถึง **1,000+ เครื่อง** พร้อมกัน

### 🎯 วัตถุประสงค์หลัก 5 ข้อ

| # | วัตถุประสงค์ | สถานะ |
|---|-------------|-------|
| 1 | พัฒนาระบบ Monitoring แบบ Real-time สำหรับ Infrastructure ในองค์กร | ✅ สำเร็จ |
| 2 | ตรวจสอบ Health ของ Server, Network Device, Service และ Resource Usage | ✅ สำเร็จ |
| 3 | ลด Downtime ด้วยระบบ Alert เมื่อเกิดปัญหา | ✅ สำเร็จ |
| 4 | สร้าง Dashboard เพิ่ม Visibility ให้ทีม IT | ✅ สำเร็จ |
| 5 | เป็นโปรเจกต์ยกระดับทักษะนักศึกษาฝึกงาน (Grafana, Node-RED, SNMP) | ✅ สำเร็จ |

## ✨ Key Features (Enterprise Level)

* 🚀 **Dual-Engine SNMP Walker:** สลับโหมดอัตโนมัติระหว่าง `GET` mode (สำหรับ Development/Mock) และ `SUBTREE Bulk Walk` (สำหรับ Production) ดึงข้อมูลปริมาณมหาศาลได้ในระดับมิลลิวินาที
* 🛡️ **Zero-Data Loss Architecture:** กลไก Node-RED Batch Buffer ทำงานร่วมกับ PgBouncer ป้องกันการสูญเสียข้อมูลแม้ Database Server จะถูก Interrupt หรือ Restart
* 🧠 **True AIOps Alerting:** ละทิ้งการแจ้งเตือนแบบ Threshold ตายตัว ใช้สถิติ **Z-Score (3-Sigma)** ตรวจจับความผิดปกติเชิงรุกก่อนเครื่องจักรขัดข้อง
* 📊 **Symmetrical Dashboard:** กราฟ Bandwidth แบบ Butterfly Wing แสดง Download/Upload สมมาตรกัน อ่านง่าย เห็นภาพรวมทันที
* 🧪 **K6 Chaos Tested:** ผ่าน Load Testing ที่ 1,000 Concurrent VUs พิสูจน์เสถียรภาพภายใต้สภาวะกดดันสูงสุด

## 🏗️ Architecture & Tech Stack

ระบบทำงานผ่าน 4 ชั้นหลัก:

```text
┌─────────────────────────────────────────────────────────────────┐
│                    EDGE / OT LAYER                              │ 
│   [ YSPhotec LDI Machines ] ──(SNMP v2c/v3 Read-Only)──▶       │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                 INGESTION LAYER (Node-RED)                       │
│   [ Dual-Engine SNMP Walker ] ──▶ [ Bulletproof Parser v7 ]     │
│   - Fork 5 ชั้น: CPU / Storage / Network / Temp / LDI             │
│   - Join Barrier (count=5, timeout=8)                           │
│   - Smart Counter Wrap (32/64-bit)                              │
│   - Memory Cleanup + Try-Catch Wrapped                          │
└─────────────────────────────┬───────────────────────────────────┘
                              │ Batch INSERT (parameterized queries)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   STORAGE LAYER                                 │
│   [ PgBouncer (Connection Pooler) ] ──▶ [ TimescaleDB ]        │
│   - Hypertable: machine_telemetry (28 columns)                 │
│   - Continuous Aggregates: minute → hour roll-ups              │
│   - Compression: after 7 days (~90% savings)                   │
│   - Retention: auto-delete after 90 days                       │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              VISUALIZATION & AIOPS LAYER                       │
│   [ Grafana (4 Dashboards) ] ◀── [ Prometheus + Alertmanager ] │
│   [ Blackbox Exporter (SLA Probes) ]                           │
│   [ Webhook Alerts (LINE / MS Teams) ]                         │
└─────────────────────────────────────────────────────────────────┘
```

| Component | Technology | Purpose |
|-----------|-----------|---------|
| SNMP Agent | SNMP v2c/v3 (Read-Only) | ดึงข้อมูลจากเครื่องจักร |
| Data Pipeline | Node-RED 4.0.5 | ประมวลผลและ INSERT ข้อมูล |
| Connection Pooler | PgBouncer | จัดการ Connection ป้องกัน DB ล่ม |
| Time-Series DB | TimescaleDB (PostgreSQL) | เก็บข้อมูล Time-series |
| Dashboard | Grafana 11.x | แสดงผลกราฟ 4 ชุด |
| Alerting | Prometheus + Alertmanager | แจ้งเตือน 38 Rules |
| SLA Probes | Blackbox Exporter | ตรวจสอบ uptime |
| Load Testing | K6 | ทดสอบระบบ 1,000 VUs |

## ⚙️ CI/CD Pipeline

ทุกครั้งที่ Push โค้ด GitHub Actions จะทำงานอัตโนมัติ:

```yaml
✅ Syntax Check     — ตรวจสอบ docker-compose.yaml และ Dashboard JSON
✅ Linting          — ตรวจสอบ Prometheus Rules (promtool check rules)
✅ Security Scan    — ตรวจจับ Secret Keys ที่หลุดออกมา
✅ Flow Validation  — ตรวจสอบ Node-RED Flow JSON
```

## 🚀 Getting Started

```bash
# 1. Clone repository
git clone https://github.com/PATTANAKORN025/IMS.git
cd IMS

# 2. ตั้งค่า Environment Variables
cp .env.example .env
nano .env  # ใส่ Database password และ configurations

# 3. สร้าง Secrets
mkdir -p secrets
echo "your-db-password" > secrets/postgres_password.txt
echo "your-grafana-password" > secrets/grafana_admin_password.txt

# 4. เริ่มต้นระบบทั้งหมด
docker-compose up -d

# 5. ตรวจสอบสถานะ
docker-compose ps
```

## 📊 Dashboard Gallery

| Dashboard | Purpose |
|-----------|---------|
| NOC Overview | ภาพรวมสถานะเครื่องจักรทั้งหมด (Red/Yellow/Green) |
| System Overview | CPU, RAM, Disk, Network, Temperature |
| Engineering Drilldown | ข้อมูลเจาะลึกแต่ละเครื่อง (34 panels) |
| Capacity Planning | การพยากรณ์พื้นที่และทรัพยากร |

## 🚨 Alert Rules

ระบบมี **38 Alert Rules** ครอบคลุม:
- 🔥 **Critical:** CPU > 90%, Temperature > 85°C, Interface Down
- ⚠️ **Warning:** CPU > 75%, Temperature > 70°C, Network Errors
- 🧠 **AIOps:** Z-Score Anomaly (3σ), Predictive Disk Full
- 📶 **WiFi:** Signal Degradation (SNR < 20dB), Packet Loss

## 🤝 Contributors

| Team | Role |
|------|------|
| **MIS-G Department** | System Architecture & Development |
| **นักศึกษาฝึกงาน** | Development, Testing & Documentation |

> 💡 โปรเจกต์นี้เป็นส่วนหนึ่งของโครงการสหกิจศึกษา ยกระดับทักษะนักศึกษาสู่ระดับ SRE/DevOps

## 📜 License

Proprietary - APEX Circuit
