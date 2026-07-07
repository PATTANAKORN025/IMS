<div align="center">

# IMS — Infrastructure Monitoring System

### Enterprise-Grade NOC Monitoring for 1000+ Nodes

[![Docker](https://img.shields.io/badge/Docker-24.0-blue?logo=docker&logoColor=white)](https://www.docker.com/)
[![Grafana](https://img.shields.io/badge/Grafana-11.1-F46800?logo=grafana&logoColor=white)](https://grafana.com/)
[![Node-RED](https://img.shields.io/badge/Node--RED-4.0-8F0000?logo=nodered&logoColor=white)](https://nodered.org/)
[![TimescaleDB](https://img.shields.io/badge/TimescaleDB-2.x-316192?logo=postgresql&logoColor=white)](https://www.timescale.com/)
[![Prometheus](https://img.shields.io/badge/Prometheus-2.55-E6522C?logo=prometheus&logoColor=white)](https://prometheus.io/)
[![K6](https://img.shields.io/badge/K6-Load--Testing-7B61FF?logo=k6&logoColor=white)](https://k6.io/)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

![Architecture](https://img.shields.io/badge/Architecture-Cyberpunk_HUD-00F2FE)
![Uptime](https://img.shields.io/badge/Uptime-99.9%25-00FF87)
![Nodes](https://img.shields.io/badge/Scalable-1000%2B_Nodes-FF003C)

---

**IMS** is a production-grade, real-time IT infrastructure monitoring system built for Enterprise NOC operations. It collects SNMP telemetry from 1000+ machines, processes it through an asynchronous Node-RED pipeline, stores it in TimescaleDB with continuous aggregates, and visualizes it via a cyberpunk-themed Grafana HUD — all orchestrated by Docker Compose.

</div>

---

## Architecture

```
┌─────────────┐     ┌───────────┐     ┌─────────────┐     ┌────────────┐
│  SNMP Poll   │────▶│  Node-RED  │────▶│ TimescaleDB  │────▶│   Grafana   │
│  (5-thread)  │     │  Async I/O  │     │  CAGGs+Raw   │     │  Cyberpunk  │
└─────────────┘     └───────────┘     └─────────────┘     └────────────┘
                         │                      │
                    ┌────▼────┐            ┌────▼────┐
                    │  K6 Load │            │Prometheus│
                    │  Testing │            │  +Alert  │
                    └─────────┘            └─────────┘
```

### Data Flow (Macro-to-Micro Paradigm)

1. **SNMP Collection** — Node-RED forks 5 parallel walker threads (CPU, Storage, Network, Temperature, LDI) per machine every 10 seconds
2. **Async Batch Parser** — Aggregates walker results, calculates per-interface Mbps deltas, and performs 30-column parameterized INSERT via `pg` module
3. **TimescaleDB CAGG** — `telemetry_minute_summary` and `telemetry_hourly_summary` materialize fleet-wide aggregates for 1000x faster dashboard queries
4. **Grafana HUD** — Fleet Envelope (AVG+MAX), Top-10 Critical Nodes, State-Timeline Z-Score anomaly detection, Donut resource distribution, Linear regression capacity forecasting
5. **Prometheus + Alertmanager** — 12 scrape targets, inhibition rules, webhook integration (Line/Teams)

### Dashboard Architecture (3 Dashboards)

| Dashboard | Panels | Purpose |
|-----------|--------|---------|
| **NOC Overview** | 16 | Executive fleet view: Fleet Envelope, Top-10 Critical Nodes, Network Throughput, LDI Yield Risk |
| **Engineering Drill-Down** | 21 | Per-machine deep dive: Gauges, Memory/Temp timeseries, LDI manufacturing, Z-Score anomalies, Donut charts |
| **Capacity Planning** | 16 | Forecasting: Days Until Full (bargauge), Disk/CPU/RAM trends, Z-Score anomaly detection |

**Design System:** Cyberpunk HUD aesthetic — Rajdhani font, `#030407` background, `#00F2FE`/`#00FF87`/`#FF003C` neon palette, glassmorphism panels with corner bracket accents, 2D overlap-free Grid-24 layout.

---

## SRE & DevSecOps Triumphs

### Principle of Least Privilege (PoLP)
- `grafana_reader` role with read-only access to `public` schema — no admin credentials exposed
- Direct `ims-timescaledb:5432` connection bypasses PgBouncer SCRAM auth issues

### Automated 2D Overlap Prevention
- Every dashboard panel passes rectangle collision detection before commit
- Strict bottom-up Y-axis accumulation: `Next Y = Previous Y + Previous H`
- Zero overlapping panels across all 3 dashboards (verified by automated scanner)

### Technical Debt Eradication
- Migration files sequenced `001`–`011` with zero duplicate prefixes
- Node-RED context unified under `nodered_data/` (single source of truth)
- Documentation consolidated into root-level SSOT guides
- PgBouncer dead weight removed (direct DB connections)
- AI prompt artifacts purged from repository

### K6 Stress Testing
- `db-write-stress.js` — 100-node write throughput via Node-RED `/inject`
- `grafana-query-stress.js` — 50-user concurrent dashboard query stress
- Automated results export to JSON for CI/CD integration

---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/PATTANAKORN025/IMS.git
cd IMS

# Configure environment
cp .env.example .env

# Launch the complete stack (7 services)
docker compose up -d

# Wait 40 seconds for full startup
sleep 40

# Verify all services
docker compose ps

# Open Grafana
open http://localhost:3000
```

**Default credentials:** `admin` / `admin` (change on first login)

### Available Commands

| Command | Description |
|---------|-------------|
| `make up` | Start all services (dev mode with SNMP simulator) |
| `make down` | Stop all services |
| `make verify` | Full system health check |
| `make test-unit` | Run unit tests (56 tests) |
| `make test-load` | Run K6 load tests |
| `make backup` | Database backup |
| `bash scripts/init-migrations.sh` | Apply all migrations to fresh DB |

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Orchestration** | Docker Compose | 7-service container orchestration |
| **Data Collection** | Node-RED + SNMP | Async 5-thread parallel walker pipeline |
| **Database** | TimescaleDB (PostgreSQL) | Time-series optimized with Continuous Aggregates |
| **Visualization** | Grafana 11.1 | Cyberpunk HUD dashboards with state-timeline anomalies |
| **Alerting** | Prometheus + Alertmanager | Metric scraping, inhibition rules, webhook integration |
| **Load Testing** | K6 | Database write and Grafana query stress testing |
| **SLA Probing** | Blackbox Exporter | HTTP/TCP/ICMP endpoint monitoring |

---

## Database Schema

- **`machine_telemetry`** — 30-column raw telemetry (CPU, RAM, Disk, Network per-interface, Temperature, LDI manufacturing, WiFi)
- **`telemetry_minute_summary`** — Continuous aggregate: per-minute fleet averages
- **`telemetry_hourly_summary`** — Continuous aggregate: per-hour fleet rollups
- **`machines`** — Device registry (machine_id, hostname, community string, SNMP port)
- **11 idempotent migrations** in `database/migrations/` (001–011)

---

## Project Structure

```
IMS/
├── monitoring/grafana/          # Dashboards, datasources, provisioning
│   └── dashboards/              # 3 JSON dashboard files (source of truth)
├── nodered_data/                # Node-RED flows, settings, Dockerfile
│   └── flows/                   # ingestion.json + alerting.json
├── postgres/init/               # Database init SQL + readonly role
├── database/migrations/         # 11 sequenced migration files
├── tests/k6/                    # K6 stress & chaos test scripts
├── tests/unit/                  # Parser & counter unit tests
├── scripts/                     # Utility scripts
└── docs/                        # Architecture, Troubleshooting, Design System
```

---

## License

MIT License — see [LICENSE](LICENSE) for details.
