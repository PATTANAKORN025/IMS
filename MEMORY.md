# IMS (Industrial Monitoring System) - Core Memory & Architecture

## Project Vision
A World-Class, Enterprise-Grade Server & IoT Monitoring Pipeline designed for APEX Circuit.
The system targets ~99% SLA (single-instance architecture), Zero-Leak memory processing, and Predictive AIOps.

## Tech Stack & Architecture
- **Data Ingestion:** Node-RED (v4.0.5 minimal) + net-snmp (Parallel Walker Architecture)
- **Database:** TimescaleDB (PostgreSQL 16) + PgBouncer (Transaction Pool Mode, Port 5432 internal)
- **Visualization:** Grafana (v11+) with Native Macros (`$__timeGroupAlias`)
- **Alerting & SRE:** Prometheus + Alertmanager + Blackbox Exporter (SLA Probes)
- **Simulator:** SNMP Simulator (`tandrup/snmpsim`)

## The Ironclad Rules
1. **Schema Protocol:** Database ใช้ `public` schema เท่านั้น ห้ามกลับไปใช้ `ims.*` เด็ดขาด
2. **Node-RED SNMP:**
   - ห้ามใช้โหนด `snmp` (GET) ธรรมดาแบบต่อคิว (Daisy-chain) ให้ใช้ **`snmp walker` แบบขนาน 5 ท่อ (Parallel)** แล้วใช้โหนด `Join` รวบรวมข้อมูล
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
- **LDI Private MIB:** `.1.3.6.1.4.1.9999.1.x.x` (Enterprise `.9999` = 4 nines, NOT 5)
  - `.1.1.0` Throughput (units/sec) | `.1.2.0` Temperature (°C) | `.1.3.0` Humidity (%)
  - `.1.4.2` PE2 — Process Efficiency (%) | `.1.4.5` PE5 (%) | `.1.5.1` JE — Junction Efficiency (%)
  - `.1.6.1` Power (Watts) | `.1.7.1` Vibration (mm/s RMS) | `.1.8.1` Uptime (Counter64)

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
| TimescaleDB | 5432 (internal only) | Time-series database |
| PgBouncer | 5432→container (no host port) | Connection pooler |
| Node-RED | 1880 (localhost only) | Flow-based data pipeline |
| Grafana | 3000 (localhost only) | Dashboard & visualization |
| Prometheus | 9090 (localhost only) | Metrics collection |
| Alertmanager | 9093 (localhost only) | Alert routing |
| SNMP Simulator | 161/udp (internal only) | Simulated server metrics |

## Database Schema
- `public.machines` — Machine registry
- `public.machine_telemetry` — Raw telemetry (hypertable) + LDI columns
- `public.telemetry_minute_summary` — 1-minute continuous aggregate (with LDI)
- `public.telemetry_hourly_summary` — 1-hour continuous aggregate (with LDI)
- `public.alert_rules` — Alert threshold definitions
- `public.alert_history` — Alert event log

### LDI Columns (machine_telemetry)
- `ldi_throughput` (double precision) — units/sec
- `ldi_humidity` (double precision) — ambient humidity % (÷100 from snmpsim)
- `ldi_pe` (double precision) — Process Efficiency % (÷100 from snmpsim)
- `ldi_je` (double precision) — Junction Efficiency % (÷100 from snmpsim)
- `ldi_power` (double precision) — Watts (÷100 from snmpsim)
- `ldi_vibration` (double precision) — mm/s RMS (÷100 from snmpsim)
- `ldi_uptime` (bigint) — seconds since start

### WiFi Columns (machine_telemetry)
- `wifi_rssi` (int) — Received Signal Strength Indicator (dBm)
- `wifi_snr` (int) — Signal-to-Noise Ratio (dB)

### Additional Columns (machine_telemetry)
- `ldi_temp` (double precision) — LDI machine temperature °C (÷100 from snmpsim OID .1.2.0)
- `disk_description` (text) — hrStorageDescr from HOST-RESOURCES-MIB

## Alert Thresholds
| Metric | Warning | Critical |
|--------|---------|----------|
| CPU Load | > 75% | > 90% |
| RAM Usage | > 80% | > 90% |
| Disk Usage | > 85% | > 95% |
| Temperature | > 70°C | > 85°C |
| Network Errors | > 100 | > 1000 |
| WiFi RSSI | < -70 dBm | < -80 dBm |
| WiFi SNR | < 15 dB | < 10 dB |
| LDI Throughput | Z-Score 2σ | Z-Score 3σ |
| LDI Vibration | Z-Score 2σ | Z-Score 3σ |

## Gotchas
- PgBouncer uses `transaction` pooling mode — no prepared statements
- `node-red/flows/ingestion.json` is source of truth for ingestion pipeline; `node-red/flows/alerting.json` for alerting. Runtime copies in `nodered_data/`
- After editing flows: copy split files to `nodered_data/`, then restart Node-RED
- **NEVER use PowerShell `ConvertTo-Json`** to edit flow JSON — it corrupts `\n` escape sequences in `func` fields, causing SyntaxError in Node-RED
- **Node-RED `func` fields are single-line JSON strings** — edits must preserve `\n` escape sequences, never introduce literal line breaks
- **Node-RED function nodes run in sandboxed VM** — `require()` is unavailable; use `global.get()` for installed packages
- **`snmp walker` nodes unreliable** with snmpsimd (GETNEXT doesn't respect subtree boundaries) — use direct SNMP GET with function nodes instead
- TimescaleDB hypertable requires `time` column as partitioning key
- Grafana dashboards are read-only mounted; edit JSON files directly
- Secrets must exist as files in `secrets/` directory before `docker compose up`
- **snmpsim Integer type (2)** fluctuates; **Counter64 (65)** accumulates — use type 2 for manufacturing metrics
- **join_sync `count` field** (string) must match `joinCount` (number) — they are separate fields
- **LDI Private MIB** uses enterprise `.1.3.6.1.4.1.9999` (4 nines) — all OIDs under `.1.x.x`
- **`session.subtree()` DOES NOT WORK with snmpsim** — GETNEXT returns wrong subtrees. Only `session.get()` with explicit OIDs is reliable for snmpsim
- **TimescaleDB hypertable ALTER requires 7-step sequence** — drop caggs, disable compression, ALTER, re-enable, recreate caggs (see `alter-hypertable-columns` skill)
- **TimescaleDB migrations can't use BEGIN/COMMIT** — `CREATE MATERIALIZED VIEW ... WITH (timescaledb.continuous)` fails inside a transaction block. Write migrations without transaction wrappers.
- **Docker host port conflicts on Windows** — snmpsim (1161/udp) and pgbouncer (6432) can conflict with native Windows services. Remove host port mappings; Node-RED accesses via Docker network.
- **`nodered_data/` is bind-mounted** — persists across `docker compose down -v`. Credential files survive volume destruction. Delete `nodered_data/flows_cred.json` manually if encryption key changes.
- **Z-Score alert rules NOT in Prometheus** — only a comment "FOLLOW-UP" in `ims-alerts.yml:16`. No actual `stddev_over_time` PromQL rules implemented.
