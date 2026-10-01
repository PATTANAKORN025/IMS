# scripts/

Operational and build scripts. Run them from the repository root. Most are wrapped by a `make` target (see `make help`); the rest are run directly.

A script that only fixed one historical problem does not belong here: delete it once it has run, and let git history keep it.

## Stack lifecycle

| Script | Purpose | Entry point |
| --- | --- | --- |
| `check-env.js` | Refuses to start when a key `docker-compose.yaml` requires is missing; `--strict` also rejects public example values | `make up`, `make up-prod`, `make check-env` |
| `migrate-entrypoint.sh` | The single canonical migration runner, run by the one-shot `db-migrate` container | `docker compose up` |
| `migrate.sh` | Re-runs `db-migrate` by hand | direct |
| `verify-deployment.sh` / `.ps1` | Health check: containers, DB, pipeline, alerts | `make verify` |
| `verify-db-health.sh` / `.ps1` | Database integrity check | direct |
| `container-watchdog.sh` | Restarts exited containers that Docker Desktop's restart policy misses | direct / scheduled |
| `observability-archiver.sh` | Runs inside the `observability-archiver` service | compose |
| `switch-data-mode.sh` | Switches between real and mock data | direct |
| `import-real-data.sh` | Real-data cutover for LDI telemetry and alarms | direct |

## Backup and disaster recovery

| Script | Purpose | Entry point |
| --- | --- | --- |
| `backup-db.sh` / `.ps1` | `pg_dump -Z` inside the container, copied out with `docker cp` | `make backup` |
| `restore-db.sh` | Restores a `.sql.gz` dump into the live database | `make restore FILE=…` |
| `dr-test.sh`, `dr-verify-restore.sh`, `dr-restore-table-data.py` | Disaster-recovery drill and restore verification | direct |

See [Backup & Restore](../docs/operations/BACKUP_RESTORE.md).

## Build and deploy

| Script | Purpose | Entry point |
| --- | --- | --- |
| `make-help.js` | Prints the Makefile targets and their `## ` descriptions | `make`, `make help` |
| `build-flows.js` | Merges `nodered_data/flows/*.json` into `flows.json` | `make build-flows` |
| `provision-library-panels.sh` | Grafana library panels over the HTTP API | direct |
| `grafana-folder-permissions.js` | Permissions of the provisioned dashboard folders | direct |
| `create-playlist.sh` | NOC wall-display playlist | direct |
| `snmp-discover.js` | SNMP OID discovery for a new device | direct |
| `unwrap-pgadmin-export.py` | Unwraps a pgAdmin "Copy with SQL INSERT" export | direct |

## Quality gates and assurance

| Script | Purpose | Entry point |
| --- | --- | --- |
| `pre-commit.js` | Unit tests, linters, dashboard and flow JSON checks | husky hook, CI, `make check` |
| `run-alarm-api-tests.js` | alarm-api tests with the service's own dependencies | `make test-unit` |
| `production-assurance.js`, `assurance-schema.js`, `gate.js` | Profiled assurance runs and their verdict | direct |
| `production-readiness-render.js`, `failure-detection-matrix-render.js` | Render evidence documents from assurance output | direct |
| `kiosk-load-test.sh`, `soak-test-report.sh`, `soak-test-report-hidden.vbs` | Load and soak tests (the `.vbs` runs the soak report from Task Scheduler without a console window) | direct |
| `find-broken-links.js` | Relative-link checker for all Markdown | direct |

## Generators (documentation is generated, not hand-counted)

| Script | Output | Entry point |
| --- | --- | --- |
| `generate-dashboard-inventory.js` | Dashboard inventory (`--check` in CI) | direct |
| `generate-schema-inventory.js` | Database schema inventory | direct |
| `generate-docs-readme-index.js` | Directory maps in each docs README (`--check`) | direct |
| `generate-showcase.sh` | README dashboard screenshots | direct |
| `generate-banner-gif.py`, `icon-engine.mjs` | README banner and icon assets | direct |

## Floor 1 digital twin (needs the private CAD data, outside git)

| Script | Purpose |
| --- | --- |
| `extract-floor1-cad.js`, `extract-floor1-raw-cad.js`, `extract-floor1-equipment.js` | Extract geometry from the private CAD export |
| `apply-floor1-canonical-frame.js`, `recover-floor1-outside-envelope-equipment.js` | Normalise and repair the extracted records |
| `twin-direct-container.sh` / `.ps1` | Throwaway Factory Twin container for scene checks |

## Shared code

- `lib/`: helpers shared by the scripts above.
- `mock/`: synthetic data generators (`docs/data/MOCK_DATA.md`).
