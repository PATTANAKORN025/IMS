<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

<div align="center">
  <h1>IMS Visual Architecture & Topology Reference</h1>
  <p><b>Comprehensive C4 models, dynamic sequence flows, gateway security topologies, and storage hierarchies for the Industrial Monitoring System</b></p>
  <p>
    <a href="ARCHITECTURE_DIAGRAM.md">English</a> |
    <a href="../../th/docs/architecture/ARCHITECTURE_DIAGRAM.md">ไทย</a> |
    <a href="../../zh-CN/docs/architecture/ARCHITECTURE_DIAGRAM.md">简体中文</a>
  </p>
</div>

---

> [!TIP]
> **Raw Mermaid Definition**: For standalone rendering in IDE plugins or CI pipelines, the raw Mermaid definition is available at [ims-system-architecture.mermaid](ims-system-architecture.mermaid).

## 1. System Context Diagram (C4 Model - Level 1)

The System Context diagram illustrates how human actors, physical manufacturing equipment, enterprise IT servers, network switches, and external notification platforms interact with the core IMS telemetry engine.

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#00F2FE', 'primaryBorderColor': '#10B981', 'lineColor': '#00F2FE', 'secondaryColor': '#0f172a', 'tertiaryColor': '#0f172a', 'clusterBkg': '#030407', 'clusterBorder': '#00F2FE'}}}%%
C4Context
 title System Context Diagram for Industrial Monitoring System (IMS)

 Person(noc_op, "NOC Operator", "Monitors enterprise infrastructure health, server capacity, and network interface alarms.")
 Person(proc_eng, "Process Engineer", "Analyzes LDI manufacturing yield, Cpk distributions, and performs Root Cause Analysis (RCA).")
 Person(drill_eng, "Drilling Specialist", "Investigates CNC spindle vibration anomalies, hit counts, and tool wear life cycles.")
 Person(vcp_tech, "Plating Technician", "Monitors VCP line speed, bath temperatures, and rectifier current densities.")

 System_Ext(ldi_mach, "LDI Manufacturing Machines", "High-precision Laser Direct Imaging exposure hardware delivering JSON telemetry.")
 System_Ext(cnc_drill, "CNC Drilling Machines", "Mechanical drilling fleet logging spindle rpm, feed rates, and machine events to eap_backup.")
 System_Ext(vcp_lines, "VCP Plating Lines", "Vertical Continuous Plating lines logging chemical bath telemetry and conveyor line speeds.")
 System_Ext(servers, "Linux Server Fleet", "Production compute servers providing CPU, memory, and disk telemetry via SNMP v2c.")
 System_Ext(switches, "Juniper EX Switches", "Industrial Ethernet switches providing interface counters and optical power via SNMP.")
 System_Ext(line_teams, "LINE / MS Teams", "External incident dispatch channels notifying engineers of critical factory excursions.")

 System(ims, "IMS Platform", "Central telemetry ingestion, connection-pooled TimescaleDB storage, and 22 Grafana HUD dashboards.")

 Rel(noc_op, ims, "Observes NOC and capacity dashboards", "HTTP / Port 3000")
 Rel(proc_eng, ims, "Inspects LDI Command Center and SPC analytics", "HTTP / Port 3000")
 Rel(drill_eng, ims, "Analyzes CNC fleet and anomaly dashboards", "HTTP / Port 3000")
 Rel(vcp_tech, ims, "Monitors VCP operations and real-time wall", "HTTP / Port 3000")

 Rel(ldi_mach, ims, "Streams manufacturing telemetry", "HTTP POST /ldi-telemetry")
 Rel(cnc_drill, ims, "Feeds event logs & machine status", "PostgreSQL / eap_backup")
 Rel(vcp_lines, ims, "Feeds bath parameters & sensor logs", "PostgreSQL / eap_backup")
 Rel(ims, servers, "Polls host performance metrics", "SNMP v2c / UDP 161")
 Rel(ims, switches, "Polls interface octets & error counters", "SNMP v2c / UDP 161")
 Rel(ims, line_teams, "Dispatches critical severity incidents", "HTTPS Webhooks")
