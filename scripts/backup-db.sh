#!/usr/bin/env bash
# IMS database backup. pg_dump writes a gzipped plain-SQL dump inside the
# container (-Z) and docker cp copies the file out, so the bytes never pass
# through a host pipe or shell encoding. Role and database come from .env.
set -euo pipefail
# Git Bash on Windows rewrites /tmp/... arguments into host paths; docker exec needs them verbatim.
export MSYS_NO_PATHCONV=1

cd "$(dirname "$0")/.."

env_value() { # read KEY from .env without sourcing it
  [ -f .env ] || return 0
  sed -n "s/^$1=//p" .env 2>/dev/null | tail -n 1 | sed -e "s/^['\"]//" -e "s/['\"]\$//"
}
DB_USER="${POSTGRES_USER:-$(env_value POSTGRES_USER)}"
DB_NAME="${POSTGRES_DB:-$(env_value POSTGRES_DB)}"
DB_USER="${DB_USER:-ims_admin}"
DB_NAME="${DB_NAME:-ims}"

CONTAINER="ims-timescaledb"
BACKUP_DIR="./backups"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="ims_backup_${TIMESTAMP}.sql.gz"
TMP="/tmp/${FILENAME}"

mkdir -p "$BACKUP_DIR"

if [ -z "$(docker ps -q --filter "name=^${CONTAINER}\$" --filter status=running)" ]; then
  echo "ERROR: ${CONTAINER} is not running." >&2
  exit 1
fi

echo "Backing up ${DB_NAME} to ${BACKUP_DIR}/${FILENAME}..."
trap 'docker exec "$CONTAINER" rm -f "$TMP" >/dev/null 2>&1 || true' EXIT
docker exec "$CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" -Z 6 -f "$TMP"
docker cp "${CONTAINER}:${TMP}" "${BACKUP_DIR}/${FILENAME}"
gzip -t "${BACKUP_DIR}/${FILENAME}"

echo "Done: ${BACKUP_DIR}/${FILENAME}"

# Delete dumps older than the retention period
find "$BACKUP_DIR" -maxdepth 1 -name 'ims_backup_*.sql.gz' -mtime +"$RETENTION_DAYS" -delete
