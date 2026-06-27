# 🏛️ System Architecture (Enterprise Blueprint)

เอกสารนี้อธิบายโครงสร้างเชิงลึกของระบบ **IMS (Infrastructure Monitoring System)** ออกแบบมาสำหรับ **Senior Engineer** และ **SRE (Site Reliability Engineer)** เพื่อทำความเข้าใจและพัฒนาต่อยอด

---

## 1. System Topology (4 Layers)

สถาปัตยกรรมระบบแบ่งออกเป็น 4 ชั้นหลัก เพื่อความง่ายในการ scaling และบำรุงรักษา:

### Layer 1: Edge/OT Layer
ชั้นอุปกรณ์เครื่องจักรและเครือข่าย

- **อุปกรณ์:** YSPhotec LDI (Laser Direct Imaging) สำหรับผลิต PCB
- **โปรโตคอล:** SNMP v2c/v3 (Read-Only 100%)
- **Network:** Ethernet (eth0) + Wi-Fi (wlan0)
- **OIDs ที่ใช้:**
  - CPU: `.1.3.6.1.2.1.25.3.3.1.2` (hrProcessorLoad)
  - Storage: `.1.3.6.1.2.1.25.2.3.1` (hrStorageTable)
  - Network: `.1.3.6.1.2.1.2.2.1` (ifTable) + `.1.3.6.1.2.1.31.1.1.1` (ifXTable 64-bit)
  - Temperature: `.1.3.6.1.4.1.2021.13.16.2.1.7` (lmTempSensor)
  - LDI Private MIB: `.1.3.6.1.4.1.9999.1.x.x` (Enterprise OID)

### Layer 2: Ingestion Layer (Node-RED)
ชั้นรับและประมวลผลข้อมูล

- **Dual-Engine SNMP Walker:** สลับโหมดอัตโนมัติ
  - Production: `session.subtree()` — เร็วกว่า 10x สำหรับอุปกรณ์จริง
  - Development: `session.get()` — ใช้กับ snmpsim ได้ 100%
- **5-Thread Parallel Walker:**
  ```
  Fork → CPU Walker │ Storage Walker │ Network GET │ Temp Walker │ LDI Walker
       ↓              ↓                ↓              ↓             ↓
  └──────────────────────── Join Barrier (count=5, timeout=8) ──────────────────┘
                                    ↓
                              Bulletproof Parser v7
                                    ↓
                              PostgreSQL INSERT
  ```
- **Bulletproof Parser v7 (4-Bug Fix):**
  - Two-Pass Parsing: อ่านชื่อก่อน แล้ว map ค่า — ป้องกัน Race Condition
  - Smart Counter Wrap: ตรวจจับ 32-bit (+4,294,967,296) vs 64-bit (+18,446,744,073,709,551,616) overflow อัตโนมัติ
  - Memory Cleanup: `msg.payload = null` + `flatData.length = 0` ป้องกัน Memory Leak ใน Node-RED sandboxed VM
  - Try-Catch Wrapped: ป้องกัน Pipeline Crash จาก SNMP Timeout หรือ malformed data

### Layer 3: Storage Layer (TimescaleDB + PgBouncer)
ชั้นเก็บข้อมูลประสิทธิภาพสูง

- **PgBouncer (Connection Pooler):**
  - Transaction pooling mode — ป้องกัน connection limit เต็ม
  - พอร์ตภายใน Docker: 5432 (ไม่ใช่ 6432)
- **TimescaleDB (Hypertable):**
  - ตาราง `public.machine_telemetry` — 28 คอลัมน์
  - Partitioning by `time` column
  - Compression: หลัง 7 วัน (~90% ประหยัดพื้นที่)
  - Retention: ลบอัตโนมัติหลัง 90 วัน
- **Continuous Aggregates:**
  - `telemetry_minute_summary` — สรุปทุก 1 นาที
  - `telemetry_hourly_summary` — สรุปทุก 1 ชั่วโมง
  - ทำให้ Grafana โหลดข้อมูล 30 วันได้ต่ำกว่า 2 วินาที

### Layer 4: Visualization & AIOps Layer
ชั้นแสดงผลและวิเคราะห์อัจฉริยะ

- **Grafana:** 4 Dashboards, 34+ Panels, SRE Color Convention
- **Prometheus:** 38 Alert Rules, 13 Groups
- **AIOps Z-Score:** `abs(metric - avg_over_time[1h]) > 3 * stddev_over_time[1h]`
- **Predictive Alerting:** Linear Regression ผ่าน `regr_slope` / `regr_intercept`
- **Alertmanager:** Inhibition Rules + Webhook (Emoji format สำหรับ LINE/Teams)
- **Blackbox Exporter:** HTTP/TCP/ICMP SLA Probes

---

## 2. Data Flow Pipeline

