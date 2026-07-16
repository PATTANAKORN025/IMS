# IMS System Architecture

> Architecture Decision Records and system context for the Industrial NOC Monitoring System.

## System Context

IMS is a Docker-based monitoring stack that collects SNMP telemetry from IT infrastructure, processes it through a real-time pipeline, stores it in a time-series database, and visualizes it via Grafana dashboards with Prometheus-based alerting.

```mermaid
flowchart LR
    subgraph Devices ["🛰️ SNMP Devices"]
        J[Juniper EX4000\n78 interfaces] 
        S[Linux Servers\n1000+ nodes]
    end

    subgraph Pipeline ["⚙️ V10 Streaming Pipeline"]
        J -->|SNMP v2c UDP/161| W[Node-RED\nSequential Async Bulk\nmaxRepetitions: 50]
        S -->|SNMP v2c UDP/161| W
        W -->|fork_5_ways| CPU[CPU Walker]
        W -->|fork_5_ways| NET[Network Walker\nifTable + ifXTable]
        W -->|fork_5_ways| STO[Storage Walker]
        W -->|fork_5_ways| TMP[Temp Walker]
        CPU --> P["sre_parser\nper-device state\nflow context"]
        NET --> P
        STO --> P
        TMP --> P
    end

    subgraph Storage ["🗄️ TimescaleDB"]
        P -->|Batch INSERT 10s| B[PgBouncer\nTransaction Pool]
        B --> T["sys_metrics\nnet_metrics\nldi_metrics"]
        T --> CAGG["CAGGs\nHourly → Daily → Weekly"]
    end

    subgraph Obs ["📊 Observation"]
        T --> G["Grafana\n4 Dashboards\n10s refresh"]
        T --> PR["Prometheus\n/metrics scrape"]
        PR --> AM["Alertmanager\n→ LINE / Slack"]
    end

    style Devices fill:#1e293b,stroke:#3B82F6,color:#e2e8f0
    style Pipeline fill:#1e293b,stroke:#F59E0B,color:#e2e8f0
    style Storage fill:#1e293b,stroke:#10B981,color:#e2e8f0
    style Obs fill:#1e293b,stroke:#8B5CF6,color:#e2e8f0
```
### Data Flow

1. **Collection**: Node-RED polls devices via SNMP v2c every 10 seconds. The `fork_5_ways` node dispatches 4 walkers for network switches (CPU, Storage, Network, Temp) and 5 for servers (+LDI). Device registry is loaded from `public.devices` every 5 minutes into `global.deviceRegistry`.
2. **Walking**: Each walker executes independently. Network switches use sequential async bulk walks (`session.subtree` with `maxRepetitions: 50`) — first ifTable for names/status/counters, then ifXTable for 64-bit HC counters. Servers use targeted `session.get()` with known OIDs. All walkers include offline pass-through (`_walker: "offline"`).
3. **Parsing**: The `sre_parser` node receives each walker response, maintains per-device state in flow context (`dev_state_<deviceId>`), and buffers rows in `batch_buf_<deviceId>`. Interface names are matched via OID prefix parsing (`oid.startsWith()`). Network rates are calculated from counter deltas with cold-start guards and wrap-around handling.
4. **Storage**: On a 10-second timer, buffers are flushed independently to TimescaleDB via PgBouncer. Each table type (sys_metrics, net_metrics, ldi_metrics) inserts only if its buffer has rows — partial walker failures do not block unrelated data.
5. **Continuous Aggregation**: CAGGs (`sys_hourly`, `net_hourly`, `ldi_hourly`) auto-refresh every 30 minutes. Daily and weekly CAGGs aggregate from hourly. Retention: raw 14d, hourly 90d, daily 2yr, weekly forever.
6. **Visualization**: Grafana renders 4 dashboards — NOC Overview (fleet envelope), Engineering Drill-Down (per-machine with per-interface), AIOps & Capacity (forecasting + Z-Score anomaly detection), and Meta-Monitoring (pipeline health).
7. **Alerting**: Prometheus scrapes Node-RED `/metrics` endpoint. Alertmanager routes firing alerts to LINE Notify and Slack with runbook links. Z-Score alerts detect anomalies via Grafana SQL over TimescaleDB.

### Container Architecture

| Service | Port | Purpose |
|---------|------|---------|
| TimescaleDB | 5432 (internal) | Time-series storage with compression and retention |
| PgBouncer | 5432 (internal) | Connection pooling — all DB access routes through here |
| Node-RED | 127.0.0.1:1880 | SNMP polling pipeline and alerting webhook receiver |
| Grafana | 127.0.0.1:3000 | Dashboard visualization (3 provisioned dashboards) |
| Prometheus | 127.0.0.1:9090 | Metrics scraping and alert rule evaluation |
| Alertmanager | 127.0.0.1:9093 | Alert routing with inhibition rules |
| Blackbox Exporter | 127.0.0.1:9115 | HTTP/TCP/ICMP SLA probes |
| SNMP Simulator | 161 (internal) | Simulated telemetry for development |

