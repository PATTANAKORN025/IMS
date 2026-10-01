<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>หน้าหลัก</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>ดัชนีเอกสาร</b></a>
</div>
<br/>

<div align="center">
  <h1>แผนภาพสถาปัตยกรรมและโทโพโลยีระบบ IMS (Visual Architecture Reference)</h1>
  <p><b>โมเดล C4 เชิงลึก, ลำดับขั้นตอนการทำงาน (Sequence Flows), ความปลอดภัยของเกตเวย์ และโครงสร้างลำดับชั้นการจัดเก็บข้อมูลสำหรับระบบ IMS</b></p>
  <p>
    <a href="../../../docs/architecture/ARCHITECTURE_DIAGRAM.md">English</a> |
    <a href="ARCHITECTURE_DIAGRAM.md">ไทย</a> |
    <a href="../../../zh-CN/docs/architecture/ARCHITECTURE_DIAGRAM.md">简体中文</a>
  </p>
</div>

---

> [!TIP]
> **ไฟล์ข้อกำหนด Mermaid โดยตรง**: สำหรับการเรนเดอร์ใน IDE หรือไปป์ไลน์ CI สามารถเข้าถึงไฟล์ Mermaid ดิบได้ที่ [ims-system-architecture.mermaid](../../../docs/architecture/ims-system-architecture.mermaid)

## 1. แผนภาพบริบทของระบบ (C4 Model - Level 1: System Context)

แผนภาพบริบทแสดงภาพรวมการมีปฏิสัมพันธ์ระหว่างผู้ใช้งาน, เครื่องจักรในกระบวนการผลิต, เครื่องแม่ข่ายโครงสร้างพื้นฐานไอที, สวิตช์เครือข่าย และระบบส่งข้อความภายนอก กับระบบ Telemetry หลักของ IMS

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#00F2FE', 'primaryBorderColor': '#10B981', 'lineColor': '#00F2FE', 'secondaryColor': '#0f172a', 'tertiaryColor': '#0f172a', 'clusterBkg': '#030407', 'clusterBorder': '#00F2FE'}}}%%
C4Context
 title แผนภาพบริบทของระบบ IMS (System Context Diagram)

 Person(noc_op, "โอเปอเรเตอร์ NOC", "เฝ้าระวังสุขภาพระบบ ประสิทธิภาพเซิร์ฟเวอร์ และการแจ้งเตือนพอร์ตเครือข่าย")
 Person(proc_eng, "วิศวกรกระบวนการผลิต", "วิเคราะห์ Yield ของ LDI, การกระจายตัวของค่า Cpk และค้นหาสาเหตุรากเหง้า (RCA)")
 Person(drill_eng, "ผู้เชี่ยวชาญงานเจาะ CNC", "วิเคราะห์ความสั่นสะเทือนของ Spindle, จำนวน Hit และอายุการใช้งานของดอกสว่าน")
 Person(vcp_tech, "ช่างเทคนิคงานชุบ VCP", "ติดตามความเร็วสายการผลิต, อุณหภูมิบ่อชุบ และกระแสไฟฟ้าของ Rectifier")

 System_Ext(ldi_mach, "เครื่องจักร LDI", "เครื่องจักรเปิดรับแสง LDI ความแม่นยำสูง ส่งข้อมูล Telemetry ผ่าน HTTP/JSON")
 System_Ext(cnc_drill, "เครื่องเจาะ CNC", "กลุ่มเครื่องเจาะส่งข้อมูลรอบหมุน, อัตราป้อน และประวัติเหตุการณ์เข้าสู่ eap_backup")
 System_Ext(vcp_lines, "สายชุบแผ่น VCP", "สายการผลิตชุบแผ่นต่อเนื่องส่งข้อมูลค่าพารามิเตอร์เคมีเข้าสู่ eap_backup")
 System_Ext(servers, "เครื่องแม่ข่าย Linux", "เซิร์ฟเวอร์ประมวลผลส่งข้อมูล CPU, RAM และ Disk ผ่านโพรโทคอล SNMP v2c")
 System_Ext(switches, "สวิตช์เครือข่าย Juniper", "สวิตช์เครือข่ายส่งข้อมูลสถิติทราฟฟิกและตัวนับความผิดพลาดผ่าน SNMP")
 System_Ext(line_teams, "LINE / MS Teams", "ระบบกระจายแจ้งเตือนเหตุการณ์ผิดปกติระดับวิกฤตไปยังทีมวิศวกรโรงงาน")

 System(ims, "แพลตฟอร์ม IMS", "ระบบรับข้อมูล Telemetry, ตัวรวบรวมการเชื่อมต่อฐานข้อมูล TimescaleDB และแดชบอร์ด Grafana 22 ตัว")

 Rel(noc_op, ims, "เรียกดูแดชบอร์ด NOC และการพยากรณ์ความจุ", "HTTPS / พอร์ต 3000")
 Rel(proc_eng, ims, "ตรวจสอบ Command Center และการวิเคราะห์ SPC", "HTTPS / พอร์ต 3000")
 Rel(drill_eng, ims, "วิเคราะห์แดชบอร์ดกลุ่มเครื่องเจาะและความผิดปกติ", "HTTPS / พอร์ต 3000")
 Rel(vcp_tech, ims, "ติดตามการทำงานของ VCP และแดชบอร์ดติดผนัง", "HTTPS / พอร์ต 3000")

 Rel(ldi_mach, ims, "ส่งข้อมูล Telemetry แบบสตรีม", "HTTP POST /ldi-telemetry")
 Rel(cnc_drill, ims, "บันทึกประวัติเหตุการณ์และสถานะเครื่องจักร", "PostgreSQL / eap_backup")
 Rel(vcp_lines, ims, "บันทึกข้อมูลพารามิเตอร์เคมีและเซนเซอร์", "PostgreSQL / eap_backup")
 Rel(ims, servers, "ดึงข้อมูลสถิติสมรรถนะ", "SNMP v2c / UDP 161")
 Rel(ims, switches, "ดึงข้อมูลสถิติการรับส่งข้อมูลและพอร์ต", "SNMP v2c / UDP 161")
 Rel(ims, line_teams, "ส่งต่อการแจ้งเตือนความผิดปกติวิกฤต", "HTTPS Webhooks")
