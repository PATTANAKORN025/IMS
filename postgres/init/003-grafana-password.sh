#!/usr/bin/env bash
set -euo pipefail

grafana_db_password="${GRAFANA_DB_PASSWORD:-grafana_secure}"

psql -v ON_ERROR_STOP=1 \
  --username "${POSTGRES_USER}" \
  --dbname "${POSTGRES_DB}" \
  --set=grafana_db_password="${grafana_db_password}" <<'EOSQL'
ALTER ROLE grafana_reader WITH PASSWORD :'grafana_db_password';
EOSQL
