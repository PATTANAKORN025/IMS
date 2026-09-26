# Contributing to IMS

> **Guidelines for contributing to IMS**

---

<div align="center">

<img src="docs/assets/icons/check-circle.svg" width="14" align="center"/> **Contributing:** Guide
<img src="docs/assets/icons/check-circle.svg" width="14" align="center"/> **License:** MIT

</div>

---

## Development Workflow

1. Maintainers create a branch from an up-to-date `main`; external contributors fork the repository first.
2. Make changes following the project conventions below.
3. Commit. The Husky pre-commit hook runs `node scripts/pre-commit.js` (unit tests, `tests/lint/` linters, dashboard and flow JSON validation); run it by hand if hooks are disabled.
4. If the change touches the running stack, run `make verify` against a local stack before opening the pull request.
5. Open a pull request against `main`. The `main` ruleset requires one approving review (stale approvals are dismissed on push), resolved review threads, an up-to-date branch with a passing `validate-architecture` status check, and linear history — merge with **squash** or **rebase**, never a merge commit. Force-pushes and deletion of `main` are blocked.

> [!NOTE]
> No workflow job in `.github/workflows/` currently reports a check named `validate-architecture`, so the required check can never pass and merges need an administrator bypass. Rename a CI job to that name or update the ruleset to the real job names (`lint`, `unit-tests`, ...).

