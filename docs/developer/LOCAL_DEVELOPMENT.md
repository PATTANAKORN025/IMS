<!-- GLOBAL_NAV -->
<div align="right">
  <a href="../../README.md"><img src="../assets/icons/home.svg" width="16" align="center" /> <b>Home</b></a> &nbsp;|&nbsp;
  <a href="../README.md"><img src="../assets/icons/book.svg" width="16" align="center" /> <b>Docs Index</b></a>
</div>
<br/>

<div align="center">
  <h1>IMS Local Development & Engineering Guide</h1>
  <p><b>Comprehensive developer onboarding, local stack orchestration, pipeline engineering, and testing workflows</b></p>
  <p>
    <a href="LOCAL_DEVELOPMENT.md">English</a> |
    <a href="../../th/docs/developer/LOCAL_DEVELOPMENT.md">ไทย</a> |
    <a href="../../zh-CN/docs/developer/LOCAL_DEVELOPMENT.md">简体中文</a>
  </p>
</div>

---

## 1. Quick-Start Bootstrap (5 Minutes)

Get the complete Industrial Monitoring System (IMS) telemetry stack running on your workstation in minutes:

```bash
# 1. Clone the repository
git clone https://github.com/PATTANAKORN025/IMS.git
cd IMS

# 2. Initialize your local environment file
cp .env.example .env

# 3. Verify toolchain prerequisites
make doctor

# 4. Build flows and start the full development stack
make up

# 5. Verify service health across all 14 containers
make verify
```

Once running, access the local services:
- **Unified Front Door (Grafana UI & APIs)**: `http://localhost:3000` (Default credentials: `admin` / configured in `.env`)
- **Node-RED Flow Editor**: `http://localhost:1880`
- **Prometheus UI**: `http://localhost:9090`
- **Alertmanager UI**: `http://localhost:9093`
- **PgAdmin 4**: `http://localhost:5050` (Optional web database management)

---

## 2. Prerequisites & Toolchain Matrix

| Tool | Minimum Version | Recommended | Purpose |
|:-----|:----------------|:------------|:--------|
| **Docker Engine** | 24.0+ | 26.0+ | Containerized service runtime |
| **Docker Compose** | v2.20+ | v2.27+ | Multi-container stack orchestration |
| **GNU Make** | 3.81+ | 4.4+ | Unified build, deploy, and test automation |
| **Node.js** | 18.0.0 LTS | 20.x / 22.x LTS | Linting, test execution, flow builders, mock data |
| **npm** | 9.0+ | 10.0+ | Dependency and script package manager |
| **Git** | 2.30+ | 2.45+ | Version control and branch workflows |
| **k6** *(Optional)* | 0.45+ | Latest | Pipeline load and stress testing |
| **psql** *(Optional)* | 15.0+ | 16.0+ | Direct database command-line management |

### Multi-Platform Setup Notes

- **Windows 10/11**: We recommend PowerShell 7+ or WSL2 (Ubuntu 22.04+). When using native PowerShell, ensure execution policies permit script execution (`Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`).
- **Linux (Ubuntu/Debian)**: Install standard build tools (`sudo apt-get install build-essential docker-compose-plugin nodejs npm`).
- **macOS (Apple Silicon / Intel)**: Install Docker Desktop and Xcode Command Line Tools (`xcode-select --install`).

---

## 3. Environment Configuration & Secrets Management

IMS requires an `.env` file in the repository root. Never commit `.env` or any production secrets to version control.

```bash
cp .env.example .env
```

### Core Configuration Variables

| Variable Name | Required | Default Example | Description |
|:--------------|:---------|:----------------|:------------|
| `POSTGRES_USER` | Yes | `ims_admin` | Master administrative user for TimescaleDB. |
| `POSTGRES_PASSWORD` | Yes | *StrongSecret!* | Master password for TimescaleDB. |
| `POSTGRES_DB` | Yes | `ims_telemetry` | Primary telemetry database name. |
| `GF_SECURITY_ADMIN_USER` | Yes | `admin` | Grafana administrative username. |
| `GF_SECURITY_ADMIN_PASSWORD` | Yes | *AdminSecret!* | Grafana administrative password. |
| `INGEST_API_KEY` | Yes | *TelemetrySecretKey* | API token required for `POST /ldi-telemetry`. |
| `NODE_RED_CREDENTIAL_SECRET` | Yes | *FlowEncryptKey* | AES encryption key for Node-RED flow credentials. |
| `ALERTMANAGER_LINE_TOKEN` | Optional | *LineToken...* | LINE Notify bearer token for alerting. |
| `ALERTMANAGER_TEAMS_WEBHOOK` | Optional | `https://...` | Microsoft Teams incoming webhook URL. |

