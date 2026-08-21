#!/bin/bash
# Structural integrity comparison between a source and a restored database.
#
# Row counts alone do not prove a restore is correct -- pg_dump/psql restores
# of a TimescaleDB database routinely lose constraints, indexes, or CAGGs
# while row counts stay fine (proven: scripts/dr-test-reports/restore-
# 20260813T085215Z.log and restore-20260820T093518Z.log both show 8 real
# ERROR lines -- "could not find hypertable with id 18", 6x "ONLY option not
# supported on hypertable operations", 1x missing FK unique-constraint target
# -- from a restore the old drill_backup_restore verdict called PASS, because
# it only checked 3 tables' row counts and none of those 3 happened to be
# affected).
#
# This script diffs structural catalog state between two databases in the
# same Postgres instance and exits non-zero if anything doesn't match.
# Table/column/index/constraint/trigger/extension/CAGG/policy identity must
# match EXACTLY. Row counts and chunk counts for actively-ingesting
# hypertables are checked against a live [before, after] bracket instead,
# since the source database keeps accepting writes during the dump window --
# passed via BEFORE_COUNTS_FILE / AFTER_COUNTS_FILE (see dr-test.sh).
#
# Usage:
#   ./scripts/dr-verify-restore.sh <container> <pguser> <source_db> <target_db> \
#       [before_counts_file] [after_counts_file]
#
# before/after counts files: one "table_name count" pair per line, as
# produced by this script's own --dump-counts mode:
#   ./scripts/dr-verify-restore.sh <container> <pguser> <source_db> --dump-counts > before.txt

set -uo pipefail

CONTAINER="${1:?container name required}"
PGUSER="${2:?pguser required}"
SRC_DB="${3:?source db required}"

psql_c() {
    local db="$1" sql="$2"
    docker exec "$CONTAINER" psql -U "$PGUSER" -d "$db" -t -A -F'|' -c "$sql" 2>&1
}

if [[ "${4:-}" == "--dump-counts" ]]; then
    psql_c "$SRC_DB" "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1;" \
    | while read -r t; do
        [[ -z "$t" ]] && continue
        c=$(psql_c "$SRC_DB" "SELECT count(*) FROM public.\"$t\";")
        echo "$t $c"
    done
    psql_c "$SRC_DB" "SELECT hypertable_name FROM timescaledb_information.hypertables ORDER BY 1;" \
    | while read -r h; do
        [[ -z "$h" ]] && continue
        c=$(psql_c "$SRC_DB" "SELECT count(*) FROM timescaledb_information.chunks WHERE hypertable_name='$h';")
        echo "chunks:$h $c"
    done
    exit 0
fi

TGT_DB="${4:?target db required}"
BEFORE_FILE="${5:-}"
AFTER_FILE="${6:-}"

PASS=0
FAIL=0
declare -a FAILED_CHECKS=()

cmp_exact() {
    local label="$1" query="$2"
    local live restored
    live=$(psql_c "$SRC_DB" "$query" | sort)
    restored=$(psql_c "$TGT_DB" "$query" | sort)
    if [[ "$live" == "$restored" ]]; then
        echo "   PASS: $label"
        PASS=$((PASS + 1))
    else
        echo "   FAIL: $label"
        diff <(echo "$live") <(echo "$restored") | sed 's/^/     /'
        FAIL=$((FAIL + 1))
        FAILED_CHECKS+=("$label")
    fi
}

echo "═══════════════════════════════════════════════════"
echo "  Structural comparison: $SRC_DB (source) vs $TGT_DB (restored)"
echo "═══════════════════════════════════════════════════"

echo "-> table comparison (public base tables, exact set match)"
cmp_exact "table comparison" \
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY 1;"

echo "-> schema comparison (columns/types/nullability, exact match per table)"
cmp_exact "schema comparison" \
    "SELECT table_name||'.'||column_name||':'||data_type||':'||is_nullable FROM information_schema.columns WHERE table_schema='public' ORDER BY 1;"

echo "-> hypertable comparison (name + dimension count, exact match)"
cmp_exact "hypertable comparison" \
    "SELECT hypertable_name||':'||num_dimensions FROM timescaledb_information.hypertables ORDER BY 1;"

echo "-> index comparison (public schema, exact match)"
cmp_exact "index comparison" \
    "SELECT tablename||':'||indexname FROM pg_indexes WHERE schemaname='public' ORDER BY 1;"

