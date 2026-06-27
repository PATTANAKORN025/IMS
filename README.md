# IMS — Industrial NOC Monitoring System

> World-class server telemetry monitoring with SNMP, TimescaleDB, Prometheus, Grafana, and Node-RED.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐
│  SNMP Agent │────▶│  Node-RED   │────▶│  PgBouncer   │
│  (snmpsim)  │     │  Pipeline   │     │  (Pooler)    │
└─────────────┘     └──────┬──────┘     └──────┬───────┘
                           │                    │
                           ▼                    ▼
                    ┌─────────────┐     ┌──────────────┐
                    │  Grafana    │◀────│  TimescaleDB │
                    │  Dashboard  │     │  (PostgreSQL)│
                    └──────┬──────┘     └──────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  Alerting   │◀──── Prometheus + Alertmanager
                    └─────────────┘
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| TimescaleDB | 5432 (internal) | Time-series database |
| PgBouncer | 6432 (internal) | Connection pooler |
| Node-RED | 1880 | Flow-based data pipeline |
| Grafana | 3000 | Dashboard & visualization |
| Prometheus | 9090 | Metrics collection |
| Alertmanager | 9093 | Alert routing |
| SNMP Simulator | 1161/udp | Simulated server metrics |

## Quick Start

### 1. Clone and Configure

```bash
cp .env.example .env
# Edit .env with your credentials

# Create secrets
mkdir -p secrets
echo "your-db-password" > secrets/postgres_password.txt
echo "your-grafana-password" > secrets/grafana_admin_password.txt
```

### 2. Start Services

```bash
docker compose up -d
```

### 3. Verify Health

```bash
docker compose ps
docker compose logs --tail=50
```

### 4. Access Dashboards

- **Grafana**: http://localhost:3000
- **Node-RED**: http://localhost:1880
- **Prometheus**: http://localhost:9090
- **Alertmanager**: http://localhost:9093

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `TZ` | Timezone | `Asia/Bangkok` |
| `POSTGRES_DB` | Database name | `ims` |
| `POSTGRES_USER` | Database user | `ims_admin` |
| `POSTGRES_PASSWORD` | Database password | (required) |
| `GRAFANA_ADMIN_USER` | Grafana admin user | `admin` |
| `GRAFANA_ADMIN_PASSWORD` | Grafana admin password | (required) |
| `SNMP_COMMUNITY` | SNMP community string | `Netk@` |
| `NODE_RED_CREDENTIAL_SECRET` | Node-RED encryption key | (auto-generated) |

### Monitored Metrics

| Category | Metrics |
|----------|---------|
| **CPU** | Core count, average load, per-core load, 1m/5m/15m load averages |
| **Memory** | Total, used, free, usage % |
| **Disk** | Total, used, free, usage % |
| **Network** | IF-MIB: RX/TX bytes, throughput (Mbps), errors, drops, active interfaces |
| **Temperature** | LM-SENSORS-MIB: CPU core, package, system board, ambient, VRM sensors |
| **System** | Uptime, process count |

### Alert Thresholds

| Metric | Warning | Critical |
|--------|---------|----------|
| CPU Load | > 75% | > 90% |
| RAM Usage | > 80% | > 90% |
| Disk Usage | > 85% | > 95% |
| Temperature | > 70°C | > 85°C |
| Network Errors | > 100 | > 1000 |
| CPU Load 15m | > 80 | > 95 |

### Alert Channels

| Severity | Channel | Purpose |
|----------|---------|---------|
| Critical | Slack + Node-RED webhook | Immediate escalation |
| Warning | Node-RED webhook (Line Notify) | Team notification |
| Info | Log only | Audit trail |

## Grafana Dashboards

### NOC Overview (`ims-noc-overview`)
- Fleet uptime percentage
- Online/offline machine count
- Real-time CPU, temperature, network, RAM graphs
- Server status table with health indicators

### Engineering Drill-Down (`ims-engineering`)
- Machine selector variable (dropdown)
- CPU load averages (1m/5m/15m)
- Temperature sensor breakdown
- Network errors & drops tracking
- Recent telemetry data table

## Database Schema

### Tables

- `ims.machines` — Machine registry
- `ims.machine_telemetry` — Raw telemetry (hypertable)
- `ims.telemetry_1h` — 1-hour continuous aggregate
- `ims.telemetry_1d` — 1-day continuous aggregate
- `ims.alert_rules` — Alert threshold definitions
- `ims.alert_history` — Alert event log

### Views

- `ims.v_daily_summary` — Daily aggregated metrics
- `ims.v_uptime_summary` — Machine health status

### Policies

- **Compression**: After 7 days
- **Retention**: 365 days
- **Aggregation**: 5-minute refresh

## Security

- Passwords stored in Docker Secrets (`secrets/` directory)
- `.env` and `secrets/` excluded from git via `.gitignore`
- PgBouncer connection pooling for database access
- Internal network isolation (services not exposed to host)
- Non-root containers where possible

## Development

### Add a New Machine

```sql
INSERT INTO ims.machines (machine_id, hostname, os_type, cpu_cores, ram_total_mb, disk_total_gb, location, department, contact_name, contact_email)
VALUES ('NEW-SERVER', 'new-server', 'linux', 8, 32768, 1000, 'Server Room B', 'DevOps', 'Team Lead', 'team@company.com');
```

### Query Recent Telemetry

```sql
SELECT * FROM ims.machine_telemetry
WHERE machine_id = 'ERP-MASTER-UBUNTU'
  AND recorded_at > NOW() - INTERVAL '1 hour'
ORDER BY recorded_at DESC
LIMIT 100;
```

### Query Machine Health

```sql
SELECT * FROM ims.v_uptime_summary;
```

## Troubleshooting

### Node-RED can't connect to database

```bash
docker logs ims-node-red --tail 50
# Check PgBouncer is running
docker logs ims-pgbouncer --tail 20
```

### SNMP walk returns empty

```bash
docker exec ims-snmpsim snmpwalk -v2c -c Netk@ ims-snmpsim:161 1.3.6.1.2.1.25.3.3.1.2
```

### Grafana shows "No data"

1. Check datasource: http://localhost:3000/datasources
2. Verify PgBouncer connection: `docker exec ims-pgbouncer psql -h timescaledb -U ims_admin -d ims -c "SELECT 1"`
3. Verify data exists: `SELECT count(*) FROM ims.machine_telemetry;`

## License

Internal use only.