```

---

## 2. แผนภาพโครงสร้างคอนเทนเนอร์ (C4 Model - Level 2: Container Diagram)

แผนภาพนี้แสดงรายละเอียดการทำงานของเซอร์วิสทั้ง 16 ตัวในเครือข่าย Docker Compose พร้อมการแมปพอร์ตและเส้นทางการรับส่งข้อมูล:

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#00F2FE', 'primaryBorderColor': '#10B981', 'lineColor': '#00F2FE', 'secondaryColor': '#0f172a', 'tertiaryColor': '#0f172a', 'clusterBkg': '#030407', 'clusterBorder': '#00F2FE'}}}%%
C4Container
 title แผนภาพคอนเทนเนอร์ของระบบ IMS (16 เซอร์วิส)

 Person(user, "วิศวกรและผู้ปฏิบัติการ", "เข้าใช้งานแดชบอร์ด, Digital Twin และ API จัดการแจ้งเตือนผ่านเบราว์เซอร์")
 System_Ext(ext_dev, "อุปกรณ์และเครื่องจักรในโรงงาน", "LDI, CNC เจาะ, VCP ชุบ, เซิร์ฟเวอร์, สวิตช์")

 System_Boundary(c1, "เครือข่าย Docker ภายในของ IMS (ims-internal, ims-monitoring, ims-docker-api)") {
   Container(proxy, "Reverse Proxy (ims-proxy)", "Nginx Alpine", "เกตเวย์ขาเข้ารวมศูนย์, ควบคุมอัตราการส่งข้อมูล และตรวจสอบสิทธิ์เซสชัน")
   Container(grafana, "Grafana 13 (ims-grafana)", "Go", "แสดงผลแดชบอร์ดธีม Cyberpunk HUD ทั้งหมด 22 ตัวใน 4 แผนกงาน")
   Container(alarm_api, "Alarm API (ims-alarm-api)", "Node.js Express", "จัดการการเปลี่ยนสถานะแจ้งเตือน (ack/resolve) ใน public.ldi_alarm_lifecycle")
   Container(twin_3d, "Factory Twin 3D (ims-factory-twin-3d)", "Node.js Express", "เรนเดอร์โมเดล 3D แบบจำลองโรงงานชั้น 1 (อ่านอย่างเดียว)")
   Container(renderer, "Image Renderer (ims-grafana-renderer)", "Chromium", "สร้างภาพ PNG ของพาเนลสำหรับแนบไปกับการแจ้งเตือนและรายงาน")

   Container(nodered, "ไปป์ไลน์รับข้อมูล (ims-node-red)", "Node.js / Node-RED", "รัน Walker แบบขนาน, พาร์สเซอร์ข้อมูล, คิวบัฟเฟอร์ และส่งต่อแจ้งเตือน")
   Container(pgbouncer, "ตัวรวมการเชื่อมต่อ (ims-pgbouncer)", "C / PgBouncer", "พูลการเชื่อมต่อพอร์ต 5432 แบบ Transaction ด้วยการยืนยันตัวตน SCRAM-SHA-256")
   ContainerDb(timescaledb, "TimescaleDB (ims-timescaledb)", "PostgreSQL 16 + TimescaleDB", "จัดเก็บข้อมูลไฮเปอร์เทเบิล, Continuous Aggregates, ประวัติการแจ้งเตือน และฐานข้อมูล eap_backup")

   Container(prometheus, "Prometheus (ims-prometheus)", "Go", "เก็บรวบรวมเมทริกซ์และประเมินกฎการแจ้งเตือน")
   Container(alertmanager, "Alertmanager (ims-alertmanager)", "Go", "ตัดข้อมูลแจ้งเตือนซ้ำ จัดกลุ่ม และส่งต่อไปยัง Node-RED")
   Container(blackbox, "Blackbox Probes (ims-blackbox)", "Go", "ตรวจสอบ SLA ของ HTTP และการเชื่อมต่อเครือข่าย")
   Container(snmpsim, "SNMP Simulator (ims-snmpsim)", "Python", "จำลองอุปกรณ์ SNMP เซิร์ฟเวอร์และสวิตช์สำหรับการพัฒนาในเครื่อง")
   Container(archiver, "Observability Archiver (ims-observability-archiver)", "Bash", "บันทึกประวัติสุขภาพและเมทริกซ์เก็บไว้ใน ops-logs เป็นระยะ")
   Container(db_migrate, "Migration Runner (ims-db-migrate)", "Bash / psql", "คอนเทนเนอร์แบบรันครั้งเดียวสำหรับรันสคริปต์ไมเกรชัน 001 ถึง 091)")
   Container(sockproxy, "Docker Socket Proxy (ims-docker-socket-proxy)", "HAProxy / Alpine", "จำกัดสิทธิ์การเข้าถึง Docker daemon บนเครือข่ายภายใน ims-docker-api")
   Container(pgadmin, "PgAdmin 4 (ims-pgadmin4)", "Python", "หน้าต่างเว็บจัดการฐานข้อมูล (พอร์ต 127.0.0.1:5050)")
 }

 Rel(user, proxy, "เข้าถึงหน้าจอและ API", "HTTP / พอร์ต 3000")
 Rel(ext_dev, proxy, "ส่งข้อมูล Telemetry ผ่าน HTTP", "POST /ldi-telemetry")
 Rel(nodered, ext_dev, "โพลข้อมูลผ่าน SNMP", "UDP 161")
 Rel(nodered, snmpsim, "โพลข้อมูลอุปกรณ์ SNMP จำลอง", "UDP 161")

 Rel(proxy, grafana, "ส่งต่อหน้าเว็บและ API ของ Grafana", "HTTP :3000")
 Rel(proxy, alarm_api, "ส่งต่อ /alarm-api/* (ตรวจสอบสิทธิ์แล้ว)", "HTTP :4000")
 Rel(proxy, twin_3d, "ส่งต่อ /factory-twin-3d/* (ตรวจสอบสิทธิ์แล้ว)", "HTTP :4100")
 Rel(proxy, nodered, "ส่งต่อ /ldi-telemetry และ /inject", "HTTP :1880")
 Rel(proxy, grafana, "ตรวจสอบเซสชันภายใน (/auth-check)", "HTTP :3000")

 Rel(grafana, renderer, "ขอเรนเดอร์ภาพพาเนล", "HTTP :8081")
 Rel(grafana, pgbouncer, "คิวรีข้อมูล CAGGs และวิว", "TCP :5432")
 Rel(grafana, timescaledb, "คิวรี eap_backup (drilling-timescaledb)", "TCP :5432")
 Rel(alarm_api, pgbouncer, "อัปเดตสถานะแจ้งเตือน (สิทธิ์ alarm_api_writer)", "TCP :5432")
 Rel(nodered, pgbouncer, "บันทึกข้อมูลแบบชุด (nodered_writer)", "TCP :5432")
 Rel(pgbouncer, timescaledb, "ส่งต่อทรานแซกชัน (SCRAM)", "TCP :5432")
 Rel(db_migrate, timescaledb, "ประมวลผลไมเกรชันฐานข้อมูล 001-091", "TCP :5432")
 Rel(pgadmin, timescaledb, "บริหารจัดการฐานข้อมูล", "TCP :5432")

 Rel(prometheus, nodered, "ดึงเมทริกซ์ไปป์ไลน์", "HTTP :1880/metrics")
 Rel(prometheus, alertmanager, "ส่งเหตุการณ์แจ้งเตือน", "HTTP :9093")
 Rel(prometheus, blackbox, "สั่งโพรบตรวจสอบ HTTP/TCP/ICMP", "HTTP :9115")
 Rel(blackbox, timescaledb, "โพรบการเชื่อมต่อ TCP :5432", "TCP :5432")
 Rel(blackbox, pgbouncer, "โพรบการเชื่อมต่อ TCP :5432", "TCP :5432")
 Rel(alertmanager, nodered, "ส่งเว็บบุ๊กไปยัง /alert-webhook", "HTTP :1880")
 Rel(grafana, nodered, "ส่งการแจ้งเตือนภายในไปที่ /alert-webhook", "HTTP :1880")

 Rel(archiver, sockproxy, "อ่านเมทริกซ์และเหตุการณ์ Docker", "HTTP :2375 (ims-docker-api)")
```

