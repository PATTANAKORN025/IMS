<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>หน้าหลัก</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>ดัชนีเอกสาร</b></a>
</div>
<br/>

# <img src="../../../docs/assets/icons/aperture.svg" width="24" align="center" /> ระบบนิเวศแดชบอร์ด IMS: สถาปัตยกรรมระดับมหภาคถึงจุลภาค

**Industrial Monitoring System (IMS)** ใช้ระบบนิเวศแดชบอร์ด **"Cyberpunk HUD"** ที่ออกแบบมาเพื่อกำจัดภาวะความเหนื่อยล้าจากการแจ้งเตือน (Alarm Fatigue) อย่างสิ้นเชิง และเชื่อมช่องว่างระหว่างไอทีระดับองค์กร (Enterprise IT) กับเทคโนโลยีปฏิบัติการทางกายภาพ (OT)

เอกสารฉบับนี้ทำหน้าที่เป็นแคตตาล็อกหลัก ซึ่งจัดโครงสร้างตาม **ระดับความสูง (Altitude - มหภาคถึงจุลภาค)** เพื่อให้แน่ใจว่าข้อมูลที่ถูกต้องจะไปถึงบุคคลที่เหมาะสมในจังหวะเวลาที่ต้องตัดสินใจพอดี

---

## 🗺️ แผนผังระบบนิเวศ (Ecosystem Topology)

```mermaid
%%{init: {"flowchart": {"nodeSpacing": 20, "rankSpacing": 32, "padding": 10, "wrappingWidth": 150, "curve": "basis"}, "sequence": {"wrap": true, "width": 170, "actorMargin": 36, "boxMargin": 8, "noteMargin": 8, "messageMargin": 30, "mirrorActors": false}, "state": {"padding": 6}, "theme": "base", "themeVariables": {"fontFamily": "Inter, Segoe UI, Helvetica, Arial, sans-serif", "fontSize": "14px", "primaryColor": "#334155", "primaryTextColor": "#ffffff", "primaryBorderColor": "#1e293b", "lineColor": "#64748b", "textColor": "#64748b", "secondaryColor": "#475569", "tertiaryColor": "#f1f5f9", "clusterBkg": "transparent", "clusterBorder": "#94a3b8", "titleColor": "#64748b", "edgeLabelBackground": "#475569", "nodeTextColor": "#ffffff", "noteBkgColor": "#fef3c7", "noteTextColor": "#1e293b", "noteBorderColor": "#d97706", "actorBkg": "#334155", "actorTextColor": "#ffffff", "actorBorder": "#1e293b", "actorLineColor": "#94a3b8", "signalColor": "#64748b", "signalTextColor": "#64748b", "labelBoxBkgColor": "#334155", "labelBoxBorderColor": "#1e293b", "labelTextColor": "#ffffff", "loopTextColor": "#64748b", "activationBkgColor": "#e2e8f0", "sequenceNumberColor": "#ffffff", "stateLabelColor": "#ffffff", "compositeBackground": "transparent", "transitionColor": "#64748b", "transitionLabelColor": "#64748b"}}}%%
mindmap
  root((แดชบอร์ด IMS))
    T1(ระดับ 1 · ผู้บริหารและภาพรวม)
      LDI 01 Fleet Executive Overview
      Platform 01 NOC Overview
      LDI 04 Manufacturing Fleet Command Center
      Drilling 01 Fleet Digital Twin & Overview
      VCP 01 Plating Fleet Overview
    T2(ระดับ 2 · สุขภาพระบบ)
      LDI 03 Factory 3D Digital Twin
      Platform 03 AIOps Capacity
      Platform 05 Meta-Monitoring
      Drilling 02 Shift Production & OEE
    T3(ระดับ 3 · วิเคราะห์เชิงลึก)
      Platform 02 Engineering Drill-Down
      LDI 06 Engineering Analytics & SPC
      Platform 04 Ingestion Latency
      Drilling 04 Fleet Anomaly & RCA
    T4(ระดับ 4 · หน้างาน)
      LDI 05 Machine Snapshot
      LDI 02 Operator Andon
      LDI 10 Data Readiness
      Drilling 03 Machine Investigation
      VCP 03 Real-Time Wall
      VCP 02 Operations Console
    T5(ระดับ 5 · จัดการ alarm)
      LDI 07 Alarm Console
      LDI 08 Alarm Response
      LDI 09 Alarm Dictionary
```

> [!TIP]
> **สถาปัตยกรรมประสิทธิภาพ:** ไม่มีแดชบอร์ดใดที่ดึงข้อมูล Telemetry ดิบสำหรับกรอบเวลาเกิน 24 ชั่วโมง แดชบอร์ดทั้งหมดใช้พลังจาก **TimescaleDB Continuous Aggregates (CAGGs)** รับประกันเวลาโหลดต่ำกว่าหนึ่งวินาที ไม่ว่าจะสืบค้นลึกแค่ไหน หรือมีผู้ใช้พร้อมกันเท่าใด ทุกแดชบอร์ดยึดมั่นในวินัย **Grid-24** ข้อมูลจำเพาะทางเทคนิคและจำนวน panel ครบถ้วนสามารถดูได้ที่ **[Dashboard Inventory](../architecture/DASHBOARD_INVENTORY.md)**

