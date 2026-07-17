#!/usr/bin/env bash
set -euo pipefail

if [ -z "${1:-}" ]; then
    echo "Usage: ./restore-db.sh <backup-file.sql.gz>"
    exit 1
fi

BACKUP_FILE="$1"

if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi
DB_NAME="${POSTGRES_DB:-ims}"
DB_USER="${POSTGRES_USER:-ims_admin}"

echo "⚠️  This will OVERWRITE the current database ($DB_NAME). Press Ctrl+C to cancel, or Enter to continue."
read -r

gunzip -c "$BACKUP_FILE" | docker compose exec -T timescaledb psql -U "$DB_USER" "$DB_NAME"

echo "Restore complete. Verify with: docker compose exec timescaledb psql -U $DB_USER $DB_NAME -c '\dt'"