---

## 3. แผนภาพองค์ประกอบภายในไปป์ไลน์ Node-RED (C4 Model - Level 3: Components)

รายละเอียดโมดูลย่อยและการไหลของข้อมูลภายในคอนเทนเนอร์ `ims-node-red`:

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#00F2FE', 'primaryBorderColor': '#10B981', 'lineColor': '#00F2FE', 'secondaryColor': '#0f172a', 'tertiaryColor': '#0f172a', 'clusterBkg': '#030407', 'clusterBorder': '#00F2FE'}}}%%
flowchart TD
  subgraph IngressPoints ["จุดรับคำขอและตัวทริกเกอร์"]
    TMR["ตัวจับเวลาโพล (ทุก 30 วินาที)"]
    HTTP_LDI["POST /ldi-telemetry\n(รับผ่าน Nginx เกตเวย์)"]
    HTTP_INJ["POST /inject\n(เมทริกซ์ทั่วไป)"]
    AM_HOOK["POST /alert-webhook\n(รับแจ้งเตือนจาก Alertmanager)"]
  end

  subgraph SplitFlows ["โมดูลโฟลว์ย่อย (nodered_data/flows/)"]
    subgraph FlowIngest ["ingestion.json"]
      REG["แคชทะเบียนอุปกรณ์\n(โหลดจาก public.devices ทุก 5 นาที)"]
      CB["ระบบตัดวงจร Circuit Breaker\n(สถานะ: CLOSED / OPEN / HALF_OPEN)"]
      FORK["แยกการโพล fork_5_ways\n(CPU, Net, Storage, Temp, LDI)"]
      PARSER["พาร์สเซอร์ sre_parser v10\n(เก็บบริบทรายอุปกรณ์, O(N))"]
      BATCH_SNMP["ตัวสร้าง SQL ชุดข้อมูล SNMP\n(INSERT INTO public.sys_metrics & net_metrics...)"]
    end

    subgraph FlowLdiIngest ["ldi_ingestion.json"]
      AUTH_CHK["ตรวจสอบ API Key\n(เทียบกับ INGEST_API_KEY)"]
      SCHEMA_VAL["ตรวจสอบโครงสร้าง JSON Array\n(ยืนยันสเปก 22 ฟิลด์)"]
      STAGE_WRITE["การบันทึกลง Staging ล่วงหน้า\n(INSERT INTO public.ingest_staging)"]
      LDI_WRITE["ตัวบันทึกลงไฮเปอร์เทเบิลแบบชุด\n(INSERT INTO public.ldi_data)"]
      STAGE_DEL["ลบชุดข้อมูลใน Staging\n(DELETE FROM public.ingest_staging)"]
      GC["คืนหน่วยความจำชัดเจน\n(flatData.length=0, msg.payload=null)"]
    end

    subgraph FlowSim ["ldi_simulator.json & ldi_alarm_simulator.json"]
      SIM_LDI["ตัวจำลองข้อมูลโทรมาตรสด\n(OU Process, 10 เครื่องจักร)"]
      SIM_ALARM["ระบบจำลองสัญญาณเตือนภัย\n(ประเมินความผิดปกติและฉีดเหตุการณ์)"]
    end

    subgraph FlowAlerting ["alerting.json"]
      MSG_FMT["ตัวจัดรูปแบบการแจ้งเตือน\n(สร้าง Adaptive Cards และข้อความ)"]
      LINE_API["ตัวส่ง LINE Messaging API\n(ส่งข้อความแจ้งเตือนพร้อม Auth Token)"]
      TEAMS_API["ตัวส่งเว็บบุ๊ก MS Teams\n(POST Adaptive Card)"]
    end
  end

  subgraph PersistenceTier ["ระบบฐานข้อมูล"]
    PGB["PgBouncer (:5432)\nTransaction Pooling | SCRAM-SHA-256"]
    TSDB[("TimescaleDB (:5432)\npublic.sys_metrics & net_metrics\npublic.ldi_data\npublic.ingest_staging")]
  end

  TMR --> REG --> CB --> FORK --> PARSER --> BATCH_SNMP --> PGB
  HTTP_LDI --> AUTH_CHK --> SCHEMA_VAL --> STAGE_WRITE --> LDI_WRITE --> STAGE_DEL --> GC
  LDI_WRITE --> PGB
  STAGE_WRITE --> PGB
  STAGE_DEL --> PGB
  HTTP_INJ --> SCHEMA_VAL

  SIM_LDI -->|"POST ภายใน"| HTTP_LDI
  SIM_ALARM --> PGB

  PGB --> TSDB

  AM_HOOK --> MSG_FMT
  MSG_FMT --> LINE_API
  MSG_FMT --> TEAMS_API
