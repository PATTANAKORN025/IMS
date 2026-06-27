# Contributing to IMS

## Development Workflow

1. Fork the repository
2. Create a feature branch from `main`
3. Make changes following the project conventions below
4. Run `make verify` before committing
5. Submit a pull request

## Project Conventions

### Node-RED Flows
- `flows-ubuntu.json` is the source of truth — never edit `nodered_data/flows.json` directly
- After editing flows, run `make restart` to apply changes
- Function nodes use `global.get('snmp')` — `require()` is unavailable in sandboxed VM

### Database
- All objects in `public` schema only
- Never query raw `machine_telemetry` for dashboards — use continuous aggregates
- Column type changes require the 7-step hypertable ALTER sequence (see `alter-hypertable-columns` skill)

### Grafana
- Edit dashboard JSON files in `monitoring/grafana/dashboards/`
- Use `ROUND(x::NUMERIC, N)` — PostgreSQL ROUND only accepts NUMERIC
- Verify datasource UID matches `timescaledb` not `${DS_IMS_DATABASE}`

### Security
- Never commit secrets, passwords, or API tokens
- Use Docker secrets for sensitive values
- Report security issues via GitHub Issues with `security` label

## Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` new feature
- `fix:` bug fix
- `docs:` documentation only
- `refactor:` code change that neither fixes a bug nor adds a feature
- `chore:` maintenance tasks

## Testing

```bash
make test-unit    # Unit tests
make test-load    # K6 load tests
make verify       # Full deployment verification
```
