#!/bin/sh
# IMS Migration Runner — runs inside Docker as a one-shot init service
# Applies pending SQL migrations from /migrations/ against the database.
set -e

MIGRATIONS_DIR="/migrations"
PENDING=0
APPLIED=0
FAILED=0

echo "IMS Migration Runner"
echo "─────────────────────"

# Ensure tracking table exists
psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname "${POSTGRES_DB}" -c "
CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    applied_at TIMESTAMPTZ DEFAULT NOW()
);
" > /dev/null 2>&1

for f in $(ls -1 "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort); do
    fname=$(basename "$f")
    version="${fname%.sql}"

    EXISTS=$(psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname "${POSTGRES_DB}" -t -A -c         "SELECT COUNT(*) FROM public.schema_migrations WHERE version = '${version}';")

    if [ "$EXISTS" = "1" ]; then
        continue
    fi

    PENDING=$((PENDING + 1))
    printf "  %s... " "$fname"

    if psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname "${POSTGRES_DB}" -f "$f" > /dev/null 2>&1; then
        psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname "${POSTGRES_DB}" -c             "INSERT INTO public.schema_migrations (version, filename) VALUES ('${version}', '${fname}');" > /dev/null 2>&1
        echo "OK"
        APPLIED=$((APPLIED + 1))
    else
        echo "FAILED"
        FAILED=$((FAILED + 1))
    fi
done

echo "─────────────────────"
echo "Pending: ${PENDING}  Applied: ${APPLIED}  Failed: ${FAILED}"
echo "─────────────────────"

if [ "$FAILED" -gt 0 ]; then
    echo "Migration completed with errors."
    exit 1
fi

echo "All migrations applied successfully."
