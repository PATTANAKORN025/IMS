#!/usr/bin/env bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# IMS — Migration Runner
# Applies pending SQL migrations and tracks them in schema_migrations.
# Usage: bash scripts/migrate.sh
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

set -euo pipefail

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

MIGRATIONS_DIR="database/migrations"
DATABASE="${POSTGRES_DB:-ims}"
USER="${POSTGRES_USER:-ims_admin}"

echo -e "${GREEN}IMS Migration Runner${NC}"
echo "─────────────────────────"

# Ensure tracking table exists
docker compose exec -T timescaledb psql -U "$USER" -d "$DATABASE" -c "
CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    applied_at TIMESTAMPTZ DEFAULT NOW(),
    checksum TEXT
);
" > /dev/null 2>&1

# Find pending migrations (files NOT in schema_migrations)
PENDING=0
APPLIED=0
FAILED=0

for f in $(ls -1 "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort); do
    fname=$(basename "$f")
    version="${fname%.sql}"

    # Check if already applied
    EXISTS=$(docker compose exec -T timescaledb psql -U "$USER" -d "$DATABASE" -t -A -c \
        "SELECT COUNT(*) FROM public.schema_migrations WHERE version = '${version}';")

    if [ "$EXISTS" = "1" ]; then
        continue  # Already applied
    fi

    PENDING=$((PENDING + 1))
    echo -ne "  ${YELLOW}${fname}...${NC} "

    # Apply migration
    if docker compose exec -T timescaledb psql -U "$USER" -d "$DATABASE" -v ON_ERROR_STOP=0 -f - < "$f" > /dev/null 2>&1; then
        # Record in tracking table
        docker compose exec -T timescaledb psql -U "$USER" -d "$DATABASE" -c \
            "INSERT INTO public.schema_migrations (version, filename) VALUES ('${version}', '${fname}');" > /dev/null 2>&1
        echo -e "${GREEN}OK${NC}"
        APPLIED=$((APPLIED + 1))
    else
        echo -e "${RED}FAILED${NC}"
        FAILED=$((FAILED + 1))
    fi
done

echo ""
echo "─────────────────────────"
echo -e "Pending: ${PENDING}  Applied: ${GREEN}${APPLIED}${NC}  Failed: ${RED}${FAILED}${NC}"
echo "─────────────────────────"

if [ "$FAILED" -gt 0 ]; then
    echo -e "${RED}Migration completed with errors.${NC}"
    exit 1
fi

echo -e "${GREEN}All migrations applied successfully.${NC}"
