# Contributing to IMS

> **Guidelines สำหรับการร่วมพัฒนา IMS**

---

<div align="center">

![Contributing](https://img.shields.io/badge/Contributing-Guide-blue)
![License](https://img.shields.io/badge/License-MIT-green)

</div>

---

## Development Workflow

1. Fork the repository
2. Create a feature branch from `main`
3. Make changes following project conventions
4. Run `make verify` before committing
5. Submit a pull request

---

## Project Conventions

### Node-RED Flows

- `nodered_data/flows/*.json` is the **source of truth**, split by concern (`ingestion.json`, `ldi_ingestion.json`, `ldi_simulator.json`, `ldi_alarm_simulator.json`, `alerting.json`) — never hand-edit `nodered_data/flows.json` directly, it's a **build artifact**.
- After editing a source flow file, run `node scripts/build-flows.js` to regenerate `nodered_data/flows.json`, then `make restart` to apply it.
- Function nodes use `global.get('parser')` / `global.get('circuit-breaker')` (from `nodered_data/lib/`) — `require()` of arbitrary npm packages is unavailable in Node-RED's sandboxed function VM.
- `func` fields inside `flows.json` are single-line JSON strings — preserve `\n` escape sequences if you ever need to hand-inspect the built file.

```bash
# Validate every source flow file is syntactically valid JSON
for f in nodered_data/flows/*.json; do
 node -e "const j=JSON.parse(require('fs').readFileSync('$f','utf8')); console.log('Valid:', j.length, 'nodes —', '$f')"
done
```

### Database

- All objects live in the `public` schema.
- Never query raw hypertables (`ldi_data`, `sys_metrics`, `net_metrics`) directly from a dashboard when a continuous aggregate or materialized view already exists for that use case — see `docs/architecture/DATABASE_SCHEMA.md` for the current view/CAGG inventory. `tests/lint/query-budget-linter.js` enforces this.
- Every migration is a new, sequentially-numbered file in `database/migrations/` (currently 013–081, applied in order by the `db-migrate` service). **Never edit or renumber a migration after it's merged** — a correction is always the *next* number. See `docs/architecture/IMS_MANUFACTURING_PLATFORM_V2.md` §7 for the full versioning policy.
- Use `sanitize()` (from `nodered_data/lib/parser.js`, exported via `global.get('parser')`) for any user-supplied string that reaches SQL — zero tolerance for SQL injection.

### Grafana

- Edit dashboard JSON files in `monitoring/grafana/dashboards/infrastructure/` (NOC, Capacity, Engineering Drill-Down, Meta-Monitoring) or `monitoring/grafana/dashboards/manufacturing/` (the LDI suite) — see `docs/architecture/OWNERSHIP.md` for the domain boundary and `docs/architecture/DASHBOARD_INVENTORY.md` for the full inventory.
- Use `ROUND(x::NUMERIC, N)` in panel SQL — PostgreSQL's `ROUND()` only accepts `NUMERIC`, not `DOUBLE PRECISION`.
- The datasource UID must be `timescaledb`, not a template variable or a different name.
- Use only the approved color token set (`docs/architecture/GRAFANA_DESIGN_SYSTEM.md` §2.1) — `dashboard-linter.js` Check 15 enforces this at commit time.
- Run `node tests/lint/dashboard-linter.js` before committing any dashboard JSON change; the pre-commit hook runs it automatically.

### Security

- Never commit secrets, passwords, or API tokens. `.gitleaks.toml` scans for this in CI.
- Use Docker secrets (`secrets/` directory, gitignored) for sensitive values.
- Report security issues per `SECURITY.md`'s vulnerability-reporting process — not a public GitHub Issue.
- All AI tooling (MCP servers, skills, plugins) must be open-source (MIT/ISC/BSD/Apache-2.0) — see `SECURITY.md`'s AI Tooling Security section.

---

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

| Type | Usage | Example |
|---|---|---|
| `feat:` | New feature | `feat(snmp): add LDI walker for manufacturing metrics` |
| `fix:` | Bug fix | `fix(parser): correct counter wraparound detection` |
| `docs:` | Documentation only | `docs: upgrade enterprise documentation suite` |
| `refactor:` | Code restructuring | `refactor(flows): split ingestion and alerting` |
| `chore:` | Maintenance | `chore(ci): add Gitleaks security scanning` |
| `test:` | Adding tests | `test(k6): add database write stress test` |
| `security:` | Security fix | `security: remove hardcoded credentials` |

### Branch Naming

```
feat/<topic>   # New features
fix/<topic>    # Bug fixes
chore/<topic>   # Maintenance
docs/<topic>   # Documentation
refactor/<topic> # Code restructuring
test/<topic>   # Tests
security/<topic> # Security fixes
```

---

## Testing

```bash
# Unit tests (5 files, 99 assertions)
make test-unit

# K6 load tests
make test-load

# Full deployment verification
make verify

# Dashboard/alarm/query-budget/RCA-coverage linters
node tests/lint/dashboard-linter.js
node tests/lint/alarm-sync-linter.js
node tests/lint/query-budget-linter.js
node tests/lint/rca-mapping-coverage.js
node tests/lint/orphan-object-linter.js

# Golden-dataset SPC formula check
node tests/e2e/golden-dataset-spc.js
```

---

## Project Structure

```
IMS/
├── docker-compose.yaml     # Main orchestration
├── nodered_data/
│  ├── flows/          # Node-RED flows, split by concern (Source of Truth)
│  ├── lib/           # circuit-breaker.js, parser.js, snmp-normalize.js, units.js
│  ├── flows.json        # Built by scripts/build-flows.js from flows/*.json -- don't hand-edit
│  ├── Dockerfile        # Custom build: installs npm dependencies
│  └── settings.js       # Runtime settings
├── postgres/init/        # DB schema bootstrap (fresh-deploy path)
├── database/migrations/     # TimescaleDB migrations, applied by the db-migrate service
├── monitoring/
│  ├── grafana/dashboards/
│  │  ├── infrastructure/   # NOC, Capacity, Engineering Drill-Down, Meta-Monitoring (4)
│  │  └── manufacturing/    # LDI Manufacturing, Andon, Engineering Analytics, Machine
│  │              #  Snapshot, Data Readiness, Fleet at a Glance (6)
│  ├── grafana/library-panels/ # Shared Grafana Library Panels
│  └── prometheus/rules/    # Alert rules
├── scripts/           # Utility scripts
├── tests/
│  ├── lint/          # Dashboard/alarm/query-budget/RCA/orphan linters
│  ├── unit/          # Parser & counter unit tests
│  ├── e2e/           # Panel data, query timing, golden-dataset checks
│  ├── k6/           # Load tests
│  └── playwright/       # Visual/layout regression
└── docs/            # Documentation -- start at docs/architecture/IMS_PLATFORM_BOOK.md
```

---

## Code Review Checklist

- [ ] No secrets or credentials in code
- [ ] SQL uses `sanitize()` (from `nodered_data/lib/parser.js`) for user inputs
- [ ] Flow JSON edited in `nodered_data/flows/*.json`, then rebuilt via `node scripts/build-flows.js`
- [ ] Grafana datasource UID is `timescaledb`
- [ ] Dashboard JSON passes `node tests/lint/dashboard-linter.js`
- [ ] Tests pass (`make verify`)
- [ ] Documentation updated if needed — including `docs/architecture/DASHBOARD_INVENTORY.md` / `DATABASE_SCHEMA.md` (both auto-generated: `node scripts/generate-dashboard-inventory.js` / `node scripts/generate-schema-inventory.js`, CI-checked)

---

<div align="center">

**IMS Contributing Guide — Version 2.0, corrected 2026-08-10**

</div>