```

---

## 2. Container Diagram (C4 Model - Level 2)

This diagram details all 16 services within the IMS Docker Compose topology, highlighting inter-container networking, host port bindings, and data paths.

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#00F2FE', 'primaryBorderColor': '#10B981', 'lineColor': '#00F2FE', 'secondaryColor': '#0f172a', 'tertiaryColor': '#0f172a', 'clusterBkg': '#030407', 'clusterBorder': '#00F2FE'}}}%%
C4Container
 title Container Topology Diagram for IMS (16 Services)

 Person(user, "Engineers & Operators", "Accesses dashboards, twin, and alarm APIs via browser.")
 System_Ext(ext_dev, "Factory Edge Equipment", "LDI, CNC Drilling, VCP, Servers, Switches.")

 System_Boundary(c1, "IMS Docker Networks (ims-internal, ims-monitoring, ims-docker-api)") {
   Container(proxy, "Reverse Proxy (ims-proxy)", "Nginx Alpine", "Unified ingress, rate limiting, and session auth gate.")
   Container(grafana, "Grafana 13 (ims-grafana)", "Go", "Hosts 22 Cyberpunk HUD dashboards across 4 operational domains.")
   Container(alarm_api, "Alarm API (ims-alarm-api)", "Node.js Express", "Governs alarm lifecycle transitions (ack/resolve) on public.ldi_alarm_lifecycle.")
   Container(twin_3d, "Factory Twin 3D (ims-factory-twin-3d)", "Node.js Express", "Read-only Floor 1 digital twin spatial rendering.")
   Container(renderer, "Image Renderer (ims-grafana-renderer)", "Chromium", "Generates server-side PNG snapshots for alerts and scheduled reports.")

   Container(nodered, "Ingestion Pipeline (ims-node-red)", "Node.js / Node-RED", "Parallel walkers, telemetry parser, buffer queue, and alerting router.")
   Container(pgbouncer, "Connection Pooler (ims-pgbouncer)", "C / PgBouncer", "Transaction pooling on port 5432 with SCRAM-SHA-256 auth.")
   ContainerDb(timescaledb, "TimescaleDB (ims-timescaledb)", "PostgreSQL 16 + TimescaleDB", "Hypertables, continuous aggregates, alarm tables, and eap_backup DB.")

   Container(prometheus, "Prometheus (ims-prometheus)", "Go", "Scrapes service metrics and evaluates alerting rules.")
   Container(alertmanager, "Alertmanager (ims-alertmanager)", "Go", "Deduplicates, groups, and routes alert events to Node-RED.")
   Container(blackbox, "Blackbox Probes (ims-blackbox)", "Go", "Probes HTTP/TCP/ICMP endpoints to verify platform SLA.")
   Container(snmpsim, "SNMP Simulator (ims-snmpsim)", "Python", "Simulates Linux servers and network switches for local development.")
   Container(archiver, "Observability Archiver (ims-observability-archiver)", "Bash", "Archives telemetry snapshots and container metrics to ops-logs.")
   Container(db_migrate, "Migration Runner (ims-db-migrate)", "Bash / psql", "One-shot container applying database migrations (001 to 091).")
   Container(sockproxy, "Docker Socket Proxy (ims-docker-socket-proxy)", "HAProxy / Alpine", "Restricts Docker daemon access on internal ims-docker-api.")
   Container(pgadmin, "PgAdmin 4 (ims-pgadmin4)", "Python", "Web database management console (host port 127.0.0.1:5050).")
 }

 Rel(user, proxy, "Accesses UI and APIs", "HTTP / Port 3000")
 Rel(ext_dev, proxy, "HTTP telemetry", "POST /ldi-telemetry")
 Rel(nodered, ext_dev, "Polls SNMP telemetry", "UDP 161")
 Rel(nodered, snmpsim, "Polls mock SNMP devices", "UDP 161")

 Rel(proxy, grafana, "Proxies UI & Grafana APIs", "HTTP :3000")
 Rel(proxy, alarm_api, "Proxies /alarm-api/* (Auth Checked)", "HTTP :4000")
 Rel(proxy, twin_3d, "Proxies /factory-twin-3d/* (Auth Checked)", "HTTP :4100")
 Rel(proxy, nodered, "Proxies /ldi-telemetry & /inject", "HTTP :1880")
 Rel(proxy, grafana, "Internal session verify (/auth-check)", "HTTP :3000")

 Rel(grafana, renderer, "Requests panel PNG render", "HTTP :8081")
 Rel(grafana, pgbouncer, "Queries CAGGs and views", "TCP :5432")
 Rel(grafana, timescaledb, "Queries eap_backup (drilling-timescaledb)", "TCP :5432")
 Rel(alarm_api, pgbouncer, "Updates alarm status (alarm_api_writer)", "TCP :5432")
 Rel(nodered, pgbouncer, "Batch INSERTs telemetry (nodered_writer)", "TCP :5432")
 Rel(pgbouncer, timescaledb, "Transaction connections (SCRAM)", "TCP :5432")
 Rel(db_migrate, timescaledb, "Applies schema migrations 001-091", "TCP :5432")
 Rel(pgadmin, timescaledb, "Database administration", "TCP :5432")

 Rel(prometheus, nodered, "Scrapes pipeline metrics", "HTTP :1880/metrics")
 Rel(prometheus, alertmanager, "Dispatches alerts", "HTTP :9093")
 Rel(prometheus, blackbox, "Executes HTTP/TCP/ICMP probes", "HTTP :9115")
 Rel(blackbox, timescaledb, "Probes TCP connect :5432", "TCP :5432")
 Rel(blackbox, pgbouncer, "Probes TCP connect :5432", "TCP :5432")
 Rel(alertmanager, nodered, "POSTs to /alert-webhook", "HTTP :1880")
 Rel(grafana, nodered, "Native alerts to /alert-webhook", "HTTP :1880")

 Rel(archiver, sockproxy, "Reads Docker metrics & events", "HTTP :2375 (ims-docker-api)")
```

