#!/usr/bin/env bash
set -euo pipefail

# Load environment variables if present
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

DB_NAME="${POSTGRES_DB:-ims}"
DB_USER="${POSTGRES_USER:-ims_admin}"
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="${DB_NAME}_backup_${TIMESTAMP}.dump"

mkdir -p "$BACKUP_DIR"

echo "Backing up database to ${BACKUP_DIR}/${FILENAME}..."
docker compose exec -T timescaledb pg_dump -Fc -U "$DB_USER" "$DB_NAME" > "${BACKUP_DIR}/${FILENAME}"

echo "Done: ${BACKUP_DIR}/${FILENAME}"

# ลบ backup ที่เก่ากว่า 30 วันอัตโนมัติ
find "$BACKUP_DIR" -name "*.dump" -mtime +30 -delete
