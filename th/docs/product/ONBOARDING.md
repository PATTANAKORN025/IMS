<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>หน้าหลัก</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>ดัชนีเอกสาร</b></a>
</div>
<br/>

<div align="center">
  <h1>คู่มือเริ่มต้นสำหรับวิศวกร IMS (Onboarding Guide)</h1>
  <p><b>ภาพรวมสถาปัตยกรรม ขั้นตอนการติดตั้ง และเวิร์กโฟลว์การทำงานสำหรับทีมวิศวกรระบบ</b></p>
  <p>
    <a href="../../../docs/product/ONBOARDING.md">English</a> |
    <a href="ONBOARDING.md">ไทย</a> |
    <a href="../../../zh-CN/docs/product/ONBOARDING.md">简体中文</a>
  </p>
</div>

---

## 1. ยินดีต้อนรับสู่ทีมวิศวกรรม IMS

ยินดีต้อนรับสู่ทีมพัฒนา **Industrial Monitoring System (IMS)** แพลตฟอร์มมอนิเตอร์และตรวจจับข้อมูล Telemetry ความแม่นยำสูง สำหรับสายการผลิตแผ่นวงจรพิมพ์ (PCB) ขั้นสูง ครอบคลุมเครื่อง Laser Direct Imaging (LDI), เครื่องเจาะ CNC Drilling และสายการผลิตชุบแผ่นแนวดิ่ง (VCP)

### ภาพรวมเชิงสถาปัตยกรรม

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 32, "padding": 10, "wrappingWidth": 150, "curve": "basis"}, "sequence": {"wrap": true, "width": 170, "actorMargin": 36, "boxMargin": 8, "noteMargin": 8, "messageMargin": 30, "mirrorActors": false}, "state": {"padding": 6}, "theme": "base", "themeVariables": {"fontFamily": "Inter, Segoe UI, Helvetica, Arial, sans-serif", "fontSize": "14px", "primaryColor": "#334155", "primaryTextColor": "#ffffff", "primaryBorderColor": "#1e293b", "lineColor": "#64748b", "textColor": "#64748b", "secondaryColor": "#475569", "tertiaryColor": "#f1f5f9", "clusterBkg": "transparent", "clusterBorder": "#94a3b8", "titleColor": "#64748b", "edgeLabelBackground": "#475569", "nodeTextColor": "#ffffff", "noteBkgColor": "#fef3c7", "noteTextColor": "#1e293b", "noteBorderColor": "#d97706", "actorBkg": "#334155", "actorTextColor": "#ffffff", "actorBorder": "#1e293b", "actorLineColor": "#94a3b8", "signalColor": "#64748b", "signalTextColor": "#64748b", "labelBoxBkgColor": "#334155", "labelBoxBorderColor": "#1e293b", "labelTextColor": "#ffffff", "loopTextColor": "#64748b", "activationBkgColor": "#e2e8f0", "sequenceNumberColor": "#ffffff", "stateLabelColor": "#ffffff", "compositeBackground": "transparent", "transitionColor": "#64748b", "transitionLabelColor": "#64748b"}}}%%
flowchart LR
  accTitle: IMS โดยสรุป
  accDescr: เครื่องจักรส่งข้อมูลผ่าน HTTP หรือถูก poll ผ่าน SNMP โดย nginx และ Node-RED รับข้อมูลผ่าน PgBouncer เข้าสู่ TimescaleDB Grafana แสดง 22 แดชบอร์ด และการแจ้งเตือนจาก Prometheus, Alertmanager และ Grafana ส่งถึง LINE และ Teams ผ่าน Node-RED
  EDGE["LDI · อุปกรณ์ SNMP"]:::ext
  IN["nginx :3000 → Node-RED"]:::flow
  PGB["PgBouncer :5432"]:::app
  TSDB[("TimescaleDB")]:::store
  GRAF["Grafana · 22 แดชบอร์ด"]:::viz
  ALERT["Prometheus → Alertmanager"]:::obs
  NOTIFY["LINE · Teams"]:::notify
  EDGE -->|"HTTP · SNMP"| IN --> PGB --> TSDB --> GRAF
  IN -->|"/metrics"| ALERT -->|"ผ่าน Node-RED"| NOTIFY
  GRAF -->|"กฎแจ้งเตือนผ่าน Node-RED"| NOTIFY
  classDef actor fill:#475569,stroke:#1e293b,color:#ffffff,stroke-width:1px
  classDef ext fill:#57534e,stroke:#292524,color:#ffffff,stroke-width:1px
  classDef ingress fill:#1d4ed8,stroke:#1e3a8a,color:#ffffff,stroke-width:1px
  classDef app fill:#0f766e,stroke:#134e4a,color:#ffffff,stroke-width:1px
  classDef flow fill:#0e7490,stroke:#164e63,color:#ffffff,stroke-width:1px
  classDef store fill:#b45309,stroke:#78350f,color:#ffffff,stroke-width:1px
  classDef viz fill:#4338ca,stroke:#312e81,color:#ffffff,stroke-width:1px
  classDef obs fill:#6d28d9,stroke:#4c1d95,color:#ffffff,stroke-width:1px
  classDef notify fill:#b91c1c,stroke:#7f1d1d,color:#ffffff,stroke-width:1px
  classDef future fill:#f8fafc,stroke:#94a3b8,color:#475569,stroke-width:1px,stroke-dasharray:4 3