```
                    ┌──────────────┐
                    │  Inject Node │ (ทุก 10 วินาที)
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  Fork 5 Ways │
                    └──┬──┬──┬──┬──┘
            ┌──────────┘  │  │  └──────────┐
            ▼             ▼  ▼             ▼
      ┌─────────┐  ┌──────────┐  ┌─────────┐
      │CPU Walk │  │Storage   │  │Network  │ ...
      │(4 OIDs) │  │Walk      │  │GET      │
      └────┬────┘  │(10 OIDs) │  │(18 OIDs)│
           │       └────┬─────┘  └────┬────┘
           └────────────┼─────────────┘
                        ▼
                ┌───────────────┐
                │ Join Barrier  │ count=5, timeout=8
                └───────┬───────┘
                        ▼
                ┌───────────────┐
                │ SRE Parser v7 │ ← try-catch wrapped
                │ (Two-Pass)    │
                └───────┬───────┘
                        ▼
                ┌───────────────┐
                │ PostgreSQL    │ ← parameterized queries
                │ INSERT        │   ($1, $2, ... $N)
                └───────────────┘
```

### Smart Counter Wrap Logic
```
rDiff = currentCounter - previousCounter

IF rDiff < 0:
  IF |rDiff| > 2,147,483,648:     // 64-bit overflow
    rDiff += 18,446,744,073,709,551,616
  ELSE:                            // 32-bit overflow
    rDiff += 4,294,967,296

rx_mbps = (rDiff × 8) / (elapsedSec × 1,000,000)
IF rx_mbps > 40,000 OR rx_mbps < 0:
  rx_mbps = 0                      // HardCap 40 Gbps
```

---

## 3. Database Schema & Aggregation

### machine_telemetry (Hypertable)

| Column | Type | Description |
|--------|------|-------------|
| `time` | TIMESTAMPTZ | เวลาที่เก็บข้อมูล (partition key) |
| `machine_id` | TEXT | ชื่อเครื่องจักร |
| `cpu_load_percent` | DOUBLE PRECISION | โหลด CPU (%) |
| `ram_used_mb` | DOUBLE PRECISION | RAM ที่ใช้ (MB) |
| `disk_used_gb` | DOUBLE PRECISION | พื้นที่ disk ที่ใช้ (GB) |
| `net_rx_bytes` | BIGINT | จำนวน Bytes ที่รับ (64-bit) |
| `net_tx_bytes` | BIGINT | จำนวน Byte ที่ส่ง (64-bit) |
| `net_rx_errors` | BIGINT | จำนวน Errors |
| `net_rx_drops` | BIGINT | จำนวน Drops |
| `temp_c` | DOUBLE PRECISION | อุณหภูมิ (°C) |
| `rx_mbps` | DOUBLE PRECISION | Bandwidth รับ (Mbps) |
| `tx_mbps` | DOUBLE PRECISION | Bandwidth ส่ง (Mbps) |
| `interface_metrics` | JSONB | ข้อมูล per-interface (eth0, wlan0) |
| `ldi_throughput` | DOUBLE PRECISION | LDI Throughput |
| `ldi_humidity` | DOUBLE PRECISION | LDI Humidity (%) |
| `ldi_pe` | DOUBLE PRECISION | Position Error |
| `ldi_je` | DOUBLE PRECISION | Judgment Error |
| `ldi_power` | DOUBLE PRECISION | Power Consumption (W) |
| `ldi_vibration` | DOUBLE PRECISION | Vibration (mm/s) |
| `wifi_rssi` | INTEGER | Wi-Fi Signal Strength (dBm) |
| `wifi_snr` | INTEGER | Wi-Fi Signal-to-Noise Ratio (dB) |

### Continuous Aggregates
```sql
-- Minute Summary
CREATE MATERIALIZED VIEW public.telemetry_minute_summary
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 minute', "time") AS "bucket",
    machine_id,
    AVG(cpu_load_percent) AS avg_cpu_load,
    MAX(temp_c) AS avg_temp,
    AVG(ldi_humidity) AS avg_ldi_humidity,
    AVG(wifi_rssi) AS avg_wifi_rssi,
    MIN(wifi_snr) AS min_wifi_snr
    -- ... + fields
FROM public.machine_telemetry
GROUP BY "bucket", machine_id;
```

---

## 4. High Availability & Security

### Chaos Tolerance
- **K6 Load Test:** 1,000 VUs, 0% failure rate, p95 < 80ms
- **PgBouncer Failover:** Node-RED Batch Buffer เก็บข้อมูลใน RAM แล้วเทกลับเมื่อ DB กลับมา
- **Zero Data Loss:** ผ่านการทดสอบ Chaos Engineering แล้ว

### Security Model
- **SNMP Read-Only:** 100% ปลอดภัย ไม่ส่งคำสั่งไปที่เครื่องจักร
- **No Hardcoded Secrets:** ใช้ Docker secrets + .env
- **SQL Injection Prevention:** Parameterized queries เสมอ
- **Zero Trust:** ไม่มี password ใน source code

---

## 5. Scalability

- **Database-driven Machine Registry:** ไม่ hardcode IP ใน Node-RED
- **10 → 1,000 Machines:** ไม่ต้องแก้โค้ด เพียงเพิ่ม IP ใน DB
- **Dynamic OID Discovery:** ใช้ MIB Browser ค้นหา OID ของอุปกรณ์ใหม่
