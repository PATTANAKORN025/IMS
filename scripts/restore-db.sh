#!/usr/bin/env bash
set -euo pipefail

if [ -z "${1:-}" ]; then
    echo "Usage: ./restore-db.sh <backup-file.sql.gz>"
    exit 1
fi

BACKUP_FILE="$1"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

env_value() { # read KEY from .env without sourcing it
  [ -f "$ROOT/.env" ] || return 0
  sed -n "s/^$1=//p" "$ROOT/.env" 2>/dev/null | tail -n 1 | sed -e "s/^['\"]//" -e "s/['\"]\$//"
}
DB_USER="${POSTGRES_USER:-$(env_value POSTGRES_USER)}"
DB_NAME="${POSTGRES_DB:-$(env_value POSTGRES_DB)}"
DB_USER="${DB_USER:-ims_admin}"
DB_NAME="${DB_NAME:-ims}"

gzip -t "$BACKUP_FILE"

echo "⚠️  This will OVERWRITE the current database ${DB_NAME}. Press Ctrl+C to cancel, or Enter to continue."
read -r

gunzip -c "$BACKUP_FILE" | docker compose --project-directory "$ROOT" exec -T timescaledb psql -U "$DB_USER" "$DB_NAME"

echo "Restore complete. Verify with: docker compose exec timescaledb psql -U ${DB_USER} ${DB_NAME} -c '\dt'"