```

---

## 4. ลำดับการไหลของข้อมูล Telemetry ความถี่สูง (High-Throughput Sequence Flow)

เส้นทางของข้อมูลการผลิตจากหัวเปิดรับแสงของเครื่องจักร LDI ไปจนถึงการแสดงผลบนหน้าจอแดชบอร์ดแบบ Sub-second:

```mermaid
sequenceDiagram
  autonumber
  participant Machine as เครื่องจักร LDI
  participant Proxy as Nginx เกตเวย์ (ims-proxy)
  participant NodeRed as ระบบรับข้อมูล (ims-node-red)
  participant PgBouncer as PgBouncer (:5432)
  participant TimescaleDB as TimescaleDB (:5432)
  participant Grafana as แดชบอร์ด Grafana (:3000)

  Machine->>Proxy: POST /ldi-telemetry (เพย์โหลด JSON Array + X-API-Key)
  Proxy->>Proxy: จำกัดอัตราส่ง (rate=50r/s burst=100 nodelay)
  Proxy->>NodeRed: ส่งต่อคำขอไปยัง :1880/ldi-telemetry ภายใน
  NodeRed->>NodeRed: ตรวจสอบความถูกต้องของ API Key และสคีมา Array 22 ฟิลด์

  alt การตรวจสอบข้อมูลล้มเหลว
    NodeRed-->>Proxy: 400 Bad Request ("Payload must be a JSON array")
    Proxy-->>Machine: 400 Bad Request
  else การตรวจสอบข้อมูลผ่าน
    NodeRed->>PgBouncer: บันทึกลง Staging ล่วงหน้า: INSERT INTO public.ingest_staging
    PgBouncer->>TimescaleDB: บันทึกข้อมูลแถว Staging
    alt บันทึก Staging ล้มเหลว
      NodeRed-->>Proxy: 503 Service Unavailable ("Staging failed, batch not accepted")
      Proxy-->>Machine: 503 Service Unavailable
    else บันทึก Staging สำเร็จ
      NodeRed->>PgBouncer: บันทึกแบบชุดลงไฮเปอร์เทเบิล: INSERT INTO public.ldi_data
      PgBouncer->>TimescaleDB: บันทึกลงในไฮเปอร์เทเบิล public.ldi_data
      alt บันทึกลงไฮเปอร์เทเบิลล้มเหลว
        NodeRed-->>Proxy: 502 Bad Gateway (ข้อมูล Staging ถูกเก็บไว้เพื่อรอลองใหม่)
        Proxy-->>Machine: 502 Bad Gateway
      else บันทึกลงไฮเปอร์เทเบิลสำเร็จ
        NodeRed->>PgBouncer: DELETE FROM public.ingest_staging WHERE id = staged_id
        NodeRed->>NodeRed: คืนหน่วยความจำทันที (flatData.length = 0, msg.payload = null)
        NodeRed-->>Proxy: 200 OK {"status": "success", "inserted": count}
        Proxy-->>Machine: 200 OK
      end
    end
  end

  Note over TimescaleDB: ระบบ Continuous Aggregate คำนวณสรุปผลอัตโนมัติ
  TimescaleDB->>TimescaleDB: สรุปผลล่วงหน้าลงใน public.ldi_data_15m

  Grafana->>PgBouncer: SELECT bucket AS time, avg_temperature FROM ldi_data_15m
  PgBouncer->>TimescaleDB: ประมวลผลคิวรีเชิงวิเคราะห์
  TimescaleDB-->>Grafana: ส่งคืนแถวข้อมูลสรุปในเวลาเสี้ยววินาที
  Grafana-->>Grafana: เรนเดอร์เส้นกราฟบน Cyberpunk HUD