---

## Architecture Decision Records (ADRs)

### ADR-001: TimescaleDB over InfluxDB

**Context**: The system needed a time-series database capable of handling 55 machines polled every 10 seconds (~330 rows/minute raw, ~59k rows/day).

**Decision**: TimescaleDB (PostgreSQL extension) over InfluxDB.

**Rationale**:
- **SQL standard**: Dashboard queries use standard PostgreSQL SQL with JOINs, CTEs, and window functions — no need to learn InfluxQL or Flux.
- **Relational JOINs**: The system joins time-series data with relational tables (e.g., `sys_metrics` JOIN `devices` for device registry, CAGG JOIN raw table for total capacity).
- **Continuous Aggregates**: Materialized views that auto-refresh, providing pre-computed 1-minute and 1-hour summaries without custom cron jobs.
- **Compression**: 7-day auto-compression achieves ~90% storage reduction with transparent query decompression.
- **Ecosystem**: Grafana's PostgreSQL datasource is mature and well-documented.

### ADR-002: Node-RED as Pipeline Engine (V10 Streaming Architecture)

**Context**: The system polls 1000+ devices via SNMP v2c every 10 seconds, parses raw OID responses into structured metrics, and inserts into TimescaleDB. Each device generates 5 walker responses (CPU, Storage, Network, Temp, LDI).

**Decision**: Node-RED with V10 Streaming Architecture — direct fan-in to a single stateful parser.

**Rationale**:
- **Event-driven architecture**: Async SNMP callbacks map to Node-RED's message-passing model with zero thread pool management.
- **Sequential async bulk walks**: For network switches (78+ ports), walkers use `session.subtree()` with `maxRepetitions: 50` in sequential `await` calls — first ifTable (names + status + counters), then ifXTable (64-bit HC counters). Single UDP socket eliminates switch-level packet drops. For servers, lightweight `session.get()` with known OIDs.
- **Stateful parser**: The `sre_parser` node accumulates per-device state in flow context (`dev_state_<deviceId>`) and buffers rows in `batch_buf_<deviceId>`. Each walker fires independently and the parser handles it immediately — no join barrier required.
- **Timer-gated independent flushing**: Buffer flushes on a 10-second timer. Each table type (sys/net/ldi) inserts independently — a network timeout does not block CPU/temp data writes.
- **Offline heartbeat**: When the circuit breaker trips (device unreachable), the fork emits `_walker: "offline"` messages. The parser immediately zeros all metrics for that device and pushes zeroed rows to the database, ensuring outage timestamps are always recorded.
- **Protocol translation**: Built-in HTTP nodes receive Alertmanager webhooks and translate to LINE/Teams API calls.
- **Flow visualization**: The pipeline is visible and editable in the Node-RED UI for debugging and handoff.

### ADR-003: PgBouncer Connection Pooling

**Context**: Grafana dashboards query TimescaleDB continuously (10s refresh), while Node-RED inserts every 30s for 1000+ devices. Without pooling, both could exhaust PostgreSQL's `max_connections=100`.

**Decision**: PgBouncer in `transaction` pooling mode, sitting between all clients and TimescaleDB.

**Rationale**:
- **Transaction mode**: Each SQL transaction gets a fresh server connection, then returns it to the pool. This works because the pipeline uses simple INSERT statements (no prepared statements).
- **Connection reuse**: Reduces connection overhead — 200 client connections map to 20 server connections.
- **Failure isolation**: If Node-RED crashes, its connections are released without affecting Grafana queries.
- **No host port**: PgBouncer listens only on the Docker internal network (`ims-pgbouncer:5432`), never exposed to the host.

### ADR-004: Direct Fan-In Parser (replaces Join Barrier)

**Context**: With 1000+ devices polled concurrently, the previous join-barrier pattern (`msg.parts` correlation) was unreliable — dropped messages caused silent data loss, and the join node introduced unnecessary complexity.

**Decision**: Direct fan-in — all walkers send messages directly to `sre_parser`. The parser uses `deviceId` (from `msg.machine_id`) to maintain per-device state.

**Rationale**:
- **No correlation overhead**: Each message carries its own `machine_id` — the parser routes it to the correct device state via `flow.get('dev_state_' + deviceId)`.
- **Resilience**: If one walker fails (timeout, crash), only that device's state is affected. Other devices continue unaffected.
- **Simplified debugging**: Each walker message is self-contained — no need to trace join-group IDs.
- **Safety timeout**: Function node timeout set to 15 seconds accommodates SNMP timeout (6s) + merge delay + DB insert.