---

## <img src="../../../docs/assets/icons/globe.svg" width="18" align="center" /> ระดับที่ 1: ศูนย์บัญชาการผู้บริหารและภาพรวม (30,000 ฟุต - มหภาค)

_**เป้าหมาย**: มองเห็นภาพรวมได้ทันทีสำหรับผู้นำธุรกิจ เน้นที่สุขภาพโดยรวม สถานะขึ้น/ลง และ OEE โดยรวม_
**ผู้ชม**: ผู้บริหารระดับ C-Level, ผู้จัดการโรงงาน, ผู้บัญชาการ NOC

| แดชบอร์ด | คำอธิบาย | ตัวอย่าง |
|-----------|-------------|---------|
| **IMS NOC Overview** | คะแนนสุขภาพ (0-100), กระดานผู้นำโหนดวิกฤต 10 อันดับแรก และไทม์ไลน์ความผิดปกติ | <img src="../../../assets/noc-overview.png" width="250"/> |
| **LDI Manufacturing** | ประสิทธิผลโดยรวมของเครื่องจักรอุปกรณ์ (OEE) แบบเรียลไทม์, อัตราผลตอบแทน, และคอขวดการผลิต | <img src="../../../assets/ldi-manufacturing.png" width="250"/> |
| **IMS Easy Overview** | การติดตาม KPI ระดับธุรกิจที่เรียบง่าย เวลาทำงาน (Uptime) โดยรวมของระบบและผลผลิตขั้นต้น | <img src="../../../assets/ims-easy-overview.png" width="250"/> |
| **Drilling Fleet Overview** | การใช้งาน Spindle เครื่องเจาะ CNC ทั้งฝูง, สถานะการทำงาน และการกระจายตัวของ Alarm | *(แหล่งข้อมูล Synthetic EAP)* |
| **VCP Overview** | ภาพรวมสายการผลิตงานชุบ VCP หลายสาย, บาร์จับชิ้นงานที่กำลังทำงาน, ความเร็วสายพาน และค่าพารามิเตอร์เคมี | *(แหล่งข้อมูล Synthetic EAP)* |

---

## <img src="../../../docs/assets/icons/activity.svg" width="18" align="center" /> ระดับที่ 2: สุขภาพระบบและความสามารถในการคาดการณ์ (10,000 ฟุต)

_**เป้าหมาย**: ปฏิบัติการเชิงคาดการณ์ (AIOps) แก้ไขปัญหาก่อนที่จะลุกลามจนทำให้ระบบล่ม_
**ผู้ชม**: ผู้อำนวยการไอที, ผู้วางแผนการบำรุงรักษา, SRE

| แดชบอร์ด | คำอธิบาย | ตัวอย่าง |
|-----------|-------------|---------|
| **Capacity Planning** | การพยากรณ์ล่วงหน้าด้วย Linear regression คำนวณ "จำนวนวันจนกว่าความจุจะถึง 100%" | <img src="../../../assets/capacity-planning.png" width="250"/> |
| **Meta-Monitoring** | "การตรวจสอบผู้ตรวจสอบ" ปริมาณงานในไปป์ไลน์, สถานะ SNMP และโควต้าคิวรี | <img src="../../../assets/meta-monitoring.png" width="250"/> |
| **Factory Digital Twin** | ตัวแทนทางกายภาพแบบเรียลไทม์ของพื้นที่การผลิต แผนที่เชิงพื้นที่ของสถานะเครื่องจักร | *(Requires specialized 3D plugin)* |
| **Drilling Shift Production** | ติดตามผลผลิตงานเจาะแยกตามกะกลางวัน/กลางคืน, จำนวนแผ่นงานที่เจาะเสร็จ และการคาดการณ์เวลารัน | *(แหล่งข้อมูล Synthetic EAP)* |

---

## <img src="../../../docs/assets/icons/crosshair.svg" width="18" align="center" /> ระดับที่ 3: วิศวกรรมและการวิเคราะห์เชิงลึก (1,000 ฟุต)

_**เป้าหมาย**: สหสัมพันธ์ของสาเหตุที่แท้จริงระหว่างข้อจำกัดของโครงสร้างพื้นฐานไอทีกับผลผลิต (Yield) ของ OT_
**ผู้ชม**: ผู้ดูแลระบบ (SysAdmins), วิศวกรกระบวนการ, นักวิทยาศาสตร์ข้อมูล