```

---

## 5. ลำดับขั้นตอนการจัดการวงจรชีวิตการแจ้งเตือน (Alarm Lifecycle Sequence)

ขั้นตอนการทำงานตั้งแต่ระบบตรวจพบความผิดปกติ การรับทราบโดยโอเปอเรเตอร์ จนถึงการแก้ไขปัญหาเสร็จสิ้น:

```mermaid
sequenceDiagram
  autonumber
  actor Operator as โอเปอเรเตอร์ NOC
  actor Engineer as วิศวกรซ่อมบำรุง
  participant Browser as เว็บบราวเซอร์
  participant Proxy as Nginx เกตเวย์ (:3000)
  participant AlarmAPI as Alarm API (ims-alarm-api :4000)
  participant DB as TimescaleDB (public.ldi_alarm_lifecycle)

  Note over DB: ระบบ Telemetry ตรวจพบค่าหลุดสเปก (สถานะ: OPEN)

  Operator->>Browser: เปิดหน้าจอ "IMS LDI - Alarm Console"
  Browser->>Proxy: GET /d/ims-ldi-alarm-console
  Proxy->>Browser: ส่งหน้าแดชบอร์ดพร้อมรายการแจ้งเตือนสถานะ OPEN

  Operator->>Browser: กดปุ่ม "Acknowledge" ที่การแจ้งเตือน LOG-10001
  Browser->>Proxy: POST /alarm-api/alarms/ack (แนบเซสชัน Cookie)
  Proxy->>Proxy: ตรวจสอบสิทธิ์ย่อย GET /auth-check ไปยัง Grafana (200 OK)
  Proxy->>AlarmAPI: ส่งต่อ POST /alarms/ack {"logdate_ms": 1790568000000, "logid": "LOG-10001"}
  AlarmAPI->>DB: UPDATE ldi_alarm_lifecycle SET status='ACKNOWLEDGED', acknowledged_by=session.user WHERE status='OPEN'
  DB-->>AlarmAPI: อัปเดตข้อมูลสำเร็จ (ส่งคืน 1 แถว)
  AlarmAPI-->>Proxy: 200 OK (ส่งคืนข้อมูล JSON ที่อัปเดต)
  Proxy-->>Browser: 200 OK (แดชบอร์ดเปลี่ยนสีสถานะเป็นสีส้ม Amber)

  Note over Engineer: วิศวกรเข้าตรวจหน้างานและเปลี่ยนแผ่นกรองอากาศ
  Engineer->>Browser: กดปุ่ม "Resolve" พร้อมกรอกบันทึกการแก้ไขปัญหา
  Browser->>Proxy: POST /alarm-api/alarms/resolve {"logid": "LOG-10001", "resolved_by": "engineer-02", "resolution_note": "เปลี่ยนไส้กรอง"}
  Proxy->>Proxy: ตรวจสอบสิทธิ์เซสชันผ่าน GET /auth-check (200 OK)
  Proxy->>AlarmAPI: ส่งต่อ POST /alarms/resolve
  AlarmAPI->>DB: UPDATE ldi_alarm_lifecycle SET status='RESOLVED', resolved_by=session.user, resolution_note='...' WHERE status IN ('OPEN', 'ACKNOWLEDGED')
  DB-->>AlarmAPI: อัปเดตข้อมูลสำเร็จ
  AlarmAPI-->>Proxy: 200 OK
  Proxy-->>Browser: 200 OK (แดชบอร์ดแสดงสถานะแก้ไขแล้วเป็นสีเขียว Green)
