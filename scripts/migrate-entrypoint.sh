#!/bin/sh
# IMS Migration Runner — runs inside Docker as a one-shot init service
# Applies pending SQL migrations from /migrations/ against the database.
#
# Two rules beyond "run what is not recorded yet":
#  - Stop at the first failure. Later migrations assume the earlier ones
#    succeeded; running them on a half-applied schema only adds damage.
#    (Files are not wrapped in --single-transaction: 19 of them call
#    refresh_continuous_aggregate or similar, which cannot run inside a
#    transaction block. A file that needs atomicity uses BEGIN/COMMIT itself.)
#  - A migration may defer itself by printing a line that starts with
#    IMS_MIGRATION_DEFERRED (084-086 do this when the eap_backup database
#    does not exist yet). A deferred file is not recorded, so it runs again on
#    the next start and applies once its prerequisite exists.
set -e

MIGRATIONS_DIR="/migrations"
PENDING=0
APPLIED=0
DEFERRED=0
FAILED=0

echo "IMS Migration Runner"
echo "─────────────────────"

# Wait for database TCP connection to be fully ready before proceeding
MAX_RETRIES=30
RETRY_COUNT=0
echo "Waiting for PostgreSQL at ${PGHOST:-timescaledb}:${PGPORT:-5432}..."
until pg_isready -h "${PGHOST:-timescaledb}" -p "${PGPORT:-5432}" -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ "$RETRY_COUNT" -ge "$MAX_RETRIES" ]; then
        echo "ERROR: PostgreSQL at ${PGHOST:-timescaledb}:${PGPORT:-5432} not reachable after ${MAX_RETRIES} attempts." >&2
        exit 2
    fi
    echo "Waiting for database connection... (${RETRY_COUNT}/${MAX_RETRIES})"
    sleep 1
done

# Ensure tracking table exists
psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname "${POSTGRES_DB}" -c "
CREATE TABLE IF NOT EXISTS public.schema_migrations (
    version TEXT PRIMARY KEY,
    filename TEXT NOT NULL,
    applied_at TIMESTAMPTZ DEFAULT NOW()
);
"

for f in $(ls -1 "$MIGRATIONS_DIR"/*.sql 2>/dev/null | sort); do
    fname=$(basename "$f")
    version="${fname%.sql}"

    EXISTS=$(psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname "${POSTGRES_DB}" -t -A -c "SELECT COUNT(*) FROM public.schema_migrations WHERE version = '${version}';")

    if [ "$EXISTS" = "1" ]; then
        continue
    fi

    PENDING=$((PENDING + 1))
    printf "  %s... " "$fname"

    if OUT=$(psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname "${POSTGRES_DB}" -f "$f" 2>&1); then
        if printf '%s\n' "$OUT" | grep -q '^IMS_MIGRATION_DEFERRED'; then
            echo "DEFERRED (not recorded; runs again next start)"
            printf '%s\n' "$OUT" | grep '^IMS_MIGRATION_DEFERRED' | sed 's/^/      /'
            DEFERRED=$((DEFERRED + 1))
            PENDING=$((PENDING - 1))
            continue
        fi
        psql -q -v ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname "${POSTGRES_DB}" -c "INSERT INTO public.schema_migrations (version, filename) VALUES ('${version}', '${fname}');"
        echo "OK"
        APPLIED=$((APPLIED + 1))
    else
        echo "FAILED"
        printf '%s\n' "$OUT" | tail -n 20 | sed 's/^/      /'
        FAILED=$((FAILED + 1))
        break
    fi
done

echo "─────────────────────"
# summary format is parsed by CI (schema drift check) and scripts/dr-test.sh
echo "Pending: ${PENDING}  Applied: ${APPLIED}  Failed: ${FAILED}"
echo "Deferred: ${DEFERRED}"
echo "─────────────────────"

if [ "$FAILED" -gt 0 ]; then
    echo "Migration stopped at the first failure; later migrations were not run."
    exit 1
fi

echo "All migrations applied successfully."
