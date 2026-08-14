# ️ IMS Visual Architecture Diagrams

> [!NOTE]
>
> > These diagrams are generated dynamically using Mermaid.js. They provide a visual, structural overview of the IMS ecosystem.

---

## 1. System Context Diagram (C4 Model - Level 1)

This diagram shows how external actors interact with the IMS system.

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#00F2FE', 'primaryBorderColor': '#10B981', 'lineColor': '#00F2FE', 'secondaryColor': '#0f172a', 'tertiaryColor': '#0f172a', 'clusterBkg': '#030407', 'clusterBorder': '#00F2FE'}}}%%
C4Context
 title System Context diagram for IMS

 Person(admin, "NOC Operator", "Monitors system health and responds to alarms.")
 Person(engineer, "Process Engineer", "Analyzes manufacturing yield and correlates with telemetry.")

 System_Ext(switches, "Juniper EX Switches", "Network infrastructure providing SNMP telemetry.")
 System_Ext(servers, "Linux Server Fleet", "Compute infrastructure providing SNMP telemetry.")
 System_Ext(ldi, "LDI Manufacturing Machines", "Physical PCB processing hardware providing HTTP/JSON telemetry.")
 System_Ext(line, "LINE Messaging API / MS Teams", "External notification systems for alarms -- delivery requires operator-configured credentials (LINE_CHANNEL_ACCESS_TOKEN, TEAMS_WEBHOOK_URL), absent by design in this repo's .env.")

 System(ims, "IMS (Industrial Monitoring System)", "The core ingestion, storage, and visualization engine.")

 Rel(admin, ims, "Views NOC dashboards", "HTTPS")
 Rel(engineer, ims, "Views Analytics dashboards", "HTTPS")

 Rel(ims, switches, "Polls via SNMP v2c", "UDP 161")
 Rel(ims, servers, "Polls via SNMP v2c", "UDP 161")
 Rel(ims, ldi, "Ingests JSON payloads", "HTTP")

 Rel(ims, line, "Sends Critical Alerts", "HTTPS")
```

---

## 2. Container Diagram (C4 Model - Level 2)

This diagram breaks down the IMS system into its deployable Docker containers.

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#00F2FE', 'primaryBorderColor': '#10B981', 'lineColor': '#00F2FE', 'secondaryColor': '#0f172a', 'tertiaryColor': '#0f172a', 'clusterBkg': '#030407', 'clusterBorder': '#00F2FE'}}}%%
C4Container
 title Container diagram for IMS

 System_Ext(devices, "Edge Devices", "Servers, Switches, LDI")

 System_Boundary(c1, "IMS Docker Stack") {
 Container(nodered, "Node-RED", "Node.js", "Handles sequential bulk ingestion, parsing, and circuit breaking.")
 Container(pgbouncer, "PgBouncer", "C", "Connection pooling for TimescaleDB to prevent connection starvation.")
 ContainerDb(timescale, "TimescaleDB", "PostgreSQL", "Stores hyper-scale time-series data and Continuous Aggregates (CAGGs).")
 Container(grafana, "Grafana", "Go", "Provides the Cyberpunk HUD visualization layer.")
 Container(prometheus, "Prometheus", "Go", "Scrapes metrics from TimescaleDB and evaluates alert rules.")
 Container(alertmanager, "Alertmanager", "Go", "Handles alert deduplication, inhibition, and routing.")
 }

 Rel(devices, nodered, "Telemetry (SNMP/HTTP)")
 Rel(nodered, pgbouncer, "Batch INSERTs", "TCP 5432")
 Rel(pgbouncer, timescale, "SQL Transactions", "TCP 5432")
 Rel(grafana, timescale, "SQL Queries", "TCP 5432")
 Rel(prometheus, timescale, "Scrape /metrics", "HTTP")
 Rel(prometheus, alertmanager, "Fires Alerts", "HTTP")
```

---

## 3. Dynamic Flow Diagram: The Circuit Breaker Pattern

This diagram explains the fault-tolerance mechanism when a server goes offline.

```mermaid
%%{init: {'theme': 'base', 'themeVariables': { 'primaryColor': '#1e293b', 'primaryTextColor': '#00F2FE', 'primaryBorderColor': '#10B981', 'lineColor': '#00F2FE', 'secondaryColor': '#0f172a', 'tertiaryColor': '#0f172a', 'clusterBkg': '#030407', 'clusterBorder': '#00F2FE'}}}%%
sequenceDiagram
 participant Timer as <img src="docs/assets/icons/clock.svg" width="18" height="18" align="center" /> Node-RED Inject (30s)
 participant Walker as ️ SNMP Walker
 participant State as Context State
 participant Device as Edge Server (Offline)

 Timer->>Walker: Trigger poll cycle
 Walker->>State: Check device status

 alt Status == OPEN (Tripped)
  State-->>Walker: Abort poll (Protect Network)
 else Status == CLOSED (Healthy)
  Walker->>Device: SNMP Bulk Request
  Device--xWalker: Timeout (No Response)
  Walker->>State: Increment Error Count

  alt Error Count == 2
   State->>State: Transition to OPEN state
   State->>State: Emit "Node Offline" metric to DB
  end
 end

 note over Timer,Device: After 2 minutes, State transitions to HALF_OPEN to test recovery.
```
