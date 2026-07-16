<div align="center">

# IMS — Industrial Monitoring System

### Enterprise NOC Infrastructure Monitoring for 1000+ Nodes

[![License: MIT](https://img.shields.io/badge/License-MIT-10B981?logo=opensourceinitiative&logoColor=white)](LICENSE)
[![Docker: Ready](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![Grafana: v11+](https://img.shields.io/badge/Grafana-v11-F46800?logo=grafana&logoColor=white)](https://grafana.com/)
[![Node-RED: v4+](https://img.shields.io/badge/Node--RED-v4-8F0000?logo=nodered&logoColor=white)](https://nodered.org/)
[![TimescaleDB](https://img.shields.io/badge/TimescaleDB-2.x-316192?logo=postgresql&logoColor=white)](https://www.timescale.com/)
[![Tests: Passing](https://img.shields.io/badge/Tests-Passing-10B981?logo=jest&logoColor=white)](#quick-start)
[![K6: Stress-Tested](https://img.shields.io/badge/K6-Stress--Tested-7B61FF?logo=k6&logoColor=white)](#quick-start)

<br/>

**IMS** is a production-grade, real-time IT infrastructure monitoring system built for Enterprise NOC operations. It collects SNMP telemetry from 1000+ machines, processes it through an asynchronous Node-RED pipeline, stores it in TimescaleDB with continuous aggregates, and visualizes it via a cyberpunk-themed Grafana HUD — all orchestrated by Docker Compose.

<br/>

</div>

---

## Dashboard Showcase

<p align="center">
  <img src="assets/noc-overview.png" width="31%" alt="NOC Overview" />
  <img src="assets/engineering-drilldown.png" width="31%" alt="Engineering Drill-Down" />
  <img src="assets/capacity-planning.png" width="31%" alt="Capacity Planning" />
</p>

<p align="center">
  <em>NOC Overview</em> &nbsp;&nbsp;&nbsp; <em>Engineering Drill-Down</em> &nbsp;&nbsp;&nbsp; <em>Capacity Planning</em>
</p>

<br/>

---

## Why IMS?

| | Capability | What It Does |
|:---:|---|---|
| ⚡ | **Hyper-Parallel Ingestion** | Node-RED sequential async bulk SNMP walks with maxRepetitions:50. 78-port switches polled in <2s per cycle. Circuit breaker trips after 2 consecutive failures — zero log spam. |
| 🧠 | **Predictive AIOps** | Z-Score anomaly detection (3σ from 24h rolling baseline), linear regression capacity forecasting (days until disk/RAM full), continuous fleet health scoring (0-100). |
| 🛡️ | **Zero-Downtime Architecture** | Circuit breaker with HALF_OPEN probe, PgBouncer transaction pooling, retry queue with age-based eviction, offline heartbeat on device failure — the database ALWAYS records the exact moment of outage. |

---

## One-Minute Quickstart

```bash
# Clone and configure
git clone https://github.com/PATTANAKORN025/IMS.git
cd IMS
cp .env.example .env

# Launch the complete stack (7 services)
make up          # or: docker compose up -d

# Wait 40 seconds for full startup, then verify
sleep 40 && make verify

# Open Grafana (default: admin / admin)
open http://localhost:3000
```

### Available Commands

| Command | Description |
|---------|-------------|
| `make up` | Start all services (dev mode with SNMP simulator) |
| `make down` | Stop all services |
| `make verify` | Full system health check (containers, DB, pipeline, alerts) |
| `make test-unit` | Run unit tests (18 parser + counter tests) |
| `make test-load` | Run K6 pipeline stress test (50→200 VUs) |
| `make test-visual` | Capture dashboard screenshots via Playwright |
| `make validate-dashboards` | Lint all dashboard JSON for grid overlap + hex corruption |
| `make backup` | Database backup |

---

## Architecture

```
┌──────────────┐    SNMP v2c     ┌──────────────┐    SQL INSERT    ┌────────────┐
│  SNMP Walk   │ ──────────────▸ │   Node-RED   │ ──────────────▸ │ PgBouncer  │
│  (Sequential │    UDP/161      │  5-Thread    │   Batch 10s     │ (pooling)  │
│  Async Bulk) │                 │  Stateful    │                 └─────┬──────┘
└──────────────┘                 └──────────────┘                       │
                                                          ┌────────────▼──────────┐
                                                          │     TimescaleDB       │
                                                          │  CAGGs + Hypertables  │
                                                          └────────────┬──────────┘
                                                          ┌────────────▼──────────┐
                                            ┌─────────────┤     Prometheus        │
                                            │             │   + Alertmanager      │
                                     ┌──────▼──────┐     └───────────────────────┘
                                     │   Grafana   │
                                     │ 4 Dashboards│
                                     └─────────────┘
```

### Data Flow

1. **Collection** — Node-RED forks 4 walkers for network switches (CPU, Storage, Network, Temp) and 5 for servers (+LDI) every 10 seconds. Device registry loaded from `public.devices` every 5 minutes.
2. **Walking** — Sequential async bulk walks (`session.subtree` with `maxRepetitions: 50`). Single UDP socket eliminates switch-level packet drops. Circuit breaker trips after 2 failures with automatic HALF_OPEN probe.
3. **Parsing** — `sre_parser` maintains per-device state in flow context (`dev_state_<deviceId>`), buffers rows in `batch_buf_<deviceId>`. Offline heartbeat (`_walker: "offline"`) immediately zeros all metrics on device failure.
4. **Storage** — Timer-gated independent flushing: each table type (sys/net/ldi) inserts only if its buffer has rows. Partial walker failures don't block unrelated data writes.
5. **Continuous Aggregation** — Hourly CAGGs refresh every 30min. Daily/Weekly CAGGs aggregate from hourly. Retention: raw 14d, hourly 90d, daily 2yr, weekly forever.
6. **Visualization** — 4 dashboards: NOC Overview (fleet envelope), Engineering Drill-Down (per-machine), AIOps & Capacity (forecasting), Meta-Monitoring (pipeline health).
7. **Alerting** — Prometheus scrapes `/metrics`, Alertmanager routes to LINE Notify + Slack with runbook links. Z-Score anomalies via Grafana SQL over TimescaleDB.

### Dashboard Architecture

| Dashboard | Panels | Purpose |
|-----------|--------|---------|
| **NOC Overview** | 15 | Fleet envelope (AVG+MAX), Fleet Health Score, Top-10 Critical Nodes, Network Bandwidth, LDI Yield Risk |
| **Engineering Drill-Down** | 25 | Per-machine gauges, RAM/CPU/Temp timeseries, LDI manufacturing, Power analytics, Z-Score anomalies |
| **Capacity Planning** | 16 | Disk/CPU/RAM forecast with linear regression, Days Until Full, Z-Score anomaly detection |
| **Meta-Monitoring** | 15 | Pipeline throughput, deadman alerts, circuit breaker state, device poll rates |

**Design System:** Cyberpunk HUD — `#030407` background, Tailwind palette (`#10B981` Healthy, `#F59E0B` Warning, `#EF4444` Critical, `#3B82F6` Accent), Roboto Mono for stat values, glassmorphism panels, Grid-24 overlap-free layout.

---

## NOC Wall-Display (Kiosk Mode)

| Mode | URL | Use Case |
|------|-----|----------|
| **TV Kiosk** | `?kiosk=tv&autofitpanels` | NOC wall-display — hides all chrome, auto-fits panels |
| **Clean** | `?kiosk` | Presentation mode — hides sidebar + topnav |
| **Embedded** | `?kiosk=1` | iframe embedding — hides everything |

```bash
# Create a playlist that cycles through all dashboards every 30 seconds
export GRAFANA_API_KEY="your-admin-api-key"
./scripts/create-playlist.sh http://localhost:3000 "$GRAFANA_API_KEY" 30

# Open in kiosk mode on NOC display
open "http://localhost:3000/playlists/play/1?kiosk=tv&autofitpanels"
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Orchestration** | Docker Compose | 7-service container stack with dev/prod overlays |
| **Collection** | Node-RED + net-snmp | Sequential async bulk SNMP walks, 5-thread parallel walker |
| **Database** | TimescaleDB (PostgreSQL) | Hypertables with CAGGs, 90% compression after 7d |
| **Visualization** | Grafana 11 | 4 cyberpunk HUD dashboards, state-timeline anomalies |
| **Alerting** | Prometheus + Alertmanager | Metric scraping, inhibition rules, LINE/Slack webhooks |
| **Load Testing** | K6 | Pipeline stress (50→200 VUs), threshold p95<500ms |
| **SLA Probing** | Blackbox Exporter | HTTP/TCP/ICMP endpoint monitoring |

---

## Database Schema

| Table | Columns | Description |
|-------|---------|-------------|
| `devices` | 11 | Device registry (device_id, hostname, snmp_community, device_type, enabled) |
| `sys_metrics` | 12 | CPU, RAM, Disk, Temperature per poll cycle (hypertable) |
| `net_metrics` | 10 | Per-interface RX/TX Mbps, errors, drops, status (hypertable) |
| `ldi_metrics` | 9 | Manufacturing throughput, PE, JE, humidity, power, vibration (hypertable) |
| `sys_hourly` | — | Continuous Aggregate: hourly CPU/RAM/Disk/Temp rollup |
| `net_hourly` | — | Continuous Aggregate: hourly network throughput rollup |
| `ldi_hourly` | — | Continuous Aggregate: hourly LDI metrics rollup |

---

## Project Structure

```
IMS/
├── monitoring/grafana/                # Grafana dashboards + provisioning
│   ├── dashboards/                    #   4 JSON dashboard files (source of truth)
│   └── library-panels/               #   Shared library panels (Fleet Health Score)
├── nodered_data/                      # Node-RED pipeline engine
│   ├── flows/                         #   ingestion.json + alerting.json (source)
│   ├── lib/                           #   circuit-breaker.js, parser, units.js
│   └── settings.js                    #   functionGlobalContext, auth config
├── postgres/                          # Database initialization
│   └── init/                          #   001-init-timescaledb.sql (schema + views)
├── database/migrations/               #   5 sequenced migration files (013-017)
├── tests/                             # Test suites
│   ├── k6/                            #   K6 pipeline stress test
│   ├── unit/                          #   Parser & counter unit tests
│   └── playwright/                    #   Visual regression + screenshot capture
├── scripts/                           # Operational scripts
│   ├── create-playlist.sh             #   NOC wall-display playlist creator
│   ├── generate-showcase.sh           #   Dashboard screenshot generator
│   ├── snmp-discover.js               #   Enterprise SNMP OID discovery
│   └── build-flows.sh                 #   Merge ingestion + alerting → flows.json
├── assets/                            # Dashboard screenshots (auto-generated)
├── docs/                              # Architecture, Design System, Troubleshooting
└── .mimocode/skills/                  # 24 custom skills for DevOps automation
```

---

## License

MIT License — see [LICENSE](LICENSE) for details.