```

---

## 6. กลไกตัดวงจรป้องกันความผิดพลาดของโพรโทคอล SNMP (Circuit Breaker)

ปกป้องสวิตช์เครือข่ายจากการส่งข้อมูลท่วมท้นเมื่ออุปกรณ์ปลายทางไม่ตอบสนอง:

```mermaid
sequenceDiagram
  autonumber
  participant Timer as ตัวกำหนดเวลา Node-RED (ทุก 30 วินาที)
  participant Walker as ตัวดึงข้อมูล SNMP Bulk Walker
  participant Breaker as สถานะ Circuit Breaker
  participant Target as อุปกรณ์ปลายทาง (ไม่ตอบสนอง)
  participant DB as TimescaleDB (circuit_breaker_events)

  Timer->>Walker: เริ่มรอบการดึงข้อมูลตามกำหนดเวลา
  Walker->>Breaker: ตรวจสอบสถานะอุปกรณ์สำหรับ "SW-CORE-01"

  alt สถานะ Breaker คือ CLOSED (ปกติ)
    Walker->>Target: ส่งคำขอ SNMP GETBULK (UDP 161)
    Target--xWalker: หมดเวลา (ไม่ตอบสนองภายใน 5000ms)
    Walker->>Breaker: บันทึกความล้มเหลว (failureCount++)

    alt failureCount < 2
      Breaker-->>Walker: สถานะยังคงเป็น CLOSED (ลองใหม่รอบหน้า)
    else failureCount >= 2
      Breaker->>Breaker: เปลี่ยนสถานะ -> OPEN (ตัดวงจร)
      Breaker->>DB: บันทึกสถานะโหนด = OFFLINE (ส่งค่าศูนย์ทันที)
      Note over Breaker: เริ่มจับเวลา Cooldown 300 วินาที (5 นาที)
    end

  else สถานะ Breaker คือ OPEN (วงจรถูกตัด)
    Breaker-->>Walker: ระงับการดึงข้อมูล (ป้องกันทราฟฟิกล้นเครือข่าย)
    Note over Walker: ข้ามการส่ง SNMP - คงค่าเมตริกศูนย์ที่ปลอดภัย

  else หมดเวลา Cooldown: เปลี่ยนสถานะเป็น HALF_OPEN (โหมดทดสอบ)
    Breaker->>Walker: อนุญาตคำขอโพรบ SNMP ขนาดเล็ก 1 ครั้ง
    Walker->>Target: ส่งคำขอทดสอบ GET
    alt โพรบสำเร็จ
      Target-->>Walker: ตอบกลับ SNMP ถูกต้อง
      Walker->>Breaker: รีเซ็ต failureCount = 0 - เปลี่ยนสถานะ -> CLOSED
      Breaker->>DB: บันทึกสถานะโหนด = ONLINE
    else โพรบล้มเหลว
      Target--xWalker: หมดเวลา
      Walker->>Breaker: ตัดวงจรซ้ำ -> OPEN - เริ่มจับเวลา Cooldown 300 วินาทีใหม่
    end
  end