---

## 3. Component Diagram: Node-RED Ingestion Pipeline (C4 Model - Level 3)

Details the internal components and data flow within the `ims-node-red` ingestion container:

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#00F2FE', 'primaryBorderColor': '#10B981', 'lineColor': '#00F2FE', 'secondaryColor': '#0f172a', 'tertiaryColor': '#0f172a', 'clusterBkg': '#030407', 'clusterBorder': '#00F2FE'}}}%%
flowchart TD
  subgraph IngressPoints ["Ingestion Triggers & Endpoints"]
    TMR["Inject Timer (Every 30s)"]
    HTTP_LDI["POST /ldi-telemetry\n(Ingress via Nginx)"]
    HTTP_INJ["POST /inject\n(Generic Metrics)"]
    AM_HOOK["POST /alert-webhook\n(Prometheus / Grafana Alerts)"]
  end

  subgraph SplitFlows ["Split Flow Modules (nodered_data/flows/)"]
    subgraph FlowIngest ["ingestion.json"]
      REG["Device Registry Cache\n(Reloads from public.devices every 5m)"]
      CB["Circuit Breaker Engine\n(State: CLOSED / OPEN / HALF_OPEN)"]
      FORK["fork_5_ways Walker Dispatch\n(CPU, Net, Storage, Temp, LDI)"]
      PARSER["sre_parser v10\n(Per-device context, O(N) parsing)"]
      BATCH_SNMP["Batch SQL Builder\n(INSERT INTO public.sys_metrics & net_metrics...)"]
    end

    subgraph FlowLdiIngest ["ldi_ingestion.json"]
      AUTH_CHK["API Key Validator\n(Matches INGEST_API_KEY)"]
      SCHEMA_VAL["JSON Array Schema Validator\n(22-field structural assertion)"]
      STAGE_WRITE["Write-Ahead Staging\n(INSERT INTO public.ingest_staging)"]
      LDI_WRITE["Batch Hypertable Writer\n(INSERT INTO public.ldi_data)"]
      STAGE_DEL["Delete Staged Batch\n(DELETE FROM public.ingest_staging)"]
      GC["Explicit Garbage Collection\n(flatData.length=0, msg.payload=null)"]
    end

    subgraph FlowSim ["ldi_simulator.json & ldi_alarm_simulator.json"]
      SIM_LDI["Live Telemetry Simulator\n(OU Process, 10 Machines)"]
      SIM_ALARM["Live Alarm Replay Engine\n(Excursion evaluation & injection)"]
    end

    subgraph FlowAlerting ["alerting.json"]
      MSG_FMT["Notification Card Formatter\n(Builds JSON & Adaptive Cards)"]
      LINE_API["LINE Messaging API Sender\n(Push Message with Auth Token)"]
      TEAMS_API["MS Teams Webhook Sender\n(POST Adaptive Card)"]
    end
  end

  subgraph PersistenceTier ["Persistence Tier"]
    PGB["PgBouncer (:5432)\nTransaction Pooling | SCRAM-SHA-256"]
    TSDB[("TimescaleDB (:5432)\npublic.sys_metrics & net_metrics\npublic.ldi_data\npublic.ingest_staging")]
  end

  TMR --> REG --> CB --> FORK --> PARSER --> BATCH_SNMP --> PGB
  HTTP_LDI --> AUTH_CHK --> SCHEMA_VAL --> STAGE_WRITE --> LDI_WRITE --> STAGE_DEL --> GC
  LDI_WRITE --> PGB
  STAGE_WRITE --> PGB
  STAGE_DEL --> PGB
  HTTP_INJ --> SCHEMA_VAL

  SIM_LDI -->|"Internal POST"| HTTP_LDI
  SIM_ALARM --> PGB

  PGB --> TSDB

  AM_HOOK --> MSG_FMT
  MSG_FMT --> LINE_API
  MSG_FMT --> TEAMS_API
