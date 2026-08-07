#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
# Real-data cutover: loads real LDI telemetry/alarm data from
# data/real/ (gitignored, never committed) into the live database.
#
# Prerequisites:
#   - data/real/ldi_data_clean.sql, ldi_alarm_log_clean.sql,
#     ldi_alarm_ms_code_clean.sql exist (produced by
#     scripts/unwrap-pgadmin-export.py from the pgAdmin CSV export).
#   - ims-timescaledb container running.
#   - Node-RED simulator already stopped (LDI_SIMULATOR_ENABLED=false
#     in .env) -- this script does not stop it for you.
#
# What this does, in order:
#   1. Registers 3 real equipment IDs that appear only in the alarm
#      log, never in the telemetry export (LDI001-LD1, LDI001-LD2,
#      LDI_01) -- confirmed genuinely distinct from the already-
#      registered LDI002-LD1/LD2 by non-overlapping... actually
#      overlapping for months of concurrent operation, ruling out
#      "renamed over time". See git history for the investigation.
#   2. Loads real ldi_data (telemetry) -- table must be empty first
#      (TRUNCATE or a prior devices-remap cascade already cleared it).
#   3. Loads real ldi_alarm_log.
#   4. Merges the 892-row live-DB alarm_ms_code export into
#      ldi_alarm_ms_code via UPSERT, computing severity with the
#      identical rule documented in migration 061 -- this stays out
#      of git (unlike migration 061's 1,820-row catalog, which was
#      already committed before the real-data-outside-git policy was
#      adopted and is being kept as an accepted historical exception).
#   5. Refreshes all 4 continuous aggregates, re-analyzes, and
#      recompresses chunks older than 7 days (matching migration
#      059's compression policy).
#
# Idempotent: devices insert uses ON CONFLICT DO NOTHING, ldi_data/
# ldi_alarm_log loads assume an empty table (safe to re-run after a
# TRUNCATE), alarm_ms_code merge is a straight UPSERT.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

CONTAINER=ims-timescaledb
PSQL_USER=${POSTGRES_USER:-ims_admin}
PSQL_DB=${POSTGRES_DB:-ims}
REAL_DIR=data/real

psql() { docker exec -i "$CONTAINER" psql -U "$PSQL_USER" -d "$PSQL_DB" -v ON_ERROR_STOP=1 "$@"; }

for f in ldi_data_clean.sql ldi_alarm_log_clean.sql ldi_alarm_ms_code_clean.sql; do
    [ -f "$REAL_DIR/$f" ] || { echo "missing $REAL_DIR/$f -- run scripts/unwrap-pgadmin-export.py first" >&2; exit 1; }
done

echo "==> 1/5 registering alarm-only equipment IDs"
psql <<'SQL'
INSERT INTO public.devices (device_id, hostname, location, device_type, enabled, snmp_community, snmp_port)
VALUES
    ('LDI001-LD1', 'ldi001-ld1',    'Factory 3 - DF INNER', 'ldi', true, 'public', 161),
    ('LDI001-LD2', 'ldi001-ld2',    'Factory 3 - DF INNER', 'ldi', true, 'public', 161),
    ('LDI_01',     'ldi-01-legacy', 'Factory 3 - DF INNER', 'ldi', true, 'public', 161)
ON CONFLICT (device_id) DO NOTHING;
SQL

echo "==> 2/5 decompressing chunks (compressed chunks reject inserts)"
psql -c "SELECT decompress_chunk(c, if_compressed=>true) FROM show_chunks('public.ldi_data') c;"

ROWS=$(psql -t -c "SELECT count(*) FROM public.ldi_data;" | tr -d '[:space:]')
if [ "$ROWS" != "0" ]; then
    echo "==> ldi_data has $ROWS existing rows -- truncating before real load"
    psql -c "TRUNCATE public.ldi_data;"
fi
echo "==> 3/5 loading real ldi_data ($(wc -l < "$REAL_DIR/ldi_data_clean.sql") lines)"
psql < "$REAL_DIR/ldi_data_clean.sql"

ALOG_ROWS=$(psql -t -c "SELECT count(*) FROM public.ldi_alarm_log;" | tr -d '[:space:]')
if [ "$ALOG_ROWS" != "0" ]; then
    echo "==> ldi_alarm_log has $ALOG_ROWS existing rows -- truncating before real load"
    psql -c "TRUNCATE public.ldi_alarm_log;"