```

---

## 7. ลำดับชั้นการจัดเก็บข้อมูลและการรวมผลต่อเนื่อง (TimescaleDB Topology)

```mermaid
flowchart TD
  subgraph Ingestion ["ระดับการนำเข้าข้อมูลดิบ"]
    RAW_LDI["public.ldi_data\n(ไฮเปอร์เทเบิล, ก้อนข้อมูลละ 1 วัน)"]
    RAW_INFRA["public.sys_metrics และ net_metrics\n(ไฮเปอร์เทเบิล, ก้อนข้อมูลละ 1 วัน)"]
    RAW_ALARM["public.ldi_alarm_log\n(ไฮเปอร์เทเบิล, ก้อนข้อมูลละ 7 วัน)"]
  end

  subgraph CAGG_Tier1 ["ระดับ 1: สรุปข้อมูลความถี่สูง (High-Frequency Rollups)"]
    CAGG_1M["public.ldi_data_1m\n(รีเฟรชทุก 1 นาที ขอบเขตย้อนหลัง 1 ชม.)"]
    CAGG_15M["public.ldi_data_15m\n(รีเฟรชทุก 15 นาที)\nขับเคลื่อน Manufacturing และ Command Center"]
  end

  subgraph CAGG_Tier2 ["ระดับ 2: สรุปข้อมูลรายชั่วโมง (Hourly Rollups)"]
    CAGG_1H["public.ldi_data_1h และ ldi_data_hourly\n(รีเฟรชทุก 1 ชม.)\nขับเคลื่อน SPC และการวิเคราะห์แนวโน้ม"]
    INFRA_HOURLY["public.sys_hourly และ net_hourly\n(สรุปข้อมูลโครงสร้างพื้นฐานรายชั่วโมง)"]
  end

  subgraph Retention ["นโยบายการเก็บรักษาข้อมูล (ตรวจสอบจากระบบจริง)"]
    RET_RAW["ข้อมูลดิบ: 30 วัน (โครงสร้างพื้นฐาน) / 180 วัน (LDI)"]
    RET_HOURLY["ข้อมูลสรุปรายชั่วโมง: 2 ปี"]
    RET_ALARM["ประวัติการแจ้งเตือน: 365 วัน"]
  end

  RAW_LDI --> CAGG_1M --> CAGG_15M --> CAGG_1H
  RAW_INFRA --> INFRA_HOURLY

  RAW_LDI -.-> RET_RAW
  RAW_INFRA -.-> RET_RAW
  RAW_ALARM -.-> RET_ALARM
  CAGG_1H -.-> RET_HOURLY