```

---

## 4. High-Throughput Manufacturing Telemetry Sequence Flow

Demonstrates the path of manufacturing telemetry from the physical exposure machine into continuous analytical views:

```mermaid
sequenceDiagram
  autonumber
  participant Machine as LDI Exposure Machine
  participant Proxy as Nginx Gateway (ims-proxy)
  participant NodeRed as Ingestion Engine (ims-node-red)
  participant PgBouncer as PgBouncer (:5432)
  participant TimescaleDB as TimescaleDB (:5432)
  participant Grafana as Grafana Dashboard (:3000)

  Machine->>Proxy: POST /ldi-telemetry (JSON array + X-API-Key)
  Proxy->>Proxy: Apply rate limiting (rate=50r/s burst=100 nodelay)
  Proxy->>NodeRed: Forward payload to internal :1880/ldi-telemetry
  NodeRed->>NodeRed: Validate API key & array schema (22 fields)

  alt Validation Failure
    NodeRed-->>Proxy: 400 Bad Request ("Payload must be a JSON array")
    Proxy-->>Machine: 400 Bad Request
  else Validation Success
    NodeRed->>PgBouncer: Write-ahead staging: INSERT INTO public.ingest_staging
    PgBouncer->>TimescaleDB: Write staging record
    alt Staging DB Failure
      NodeRed-->>Proxy: 503 Service Unavailable ("Staging failed, batch not accepted")
      Proxy-->>Machine: 503 Service Unavailable
    else Staging DB Success
      NodeRed->>PgBouncer: Batch INSERT INTO public.ldi_data (1d chunk)
      PgBouncer->>TimescaleDB: Write into hypertable public.ldi_data
      alt Batch Insert Failure
        NodeRed-->>Proxy: 502 Bad Gateway (Staged row retained for retry)
        Proxy-->>Machine: 502 Bad Gateway
      else Batch Insert Success
        NodeRed->>PgBouncer: DELETE FROM public.ingest_staging WHERE id = staged_id
        NodeRed->>NodeRed: Explicit GC (flatData.length = 0, msg.payload = null)
        NodeRed-->>Proxy: 200 OK {"status": "success", "inserted": count}
        Proxy-->>Machine: 200 OK
      end
    end
  end

  Note over TimescaleDB: Continuous Aggregate policy triggers
  TimescaleDB->>TimescaleDB: Materialize rollups into public.ldi_data_15m

  Grafana->>PgBouncer: SELECT bucket AS time, avg_temperature FROM ldi_data_15m
  PgBouncer->>TimescaleDB: Execute analytical query
  TimescaleDB-->>Grafana: Return sub-second aggregated rows
  Grafana-->>Grafana: Render Cyberpunk HUD time-series curve