> [!IMPORTANT]
> This repository is public. Before every push, check the diff for secrets, production data, CAD-derived facility data, real machine/line IDs, lot numbers, internal hostnames and personal data — see [SECURITY.md](SECURITY.md#this-repository-is-public). Never use `git add .` in a working tree that holds local data exports.

---

## Project Conventions

### Node-RED Flows

- `nodered_data/flows/*.json` is the **source of truth**, split by concern (`ingestion.json`, `ldi_ingestion.json`, `ldi_simulator.json`, `ldi_alarm_simulator.json`, `alerting.json`) — never hand-edit `nodered_data/flows.json` directly, it's a **build artifact**.
- After editing a source flow file, run `node scripts/build-flows.js` (or `make build-flows`) to regenerate `nodered_data/flows.json`, then `make restart` to apply it.
- Function nodes use `global.get('parser')` / `global.get('circuitBreaker')` (from `nodered_data/lib/`, wired in `settings.js` `functionGlobalContext`) — `require()` of arbitrary npm packages is unavailable in Node-RED's sandboxed function VM. See `AGENTS.md` section 3 for the other sandbox limits.
- `func` fields inside `flows.json` are single-line JSON strings — preserve `\n` escape sequences if you ever need to hand-inspect the built file. On Windows, edit flow JSON with Node or Python, never with PowerShell string replacement.

```bash
# Validate every source flow file is syntactically valid JSON
for f in nodered_data/flows/*.json; do
 node -e "const j=JSON.parse(require('fs').readFileSync('$f','utf8')); console.log('Valid:', j.length, 'nodes —', '$f')"
done
```

### Database

- All objects live in the `public` schema.
- Never query raw hypertables (`ldi_data`, `sys_metrics`, `net_metrics`) directly from a dashboard when a continuous aggregate or materialized view already exists for that use case — see `docs/architecture/DATABASE_SCHEMA.md` for the current view/CAGG inventory. `tests/lint/query-budget-linter.js` enforces this.
- Every migration is a new, sequentially-numbered file in `database/migrations/` (currently up to `082`, applied in order by the `db-migrate` service). **Never edit or renumber a migration after it's merged** — a correction is always the _next_ number. See `docs/architecture/IMS_MANUFACTURING_PLATFORM_V2.md` §7 for the full versioning policy.
- Use `sanitize()` (from `nodered_data/lib/parser.js`, exported via `global.get('parser')`) for any user-supplied string that reaches SQL in a function node — zero tolerance for SQL injection. The Node services use parameterised queries.

### Grafana

- Edit dashboard JSON files in `monitoring/grafana/dashboards/infrastructure/` (NOC Overview, Engineering Drill-Down, AIOps & Capacity, Meta-Monitoring, Ingestion Latency) or `monitoring/grafana/dashboards/manufacturing/` (the LDI suite) — see `docs/architecture/OWNERSHIP.md` for the domain boundary and `docs/architecture/DASHBOARD_INVENTORY.md` for the full inventory.
- Use `ROUND(x::NUMERIC, N)` in panel SQL — PostgreSQL's two-argument `ROUND()` only accepts `NUMERIC`, not `DOUBLE PRECISION`.
- The datasource UID must be `timescaledb`, not a template variable or a different name.
- Use only the approved color token set (`docs/architecture/GRAFANA_DESIGN_SYSTEM.md` §2.1) — `dashboard-linter.js` Check 15 enforces this at commit time.
- Run `node tests/lint/dashboard-linter.js` before committing any dashboard JSON change; the pre-commit hook runs it automatically. Regenerate the inventory with `node scripts/generate-dashboard-inventory.js` when a dashboard is added, renamed or changes panel count.

### Security

- Never commit secrets, passwords, or API tokens. Real values live only in `.env` (gitignored); `.env.example` holds public placeholders.
- `.gitleaks.toml` configures the CI secret scan, but that scan is currently non-blocking and working-tree only — run `gitleaks detect` over the full history locally before pushing sensitive changes.
- Report security issues per `SECURITY.md`'s vulnerability-reporting process — not a public GitHub issue.
- All AI tooling (MCP servers, skills, plugins) must be open-source (MIT/ISC/BSD/Apache-2.0) — see `SECURITY.md`'s AI Tooling Security section.

### Documentation

- Documents under `docs/` are English; `th/` and `zh-CN/` mirror them. When you change a living document (README, manuals, runbooks, architecture), update both mirrors in the same pull request. Dated evidence and audit records stay English-first.
- Do not hand-type totals of dashboards, services or migrations; `tests/lint/doc-overclaim-linter.js` rejects them. Use the generators instead.

---

## Commit Messages

Commit messages are checked by commitlint with `@commitlint/config-conventional` ([Conventional Commits](https://www.conventionalcommits.org/)). Allowed types: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, `test`.

| Type | Usage | Example |
| --- | --- | --- |
| `feat:` | New feature | `feat(snmp): add LDI walker for manufacturing metrics` |
| `fix:` | Bug fix (including security fixes, with a `security` scope) | `fix(security): remove hardcoded credentials` |
| `perf:` | Performance improvement | `perf(factory-twin): cache private geometry file reads` |
| `docs:` | Documentation only | `docs(runbook): correct nginx reload command` |
| `refactor:` | Code restructuring | `refactor(flows): split ingestion and alerting` |
| `test:` | Adding tests | `test(k6): add database write stress test` |
| `ci:` / `build:` | CI pipeline / build and images | `ci: make gitleaks blocking` |
| `chore:` | Maintenance | `chore(repo): update .gitignore` |

### Branch Naming

```text
feat/<topic>      # New features
fix/<topic>       # Bug fixes
perf/<topic>      # Performance work
chore/<topic>     # Maintenance
docs/<topic>      # Documentation
refactor/<topic>  # Code restructuring
test/<topic>      # Tests
security/<topic>  # Security fixes (commit type is still fix)
```

---

## Testing

```bash
# Full pre-commit suite: every wired unit test, the tests/lint linters, dashboard + flow JSON validation
node scripts/pre-commit.js

# Only the 4 core parser/boundary unit tests
make test-unit

# Individual linters
node tests/lint/dashboard-linter.js
node tests/lint/alarm-sync-linter.js
node tests/lint/query-budget-linter.js
node tests/lint/rca-mapping-coverage.js
node tests/lint/private-data-leak-scanner.js

# Need a running stack
make verify
make test-load
node tests/lint/orphan-object-linter.js
node tests/e2e/golden-dataset-spc.js
```

New files in `tests/unit/` are not picked up automatically: add them to both `scripts/pre-commit.js` and `.github/workflows/ci.yml`.

---

## Project Structure

```text
IMS/
├── docker-compose.yaml        # Main orchestration (15 services)
├── proxy/nginx.conf           # The single front door
├── nodered_data/
│ ├── flows/                   # Node-RED flows, split by concern (source of truth)
│ ├── lib/                     # circuit-breaker.js, parser.js, snmp-normalize.js, units.js
│ ├── flows.json               # Built by scripts/build-flows.js from flows/*.json -- don't hand-edit
│ ├── Dockerfile               # Custom build: installs npm dependencies
│ └── settings.js              # Runtime settings (adminAuth, functionGlobalContext)
├── postgres/init/             # DB schema bootstrap (fresh-deploy path)
├── database/migrations/       # TimescaleDB migrations, applied by the db-migrate service
├── services/
│ ├── alarm-api/               # Acknowledge/Resolve write path
│ └── factory-twin-3d/         # Floor 1 digital twin
├── monitoring/
│ ├── grafana/dashboards/
│ │ ├── infrastructure/        # NOC Overview, Engineering Drill-Down, AIOps & Capacity,
│ │ │                          # Meta-Monitoring, Ingestion Latency
│ │ └── manufacturing/         # Easy Overview, Manufacturing Command Center, Operator Andon,
│ │                            # Alarm Console/Response/Dictionary, Engineering Analytics,
│ │                            # Machine Snapshot, Factory Digital Twin, Data Readiness
│ ├── grafana/library-panels/  # Shared Grafana library panels
│ ├── grafana/provisioning/    # Datasources, dashboard providers, Grafana-managed alert rules
│ └── prometheus/rules/        # Prometheus alert rules
├── scripts/                   # Utility scripts
├── tests/
│ ├── lint/                    # Dashboard/alarm/query-budget/RCA/leak/orphan linters
│ ├── unit/                    # Parser, boundary and factory-twin contract tests
│ ├── e2e/                     # Panel data, query timing, golden-dataset checks
│ ├── k6/                      # Load tests
│ └── playwright/              # Visual/layout and factory-twin browser regression
└── docs/                      # Documentation -- start at docs/README.md; th/ and zh-CN/ mirror it
```

---

## Code Review Checklist

- [ ] No secrets, credentials, production data, CAD-derived dimensions, real machine IDs or personal data in the diff
- [ ] SQL in function nodes uses `sanitize()` (from `nodered_data/lib/parser.js`) for user inputs
- [ ] Flow JSON edited in `nodered_data/flows/*.json`, then rebuilt via `node scripts/build-flows.js`
- [ ] Grafana datasource UID is `timescaledb`
- [ ] Dashboard JSON passes `node tests/lint/dashboard-linter.js`
- [ ] `node scripts/pre-commit.js` passes (and `make verify` for changes to the running stack)
- [ ] Documentation updated in English, Thai and Simplified Chinese where a living document changed — including the generated `docs/architecture/DASHBOARD_INVENTORY.md` / `DATABASE_SCHEMA.md` (`node scripts/generate-dashboard-inventory.js` / `node scripts/generate-schema-inventory.js`, CI-checked)

---

<div align="center">

**IMS Contributing Guide — Version 2.1, verified against `main` 2026-09-26**

</div>
