# IMS System Architecture

> Architecture Decision Records and system context for the Industrial NOC Monitoring System.

## System Context

IMS is a Docker-based monitoring stack that collects SNMP telemetry from IT infrastructure, processes it through a real-time pipeline, stores it in a time-series database, and visualizes it via Grafana dashboards with Prometheus-based alerting.

```
┌─────────────┐    SNMP v2c     ┌──────────────┐    JSON/SQL    ┌────────────┐
│  Network     │ ──────────────▸ │  Node-RED    │ ────────────▸ │ PgBouncer  │
│  Devices     │    UDP/161      │  5-Thread    │    INSERT     │ (pooling)  │
│  (55 hosts)  │                 │  Walker      │               └─────┬──────┘
└─────────────┘                 └──────────────┘                     │
                                                                     │ TCP/5432
                                                              ┌──────▼──────┐
                                                              │ TimescaleDB │
                                                              │ (PostgreSQL │
                                                              │  + hypertable)│
                                                              └──────┬──────┘
                                                                     │
                                              ┌──────────────────────┼──────────────┐
                                              │                      │              │
                                       ┌──────▼──────┐     ┌────────▼────┐  ┌───────▼──────┐
                                       │   Grafana   │     │ Prometheus  │  │   Grafana    │
                                       │ (3 dashboards)   │  + Alertmgr │  │  Dashboards  │
                                       └─────────────┘     └─────────────┘  └──────────────┘
```

### Data Flow

1. **Collection**: Node-RED polls 55 machines via SNMP v2c every 10 seconds using 5 parallel walker threads (CPU, Storage, Network, Temperature, LDI).
2. **Processing**: The AIOps Parser aggregates raw OID values into structured metrics (CPU%, RAM MB, bandwidth Mbps, temperature, LDI manufacturing data).
3. **Storage**: Metrics are inserted into TimescaleDB via PgBouncer (transaction pooling mode). Continuous Aggregates pre-compute 1-minute and 1-hour summaries.
4. **Visualization**: Grafana renders 3 dashboards — NOC Overview (fleet health), Engineering Drill-Down (per-machine), and AIOps & Capacity (forecasting + anomaly detection).
5. **Alerting**: Prometheus scrapes Node-RED metrics and blackbox probes. Alertmanager routes firing alerts to Node-RED webhooks for LINE/Teams notification.

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
- **Relational JOINs**: The system joins time-series data with relational tables (e.g., `machine_telemetry` JOIN `machines` for device registry, CAGG JOIN raw table for total capacity).
- **Continuous Aggregates**: Materialized views that auto-refresh, providing pre-computed 1-minute and 1-hour summaries without custom cron jobs.
- **Compression**: 7-day auto-compression achieves ~90% storage reduction with transparent query decompression.
- **Ecosystem**: Grafana's PostgreSQL datasource is mature and well-documented.

### ADR-002: Node-RED as Pipeline Engine

**Context**: The system needed to poll SNMP devices, parse OID responses, calculate derived metrics (bandwidth from counters), and insert into PostgreSQL.

**Decision**: Node-RED over custom Python/Go service.

**Rationale**:
- **Event-driven architecture**: Async SNMP callbacks naturally map to Node-RED's message-passing model — no thread pool management needed.
- **5-thread parallel walker**: Fork-join pattern with `msg.parts` correlation handles concurrent SNMP polls without blocking.
- **Protocol translation**: Built-in HTTP nodes receive Alertmanager webhooks and translate to LINE/Teams API calls without custom HTTP server code.
- **Flow visualization**: The pipeline is visible and editable in the Node-RED UI, making debugging and handoff straightforward.
- **Ecosystem**: `net-snmp` and `pg` npm packages provide mature SNMP and PostgreSQL clients.

### ADR-003: PgBouncer Connection Pooling

**Context**: Grafana dashboards query TimescaleDB continuously (10s refresh), while Node-RED inserts every 10s for 55 machines. Without pooling, both could exhaust PostgreSQL's `max_connections=100`.

**Decision**: PgBouncer in `transaction` pooling mode, sitting between all clients and TimescaleDB.

**Rationale**:
- **Transaction mode**: Each SQL transaction gets a fresh server connection, then returns it to the pool. This works because the pipeline uses simple INSERT statements (no prepared statements).
- **Connection reuse**: Reduces connection overhead — 200 client connections map to 20 server connections.
- **Failure isolation**: If Node-RED crashes, its connections are released without affecting Grafana queries.
- **No host port**: PgBouncer listens only on the Docker internal network (`ims-pgbouncer:5432`), never exposed to the host.

### ADR-004: Per-Machine Join Correlation via msg.parts

**Context**: Node-RED's join node must collect 5 walker responses (CPU, Storage, Network, Temp, LDI) per machine before parsing. With 55 machines polled concurrently, responses interleave unpredictably.

**Decision**: Use `msg.parts` with machine-specific IDs for join correlation.

**Rationale**:
- **Race condition prevention**: Each fork sets `msg.parts = { id: mid + "_" + timestamp, index: N, count: 5 }`. The join node groups by `msg.parts.id`, so responses from different machines never mix.
- **Timeout safety net**: Join node uses `mode: "custom"` with `timeout: "15"` seconds. If a walker fails, the group expires after 15s instead of leaking memory forever.
- **Dynamic count**: Empty `count` field causes Node-RED to read `msg.parts.count` from the message itself, supporting the 5-walker pattern without hardcoding.

---

## Continuous Aggregate Strategy

| CAGG | Source | Refresh Interval | Retention |
|------|--------|-------------------|-----------|
| `telemetry_minute_summary` | `machine_telemetry` | 1 minute | 90 days |
| `telemetry_hourly_summary` | `telemetry_minute_summary` | 1 hour | 90 days |
| `business_metrics_hourly` | `machine_telemetry` | 1 hour | 90 days |

**Rule**: Any Grafana query spanning more than 1 hour MUST use a Continuous Aggregate, never the raw `machine_telemetry` table.

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