---

## Continuous Aggregate Strategy

| CAGG | Source | Refresh Interval | Retention |
|------|--------|-------------------|-----------|
| `sys_hourly` | `sys_metrics` | 30 minutes | Indefinite |
| `net_hourly` | `net_metrics` | 30 minutes | Indefinite |
| `ldi_hourly` | `ldi_metrics` | 30 minutes | Indefinite |

**Rule**: Any Grafana query spanning more than 2 hours MUST use a Continuous Aggregate (CAGG), never the raw tables. Raw tables have 30-day retention; CAGGs are kept indefinitely.

## Alert Architecture

```
Prometheus ──scrape──▸ Node-RED metrics
                    ──scrape──▸ Blackbox Exporter (HTTP/TCP/ICMP probes)
                          │
                          ▼
                    Alert Rules (ims-alerts.yml)
                          │
                          ▼
                    Alertmanager
                    ├── Inhibition: Critical suppresses Warning on same machine
                    ├── Route: Default → ims-node-red-webhook
                    └── Webhook → Node-RED /alert-webhook
                                    ├── LINE Messaging API
                                    └── MS Teams Adaptive Card
```


---

# Detailed System Architecture

# 🏗️ IMS — System Architecture Document

> **เอกสารทางเทคนิคสำหรับ Engineers และ SREs**
> อธิบาย topology, data flow, monitoring strategy, และ alerting pipeline ของระบบ IMS

---

<div align="center">

