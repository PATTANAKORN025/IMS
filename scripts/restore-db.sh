#!/usr/bin/env bash
set -euo pipefail

if [ -z "${1:-}" ]; then
    echo "Usage: ./restore-db.sh <backup-file.sql.gz>"
    exit 1
fi

BACKUP_FILE="$1"

echo "⚠️  This will OVERWRITE the current database. Press Ctrl+C to cancel, or Enter to continue."
read -r

gunzip -c "$BACKUP_FILE" | docker compose exec -T timescaledb psql -U ims_admin ims

echo "Restore complete. Verify with: docker compose exec timescaledb psql -U ims_admin ims -c '\dt'"