```

---

## 8. แผนผังระบบนิเวศแดชบอร์ดตาม 4 แผนกงาน (Dashboard Ecosystem)

แดชบอร์ด Grafana ทั้ง 22 ตัวถูกจัดหมวดหมู่อย่างเป็นระเบียบตาม 4 แผนกงาน:

```mermaid
flowchart LR
  subgraph D1 ["01. แผนกเจาะแผงวงจร CNC (4 แดชบอร์ด)"]
    DR1["Fleet Overview"]
    DR2["Shift Production"]
    DR3["Machine Investigation"]
    DR4["Anomaly Analysis"]
  end

  subgraph D2 ["02. แผนกเปิดรับแสง LDI (10 แดชบอร์ด)"]
    LDI1["Manufacturing Command Center"]
    LDI2["Operator Andon Board"]
    LDI3["Alarm Console"]
    LDI4["Alarm Response (MTTA/MTTR)"]
    LDI5["Alarm Dictionary"]
    LDI6["Factory Digital Twin (Canvas)"]
    LDI7["Engineering Analytics & SPC"]
    LDI8["Machine Snapshot"]
    LDI9["Data Readiness Gaps"]
    LDI10["Easy Overview"]
  end

  subgraph D3 ["03. โครงสร้างพื้นฐานและศูนย์ NOC (5 แดชบอร์ด)"]
    NOC1["NOC Overview"]
    NOC2["Engineering Drill-Down"]
    NOC3["AIOps Capacity Forecast"]
    NOC4["Pipeline Ingestion Latency"]
    NOC5["Meta-Monitoring & Health"]
  end

  subgraph D4 ["04. แผนกชุบแผ่น VCP (3 แดชบอร์ด)"]
    VCP1["VCP Overview"]
    VCP2["Operations Console"]
    VCP3["Real-Time Wall"]
  end

  style D1 fill:#1a1f2e,stroke:#3B82F6,color:#e2e8f0
  style D2 fill:#1a1f2e,stroke:#10B981,color:#e2e8f0
  style D3 fill:#1a1f2e,stroke:#F59E0B,color:#e2e8f0
  style D4 fill:#1a1f2e,stroke:#8B5CF6,color:#e2e8f0
```

---

## 9. คำสั่งตรวจสอบสถาปัตยกรรมระบบจริง (Verification Commands)

```bash
# 1. ตรวจสอบสถานะของคอนเทนเนอร์ทั้ง 14 ตัวและพอร์ตที่เปิดใช้งาน
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# 2. ตรวจสอบจำนวนการเชื่อมต่อใน Pool ของ PgBouncer
docker exec -i ims-timescaledb psql -U ims_admin -p 5432 -h ims-pgbouncer -d ims -c "SHOW POOLS;"

# 3. ตรวจสอบการกระจายตัวของ Chunks และขนาดการบีบอัดข้อมูลใน TimescaleDB
docker exec -i ims-timescaledb psql -U ims_admin -d ims -c "
SELECT hypertable_name, num_chunks, total_size, compressed_total_size
FROM timescaledb_information.hypertables
ORDER BY total_size DESC;"

# 4. ตรวจสอบนโยบายการคำนวณ Continuous Aggregate ที่ทำงานอยู่
docker exec -i ims-timescaledb psql -U ims_admin -d ims -c "
SELECT view_name, schedule_interval, max_interval_per_job
FROM timescaledb_information.continuous_aggregate_stats;"
```
