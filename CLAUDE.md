# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Read `AGENTS.md` first.** It is the technical authority for all AI agents on this repo (architectural invariants, Grafana design rules, Node-RED sandbox limits, response tone). This file covers commands and the big-picture architecture; `AGENTS.md` covers the rules you must not violate.

## What this is

IMS (Industrial Monitoring System) — an OT/IT telemetry platform. It is a Docker Compose stack, not an application repo: most "code" is Node-RED flow JSON, SQL migrations, Grafana dashboard JSON, and two Node services. There is no bundler, no test framework, and no TypeScript build — tests are plain `node script.js` files that exit non-zero on failure.

## Commands

Day-to-day operations go through `make`. **The Makefile is mixed-shell, not portable across the board**: only `verify` branches on `$(OS)`. `doctor` uses cmd-style `2>NUL`; `deploy-flows` needs `jq` plus bash process substitution `<(...)`; `backup`, `restore`, `test-load`, `snapshot-flows` need a POSIX shell. On Windows, run those from Git Bash.

| Command | What it does |
| --- | --- |
| `make doctor` | Check prerequisites (docker, compose, node) |
| `make up` | `build-flows` then `docker compose up -d` on the base file only |
| `make up-prod` | Start with `docker-compose.prod.yaml` overlay (production resource limits) |
| `make down` / `make restart` / `make logs` | Stop / restart core containers / tail Node-RED logs |
| `make verify` | Full health check — containers, DB, pipeline, alerts |
| `make build-flows` | Merge `nodered_data/flows/*.json` into `nodered_data/flows.json` |
| `make validate-flows` | Build then assert flows.json is a valid array with no duplicate node IDs |
| `make deploy-flows` | POST merged flows to Node-RED at `127.0.0.1:1880` |
| `make snapshot-flows` | Back up `flows.json` to `backups/` before a deploy |
| `make validate-dashboards` | Grep dashboards for corrupted hex codes |
| `make test-unit` | The four core parser/boundary unit tests |
| `make test-load` | K6 stress test (`tests/k6/pipeline-stress.js`) |
| `make test-visual` / `make test-visual-ldi` | Playwright dashboard screenshot regression |
| `make backup` / `make restore FILE=<path>` | DB dump / restore |

### Running a single test

Every test is a standalone Node script — run it directly:

```bash
node tests/unit/factory-twin-alarm.test.js     # one unit test
node tests/lint/query-budget-linter.js         # one linter
npm run validate:floor1-geometry               # private Floor 1 geometry (skips cleanly when absent)
```

`tests/unit/` and `tests/lint/` are the fast, no-infrastructure tiers — they run in the pre-commit hook and CI and must never require a live DB or network. `tests/e2e/`, `tests/smoke/`, `tests/data-quality/`, `tests/perf/`, `tests/resilience/`, `tests/disaster-recovery/` need the stack running.

### Aggregate assurance runner

`scripts/production-assurance.js` wraps the heavier tiers into profiles and writes one aggregate JSON to `docs/evidence/runtime/`:

```bash
node scripts/production-assurance.js --profile=fast      # default
node scripts/production-assurance.js --profile=release
node scripts/production-assurance.js --profile=full --allow-container-kill
```

Other profiles: `security` (`--full`), `load`, `dr`. A profile never runs a category outside its own list.

### Pre-commit / CI

`.husky/pre-commit` runs `node scripts/pre-commit.js`: the unit tests, the `tests/lint/` linters, JSON validation of every dashboard, and flow JSON validation. `.github/workflows/ci.yml` runs roughly the same set plus gitleaks, compose validation, Prometheus config/rule lint, and the private-data leak scanner. **Both hardcode individual test paths** — a new file in `tests/unit/` is not picked up automatically; add it to `scripts/pre-commit.js` and `.github/workflows/ci.yml`. This has already drifted: `factory-twin-predictive`, `factory-twin-spc`, `floor1-cad-blocks` and `floor1-cad-rings` are referenced by neither. Commit messages are conventional-commit linted (`commitlint.config.js`).

## Architecture

### Data path

```text
SNMP devices / LDI machines (HTTP)
  -> Node-RED (ingestion, parsing, retry queue)
  -> PgBouncer (transaction pooling, plain auth, NO prepared statements)
  -> TimescaleDB (hypertables in `public` schema + continuous aggregates)
  -> Grafana (dashboards) / Prometheus + Alertmanager (alerting to LINE, Teams)
```

### The single front door

Nothing but nginx publishes a host port for the UI. `proxy/nginx.conf` listens on `${GRAFANA_PORT:-3000}` and routes same-origin so every request carries Grafana's session cookie:

