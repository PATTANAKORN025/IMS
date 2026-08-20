<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../../../docs/assets/icons/home.svg" width="16" align="center" /> <b>หน้าแรก</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../../../docs/assets/icons/book.svg" width="16" align="center" /> <b>ดัชนีเอกสาร</b></a>
</div>
<br/>

# แผนการขยายระบบ IMS (IMS Scaling Plan)

> **แผนการขยายระบบ IMS เพื่อรองรับปริมาณงานที่เพิ่มขึ้น**
> ออกแบบมาสำหรับเครื่องจักร 1-1000+ เครื่อง

---

<div align="center">

<img src="../../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **ขนาดที่รองรับ:** เครื่องจักร 1-1000+ เครื่อง
<img src="../../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **ปัจจุบัน:** ทดสอบแล้วที่ 1K VUs
<img src="../../../docs/assets/icons/check-circle.svg" width="14" align="center"/> **ขีดจำกัดสูงสุด:** ~500 เครื่อง

</div>

---

## สารบัญ (Table of Contents)

1. [สถาปัตยกรรมปัจจุบัน (Current Architecture)](#current-architecture)
2. [การวิเคราะห์ความจุ (Capacity Analysis)](#capacity-analysis)
3. [ตัวเลือกในการขยายระบบ (Scaling Options)](#scaling-options)
4. [การปรับแต่งประสิทธิภาพ (Performance Tuning)](#performance-tuning)
5. [นโยบายการเก็บรักษาข้อมูล (Retention Policy)](#retention-policy)
6. [การประเมินค่าใช้จ่าย (Cost Estimation)](#cost-estimation)
7. [ความถูกต้องของข้อมูลและการจัดการการขยายระบบ (รายละเอียดทางสถาปัตยกรรม) (Data Fidelity & Scale Management (Architectural Details))](../architecture/DATA_FIDELITY_AND_SCALING.md)

---

## สถาปัตยกรรมปัจจุบัน (Current Architecture)

### การติดตั้งแบบอินสแตนซ์เดี่ยว (Single Instance Deployment)

```text
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ Node-RED │────│ PgBouncer │────│ TimescaleDB │
│ (1 instance)│  │ (1 instance)│  │ (1 instance)│
│ ~150MB │  │ 20-50 conn │  │ ~1GB/day │
└─────────────┘  └─────────────┘  └─────────────┘
```

### ความจุปัจจุบัน (Current Capacity)

| เมตริก (Metric)                           | ค่า (Value)       | การทดสอบ (Tested)      |
| ----------------------------------------- | ----------------- | ---------------------- |
| **Load Test (K6)**                        | 1,000 VUs         | ผ่าน (Passed)          |
| **จำนวนรอบ (Iterations)**                 | ~65,000 ใน 2 นาที | ตรวจสอบแล้ว (Verified) |
| **ความหน่วง p95 (p95 Latency)**           | ~156ms            | วัดผลแล้ว (Measured)   |
| **จุดข้อมูล/ชั่วโมง (Data Points/Hour)**  | ~600 ต่อเครื่อง   | คำนวณแล้ว (Calculated) |
| **พื้นที่จัดเก็บ/ชั่วโมง (Storage/Hour)** | ~50 KB ต่อเครื่อง | ตรวจสอบแล้ว (Verified) |

---

## การวิเคราะห์ความจุ (Capacity Analysis)

### การคำนวณขีดจำกัดสูงสุด (Ceiling Calculation)

```text
ความจุปัจจุบัน:
- Node-RED: 1 อินสแตนซ์, 5 walkers ทำงานคู่ขนานกัน
- แต่ละ walker: 1 เซสชัน SNMP ต่อรอบการดึงข้อมูล
- ช่วงเวลาดึงข้อมูล: 30 วินาที
- จำนวนเซสชันพร้อมกันสูงสุด: ~100 (ทดสอบแล้ว)

ปัจจัยการขยาย:
- 500 เครื่อง × ช่วงเวลา 30 วินาที = 500 เซสชัน/30 วินาที = 1,000 เซสชัน/นาที
- ด้วย 5 walkers แบบคู่ขนาน: 1,000 / 5 = 200 เซสชันต่อ walker ต่อนาที

ขีดจำกัดสูงสุด: ~500 เครื่อง ที่ช่วงเวลาดึงข้อมูล 10 วินาที
- 500 เครื่อง × 6 ครั้ง/นาที = 3,000 เซสชัน/นาที
- ด้วย 5 walkers แบบคู่ขนาน: 3,000 / 5 = 600 เซสชันต่อ walker ต่อนาที
```

### เงื่อนไขการขยายระบบ (Scaling Triggers)

| เมตริก (Metric)              | ปัจจุบัน (Current) | คำเตือน (Warning) | วิกฤต (Critical) | การดำเนินการ (Action)                                 |
| ---------------------------- | ------------------ | ----------------- | ---------------- | ----------------------------------------------------- |
| **หน่วยความจำ Node-RED**     | ~150MB             | >512MB            | >1GB             | แบ่งส่วน (Shard) walkers ไปยังอินสแตนซ์ต่างๆ          |
| **การเชื่อมต่อ PgBouncer**   | 20-50              | >200              | >500             | เพิ่มขนาด pool หรือเพิ่ม replica                      |
| **พื้นที่ดิสก์ TimescaleDB** | ~1GB/วัน           | >100GB            | >500GB           | ปรับเปลี่ยนระยะเวลาเก็บข้อมูล หรือเพิ่มพื้นที่จัดเก็บ |
| **ความหน่วง p95 K6**         | ~156ms             | >500ms            | >1s              | ตรวจสอบคอขวด (bottleneck)                             |
| **โหลด CPU (Node-RED)**      | <30%               | >70%              | >90%             | เพิ่มอินสแตนซ์ หรือปรับปรุงประสิทธิภาพ                |
| **แบนด์วิดท์เครือข่าย**      | <10 Mbps           | >100 Mbps         | >500 Mbps        | อัปเกรดเครือข่าย หรือบีบอัดข้อมูล                     |

---

## ตัวเลือกในการขยายระบบ (Scaling Options)

### ตัวเลือกที่ 1: การขยายระบบแนวตั้ง (Vertical Scaling - ง่ายที่สุด)

**สถานการณ์ที่ควรใช้:** ต้องการผลลัพธ์ที่รวดเร็วสำหรับเครื่องจักร 50-100 เครื่อง, เปลี่ยนแปลงโค้ดน้อยที่สุด

```yaml
# ส่วนที่เพิ่มใน docker-compose.yaml
services:
  node-red:
  deploy:
    resources:
    limits:
      memory: 1G
      cpus: "2.0"
  environment:
    - NODE_OPTIONS=--max-old-space-size=800

  timescaledb:
  deploy:
    resources:
    limits:
      memory: 4G
      cpus: "4.0"
  command: >
    postgres
    -c shared_buffers=2GB
    -c work_mem=256MB
    -c max_parallel_workers_per_gather=4

  pgbouncer:
  environment:
    - DEFAULT_POOL_SIZE=50
    - MAX_CLIENT_CONN=500
    - RESERVE_POOL_SIZE=10
```

**ข้อดี (Benefits):**

- ไม่จำเป็นต้องเปลี่ยนแปลงโค้ด
- มีความเสี่ยงน้อย
- นำไปใช้งานได้รวดเร็ว

**ข้อจำกัด (Limitations):**

- มีจุดล้มเหลวเพียงจุดเดียว (Single point of failure)
- ถึงขีดจำกัดของฮาร์ดแวร์ในท้ายที่สุด

### ตัวเลือกที่ 2: การขยายระบบแนวนอน (Horizontal Scaling - การแบ่งส่วน Node-RED)

**สถานการณ์ที่ควรใช้:** เครื่องจักร 100-500 เครื่อง, ต้องการความพร้อมใช้งานสูง (High availability)

```text
┌─────────────────────────────────────────────────────────────────┐
│      Load Balancer (nginx)      │
└─────────────────────────────────────────────────────────────────┘
        │
   ┌─────────────────┼─────────────────┐
   ▼     ▼     ▼
 ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
 │ Node-RED A │ │ Node-RED B │ │ Node-RED C │
 │ Machines 0-166│ │Machines 167-333│ │Machines 334-500│
 └───────┬───────┘ └───────┬───────┘ └───────┬───────┘
   │     │     │
   └─────────────────┼─────────────────┘
        ▼
     ┌───────────────┐
     │ PgBouncer │
     └───────┬───────┘
       ▼
     ┌───────────────┐
     │ TimescaleDB │
     │ (Primary) │
     └───────────────┘
```

**การติดตั้ง (Implementation):**

```javascript
// ตรรกะการแบ่งส่วน (sharding logic) ใน Device Registry
const shardCount = 3;
const shardIndex = hash(machine_id) % shardCount;

// อินสแตนซ์ Node-RED แต่ละตัวจะประมวลผลเฉพาะส่วน (shard) ของตนเอง
if (shardIndex === MY_SHARD_INDEX) {
  // ประมวลผลเครื่องจักรนี้
} else {
  // ข้าม - ให้อินสแตนซ์อื่นจัดการแทน
}
```

**ข้อดี (Benefits):**

- ความสามารถในการขยายตัวแบบเชิงเส้น
- ความพร้อมใช้งานสูง (ไม่มีจุดล้มเหลวจุดเดียว)
- ขยายการทำงานของตัวเก็บข้อมูลได้อย่างอิสระ

**ข้อจำกัด (Limitations):**

- ต้องใช้ Load Balancer
- การติดตั้งมีความซับซ้อนมากขึ้น
- การจัดการสถานะข้ามอินสแตนซ์

### ตัวเลือกที่ 3: แทนที่ Node-RED (ระยะยาว, สำหรับเครื่องจักร 1000+ เครื่อง)

**สถานการณ์ที่ควรใช้:** ระดับองค์กร (Enterprise scale), ต้องการระบบมอนิเตอร์ริ่งโดยเฉพาะ

```text
┌─────────────────────────────────────────────────────────────────┐
│     Telegraf Fleet (1000+ agents)     │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│ │Telegraf 1│ │Telegraf 2│ │Telegraf 3│ │Telegraf N│   │
│ │SNMP  │ │SNMP  │ │SNMP  │ │SNMP  │   │
│ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘   │
└───────┼─────────────┼───────────┼─────────────┼────────────────┘
  │    │   │    │
  └─────────────┼───────────┼─────────────┘
      ▼   ▼
    ┌───────────────────────┐
    │ Redis Streams  │
    │ (Ingestion Buffer) │
    └───────────┬───────────┘
       ▼
    ┌───────────────────────┐
    │  TimescaleDB  │
    │ (Storage Backend) │
    └───────────────────────┘
```

**ข้อดี (Benefits):**

- ออกแบบมาเพื่อการรวบรวมเมตริกโดยเฉพาะ
- ใช้ทรัพยากรน้อยกว่า Node-RED
- การขยายระบบแนวนอนทำได้ดีกว่า
- เป็นเครื่องมือมาตรฐานอุตสาหกรรม

**ข้อจำกัด (Limitations):**

- จำเป็นต้องเขียนโค้ดใหม่จำนวนมาก
- ขาดฟีเจอร์ pipeline แบบภาพของ Node-RED
- ความซับซ้อนในการดำเนินการสูงขึ้น

---

## การปรับแต่งประสิทธิภาพ (Performance Tuning)

### การปรับแต่ง TimescaleDB (TimescaleDB Optimization)

```sql
-- เพิ่ม shared_buffers สำหรับข้อมูลที่มีขนาดใหญ่
ALTER SYSTEM SET shared_buffers = '2GB';

-- ปรับแต่ง work_mem สำหรับคิวรีที่ซับซ้อน
ALTER SYSTEM SET work_mem = '256MB';

-- เปิดใช้งานการประมวลผลคิวรีแบบคู่ขนาน (parallel query execution)
ALTER SYSTEM SET max_parallel_workers_per_gather = 4;

-- ปรับแต่งความถี่ในการทำ checkpoint
ALTER SYSTEM SET checkpoint_timeout = '15min';
ALTER SYSTEM SET max_wal_size = '2GB';

-- ใช้การเปลี่ยนแปลง
SELECT pg_reload_conf();
```

### การปรับแต่ง PgBouncer (PgBouncer Tuning)

```ini
# pgbouncer.ini
[databases]
ims = host=timescaledb port=5432 dbname=ims

[pgbouncer]
pool_mode = transaction
default_pool_size = 50
max_client_conn = 500
reserve_pool_size = 10
reserve_pool_timeout = 5
server_idle_timeout = 600
client_idle_timeout = 0
```

### การปรับแต่ง Node-RED (Node-RED Optimization)

```javascript
// การปรับแต่ง settings.js
module.exports = {
  flowFile: "flows.json",
  credentialSecret: process.env.CREDENTIAL_SECRET,
  editorTheme: {
    projects: {
      enabled: false, // ปิดเพื่อเพิ่มประสิทธิภาพ
    },
  },
  // เพิ่มขีดจำกัดของหน่วยความจำ
  max_old_space_size: 800,
};
```

---

## นโยบายการเก็บรักษาข้อมูล (Retention Policy)

### การตั้งค่าปัจจุบัน (Current Configuration)

| ประเภทข้อมูล (Data Type) | ระยะเวลาเก็บรักษา (Retention) | เหตุผล (Reason)           |
| ------------------------ | ----------------------------- | ------------------------- |
| **Raw Telemetry**        | 30 วัน                        | วงจร QA ในการผลิต         |
| **Minute Aggregates**    | 1 ปี                          | เพื่อดูแนวโน้มระยะยาว     |
| **Hour Aggregates**      | 2 ปี                          | การวางแผนกำลังการผลิต     |
| **Alert History**        | 90 วัน                        | การสืบสวนเหตุการณ์ขัดข้อง |

### การจัดการระยะเวลาเก็บรักษา (Retention Management)

```sql
-- ลบข้อมูลดิบที่เก่ากว่า 30 วัน
SELECT drop_chunks('public.sys_metrics', INTERVAL '30 days');

-- ลบข้อมูลดิบที่เก่ากว่า 30 วัน (net_metrics)
SELECT drop_chunks('public.net_metrics', INTERVAL '30 days');

-- ลบข้อมูลดิบที่เก่ากว่า 30 วัน (ldi_metrics)
SELECT drop_chunks('public.ldi_metrics', INTERVAL '30 days');

-- นโยบายการเก็บรักษาข้อมูลแบบอัตโนมัติ (ตั้งค่าใน 001-init-timescaledb.sql)
SELECT add_retention_policy('public.sys_metrics', INTERVAL '30 days');
SELECT add_retention_policy('public.net_metrics', INTERVAL '30 days');
SELECT add_retention_policy('public.ldi_metrics', INTERVAL '30 days');
```

### ข้อควรพิจารณาในการขยายระบบ (Scaling Considerations)

| ขนาด (Scale)                 | จำนวนเครื่องจักร | พื้นที่จัดเก็บ/วัน | พื้นที่จัดเก็บ/เดือน | ระยะเวลาเก็บรักษาที่แนะนำ                        |
| ---------------------------- | ---------------- | ------------------ | -------------------- | ------------------------------------------------ |
| **ขนาดเล็ก (Small)**         | 1-10             | ~1 MB              | ~30 MB               | 30 วัน                                           |
| **ขนาดกลาง (Medium)**        | 10-50            | ~10 MB             | ~300 MB              | 30 วัน                                           |
| **ขนาดใหญ่ (Large)**         | 50-200           | ~50 MB             | ~1.5 GB              | 30 วัน                                           |
| **ระดับองค์กร (Enterprise)** | 200-1000         | ~500 MB            | ~15 GB               | 30 วัน (สำหรับข้อมูลดิบ), 1 ปี (สำหรับข้อมูลรวม) |

---

## การประเมินค่าใช้จ่าย (Cost Estimation)

### ค่าใช้จ่ายโครงสร้างพื้นฐาน (การติดตั้งบน Cloud) (Infrastructure Costs - Cloud Deployment)

| ส่วนประกอบ (Component)       | ขนาดเล็ก (10 เครื่อง) | ขนาดกลาง (100 เครื่อง) | ระดับองค์กร (1000 เครื่อง) |
| ---------------------------- | --------------------- | ---------------------- | -------------------------- |
| **ประมวลผล (Node-RED)**      | $50/เดือน             | $200/เดือน             | $1,000/เดือน               |
| **ฐานข้อมูล (TimescaleDB)**  | $100/เดือน            | $500/เดือน             | $3,000/เดือน               |
| **พื้นที่จัดเก็บ (Storage)** | $10/เดือน             | $50/เดือน              | $500/เดือน                 |
| **เครือข่าย (Network)**      | $20/เดือน             | $100/เดือน             | $500/เดือน                 |
| **รวม (Total)**              | **$180/เดือน**        | **$850/เดือน**         | **$5,000/เดือน**           |

### ค่าใช้จ่ายแบบ On-Premise

| ส่วนประกอบ (Component)                      | ขนาดเล็ก   | ขนาดกลาง    | ระดับองค์กร |
| ------------------------------------------- | ---------- | ----------- | ----------- |
| **ฮาร์ดแวร์เซิร์ฟเวอร์ (Server Hardware)**  | $2,000     | $10,000     | $50,000     |
| **สวิตช์เครือข่าย (Network Switch)**        | $500       | $2,000      | $10,000     |
| **การบำรุงรักษารายปี (Annual Maintenance)** | $500       | $2,000      | $10,000     |
| **รวมปีที่ 1 (Total Year 1)**               | **$3,000** | **$14,000** | **$70,000** |

### การคำนวณผลตอบแทนจากการลงทุน (ROI Calculation)

```text
ค่าใช้จ่ายในการตรวจสอบด้วยตนเองในปัจจุบัน:
- พนักงาน 2 คน × 8 ชั่วโมง/วัน × $25/ชั่วโมง × 30 วัน = $12,000/เดือน

ค่าใช้จ่ายระบบตรวจสอบอัตโนมัติ (ขนาดกลาง):
- โครงสร้างพื้นฐาน: $850/เดือน
- เวลาของพนักงาน (ลดลง): 2 ชั่วโมง/วัน × $25/ชั่วโมง × 30 วัน = $1,500/เดือน
- รวมทั้งหมด: $2,350/เดือน

ประหยัดรายเดือน: $12,000 - $2,350 = $9,650/เดือน
ประหยัดรายปี: $115,800/ปี
ROI: 850% (ปีที่ 1)
```

---

<div align="center">

**แผนการขยายระบบ IMS — เวอร์ชัน 1.0**

_ออกแบบมาสำหรับสเกลเครื่องจักรระดับ 1-1000+ เครื่อง_

</div>
