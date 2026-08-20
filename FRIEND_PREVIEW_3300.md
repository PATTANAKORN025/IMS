# Friend IMS isolated preview (port 3300)

This branch runs the cloned IMS stack as a staging preview without changing the
existing Grafana on port 3000 or its database.

## Prepare the environment

Copy `.env.example` to `.env`, then set all required secrets. Keep the internal
Grafana port at `3000`, but set its public URL to the preview endpoint:

```dotenv
GRAFANA_ROOT_URL=http://localhost:3300
GRAFANA_PORT=3000
LDI_SIMULATOR_ENABLED=true
```

`GRAFANA_RENDERER_TOKEN`, `INGEST_API_KEY`,
`NODE_RED_CREDENTIAL_SECRET`, database passwords, and API secrets must not be
empty. Quote a bcrypt `NODE_RED_ADMIN_PASSWORD_HASH` with single quotes so
Docker Compose does not interpret its `$` characters.

The local `.env` file is ignored by Git and must never be committed.

## Start the preview

```powershell
node scripts/build-flows.js

docker compose `
  -p ims-friend `
  -f docker-compose.yaml `
  -f docker-compose.friend.yaml `
  up -d proxy node-red snmpsim blackbox-exporter
```

Open `http://localhost:3300`. The repository provisions the Grafana
datasources, dashboards, plugins, TimescaleDB migrations, Alarm API, and 3D
service automatically.

## Isolated host ports

| Service | Host port |
| --- | ---: |
| Grafana / reverse proxy | 3300 |
| TimescaleDB | 15432 |
| Node-RED | 11880 |
| Prometheus | 19090 |
| Alertmanager | 19093 |
| Blackbox Exporter | 19115 |

The preview uses Docker project `ims-friend`, its own named volumes, and
`ims-friend-*` container names. The observability archiver remains disabled
unless the optional `archiver` profile is explicitly enabled.

## Important preview limitation

With `LDI_SIMULATOR_ENABLED=true`, the telemetry and alarm records are synthetic
staging data. The 3D placement endpoint also reports `is_simulated: true` until
real factory coordinates are supplied. Do not present either as production
evidence.

## Stop the preview

```powershell
docker compose `
  -p ims-friend `
  -f docker-compose.yaml `
  -f docker-compose.friend.yaml `
  down
```

Do not add `-v` unless the isolated preview database and Grafana data should be
permanently deleted.