fi
echo "==> loading real ldi_alarm_log"
psql < "$REAL_DIR/ldi_alarm_log_clean.sql"

echo "==> 4/5 merging real alarm_ms_code export (892 rows) via UPSERT"
# TEMP TABLE must live in the same session as its INSERTs and the final
# UPSERT, so this whole step is one psql invocation, not several. The
# staging INSERTs come from the real export file with its target table
# name swapped via sed into a scratch copy (avoids nested-quoting issues
# from trying to do the substitution inline via \copy FROM PROGRAM).
STAGING_FILE=$(mktemp)
trap 'rm -f "$STAGING_FILE"' EXIT
sed 's/INSERT INTO public\.ldi_alarm_ms_code/INSERT INTO staging_amc/' \
    "$REAL_DIR/ldi_alarm_ms_code_clean.sql" > "$STAGING_FILE"

{
cat <<'SQL'
BEGIN;

-- PK required: the real export's own INSERT statements carry
-- "ON CONFLICT (alarm_id) DO NOTHING" (source dump was itself idempotent),
-- which errors ("no unique or exclusion constraint matching the ON
-- CONFLICT specification") against a staging table with no such constraint.
CREATE TEMP TABLE staging_amc (
    alarm_id     VARCHAR(15) PRIMARY KEY,
    alarm_type   VARCHAR(50),
    alarm_code   VARCHAR(50),
    alarm_msg    VARCHAR(500),
    alarm_detail VARCHAR(500)
) ON COMMIT DROP;
SQL

cat "$STAGING_FILE"

# Same rule as migration 061's severity classifier, applied here in SQL
# so the 892-row live-DB export gets identical treatment without a
# second, divergent Python/SQL implementation to keep in sync.
cat <<'SQL'

INSERT INTO public.ldi_alarm_ms_code (alarm_id, alarm_type, alarm_code, alarm_msg, alarm_detail, severity)
SELECT
    alarm_id, alarm_type, alarm_code, alarm_msg,
    NULLIF(alarm_detail, 'NULL'),
    CASE
        WHEN alarm_msg ~* 'emergency|e-stop|estop|crash|collision|overcurrent|fire|critical|safety|violation|overheat|speeding|hyper-?acceleration'
            THEN 'Critical'
        WHEN upper(trim(alarm_type)) = 'E' THEN 'Critical'
        WHEN upper(trim(alarm_type)) = 'W' THEN 'Warning'
        WHEN alarm_msg ~* 'timeout|retry|not supported|empty|invalid|parameter|please|not found' THEN 'Minor'
        ELSE 'Major'
    END AS severity
FROM staging_amc
ON CONFLICT (alarm_id) DO UPDATE SET
    alarm_type   = EXCLUDED.alarm_type,
    alarm_code   = EXCLUDED.alarm_code,
    alarm_msg    = EXCLUDED.alarm_msg,
    alarm_detail = EXCLUDED.alarm_detail,
    severity     = EXCLUDED.severity;

COMMIT;
SQL
} | psql

echo "==> 5/5 refreshing continuous aggregates, recompressing, analyzing"
psql <<'SQL'
CALL refresh_continuous_aggregate('public.ldi_data_hourly', NULL, NULL);
CALL refresh_continuous_aggregate('public.ldi_data_1m', NULL, NULL);
CALL refresh_continuous_aggregate('public.ldi_data_15m', NULL, NULL);
CALL refresh_continuous_aggregate('public.ldi_data_1h', NULL, NULL);

SELECT compress_chunk(c, if_not_compressed=>true)
FROM show_chunks('public.ldi_data', older_than => INTERVAL '7 days') c;

ANALYZE public.ldi_data;
ANALYZE public.ldi_alarm_log;
ANALYZE public.ldi_alarm_ms_code;
SQL

echo "==> done"
psql -c "SELECT
    (SELECT count(*) FROM public.ldi_data) AS ldi_data_rows,
    (SELECT count(*) FROM public.ldi_alarm_log) AS ldi_alarm_log_rows,
    (SELECT count(*) FROM public.ldi_alarm_ms_code) AS ldi_alarm_ms_code_rows;"
