#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
# REAL ↔ MOCK data-mode switch — single command, no manual DB surgery.
#
# Real data never lives in git: it stays local-only in data/real/
# (gitignored) and is loaded/unloaded by this script. Switching to mock
# never deletes data/real/ -- it only truncates the live tables, so
# switching back to real just re-imports from the same local files.
#
# Usage:
#   bash scripts/switch-data-mode.sh mock    # simulator-generated data
#   bash scripts/switch-data-mode.sh real    # real LDI production data
#   bash scripts/switch-data-mode.sh status  # show current row counts
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

CONTAINER=ims-timescaledb
PSQL_USER=${POSTGRES_USER:-ims_admin}
PSQL_DB=${POSTGRES_DB:-ims}
ENV_FILE=.env

psql() { docker exec -i "$CONTAINER" psql -U "$PSQL_USER" -d "$PSQL_DB" -v ON_ERROR_STOP=1 "$@"; }

usage() { echo "usage: $0 {mock|real|status}" >&2; exit 1; }
MODE=${1:-}
[ -n "$MODE" ] || usage

set_simulator_flag() {
    local val="$1"
    if [ -f "$ENV_FILE" ] && grep -q '^LDI_SIMULATOR_ENABLED=' "$ENV_FILE"; then
        sed -i "s/^LDI_SIMULATOR_ENABLED=.*/LDI_SIMULATOR_ENABLED=$val/" "$ENV_FILE"
    else
        echo "LDI_SIMULATOR_ENABLED=$val" >> "$ENV_FILE"
    fi
    echo "==> LDI_SIMULATOR_ENABLED=$val in $ENV_FILE"
    docker compose up -d node-red
}

case "$MODE" in
status)
    psql -c "SELECT
        (SELECT count(*) FROM public.ldi_data) AS ldi_data_rows,
        (SELECT count(*) FROM public.ldi_alarm_log) AS ldi_alarm_log_rows,
        (SELECT count(*) FROM public.ldi_alarm_ms_code) AS ldi_alarm_ms_code_rows,
        (SELECT count(DISTINCT eqp_id) FROM public.ldi_data) AS distinct_devices_seen;"
    grep '^LDI_SIMULATOR_ENABLED=' "$ENV_FILE" 2>/dev/null || echo "LDI_SIMULATOR_ENABLED not set in $ENV_FILE (defaults to true / mock)"
    ;;

mock)
    echo "==> switching to MOCK data mode"

    echo "==> 1/5 ensuring the full device set (real + mock) is registered"
    psql < database/migrations/040-register-ldi-devices.sql

    echo "==> 2/5 clearing telemetry/alarm tables (real data is untouched on disk in data/real/)"
    psql -c "TRUNCATE public.ldi_data, public.ldi_alarm_log;"

    echo "==> 3/5 resetting alarm master to the mock catalog (exactly the codes the simulator emits)"
    psql < database/migrations/036-ldi-alarm-master-mock.sql
    psql <<'SQL'
UPDATE public.ldi_alarm_ms_code SET severity =
    CASE
        WHEN alarm_msg ~* 'emergency|e-stop|estop|crash|collision|overcurrent|fire|critical|safety|violation|overheat|speeding|hyper-?acceleration'
            THEN 'Critical'
        WHEN upper(trim(alarm_type)) = 'E' THEN 'Critical'
        WHEN upper(trim(alarm_type)) = 'W' THEN 'Warning'
        WHEN alarm_msg ~* 'timeout|retry|not supported|empty|invalid|parameter|please|not found' THEN 'Minor'
        ELSE 'Major'
    END;
SQL

    echo "==> 4/5 enabling the simulator"
    set_simulator_flag true

    echo "==> 5/5 re-applying AlarmDetail Style Guide (docs/architecture/ALARM_DETAIL_STYLE_GUIDE.md, v1.0 + v1.1)"
    psql < database/migrations/072-alarm-detail-style-guide-v1.sql
    psql < database/migrations/073-alarm-knowledge-structured-fields-v1.1.sql

    echo "==> done. Node-RED will start writing live mock telemetry/alarms within a few seconds."
    ;;

real)
    echo "==> switching to REAL data mode"
    for f in ldi_data_clean.sql ldi_alarm_log_clean.sql ldi_alarm_ms_code_clean.sql; do
        [ -f "data/real/$f" ] || {
            echo "missing data/real/$f -- real data isn't on this machine." >&2
            echo "It never lives in git; copy it locally (or run scripts/unwrap-pgadmin-export.py on a fresh pgAdmin export) before switching to real mode." >&2
            exit 1
        }
    done

    echo "==> 1/4 disabling the simulator"
    set_simulator_flag false

    echo "==> 2/4 restoring the real alarm master catalog (1,820 rows, migration 061)"
    psql < database/migrations/061-ldi-alarm-master-real-import.sql

    echo "==> 3/4 loading real telemetry/alarm data + merging supplemental catalog export"
    bash scripts/import-real-data.sh

    echo "==> 4/4 re-applying AlarmDetail Style Guide (docs/architecture/ALARM_DETAIL_STYLE_GUIDE.md, v1.0 + v1.1)"
    psql < database/migrations/072-alarm-detail-style-guide-v1.sql
    psql < database/migrations/073-alarm-knowledge-structured-fields-v1.1.sql
    ;;

*)
    usage
    ;;
esac
