# 🤝 Contributing to IMS

> **Guidelines สำหรับการร่วมพัฒนา IMS (Infrastructure Monitoring System)**

---

<div align="center">

![Contributing](https://img.shields.io/badge/Contributing-Guide-blue)
![License](https://img.shields.io/badge/License-MIT-green)

</div>

---

## 📋 Development Workflow

1. Fork the repository
2. Create a feature branch from `main`
3. Make changes following project conventions
4. Run `make verify` before committing
5. Submit a pull request

---

## 🔧 Project Conventions

### Node-RED Flows

- `flows-ubuntu.json` is the **source of truth** — never edit `nodered_data/flows.json` directly
- After editing flows, run `make restart` to apply changes
- Function nodes use `global.get('snmp')` — `require()` is unavailable in sandboxed VM
- `func` fields are single-line JSON strings — preserve `\n` escape sequences

```bash
# Validate flow JSON
node -e "const j=JSON.parse(require('fs').readFileSync('flows-ubuntu.json','utf8')); console.log('Valid:', j.length, 'nodes')"
```

### Database

- All objects in `public` schema only
- Never query raw `machine_telemetry` for dashboards — use continuous aggregates
- Column type changes require the 7-step hypertable ALTER sequence
- Always use `safeStr()` for user inputs — zero tolerance for SQL injection

### Grafana

- Edit dashboard JSON files in `monitoring/grafana/dashboards/`
- Use `ROUND(x::NUMERIC, N)` — PostgreSQL ROUND only accepts NUMERIC
- Verify datasource UID matches `timescaledb` not `${DS_IMS_DATABASE}`
- Follow SRE color convention (CPU=Yellow→Red, RAM=Purple→Red, Disk=Cyan→Red)

### Security

- Never commit secrets, passwords, or API tokens
- Use Docker secrets for sensitive values
- Report security issues via GitHub Issues with `security` label
- All plugins/MCP must be open-source (MIT/ISC/BSD/Apache-2.0)

---

## 📝 Commit Messages

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
feat/<topic>      # New features
fix/<topic>       # Bug fixes
chore/<topic>     # Maintenance
docs/<topic>      # Documentation
refactor/<topic>  # Code restructuring
test/<topic>      # Tests
security/<topic>  # Security fixes
```

---

## 🧪 Testing

```bash
# Unit tests
make test-unit

# K6 load tests
make test-load

# Full deployment verification
make verify

# Validate Prometheus config
docker compose exec prometheus promtool check config /etc/prometheus/prometheus.yml

# Validate Grafana dashboards
for f in monitoring/grafana/dashboards/*.json; do python -c "import json; json.load(open('$f'))" && echo "OK: $f"; done
```

---

## 📁 Project Structure

```
IMS/
├── docker-compose.yaml          # Main orchestration
├── flows-ubuntu.json            # Node-RED flows (source of truth)
├── postgres/init/               # DB schema
├── database/migrations/         # TimescaleDB migrations
├── monitoring/
│   ├── grafana/dashboards/      # Dashboard JSONs
│   └── prometheus/rules/        # Alert rules
├── node-red/flows/              # Split flows
├── scripts/                     # Utility scripts
├── tests/k6/                    # Load tests
└── docs/                        # Documentation
```

---

## 🔍 Code Review Checklist

- [ ] No secrets or credentials in code
- [ ] SQL uses `safeStr()` for user inputs
- [ ] Flow JSON is valid (no `\n` corruption)
- [ ] Grafana datasource UID is `timescaledb`
- [ ] Prometheus rules pass `promtool check`
- [ ] Tests pass (`make verify`)
- [ ] Documentation updated if needed

---

<div align="center">

**IMS Contributing Guide — Version 1.0**

</div>