> [!CAUTION]
> **Strict Secret Security Policy**: Reference environment variables by name only in documentation, commits, and discussions. All Compose configurations enforce secrets using the `${VARIABLE:?set VARIABLE in .env}` syntax.

---

## 4. Stack Lifecycle Command Reference

The IMS `Makefile` provides standardized targets for all daily development operations:

```bash
# Start and Stop
make up               # Build split flows and start all containers in background
make up-prod          # Start production stack with prod overlay configuration
make down             # Stop all containers and teardown internal networks
make restart          # Quick restart of Node-RED, Grafana, Alertmanager, and Prometheus

# Pipeline & Flows (IaC)
make build-flows      # Merge split flows (nodered_data/flows/*.json) into flows.json
make validate-flows   # Validate flows.json JSON schema and verify unique node IDs
make deploy-flows     # Build and deploy split flows to live Node-RED via HTTP API
make snapshot-flows   # Create timestamped backup of current flows.json in backups/

# System Health & Verification
make verify           # Run comprehensive cross-stack health verification script
make doctor           # Check local toolchain prerequisites (Docker, Compose, Node)
make validate-dashboards # Check Grafana dashboard JSON models for corrupted hex colors
make logs             # Stream live logs from Node-RED container

# Database Maintenance
make backup           # Create timestamped SQL backup of TimescaleDB telemetry database
make restore FILE=... # Restore TimescaleDB from a specified backup file

# Quality Assurance & Testing
make test-unit        # Run unit tests (boundary validation, parser, counter wraparound)
make test-load        # Run k6 pipeline stress and high-concurrency ingestion test
make test-visual      # Run Playwright visual regression test suite across dashboards
make test-visual-ldi  # Run Playwright LDI responsive layout verification
```

---

## 5. Node-RED Pipeline Engineering

Node-RED serves as the primary ingestion, transformation, and buffering engine for high-frequency telemetry.

### Split Flow Architecture

To enable collaborative Git version control without merge conflicts on large JSON files, Node-RED flows are maintained as individual modular files in `nodered_data/flows/`:

```
nodered_data/flows/
├── 01-snmp-poller.json       # SNMP polling and interface counter extraction
├── 02-ldi-ingest.json        # HTTP /ldi-telemetry schema validation and parsing
├── 03-alarm-engine.json      # Threshold evaluations and Alertmanager dispatch
└── 04-storage-writer.json    # PgBouncer connection and batched database inserts
```

1. **Deploying Flows**:
   ```bash
   make deploy-flows
   ```
   *Concatenates split files into `nodered_data/flows.json` and posts them to Node-RED's admin API.*
2. **Snapshotting Flows**:
   ```bash
   make snapshot-flows
   ```
   *Saves a dated copy into `backups/flows-YYYYMMDD-HHMMSS.json` before major edits.*

### Ironclad Runtime Sandbox Rules

Function nodes in Node-RED run in a restricted VM sandbox:

- **No `require()`**: Dynamic `require()` is disabled. You must access global modules using `global.get('snmp')`, `global.get('pg')`, or `global.get('fs')`.
- **No `structuredClone`**: The `structuredClone` global is unavailable. Use `JSON.parse(JSON.stringify(obj))` for deep copies.
- **Mandatory Explicit Garbage Collection**: High-throughput message arrays must be cleared manually to avoid V8 heap exhaustion:
  ```javascript
  flatData.length = 0;
  msg.payload = null;
  ```
- **$O(N)$ Single-Pass Parsing**: Telemetry parsing must process records in a single linear pass without nested iterations or unbounded regexes.

---

## 6. TimescaleDB & PostgreSQL Database Workflow

All telemetry data resides in TimescaleDB (PostgreSQL 16 with TimescaleDB extension).

### Schema Architecture Rules

- **Strict `public` Schema Only**: All hypertables, regular tables, views, and continuous aggregates must reside in the `public` schema. Never create or reference `ims.*` schemas.
- **Sequenced Migrations**: Database changes are applied via numbered SQL scripts in `database/migrations/` (`001-*.sql` to `086-*.sql`).
- **Column Matching on `INSERT`**: The column count in `INSERT INTO` must exactly match the number of parameter placeholders in `VALUES ()`. When using `NOW()` in `VALUES`, the `"time"` column must remain in the column list.
- **PgBouncer Connection Pooling**:
  - Connection mode: `transaction` pooling.
  - Authentication: `AUTH_TYPE: plain`.
  - Prepared statements: **Forbidden** (PgBouncer in transaction mode does not support prepared statements).

### Applying Migrations Locally

```bash
# Execute a new migration against TimescaleDB through docker exec
docker exec -i ims-timescaledb psql -U ims_admin -d ims_telemetry < database/migrations/086-add-custom-telemetry.sql
```

