# IMS (Industrial Monitoring System) - Core Memory & Architecture

## Project Vision
A World-Class, Enterprise-Grade Server & IoT Monitoring Pipeline designed for APEX Circuit.
The system ensures 99.99% SLA, Zero-Leak memory processing, and Predictive AIOps.

## Tech Stack & Architecture
- **Data Ingestion:** Node-RED (v4.0.5 minimal) + net-snmp (Parallel Walker Architecture)
- **Database:** TimescaleDB (PostgreSQL 16) + PgBouncer (Transaction Pool Mode, Port 5432 internal)
- **Visualization:** Grafana (v11+) with Native Macros (`$__timeGroupAlias`)
- **Alerting & SRE:** Prometheus + Alertmanager + Blackbox Exporter (SLA Probes)
- **Simulator:** SNMP Simulator (`tandrup/snmpsim`)

## The Ironclad Rules
1. **Schema Protocol:** Database ใช้ `public` schema เท่านั้น ห้ามกลับไปใช้ `ims.*` เด็ดขาด
2. **Node-RED SNMP:**
   - ห้ามใช้โหนด `snmp` (GET) ธรรมดาแบบต่อคิว (Daisy-chain) ให้ใช้ **`snmp walker` แบบขนาน 4 ท่อ (Parallel)** แล้วใช้โหนด `Join` รวบรวมข้อมูล
   - อัลกอริทึมการ Parse ต้องเป็น **O(N) Single-Pass** และใช้ `split('.').pop()` ห้ามใช้ Regex เพื่อประหยัด CPU
   - ต้องมี `flatData.length = 0` และ `msg.payload = null` เพื่อทำ Explicit Garbage Collection ป้องกัน Memory Leak
3. **Database Rules:**
   - ใช้ **Continuous Aggregates** (`telemetry_minute_summary`, `telemetry_hourly_summary`) สำหรับ Grafana เสมอ ห้าม Query ตาราง raw ตรงๆ สำหรับกราฟ Time-Series
   - ต้องคำนวณ Mbps (Network Bandwidth) ที่ระดับ Database หรือทำ Delta ผ่าน Node-RED context
4. **Grafana Queries:**
   - ห้ามใช้ `$__interval` เพียวๆ ใน SQL เด็ดขาด ให้ใช้ `$__timeGroupAlias("time", $__interval)`
   - การหารตัวเลข ต้อง Cast เป็น `::NUMERIC` เสมอก่อนใช้ฟังก์ชัน `ROUND()`

## Key MIBs & OIDs
- **CPU:** `.1.3.6.1.2.1.25.3.3.1.2` (HOST-RESOURCES-MIB)
- **Storage/RAM:** `.1.3.6.1.2.1.25.2.3.1` (HOST-RESOURCES-MIB)
- **Network (64-bit):** `.1.3.6.1.2.1.31.1.1.1.6` (RX) / `.10` (TX) (IF-MIB High Capacity)
- **Temp:** `.1.3.6.1.4.1.2021.13.16.2.1.7` (LM-SENSORS-MIB)
- **LDI Private MIB:** `.1.3.6.1.4.1.99999.1.1.x` (Enterprise Private — LDI Manufacturing)
  - `.1` Throughput (units/sec) | `.2` Temperature (°C) | `.3` Humidity (%)
  - `.4` PE — Process Efficiency (%) | `.5` JE — Junction Efficiency (%)
  - `.6` Power (Watts) | `.7` Vibration (mm/s RMS) | `.8` Uptime (Counter64)

## Architecture Diagram
```
┌─────────────┐     ┌──────────────────────────────┐     ┌──────────────┐
│  SNMP Agent │────▶│  Node-RED Pipeline (v6)       │────▶│  PgBouncer   │
│  (snmpsim)  │     │  5-Thread Parallel Walker     │     │  (Pooler)    │
│  LDI MIB    │     │  CPU│Storage│Network│Temp│LDI  │     └──────┬───────┘
└─────────────┘     └──────────────┬───────────────┘              │
                                   │                              ▼
                                   ▼                       ┌──────────────┐
                            ┌─────────────┐                │  TimescaleDB │
                            │  Grafana    │◀───────────────│  (PostgreSQL)│
                            │  Dashboard  │                └──────────────┘
                            └──────┬──────┘
                                   │
                                   ▼
                            ┌─────────────┐
                            │  Alerting   │◀──── Prometheus + Alertmanager
                            └─────────────┘
```

## Services & Ports
| Service | Port | Description |
|---------|------|-------------|
| TimescaleDB | 5432 (internal) | Time-series database |
| PgBouncer | 6432 (internal) | Connection pooler |
| Node-RED | 1880 | Flow-based data pipeline |
| Grafana | 3000 | Dashboard & visualization |
| Prometheus | 9090 | Metrics collection |
| Alertmanager | 9093 | Alert routing |
| SNMP Simulator | 1161/udp | Simulated server metrics |

## Database Schema
- `public.machines` — Machine registry
- `public.machine_telemetry` — Raw telemetry (hypertable) + LDI columns
- `public.telemetry_minute_summary` — 1-minute continuous aggregate (with LDI)
- `public.telemetry_hourly_summary` — 1-hour continuous aggregate (with LDI)
- `public.alert_rules` — Alert threshold definitions
- `public.alert_history` — Alert event log

### LDI Columns (machine_telemetry)
- `ldi_throughput` (int) — units/sec
- `ldi_humidity` (int) — ambient humidity %
- `ldi_pe` (int) — Process Efficiency %
- `ldi_je` (int) — Junction Efficiency %
- `ldi_power` (int) — Watts
- `ldi_vibration` (int) — mm/s RMS
- `ldi_uptime` (bigint) — seconds since start

## Alert Thresholds
| Metric | Warning | Critical |
|--------|---------|----------|
| CPU Load | > 75% | > 90% |
| RAM Usage | > 80% | > 90% |
| Disk Usage | > 85% | > 95% |
| Temperature | > 70°C | > 85°C |
| Network Errors | > 100 | > 1000 |

## Gotchas
- PgBouncer uses `transaction` pooling mode — no prepared statements
- Node-RED `flows.json` is gitignored; always edit `flows-ubuntu.json`
- TimescaleDB hypertable requires `time` column as partitioning key
- Grafana dashboards are read-only mounted; edit JSON files directly
- Secrets must exist as files in `secrets/` directory before `docker compose up`
- **snmpsim Integer type (2)** fluctuates; **Counter64 (65)** accumulates — use type 2 for manufacturing metrics
- **join_sync `count` field** (string) must match `joinCount` (number) — they are separate fields
- **LDI Private MIB** uses enterprise `.1.3.6.1.4.1.99999` — all 8 OIDs under `.1.1.x`