```

---

## 5. Alarm Lifecycle & Deterministic State Machine Sequence Flow

Illustrates the end-to-end operational flow of an alarm event from detection to verified engineering resolution:

```mermaid
sequenceDiagram
  autonumber
  actor Operator as NOC Operator
  actor Engineer as Maintenance Engineer
  participant Browser as Browser Client
  participant Proxy as Nginx Gateway (:3000)
  participant AlarmAPI as Alarm API (ims-alarm-api :4000)
  participant DB as TimescaleDB (public.ldi_alarm_lifecycle)

  Note over DB: Telemetry engine records excursion (State: OPEN)

  Operator->>Browser: Opens "IMS LDI - Alarm Console"
  Browser->>Proxy: GET /d/ims-ldi-alarm-console
  Proxy->>Browser: Serve dashboard with active OPEN alarms

  Operator->>Browser: Clicks "Acknowledge" on Alarm LOG-10001
  Browser->>Proxy: POST /alarm-api/alarms/ack (with session cookie)
  Proxy->>Proxy: Sub-request GET /auth-check -> Grafana /api/user (200 OK)
  Proxy->>AlarmAPI: Forward POST /alarms/ack {"logdate_ms": 1790568000000, "logid": "LOG-10001"}
  AlarmAPI->>DB: UPDATE ldi_alarm_lifecycle SET status='ACKNOWLEDGED', acknowledged_by=session.user WHERE status='OPEN'
  DB-->>AlarmAPI: Row updated (1 row returned)
  AlarmAPI-->>Proxy: 200 OK (Updated JSON record)
  Proxy-->>Browser: 200 OK (Dashboard updates UI status to Amber)

  Note over Engineer: Engineer inspects machine, cleans optical filter
  Engineer->>Browser: Clicks "Resolve" with corrective action note
  Browser->>Proxy: POST /alarm-api/alarms/resolve {"logdate_ms": 1790568000000, "logid": "LOG-10001", "resolution_note": "Replaced filter"}
  Proxy->>Proxy: Sub-request GET /auth-check (200 OK)
  Proxy->>AlarmAPI: Forward POST /alarms/resolve
  AlarmAPI->>DB: UPDATE ldi_alarm_lifecycle SET status='RESOLVED', resolved_by=session.user, resolution_note='...' WHERE status IN ('OPEN', 'ACKNOWLEDGED')
  DB-->>AlarmAPI: Row updated (1 row returned)
  AlarmAPI-->>Proxy: 200 OK (Updated JSON record)
  Proxy-->>Browser: 200 OK (Dashboard marks alarm RESOLVED in Green)
```

---

## 6. SNMP Ingestion Fault Tolerance: The Circuit Breaker Pattern

Protects network switches from query amplification and connection collapse when edge hardware becomes unresponsive:

```mermaid
sequenceDiagram
  autonumber
  participant Timer as Node-RED Scheduler (Every 30s)
  participant Walker as SNMP Bulk Walker
  participant Breaker as Circuit Breaker State
  participant Target as Edge Device (Unresponsive)
  participant DB as TimescaleDB (circuit_breaker_events)

  Timer->>Walker: Trigger scheduled poll cycle
  Walker->>Breaker: Query device state for target "SW-CORE-01"

  alt Breaker State is CLOSED (Healthy)
    Walker->>Target: Dispatch SNMP GETBULK request (UDP 161)
    Target--xWalker: Timeout (No response after 5000ms)
    Walker->>Breaker: Register poll failure (failureCount++)

    alt failureCount < 2
      Breaker-->>Walker: State remains CLOSED (Retry next cycle)
    else failureCount >= 2
      Breaker->>Breaker: Transition State -> OPEN (Trip breaker)
      Breaker->>DB: Record Node Status = OFFLINE (Immediate zero-value telemetry)
      Note over Breaker: Start 300s (5-minute) cooldown probe timer
    end

  else Breaker State is OPEN (Tripped)
    Breaker-->>Walker: Suppress poll (Protect edge network from packet floods)
    Note over Walker: Skip SNMP transmission - retain safe zeroed metrics

  else Cooldown Expired: Transition to HALF_OPEN (Probe Mode)
    Breaker->>Walker: Allow single lightweight SNMP probe request
    Walker->>Target: Dispatch probe GET request
    alt Probe Succeeds
      Target-->>Walker: Valid SNMP Response
      Walker->>Breaker: Reset failureCount = 0 - Transition State -> CLOSED
      Breaker->>DB: Record Node Status = ONLINE
    else Probe Fails
      Target--xWalker: Timeout
      Walker->>Breaker: Re-trip State -> OPEN - Restart 300s cooldown timer
    end
  end