### Continuous Aggregates (CAGGs)

High-performance dashboard queries must target pre-computed Continuous Aggregates (such as `public.ldi_data_15m`) rather than raw hypertables:

```sql
SELECT
  bucket AS "time",
  machine_id,
  ROUND(avg_temperature::numeric, 2) AS temperature
FROM public.ldi_data_15m
WHERE machine_id = 'LDI-01'
  AND bucket > NOW() - INTERVAL '24 hours'
ORDER BY bucket ASC;
```

---

## 7. Synthetic Mock Data Generation (CNC Drilling & VCP Plating)

To test the 7 CNC drilling and VCP plating dashboards without relying on proprietary production factory databases, use the synthetic mock data generator:

```bash
# 1. Generate 7 days (168 hours) of realistic operational mock data
node scripts/mock/eap-mock-data.js --hours=168 --apply

# 2. Verify all dashboard queries and panel row resolutions
node scripts/mock/verify-mock-dashboards.js --container=ims-timescaledb --psql-user=ims_admin
```

> [!NOTE]
> Mock data is written exclusively to the `eap_backup` database. It adheres to all schema constraints and allows full visual and functional testing of all 22 Grafana dashboards without exposing real factory production metrics.

For full technical specifications, see [Synthetic Mock Data Framework](../data/MOCK_DATA.md).

---

## 8. Grafana Dashboard Authoring & Design Discipline

All Grafana dashboards are version-controlled as JSON files in `monitoring/grafana/dashboards/`:
- `infrastructure/` (5 dashboards)
- `manufacturing/` (10 dashboards)
- `drilling/` (4 dashboards)
- `vcp/` (3 dashboards)

### Dashboard Engineering Rules

1. **Grid-24 Layout Discipline**:
   - Every dashboard row must sum to exactly **24 columns**.
   - Coordinate calculation: $\text{Next Y} = \text{Prev Y} + \text{Prev H}$.
2. **Canonical Color Tokens Only**:
   - Primary Telemetry & Normal State: `#00F2FE` (Electric Cyan)
   - Operational Success & Healthy: `#00FF87` (Spring Green)
   - Critical Alarms & Faults: `#FF003C` (Crimson Red)
   - Warning & Attention: `#FFB300` (Amber)
   - Secondary & Analytical Curves: `#7928CA` (Neon Purple)
   - Never use Grafana's default color palettes.
3. **SQL Injection Prevention**:
   - Non-repeated panels: `machine_id IN (${machine_id:singlequote})`
   - Repeated panels: `eqp_id = ${machine_id:singlequote}`
   - **Never** use `${machine_id}` without quotes.
4. **PostgreSQL ROUND Casting**:
   - Must explicitly cast floating values: `ROUND(value::NUMERIC, 2)`.

---

## 9. Comprehensive Testing & Quality Assurance Suite

Before pushing changes or opening a Pull Request, run the local quality assurance suite:

```bash
# 1. Run full 53-point pre-commit test suite
node scripts/pre-commit.js

# 2. Audit all markdown links and anchor integrity
node scripts/check-all-links.js

# 3. Verify documentation counts against real repository inventories
node tests/lint/doc-overclaim-linter.js

# 4. Scan repository for accidental private data leaks
node tests/lint/private-data-leak-scanner.js

# 5. Check dashboard inventory and schema inventory consistency
node scripts/generate-dashboard-inventory.js --check
node scripts/generate-schema-inventory.js --check
node scripts/generate-docs-readme-index.js --check
```

---

## 10. Git Conventions & Contribution Workflow

### Branching Strategy

- `feat/<feature-name>`: New features, dashboards, or capabilities.
- `fix/<bug-name>`: Bug fixes and operational patches.
- `perf/<optimization>`: Performance tuning and index optimizations.
- `docs/<topic>`: Documentation updates and translations.

### Conventional Commits

Commit messages must follow the Conventional Commits specification:

```
<type>(<optional scope>): <description>

[optional body]

[optional footer(s)]
```

*Examples:*
- `feat(drilling): add spindle vibration anomaly detection panel`
- `fix(pipeline): prevent counter wraparound on 64-bit snmp octets`
- `docs(api): document alarm lifecycle ack and resolve endpoints`

### Pull Request Checklist

Before submitting a PR:
- [ ] `node scripts/pre-commit.js` passes with 0 failures.
- [ ] No private CAD geometries, machine vendor names, or production secrets are included.
- [ ] Documentation updates are mirrored symmetrically across English (`docs/`), Thai (`th/`), and Simplified Chinese (`zh-CN/`).
- [ ] All markdown links pass link verification (`check-all-links.js`).
