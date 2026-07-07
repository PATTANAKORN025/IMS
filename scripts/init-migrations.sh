#!/usr/bin/env bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# IMS — Automated Database Migration Script
# Applies all SQL migrations in sequence against TimescaleDB
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

set -euo pipefail

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

CONTAINER="ims-timescaledb"
DATABASE="ims"
USER="ims_admin"
MIGRATIONS_DIR="$(dirname "$0")/../database/migrations"

echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}  IMS — Database Migration Runner${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Verify container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
    echo -e "${RED}ERROR: Container '${CONTAINER}' is not running.${NC}"
    echo -e "${YELLOW}Run: docker compose up -d timescaledb${NC}"
    exit 1
fi

# Verify migrations directory exists
if [ ! -d "$MIGRATIONS_DIR" ]; then
    echo -e "${RED}ERROR: Migrations directory not found: ${MIGRATIONS_DIR}${NC}"
    exit 1
fi

# Count migration files
MIGRATION_COUNT=$(ls -1 "$MIGRATIONS_DIR"/*.sql 2>/dev/null | wc -l)
if [ "$MIGRATION_COUNT" -eq 0 ]; then
    echo -e "${RED}ERROR: No .sql files found in ${MIGRATIONS_DIR}${NC}"
    exit 1
fi

echo -e "${GREEN}Found ${MIGRATION_COUNT} migration files${NC}"
echo ""

APPLIED=0
SKIPPED=0
FAILED=0

for migration_file in $(ls -1 "$MIGRATIONS_DIR"/*.sql | sort); do
    filename=$(basename "$migration_file")
    echo -ne "  ${CYAN}▶ ${filename}...${NC} "

    # Check if migration already applied (by counting its statements)
    RESULT=$(docker exec -i "$CONTAINER" psql -U "$USER" -d "$DATABASE" -v ON_ERROR_STOP=1 -f "$migration_file" 2>&1)

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ OK${NC}"
        APPLIED=$((APPLIED + 1))
    else
        # Check if error is "already exists" (idempotent — skip gracefully)
        if echo "$RESULT" | grep -qi "already exists\|does not exist\|relation.*already"; then
            echo -e "${YELLOW}⊘ Skipped (already applied)${NC}"
            SKIPPED=$((SKIPPED + 1))
        else
            echo -e "${RED}✗ FAILED${NC}"
            echo -e "${RED}  Error: $(echo "$RESULT" | head -3)${NC}"
            FAILED=$((FAILED + 1))
        fi
    fi
done

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  ${GREEN}Applied: ${APPLIED}${NC}  ${YELLOW}Skipped: ${SKIPPED}${NC}  ${RED}Failed: ${FAILED}${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

if [ "$FAILED" -gt 0 ]; then
    echo -e "${RED}Migration completed with errors.${NC}"
    exit 1
fi

echo -e "${GREEN}All migrations applied successfully.${NC}"