```

---

## 7. TimescaleDB Telemetry Tier & Continuous Aggregates Topology

Illustrates the chunking boundaries, continuous aggregate hierarchies, and lifecycle retention policies:

```mermaid
flowchart TD
  subgraph Ingestion ["Ingestion Level"]
    RAW_LDI["public.ldi_data\n(Hypertable, 1-Day Chunks)"]
    RAW_INFRA["public.sys_metrics & net_metrics\n(Hypertables, 1-Day Chunks)"]
    RAW_ALARM["public.ldi_alarm_log\n(Hypertable, 7-Day Chunks)"]
  end

  subgraph CAGG_Tier1 ["Tier 1: High-Frequency Rollups"]
    CAGG_1M["public.ldi_data_1m\n(Refreshed every 1m, 1h window)"]
    CAGG_15M["public.ldi_data_15m\n(Refreshed every 15m)\nPowers Manufacturing & Command Center"]
  end

  subgraph CAGG_Tier2 ["Tier 2: Hourly Rollups"]
    CAGG_1H["public.ldi_data_1h & ldi_data_hourly\n(Refreshed every 1h)\nPowers SPC and Trend Visualizations"]
    INFRA_HOURLY["public.sys_hourly & net_hourly\n(Infrastructure Hourly Summaries)"]
  end

  subgraph Retention ["Retention Policies (Verified Live Database)"]
    RET_RAW["Raw Telemetry Retention: 30 Days (Infra) / 180 Days (LDI)"]
    RET_HOURLY["Hourly Aggregates Retention: 2 Years"]
    RET_ALARM["Alarm Log Retention: 365 Days"]
  end

  RAW_LDI --> CAGG_1M --> CAGG_15M --> CAGG_1H
  RAW_INFRA --> INFRA_HOURLY

  RAW_LDI -.-> RET_RAW
  RAW_INFRA -.-> RET_RAW
  RAW_ALARM -.-> RET_ALARM
  CAGG_1H -.-> RET_HOURLY
```

---

## 8. Dashboard Ecosystem & Operational Domains

The 22 provisioned Grafana dashboards are organized into 4 distinct functional domains:

```mermaid
flowchart LR
  subgraph D1 ["01. CNC Drilling (4 Dashboards)"]
    DR1["Fleet Overview"]
    DR2["Shift Production"]
    DR3["Machine Investigation"]
    DR4["Anomaly Analysis"]
  end

  subgraph D2 ["02. LDI Manufacturing (10 Dashboards)"]
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

  subgraph D3 ["03. Platform & NOC (5 Dashboards)"]
    NOC1["NOC Overview"]
    NOC2["Engineering Drill-Down"]
    NOC3["AIOps Capacity Forecast"]
    NOC4["Pipeline Ingestion Latency"]
    NOC5["Meta-Monitoring & Health"]
  end

  subgraph D4 ["04. VCP Plating (3 Dashboards)"]
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

## 9. Architectural Verification & Inspection Commands

Verify the active system architecture directly from your terminal:

```bash
# 1. Inspect all 16 containers and exposed ports
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# 2. Check PgBouncer connection pool client and server allocation
docker exec -i ims-timescaledb psql -U ims_admin -p 5432 -h ims-pgbouncer -d ims -c "SHOW POOLS;"

# 3. Inspect TimescaleDB hypertable chunk distribution and compression status
docker exec -i ims-timescaledb psql -U ims_admin -d ims -c "
SELECT hypertable_name, num_chunks, total_size, compressed_total_size
FROM timescaledb_information.hypertables
ORDER BY total_size DESC;"

# 4. Check active Continuous Aggregate refresh policies
docker exec -i ims-timescaledb psql -U ims_admin -d ims -c "
SELECT view_name, schedule_interval, max_interval_per_job
FROM timescaledb_information.continuous_aggregate_stats;"
```