- `/` to `grafana:3000`
- `/alarm-api/` to `alarm-api:4000` (auth-gated via nginx `auth_request` against Grafana's `/api/user`)
- `/factory-twin-3d/` to `factory-twin-3d:4100`
- `/ldi-telemetry`, `/inject` to `node-red:1880`

Grafana itself has **no** published port. When something works direct-to-container but not through `localhost:3000`, suspect nginx, not the service. Prometheus, Alertmanager, Blackbox and Node-RED bind to `127.0.0.1` only.

### Containers

15 services in `docker-compose.yaml`, all containers named `ims-*`: `timescaledb`, `pgbouncer`, `db-migrate` (one-shot migration runner via `scripts/migrate-entrypoint.sh`, the single canonical runner), `node-red`, `grafana`, `renderer` (Grafana image renderer), `proxy`, `prometheus`, `alertmanager`, `blackbox-exporter`, `snmpsim`, `alarm-api`, `factory-twin-3d`, `observability-archiver`, `pgadmin`.

The base file has **no `profiles:` gating** — `make up` and `make up-prod` both start all 15, SNMP simulator and pgAdmin included. `docker-compose.dev.yaml` (the only file that puts `snmpsim` behind a `dev` profile) is referenced by no Makefile target. Apart from the nginx front door, `pgadmin` is the only service publishing on all interfaces (`5050:80`); every other published port binds `127.0.0.1`.

Secrets come from `.env` with `${VAR:?message}` required-var syntax — `.env.example` lists every key. The example values are public; never reuse them outside a throw-away environment.

### Node-RED (`nodered_data/`)

`nodered_data/flows/*.json` are the **source of truth**; `flows.json` is a build artifact produced by `scripts/build-flows.js` (concatenate + duplicate-ID check). Never hand-edit `flows.json`. Function nodes run in a sandbox with no `require()` and no `structuredClone` — see `AGENTS.md` section 3 for the exact substitutes and the mandatory O(N) single-pass + explicit-GC parsing pattern.

### Database (`database/migrations/`)

Numbered, forward-only SQL files applied by the one-shot `db-migrate` container running `scripts/migrate-entrypoint.sh`, which tracks applied versions in `public.schema_migrations`. That entrypoint is the single canonical runner — `scripts/migrate.sh` is only a `docker compose run --rm db-migrate` wrapper for a manual re-run. Earlier duplicate runners caused real tracking drift; do not add a third. Everything lives in the `public` schema. Raw hypertables use a `time` column; continuous aggregates use `bucket` — Grafana aliases `bucket AS time`. Most dashboard queries should hit a CAGG, not a raw table; `tests/lint/query-budget-linter.js` enforces that tiering contract.

### Grafana (`monitoring/grafana/`)

Dashboards are provisioned read-only from `dashboards/infrastructure/` and `dashboards/manufacturing/`. Edits are made to the JSON files in git, not in the UI. `tests/lint/dashboard-linter.js` enforces the grid and token rules from `AGENTS.md` section 4 (every row sums to 24 columns, canonical color tokens only, quoted template variables in SQL).

### Services (`services/`)

- **`alarm-api/`** — Express + `pg`. The only operator write path: `POST /alarms/ack`, `POST /alarms/resolve` behind an actor gate, plus `GET /healthz`.
- **`factory-twin-3d/`** — the production Floor 1 digital twin (Express, ~7k lines). Business logic sits in `lib/*.js` (`mapping`, `telemetry`, `alarm`, `analytics`, `evidence`, `wire`, `schematic`, `floors`, `spc`, `eap-map`, `predictive`, …); the browser viewer is in `public/`. Central invariant: **geometry and identity are evidence-gated** — no confirmed device-to-CAD mapping means no live attachment, whatever telemetry exists. `tests/lint/floor1-cad-reconciliation.js` and `floor1-orientation.js` compare the served model back against the CAD record.

Floor 1 CAD source data is confidential and lives outside git; `tests/lint/private-data-leak-scanner.js` runs first in CI, and the geometry validators skip cleanly when that data is absent. Public docs may state counts, rules and verdicts derived from the CAD, never dimensions, coordinates, areas, layer names or label text.

## Conventions worth knowing

- **Documentation counts are linted.** `tests/lint/doc-overclaim-linter.js` rejects prose that hardcodes dashboard/service/migration totals in specific shapes. Use the generators (`scripts/generate-dashboard-inventory.js --check`, `generate-schema-inventory.js`, `generate-docs-readme-index.js --check`) rather than writing totals by hand.
- **Docs are trilingual.** `docs/` (English) mirrors into `th/` and `zh-CN/`. Living docs (README, manuals, runbooks, architecture) are fully translated; dated evidence and audit records stay English-first behind a localized notice. A doc edit that skips the mirrors will drift.
- **Evidence over assertion.** Claims in docs are backed by artifacts under `docs/evidence/`; the assurance runner writes new ones there. Don't invent a pass/fail threshold for a check that deliberately has none (see the comments in `tests/e2e/runner.js`).
- **Windows caveat.** PowerShell mangles `\n` inside flow JSON — use Python or Node for multi-file flow edits, never PowerShell string replacement.
