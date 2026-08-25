# IMS — AI Agent Operating Instructions

> **Standing Rules:** This file is the technical authority for all AI agents (Claude, Antigravity, Cursor, etc.) working on the IMS repository. Read this file at the start of every session.

## 1. System Context

**IMS (Industrial Monitoring System)** is a telemetry monitoring system.

- **Sources:** SNMP-polled devices (Linux servers, Juniper switches) and HTTP (LDI PCB manufacturing machines).
- **Pipeline:** Node-RED (Ingestion) → PgBouncer → TimescaleDB (Storage) → Grafana (Dashboards).
- **Alerting:** Prometheus + Alertmanager → LINE / MS Teams.

## 2. Agent Output & Tone

- **Caveman Mode:** Respond terse like smart caveman. All technical substance stay. Only fluff die. Drop articles (a/an/the), filler (just/really/basically), pleasantries, hedging. Fragments OK.
- *Pattern:* `[thing] [action] [reason]. [next step].`
- *Yes:* "Bug in auth middleware. Fix:"
- *Auto-Clarity:* Drop caveman for security warnings, irreversible actions, or when the user is confused. Resume after.
- **Boundaries:** Code/commits/PRs must be written normally.
- **Formatting:** Use Markdown. Use GitHub alerts (`> [!WARNING]`, etc.) for critical information.

## 3. Ironclad Architectural Rules (Never Violate)

- **Database Schema:** Use `public` schema only. Never use `ims.*`.
- **Node-RED Sandbox:** `require()` is unavailable in function nodes. Use `global.get('snmp')`, `global.get('pg')`, `global.get('fs')`. `structuredClone` is unavailable, use `JSON.parse(JSON.stringify(obj))`.
- **Node-RED Parsing:** O(N) single-pass. Explicit GC required: `flatData.length = 0` + `msg.payload = null`.
- **Node-RED Flows:** `nodered_data/flows/*.json` (split files) are the source of truth. They are concatenated into `flows.json` at deploy time via `make deploy-flows`. PowerShell replaces `\n` with `\\n` in flow JSON — use Python scripts for complex multi-file edits.
- **Database Inserts:** INSERT column count MUST equal VALUES placeholder count. When using `NOW()` in VALUES, the `"time"` column must remain in the INSERT list.
- **PgBouncer:** `AUTH_TYPE: plain`, transaction pooling, no prepared statements.

## 4. Grafana & Dashboard Rules

- **Grid-24 Discipline:** Every row sums to exactly 24 columns. Next Y = Prev Y + Prev H.
- **Design System:** Use Canonical Color Tokens only (e.g., `#00F2FE` Cyan, `#00FF87` Green, `#FF003C` Red). Never use default Grafana colors.
- **TimescaleDB Queries:** Use continuous aggregates over raw tables where possible.
- **Column Naming:** Raw tables use `time`. CAGGs use `bucket`. Grafana aliases `bucket AS time` in queries.
- **SQL Injection Prevention:**
- Non-repeated panels: `machine_id IN (${machine_id:singlequote})`
- Repeated panels: `eqp_id = ${machine_id:singlequote}`
- NEVER use `${machine_id}` without quotes.
- **PostgreSQL ROUND:** Must cast to numeric: `ROUND(value::NUMERIC, N)`.
- **State Timeline:** Value mappings for color coding (0=Red/CRIT, 1=Amber/WARN, 2=Green/OK).

## 5. Development Workflow & Commands

- `make up` — Start dev stack (SNMP simulator profiles)
- `make up-prod` — Start production overlay
- `make restart` — Restart Node-RED, Grafana, Alertmanager, Prometheus
- `make verify` — Full health check (containers, DB, pipeline, alerts)
- `make deploy-flows` — Concatenate split flows → flows.json → POST to Node-RED
- `make test-unit` / `make test-load` / `make test-visual` — Test suites. Test narrowest first.

## 6. Safety & Security

- **Secrets:** Never read aloud, print, log, or commit `.env` files. Reference by name only.
- **Required Env Vars:** Use `:?err` syntax for required secrets in compose (e.g., `${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}`).
- **Default:** Always ask before destructive actions (DB schema change, `git push --force`, overwriting non-output files).

## 7. Available Skills

Over 90 skills are available via MCP and `.agents/skills/`. Use `/skill-name` to invoke.
Key local skills include: `code-review-and-quality`, `performance-optimization`, `security-and-hardening`, `grafana-dashboard-mastery`, `timescaledb-query-optimization`, `node-red-pipeline-engineering`.
