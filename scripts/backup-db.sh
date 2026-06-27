#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="ims_backup_${TIMESTAMP}.sql"

mkdir -p "$BACKUP_DIR"

echo "Backing up database to ${BACKUP_DIR}/${FILENAME}..."
docker compose exec -T timescaledb pg_dump -U ims_admin ims > "${BACKUP_DIR}/${FILENAME}"

echo "Compressing..."
gzip "${BACKUP_DIR}/${FILENAME}"

echo "Done: ${BACKUP_DIR}/${FILENAME}.gz"

# ลบ backup ที่เก่ากว่า 30 วันอัตโนมัติ
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +30 -delete