| แดชบอร์ด | คำอธิบาย | ตัวอย่าง |
|-----------|-------------|---------|
| **Engineering Drill-Down** | เมตริกระดับจุลภาค การตรวจจับความผิดปกติแบบ Z-Score เทียบกับเส้นฐานตลอด 24 ชั่วโมง | <img src="../../../assets/engineering-drilldown.png" width="250"/> |
| **LDI Analytics** | วิทยาการข้อมูลวิศวกรรมกระบวนการเชิงลึก หาความสัมพันธ์ของปัจจัย OT กับข้อบกพร่อง | <img src="../../../assets/ldi-engineering.png" width="250"/> |
| **Ingestion Latency** | วัดความล่าช้าการแพร่กระจายระหว่างเซ็นเซอร์ที่โรงงานกับ PostgreSQL (PgBouncer) | *(CAGG aggregation active)* |
| **Drilling Anomaly Analysis** | วิเคราะห์หาสหสัมพันธ์หลายมิติระหว่างการหักของดอกเจาะ, ค่าเบี่ยงเบนความเร็ว Spindle และ Alarm | *(แหล่งข้อมูล Synthetic EAP)* |

---

## <img src="../../../docs/assets/icons/server.svg" width="18" align="center" /> ระดับที่ 4: ปฏิบัติการทางยุทธวิธี (ระดับพื้นดิน)

_**เป้าหมาย**: การตัดสินใจแบบไบนารี โดยไม่มีความหน่วงเวลาสำหรับบุคลากรที่ใช้งานฮาร์ดแวร์จริง_
**ผู้ชม**: พนักงานควบคุมเครื่อง (Floor Operators), หัวหน้าสายการผลิต, ผู้ตรวจสอบคุณภาพ

| แดชบอร์ด | คำอธิบาย | ตัวอย่าง |
|-----------|-------------|---------|
| **Operator Andon** | กระดานสถานะความคมชัดสูง เรียบง่าย ไฟแดง/เขียว ถ้าไฟแดงให้หยุดสายการผลิตทันที | <img src="../../../assets/ldi-andon.png" width="250"/> |
| **Machine Snapshot** | สัญญาณชีพสดของเครื่องจักร สูตร (Recipe) ปัจจุบัน, เลเซอร์, ค่าเซ็นเซอร์ | <img src="../../../assets/ldi-machine.png" width="250"/> |
| **Data Readiness** | การตรวจสอบความสมบูรณ์ของข้อมูล การทุจริตของโครงสร้าง (Schema) และสถานะออฟไลน์ | <img src="../../../assets/ldi-data-readiness.png" width="250"/> |
| **Drilling Machine Investigation** | เจาะลึกราย Spindle ของเครื่องเจาะ, Telemetry การเคลื่อนที่แกน XY, อายุการใช้งานดอกเจาะ และ Event เซ็นเซอร์ | *(แหล่งข้อมูล Synthetic EAP)* |
| **VCP Realtime Wall** | จอมอนิเตอร์แบบ Flight-deck แสดงผลเรียลไทม์ของสายชุบ VCP, กระแส Rectifier, แอมแปร์-นาที และอุณหภูมิบ่อชุบ | *(แหล่งข้อมูล Synthetic EAP)* |
| **VCP Operations Console** | คอนโซลควบคุมเซลล์ชุบ Rectifier, ความคืบหน้า Flight Bar, และการปรับอุณหภูมิ/การเติมสารเคมี | *(แหล่งข้อมูล Synthetic EAP)* |

---

## <img src="../../../docs/assets/icons/zoom-in.svg" width="18" align="center" /> ระดับที่ 5: การจัดการและการแก้ไขอุบัติการณ์ (ระดับจุลภาค)

_**เป้าหมาย**: การคัดกรอง การรับทราบ และการแก้ไขความผิดปกติอย่างถาวรโดยใช้คู่มือปฏิบัติ (Playbooks)_
**ผู้ชม**: ทีมสนับสนุน L1/L2, ผู้บัญชาการอุบัติการณ์ (Incident Commanders)

| แดชบอร์ด | คำอธิบาย | กระแสงาน (Flow) |
|-----------|-------------|-------------|
| **LDI Alarm Console** | คิวการแจ้งเตือนสด จัดกลุ่มความผิดปกติ การคัดกรองแบบเรียลไทม์ | `Alertmanager -> Console` |
| **LDI Alarm Response** | การติดตามหลังเหตุการณ์ การปฏิบัติตาม SLA, MTTR, ความถี่ในการยกระดับปัญหา | `Console -> Resolution` |
| **LDI Alarm Dictionary** | ระบบการจับคู่เพื่อแปลงรหัส Hex เป็นคู่มือปฏิบัติที่มนุษย์อ่านได้ | `Database -> Playbook` |

> [!IMPORTANT]
> **ข้อจำกัดความสมบูรณ์ของข้อมูล:** แดชบอร์ดใด ๆ ที่แสดงข้อมูลรวม (ระดับที่ 1-3) จะต้องดึงข้อมูลเฉพาะจาก Continuous Aggregates เท่านั้น เฉพาะแดชบอร์ดระดับที่ 4 และ 5 เท่านั้นที่ได้รับอนุญาตให้สืบค้นตารางข้อมูล Telemetry ดิบ