```

---

## 2. การตั้งค่าสภาพแวดล้อมเริ่มต้น (Day-1 Setup)

เริ่มต้นรันระบบทดสอบบนเครื่อง Local ได้ภายใน 5 นาที:

### สิ่งที่จำเป็นต้องมี

- **Docker Desktop** / Docker Engine (รองรับ Compose v2)
- **Node.js** (v18 หรือ v20 LTS)
- **Make** (หรือเรียกสคริปต์เทียบเท่าผ่าน PowerShell บน Windows)

### ขั้นตอนเริ่มต้นใช้งาน

```bash
# 1. โคลนคลังโค้ด
git clone https://github.com/PATTANAKORN025/IMS.git
cd IMS

# 2. ตั้งค่าตัวแปรสภาพแวดล้อม
cp .env.example .env
# แก้ไข .env และเปลี่ยนรหัสผ่านเริ่มต้นเป็นค่าที่ปลอดภัย

# 3. ตรวจสอบความพร้อมของเครื่องมือ
make doctor

# 4. เริ่มต้นรันบริการทั้งหมด 16 คอนเทนเนอร์
make up

# 5. ตรวจสอบสถานะการทำงานของระบบ
make verify
```

เมื่อระบบเริ่มทำงานเรียบร้อย สามารถเปิดเว็บเบราว์เซอร์ไปที่ `http://localhost:3000` เพื่อเข้าสู่ Grafana

---

## 3. เวิร์กโฟลว์การทำงานหลัก

### การตรวจสอบและวิเคราะห์ปัญหา (Triage & Drill-Down)

เมื่อเกิดเหตุขัดข้องในการผลิตหรือมีการแจ้งเตือนจากระบบ:

1. **NOC Overview (`/d/ims-noc-overview`)**:
   - ตรวจสอบภาพรวม Telemetry ของทั้งโรงงาน เช่น อุณหภูมิ, ความเร็วการสแกน หรือความคลาดเคลื่อนของการมาร์กเกอร์
   - คลิกเลือกที่ตัวชี้วัดเพื่อเชื่อมโยง Data Link ไปยังหน้าเจาะลึกรายเครื่องจักร
2. **ศูนย์บัญชาการการผลิต LDI (Manufacturing Fleet Command Center) (`/d/ims-ldi-manufacturing`)**:
   - กรองตาม `$machine_id` (เช่น `LDI-01` ถึง `LDI-10`)
   - วิเคราะห์ดัชนีสมรรถนะกระบวนการผลิต ($C_p, C_{pk}$) และ Z-score แบบเรียลไทม์ผ่าน TimescaleDB Continuous Aggregates
3. **Alarm Console (`/d/ims-ldi-alarm-console`)**:
   - ตรวจสอบรายการแจ้งเตือนที่อยู่ในตาราง `public.ldi_alarm_lifecycle`
   - เจ้าหน้าที่รับทราบเหตุ (Acknowledge) และวิศวกรบันทึกวิธีแก้ไขพร้อมสาเหตุราก (Resolve) ผ่าน `ims-alarm-api`

---

## 4. ข้อกำหนดและมาตรฐานทางวิศวกรรม

- **กฎความปลอดภัยของโฟลว์**: ห้ามแก้ไข `nodered_data/flows.json` โดยตรง ไฟล์ต้นฉบับแยกอยู่ที่ `nodered_data/flows/*.json` ใช้คำสั่ง `make deploy-flows` เพื่อรวมและดีพลอย
- **สคีมาฐานข้อมูล**: ตารางข้อมูลและ hypertable ทั้งหมดต้องอยู่ในสคีมา `public` เท่านั้น
- **การตรวจทานก่อนคอมมิต**: รัน `make check` (หรือ `node scripts/pre-commit.js`) ก่อนส่ง pull request เสมอ การทดสอบทั้งหมดต้องผ่าน 100%

รายละเอียดเชิงลึกเพิ่มเติม ศึกษาได้จาก [ดัชนีเอกสาร](../README.md)