echo "-> FK/constraint comparison (public schema, exact match)"
cmp_exact "FK/constraint comparison" \
    "SELECT r.relname||':'||c.conname||':'||c.contype::text FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public' ORDER BY 1;"

echo "-> trigger comparison (public schema, exact match)"
cmp_exact "trigger comparison" \
    "SELECT r.relname||':'||t.tgname FROM pg_trigger t JOIN pg_class r ON r.oid=t.tgrelid JOIN pg_namespace n ON n.oid=r.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY 1;"

echo "-> extension comparison (name + version, exact match)"
cmp_exact "extension comparison" \
    "SELECT extname||':'||extversion FROM pg_extension ORDER BY 1;"

echo "-> CAGG comparison (view names, exact match)"
cmp_exact "CAGG comparison" \
    "SELECT view_name FROM timescaledb_information.continuous_aggregates ORDER BY 1;"

echo "-> compression policy comparison (hypertable_name, exact match)"
cmp_exact "compression policy comparison" \
    "SELECT hypertable_name FROM timescaledb_information.jobs WHERE proc_name='policy_compression' ORDER BY 1;"

echo "-> retention policy comparison (hypertable_name, exact match)"
cmp_exact "retention policy comparison" \
    "SELECT hypertable_name FROM timescaledb_information.jobs WHERE proc_name='policy_retention' ORDER BY 1;"

echo "-> row-count comparison"
if [[ -n "$BEFORE_FILE" && -n "$AFTER_FILE" && -f "$BEFORE_FILE" && -f "$AFTER_FILE" ]]; then
    row_fail=0
    while read -r table before; do
        [[ -z "$table" ]] && continue
        after=$(awk -v t="$table" '$1==t{print $2}' "$AFTER_FILE")
        restored=$(psql_c "$TGT_DB" "SELECT count(*) FROM public.\"${table#chunks:}\";" 2>/dev/null)
        if [[ "$table" == chunks:* ]]; then
            ht="${table#chunks:}"
            restored=$(psql_c "$TGT_DB" "SELECT count(*) FROM timescaledb_information.chunks WHERE hypertable_name='$ht';")
        fi
        if [[ -z "$after" || -z "$restored" ]]; then
            echo "   FAIL: $table -- could not read before/after/restored counts"
            row_fail=1
            continue
        fi
        if (( restored >= before && restored <= after )); then
            :
        else
            echo "   FAIL: $table -- restored=$restored not in live bracket [$before, $after]"
            row_fail=1
        fi
    done < "$BEFORE_FILE"
    if [[ "$row_fail" -eq 0 ]]; then
        echo "   PASS: row-count comparison (all tables/chunks within live [before,after] bracket)"
        PASS=$((PASS + 1))
    else
        FAIL=$((FAIL + 1))
        FAILED_CHECKS+=("row-count comparison")
    fi
else
    echo "   FAIL: row-count comparison -- before/after counts files not provided"
    FAIL=$((FAIL + 1))
    FAILED_CHECKS+=("row-count comparison")
fi

echo "-> application connectivity (real app-facing queries against restored DB)"
conn_fail=0
app_queries=(
    "SELECT device_id, location FROM public.devices WHERE device_type='ldi' AND enabled=true ORDER BY device_id;"
    "SELECT * FROM public.v_ldi_machine_latest_full LIMIT 1;"
    "SELECT * FROM public.ldi_alarm_log ORDER BY logdate DESC LIMIT 1;"
    "SELECT * FROM public.v_fleet_health LIMIT 1;"
)
for q in "${app_queries[@]}"; do
    out=$(psql_c "$TGT_DB" "$q")
    if echo "$out" | grep -qi "^ERROR"; then
        echo "   FAIL: query errored: $q"
        echo "     $out"
        conn_fail=1
    fi
done
if [[ "$conn_fail" -eq 0 ]]; then
    echo "   PASS: application connectivity (4/4 app-facing queries executed cleanly)"
    PASS=$((PASS + 1))
else
    FAIL=$((FAIL + 1))
    FAILED_CHECKS+=("application connectivity")
fi

echo ""
echo "═══════════════════════════════════════════════════"
echo "  $PASS passed, $FAIL failed"
if [[ "$FAIL" -gt 0 ]]; then
    echo "  Failed checks: ${FAILED_CHECKS[*]}"
fi
echo "═══════════════════════════════════════════════════"

[[ "$FAIL" -eq 0 ]]