![Architecture](https://img.shields.io/badge/Architecture-Enterprise%20Grade-blue)
![Monitoring](https://img.shields.io/badge/Monitoring-Real--time-brightgreen)
![Alerting](https://img.shields.io/badge/Alerting-Multi--channel-orange)

</div>

---

## 📑 Table of Contents

1. [System Topology](#-system-topology)
2. [Data Flow Pipeline](#-data-flow-pipeline)
3. [Monitoring Strategy](#-monitoring-strategy)
4. [Alerting Pipeline](#-alerting-pipeline)
5. [Database Schema](#-database-schema)
6. [Security Architecture](#-security-architecture)
7. [Scalability Considerations](#-scalability-considerations)

---

## 🌐 System Topology

### High-Level Architecture

```mermaid
graph TB
    subgraph "Data Collection Layer"
        S1["Server 1<br/>SNMP Agent"]
        S2["Server 2<br/>SNMP Agent"]
        S3["Server N<br/>SNMP Agent"]
        SIM["ims-snmpsim<br/>Dev Simulator"]
    end

    subgraph "Pipeline Layer"
        NR["ims-node-red<br/>5-Thread Parallel Walker"]
        P["ims-pgbouncer<br/>Connection Pooler<br/>Transaction Mode"]
    end

    subgraph "Storage Layer"
        TS[("ims-timescaledb<br/>PostgreSQL + TimescaleDB<br/>Hypertable + CAGG")]
    end

    subgraph "Visualization Layer"
        GR["ims-grafana<br/>3 Dashboards<br/>NOC / Engineering / Capacity"]
    end

    subgraph "Alerting Layer"
        PR["ims-prometheus<br/>Metrics Scraping"]
        AM["ims-alertmanager<br/>Route & Inhibit"]
    end

    subgraph "SLA Probing"
        BB["ims-blackbox<br/>HTTP/TCP/ICMP Probes"]
    end

    S1 -->|SNMP v2c| NR
    S2 -->|SNMP v2c| NR
    S3 -->|SNMP v2c| NR
    SIM -->|SNMP v2c| NR
    NR -->|Parameterized INSERT| P
    P -->|Transaction Pool| TS
    TS -->|Read| GR
    TS -->|Scrape| PR
    PR --> AM
    BB --> PR

    style TS fill:#f3e5f5,stroke:#7b1fa2
    style GR fill:#e8f5e9,stroke:#2e7d32
    style NR fill:#e3f2fd,stroke:#1565c0
    style AM fill:#fff3e0,stroke:#e65100
```

### Component Inventory

| Component | Container | Port (Internal) | Port (External) | Purpose |
|---|---|---|---|---|
| **TimescaleDB** | `ims-timescaledb` | 5432 | — | Time-series database engine |
| **PgBouncer** | `ims-pgbouncer` | 5432 | — | Connection pooler for DB scalability |
| **Node-RED** | `ims-node-red` | 1880 | 1880 | Data pipeline & SNMP collection |
| **Grafana** | `ims-grafana` | 3000 | 3000 | Dashboard visualization |
| **Prometheus** | `ims-prometheus` | 9090 | 9090 | Metrics scraping & alerting rules |
| **Alertmanager** | `ims-alertmanager` | 9093 | 9093 | Alert routing & notification |
| **Blackbox Exporter** | `ims-blackbox` | 9115 | 9115 | HTTP/TCP/ICMP probes for SLA |
| **SNMP Simulator** | `ims-snmpsim` | 161/udp | — | Simulated server metrics for dev |

> **หมายเหตุ**: ภายใน Docker network ใช้ service name ในการเชื่อมต่อ เช่น `ims-pgbouncer:5432` ไม่ใช่ port ที่ map ไว้บน host

---

## 🔄 Data Flow Pipeline

### Stage 1: SNMP Data Collection

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Node-RED 5-Thread Parallel Walker Architecture                         │
│                                                                         │
│  ┌─────────────┐                                                        │
│  │   Inject     │ ──▶ Resolve Device Registry ──▶ ┌──────────────────┐ │
│  │  (30s cycle) │     (host, community, port)     │     Fork         │ │
│  └─────────────┘                                  │  (5 outputs)     │ │
│                                                   └──────┬───────────┘ │
│                     ┌────────────┬──────────┬─────────┬──┴──┐          │
│                     ▼            ▼          ▼         ▼     ▼          │
│              ┌──────────┐ ┌──────────┐ ┌────────┐ ┌─────┐ ┌─────┐     │
│              │CPU Walker│ │Storage   │ │Network │ │Temp │ │LDI  │     │
│              │(4 OIDs)  │ │(10 OIDs)│ │(18 OID)│ │(2)  │ │(8)  │     │
│              └────┬─────┘ └────┬─────┘ └───┬────┘ └──┬──┘ └──┬──┘     │
│                   │            │           │         │       │         │
│                   └────────────┴─────┬─────┴─────────┴───────┘         │
│                                      ▼                                 │
│                              ┌──────────────┐                          │
│                              │  SRE Parser  │                          │
│                              │(stateful,    │                          │
│                              │ per-device)  │                          │
│                              └──────┬───────┘                          │
│                                     ▼                                  │
│                              ┌──────────────┐                          │
│                              │ Batch INSERT │                          │
│                              │ (10s timer)  │                          │
│                              └──────┬───────┘                          │
│                                     ▼                                  │
│                              ┌──────────────┐                          │
│                              │ TimescaleDB  │                          │
│                              └──────────────┘                          │
└─────────────────────────────────────────────────────────────────────────┘
```

**Dual-Engine SNMP Walker:**

ระบบใช้ Dual-Engine สำหรับ SNMP data collection:

| Mode | Trigger | Method | Performance |
|---|---|---|---|
| **Development** | `NODE_ENV != production` | `session.get()` (individual OID queries) | ง่ายต่อการ debug |
| **Production** | `NODE_ENV = production` | `session.subtree()` (bulk walk) | เร็วกว่า 80% สำหรับ OID จำนวนมาก |

```javascript
// Dual-Engine Pattern
const prodMode = (typeof env !== 'undefined' && env.get && env.get('NODE_ENV') === 'production');

if (prodMode) {
    session.subtree('1.3.6.1.2.1.25.2.3.1', 20, onFeed, onComplete);  // Bulk walk
} else {
    session.get(oids, callback);  // Individual GET
}
```

**Walker Details:**

| Walker | OIDs | Data Collected | Interval |
|---|---|---|---|
| **CPU Walker** | `.1.3.6.1.2.1.25.3.3.1.2.{1-4}` | CPU load per core (%) | 30s |
| **Storage Walker** | `.1.3.6.1.2.1.25.2.3.1.*` | Disk description, total, used, type | 30s |
| **Network Walker** | `.1.3.6.1.2.1.31.1.1.1.*` + sysUpTime | RX/TX bytes, errors, drops, status (64-bit counters) | 30s |
| **Temperature Walker** | `.1.3.6.1.4.1.2021.13.16.2.1.7.1` | CPU temperature (°C) | 30s |
| **LDI Walker** | `.1.3.6.1.4.1.9999.1.*` + WiFi `.9999.2.*` | Manufacturing telemetry (throughput, PE, JE, humidity, power, vibration, WiFi RSSI/SNR) | 30s |

**Counter Wrap Handling:**

ระบบจัดการ 32-bit และ 64-bit counter overflow อัตโนมัติ:

```javascript
// Counter wraparound detection
function calcDelta(curr, prev) {
    let diff = curr - prev;
    if (diff < 0) {
        diff += (Math.abs(diff) > 2147483648) ? 18446744073709552000 : 4294967296;
    }
    return diff;
}

// HardCap 40 Gbps prevents unrealistic values
function calcMbps(diffBytes, elapsedSec) {
    if (elapsedSec <= 0) return 0;
    const mbps = Number(((diffBytes * 8) / (elapsedSec * 1000000)).toFixed(2));
    if (mbps > 40000 || mbps < 0) return 0;  // Cap at 40 Gbps
    return mbps;
}
```

**Zero-Data Loss Mechanism:**

```
┌─────────────────────────────────────────────────────────────────────┐
│  Node-RED Retry Buffer Architecture                                  │
│                                                                      │
│  db_insert ──▶ catch_db_insert ──▶ retry_store (max 5)              │
│       ▲              │                    │                          │
│       │              ▼                    ▼                          │
│       │         retry_delay (5s) ──▶ retry_rebuild                  │
│       │                                                     │        │
│       └─────────────────────────────────────────────────────┘        │
│                                                                      │
│  Flow Context: db_retry_queue stores pending retries                 │
│  Guarantees: Zero data loss on transient DB failures                 │
└─────────────────────────────────────────────────────────────────────┘
```

### Stage 2: Data Processing (Parser)

Parser function ทำหน้าที่:

1. **Fail-safe identity**: `safeStr()` ป้องกัน SQL injection
2. **Two-pass parsing**: อ่านชื่อ column ก่อน แล้ว map ค่า (แก้ race condition)
3. **Per-interface Mbps calculation**: `delta bytes × 8 / (elapsedSec × 1000000)`
4. **LDI ÷100 precision**: แปลง centidegrees/centipercent เป็นค่าจริง
5. **HardCap 40 Gbps**: ป้องกัน counter overflow → drop to 0
6. **Memory cleanup**: `msg.payload = null` + `flatData.length = 0`

### Stage 3: Storage (TimescaleDB)

```sql
-- V2 Normalized Schema: 3 separate hypertables per domain

-- System metrics (CPU, RAM, Disk, Temp)
CREATE TABLE public.sys_metrics (
    "time"           TIMESTAMPTZ NOT NULL,
    device_id        TEXT NOT NULL REFERENCES public.devices(device_id) ON DELETE CASCADE,
    cpu_cores        INTEGER,
    cpu_load_percent DOUBLE PRECISION,
    ram_total_mb     DOUBLE PRECISION,
    ram_used_mb      DOUBLE PRECISION,
    disk_total_gb    DOUBLE PRECISION,
    disk_used_gb     DOUBLE PRECISION,
    temp_c           DOUBLE PRECISION
);
SELECT create_hypertable('public.sys_metrics', 'time');

-- Network metrics (per-interface row)
CREATE TABLE public.net_metrics (
    "time"      TIMESTAMPTZ NOT NULL,
    device_id   TEXT NOT NULL REFERENCES public.devices(device_id) ON DELETE CASCADE,
    iface_name  TEXT NOT NULL,
    rx_mbps     DOUBLE PRECISION DEFAULT 0,
    tx_mbps     DOUBLE PRECISION DEFAULT 0,
    rx_errors   BIGINT DEFAULT 0,
    tx_errors   BIGINT DEFAULT 0,
    rx_drops    BIGINT DEFAULT 0,
    tx_drops    BIGINT DEFAULT 0,
    status      TEXT DEFAULT 'UP'
);
SELECT create_hypertable('public.net_metrics', 'time');

-- LDI manufacturing metrics
CREATE TABLE public.ldi_metrics (
    "time"          TIMESTAMPTZ NOT NULL,
    device_id       TEXT NOT NULL REFERENCES public.devices(device_id) ON DELETE CASCADE,
    throughput      DOUBLE PRECISION DEFAULT 0,
    temperature     DOUBLE PRECISION DEFAULT 0,
    humidity        DOUBLE PRECISION DEFAULT 0,
    pressure        DOUBLE PRECISION DEFAULT 0,
    joule_effect    DOUBLE PRECISION DEFAULT 0,
    power_watt      DOUBLE PRECISION DEFAULT 0,
    vibration       DOUBLE PRECISION DEFAULT 0,
    wifi_rssi       INTEGER DEFAULT 0,
    wifi_snr        INTEGER DEFAULT 0
);
SELECT create_hypertable('public.ldi_metrics', 'time');
```

**Continuous Aggregates** (auto-refresh every 30 min):

```sql
-- Hourly system summary
CREATE MATERIALIZED VIEW public.sys_hourly
WITH (timescaledb.continuous) AS
SELECT time_bucket('1 hour', "time") AS bucket, device_id,
    AVG(cpu_load_percent) AS avg_cpu, MAX(cpu_load_percent) AS max_cpu,
    AVG(ram_used_mb) AS avg_ram_used, AVG(ram_total_mb) AS avg_ram_total,
    AVG(disk_used_gb) AS avg_disk_used, AVG(disk_total_gb) AS avg_disk_total,
    MAX(temp_c) AS max_temp
FROM public.sys_metrics GROUP BY bucket, device_id;
```

---

## 📈 Monitoring Strategy

### What We Monitor

| Category | Metrics | Threshold | Alert Severity |
|---|---|---|---|
| **CPU** | `cpu_load_percent` | Warning > 80%, Critical > 95% | Warning/Critical |
| **Memory** | `ram_used_mb / ram_total_mb` | Warning > 85%, Critical > 95% | Warning/Critical |
| **Disk** | `disk_used_gb / disk_total_gb` | Warning > 80%, Critical > 95% | Warning/Critical |
| **Network** | `net_rx_errors`, `net_rx_drops` | Any errors/drops | Warning |
| **Interface** | `net_if_status` (1=UP, 2=DOWN) | Status = DOWN | Critical |
| **Temperature** | `temp_c` | Warning > 80°C, Critical > 90°C | Warning/Critical |
| **Throughput** | `ldi_throughput` | Z-Score > 2σ Warning, > 3σ Critical | Warning/Critical |
| **Vibration** | `ldi_vibration` | Z-Score > 2σ Warning, > 3σ Critical | Warning/Critical |
| **SLA** | Blackbox HTTP/TCP probes | Any probe DOWN | Critical |

### Monitoring Intervals

| Component | Interval | Timeout | Retries |
|---|---|---|---|
| **SNMP Polling** | 30 seconds | 10 seconds | 2 |
| **Prometheus Scrape** | 30 seconds | 10 seconds | — |
| **Blackbox Probes** | 30 seconds | 10 seconds | 2 |
| **Continuous Aggregate Refresh** | 1 minute | — | — |
| **Alert Evaluation** | 15 seconds | — | — |

### Health Check Endpoints

```bash
# Database
docker compose exec timescaledb pg_isready -U ims_admin -d ims

# Node-RED
curl -s http://localhost:1880/

# Grafana
curl -s http://localhost:3000/api/health

# Prometheus
curl -s http://localhost:9090/-/healthy

# Alertmanager
curl -s http://localhost:9093/-/healthy

# Blackbox Exporter
curl -s http://localhost:9115/probe
```

---

## 🚨 Alerting Pipeline

### Alert Flow

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Prometheus   │────▶│ Alert Rules  │────▶│ Alertmanager │────▶│  Webhooks    │
│  (Evaluator)  │     │  (IMS YAML)  │     │   (Router)   │     │  (LINE/Teams)│
└──────────────┘     └──────────────┘     └──────┬───────┘     └──────────────┘
                                                  │
                                          ┌───────▼───────┐
                                          │   Inhibition   │
                                          │    Rules       │
                                          └───────────────┘
```

### Alert Rules Summary

| Rule | Condition | Severity | Inhibition |
|---|---|---|---|
| **HighCPUUsage** | `avg_cpu_load > 80%` for 5m | Warning | Suppressed by InterfaceDown |
| **CriticalCPUUsage** | `avg_cpu_load > 95%` for 2m | Critical | Suppresses Warning |
| **HighMemoryUsage** | `ram_usage > 85%` for 5m | Warning | Suppressed by InterfaceDown |
| **DiskSpaceLow** | `disk_usage > 80%` for 10m | Warning | — |
| **DiskSpaceCritical** | `disk_usage > 95%` for 5m | Critical | Suppresses Warning |
| **InterfaceDown** | `net_if_status == 2` for 1m | Critical | Suppresses all network warnings + CPU/RAM/Thermal warnings |
| **HighTemperature** | `temp_c > 80°C` for 5m | Warning | Suppressed by InterfaceDown |
| **CriticalTemperature** | `temp_c > 90°C` for 2m | Critical | Suppresses Warning |
| **ServiceDown** | Blackbox probe fails | Critical | Suppresses all warnings on same machine |
| **NodeREDDown** | Node-RED health fails | Critical | Suppresses TelemetryGap |
| **TelemetryGap** | No data for 3 minutes | Warning | Suppressed by NodeREDDown |
| **LDIThroughputCritical** | Z-Score > 3σ | Critical | — |
| **LDIVibrationCritical** | Z-Score > 3σ | Critical | — |
| **PredictiveDiskFull** | Linear regression → full in 7 days | Warning | — |

### Inhibition Rules (Alertmanager)

Critical alerts suppress lower-severity alerts เพื่อลบ noise:

```yaml
# Alertmanager v0.27.0 syntax
inhibit_rules:
  - target_matchers:
      - alertname = InterfaceDown
    source_matchers:
      - severity =~ "Warning|Info"
    equal: [machine]

  - target_matchers:
      - alertname = ServiceDown
    source_matchers:
      - severity =~ "Warning|Info"
    equal: [machine]

  - target_matchers:
      - severity = Critical
    source_matchers:
      - severity =~ "Warning|Info"
    equal: [alertname, machine]
```

### Notification Channels

| Channel | Format | Use Case |
|---|---|---|
| **LINE Notify** | `application/x-www-form-urlencoded` | Mobile notification for on-call team |
| **MS Teams** | MessageCard JSON | Team channel notification |
| **Debug** | Console output | Development troubleshooting |

**LINE Notify Format:**
```
POST https://notify-api.line.me/api/notify
Headers: Authorization: Bearer <token>
Body: message=<encoded alert text>
```

**MS Teams Format:**
```json
{
  "@type": "MessageCard",
  "themeColor": "FF0000",
  "sections": [{
    "text": "🚨 **Alert: InterfaceDown**\nMachine: server-01\nSeverity: Critical"
  }]
}
```

---

## 🗄️ Database Schema

### Core Tables (V2 Normalized Schema)

| Table | Type | Purpose |
|---|---|---|
| `devices` | Regular Table | Device registry (11 cols: device_id, hostname, ip_address, snmp_community, snmp_port, enabled, ...) |
| `sys_metrics` | Hypertable | System metrics: CPU, RAM, Disk, Temperature per poll cycle |
| `net_metrics` | Hypertable | Network metrics: per-interface RX/TX Mbps, errors, drops |
| `ldi_metrics` | Hypertable | LDI manufacturing: throughput, PE, JE, humidity, power, vibration |
| `sys_hourly` | Continuous Aggregate | Hourly rollup of sys_metrics |
| `net_hourly` | Continuous Aggregate | Hourly rollup of net_metrics |
| `ldi_hourly` | Continuous Aggregate | Hourly rollup of ldi_metrics |
| `alert_rules` | Regular Table | Alert rule definitions |
| `alert_history` | Regular Table | Alert event history |
| `schema_migrations` | Regular Table | Migration tracking |

### Schema Relationships

```mermaid
erDiagram
    devices ||--o{ sys_metrics : "device_id"
    devices ||--o{ net_metrics : "device_id"
    devices ||--o{ ldi_metrics : "device_id"
    sys_metrics ||--o{ sys_hourly : "time_bucket"
    net_metrics ||--o{ net_hourly : "time_bucket"
    ldi_metrics ||--o{ ldi_hourly : "time_bucket"

    devices {
        text device_id PK
        text hostname
        text ip_address
        text snmp_community
        int snmp_port
        boolean enabled
    }
    sys_metrics {
        timestamptz time
        text device_id FK
        double cpu_load_percent
        double ram_used_mb
        double disk_used_gb
        double temp_c
    }
    net_metrics {
        timestamptz time
        text device_id FK
        text iface_name
        double rx_mbps
        double tx_mbps
    }
    ldi_metrics {
        timestamptz time
        text device_id FK
        double throughput
        double temperature
        double humidity
        double power_watt
    }
```

### Key Column Types

| Column | Type | Notes |
|---|---|---|
| `time` | `TIMESTAMPTZ` | Partitioning key for hypertables (raw tables) |
| `bucket` | `TIMESTAMPTZ` | Time bucket for CAGGs (Grafana aliases as `time`) |
| `device_id` | `TEXT` | FK to `devices.device_id` (ON DELETE CASCADE) |
| `iface_name` | `TEXT` | Network interface name (net_metrics only) |

---

## 🔒 Security Architecture

### Network Security

| Control | Implementation |
|---|---|
| **Container Isolation** | Docker network bridge — services communicate via DNS |
| **No Host Port Exposure** | Internal services (PgBouncer, snmpsim) only accessible within Docker network |
| **SNMP Community** | Profile-based: `ubuntu` or `windows` snmprec files (not hardcoded) |
| **Secrets Management** | Docker secrets (`secrets/` directory, gitignored) |
| **Grafana Auth** | Basic auth with configurable admin password |

### Application Security

| Control | Implementation |
|---|---|
| **SQL Injection Prevention** | `safeStr()` escaping on all user inputs |
| **XSS Prevention** | Grafana handles output encoding |
| **Credential Rotation** | Stale `flows_cred.json` must be manually deleted after rotation |
| **CI/CD Security** | Gitleaks scanning, stub secrets for validation |

### Production Hardening

```yaml
# docker-compose.prod.yaml additions
services:
  grafana:
    environment:
      - GF_SERVER_ROOT_URL=%(protocol)s://%(domain)s/grafana/
      - GF_AUTH_DISABLE_LOGIN_FORM=false
    ports: []  # No external port — use reverse proxy

  pgbouncer:
    environment:
      - AUTH_TYPE=plain  # scram-sha-256 fails with plain-text passwords
```

---

## 🎨 Dashboard Design Standards

### Symmetrical Network Graphs (Butterfly Charts)

กราฟ Network ใช้ `axisCenteredZero: true` เพื่อแสดง RX/TX ในลักษณะ "ปีกผีเสื้อ":

```json
{
  "fieldConfig": {
    "defaults": {
      "custom": {
        "axisCenteredZero": true
      }
    },
    "overrides": [
      {
        "matcher": { "id": "byName", "options": "Download (Mbps)" },
        "properties": [{ "id": "color", "value": { "fixedColor": "#00F2FE", "mode": "fixed" } }]
      },
      {
        "matcher": { "id": "byName", "options": "Upload (Mbps)" },
        "properties": [{ "id": "color", "value": { "fixedColor": "#00FF87", "mode": "fixed" } }]
      }
    ]
  }
}
```

**SQL Pattern สำหรับ Symmetrical Display:**
```sql
-- Download (ค่าบวก)
SELECT avg_rx_mbps AS "Download (Mbps)" FROM sys_hourly

-- Upload (คูณด้วย -1 ให้ติดลบ)
SELECT (avg_tx_mbps * -1) AS "Upload (Mbps)" FROM sys_hourly
```

### LDI Quality Tolerance Box (Scatter Plot)

Panel 506 แสดง PE vs JE ใน Scatter Plot พร้อม Tolerance Box ±10µm:

```json
{
  "id": 506,
  "title": "LDI Quality Scatter (PE vs JE)",
  "type": "xychart",
  "fieldConfig": {
    "defaults": {
      "thresholds": {
        "steps": [
          { "color": "red", "value": null },
          { "color": "green", "value": -10 },
          { "color": "green", "value": 10 },
          { "color": "red", "value": null }
        ]
      },
      "thresholdsStyle": { "mode": "dashed+area" }
    },
    "overrides": [
      { "matcher": { "id": "byName", "options": "PE" }, "properties": [{ "id": "min", "value": -15 }, { "id": "max", "value": 15 }] },
      { "matcher": { "id": "byName", "options": "JE" }, "properties": [{ "id": "min", "value": -15 }, { "id": "max", "value": 15 }] }
    ]
  }
}
```

### SRE Color Convention

| Metric | Healthy | Warning | Critical |
|---|---|---|---|
| CPU | Green (#00FF87) | Orange (#FF9100) | Red (#FF003C) |
| RAM | Cyan (#00F2FE) | Orange (#FF9100) | Red (#FF003C) |
| Disk | Green (#00FF87) | Orange (#FF9100) | Red (#FF003C) |
| Network RX | Cyan (#00F2FE) | — | Red (#FF003C) |
| Network TX | Pink (#FF007F) | — | Red (#FF003C) |
| LDI | Purple (#7F00FF) | Orange (#FF9100) | Red (#FF003C) |
| Errors | — | — | Red (#FF003C) |
| Drops | — | Orange (#FF9100) | Red (#FF003C) |

---

## 📈 Scalability Considerations

### Current Capacity

| Metric | Value |
|---|---|
| **Devices Monitored** | 1000+ (simulated) |
| **Polling Interval** | 30 seconds |
| **Data Points/Hour** | ~600 per machine |
| **Storage/Hour** | ~50 KB per machine |
| **Storage/Day** | ~1.2 MB per machine |

### Scaling Roadmap

| Phase | Machines | Changes Required |
|---|---|---|
| **Current** | 1-1000+ | Standalone Docker Compose |
| **Phase 2** | 5-50 | PgBouncer tuning, connection pooling |
| **Phase 3** | 50-500 | Read replicas, continuous aggregate optimization |
| **Phase 4** | 500-1000+ | Horizontal scaling, Kubernetes migration |

### Performance Tuning

```sql
-- Increase shared_buffers for larger datasets
ALTER SYSTEM SET shared_buffers = '2GB';

-- Optimize work_mem for complex queries
ALTER SYSTEM SET work_mem = '256MB';

-- Enable parallel query execution
ALTER SYSTEM SET max_parallel_workers_per_gather = 4;
```

---

## 📚 References

| Resource | Link |
|---|---|
| TimescaleDB Documentation | https://docs.timescale.com/ |
| Node-RED Documentation | https://nodered.org/docs/ |
| Grafana Documentation | https://grafana.com/docs/ |
| Prometheus Documentation | https://prometheus.io/docs/ |
| Alertmanager Documentation | https://prometheus.io/docs/alerting/latest/configuration/ |

---

<div align="center">

**IMS System Architecture — Version 1.0**

*Designed for Enterprise-Grade Infrastructure Monitoring*

</div>
