#!/bin/bash
# IMS Disaster Recovery Test
#
# Three drills, run independently so a failure in one doesn't block the
# others. Modeled on scripts/soak-test-report.sh's pattern: real commands
# against the real running stack, real timings, no simulated output.
#
#   1. Backup/restore drill    -- safe by default: restores into a
#      throwaway database (ims_dr_test), never touches the live `ims` DB.
#   2. Single-container-loss   -- kills ims-timescaledb or ims-node-red,
#      recovery                   times Docker's restart:unless-stopped
#                                  recovery. Safe: the stack is designed
#                                  to survive this (that's the point).
#   3. Full-stack recreate     -- DESTRUCTIVE. Runs `docker compose down -v`
#                                  (deletes timescaledb_data, prometheus_data,
#                                  alertmanager_data, grafana_data volumes),
#                                  recreates from docker-compose.yaml, then
#                                  restores from a backup taken in step 1.
#                                  Requires --confirm-destroy. Without it,
#                                  this drill is skipped with an explanation
#                                  rather than silently run.
#
# Usage:
#   ./scripts/dr-test.sh backup-restore
#   ./scripts/dr-test.sh container-loss [timescaledb|node-red]
#   ./scripts/dr-test.sh full-recreate --confirm-destroy
#   ./scripts/dr-test.sh all --confirm-destroy   # runs all three in order

set -uo pipefail
cd "$(dirname "$0")/.."

source .env 2>/dev/null || true
PGUSER="${POSTGRES_USER:-ims_admin}"
PGDB="${POSTGRES_DB:-ims}"
REPORT_DIR="scripts/dr-test-reports"
mkdir -p "$REPORT_DIR"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP_FILE="$REPORT_DIR/dr-backup-$STAMP.sql"

drill_backup_restore() {
    echo "═══════════════════════════════════════════════════"
    echo "  Drill 1: Backup / Restore"
    echo "═══════════════════════════════════════════════════"
    local t0 t1

    echo "-> live row counts BEFORE dump (this is a live ingesting system -- counts"
    echo "   bracket the dump snapshot rather than assuming a single instant)"
    local before_devices before_ldi_data before_alarm_log
    before_devices=$(docker exec ims-timescaledb psql -U "$PGUSER" -d "$PGDB" -t -A -c "SELECT count(*) FROM public.devices;")
    before_ldi_data=$(docker exec ims-timescaledb psql -U "$PGUSER" -d "$PGDB" -t -A -c "SELECT count(*) FROM public.ldi_data;")
    before_alarm_log=$(docker exec ims-timescaledb psql -U "$PGUSER" -d "$PGDB" -t -A -c "SELECT count(*) FROM public.ldi_alarm_log;")
    echo "   devices=$before_devices ldi_data=$before_ldi_data ldi_alarm_log=$before_alarm_log"

    echo "-> pg_dump live '$PGDB' to $BACKUP_FILE"
    t0=$(date +%s)
    docker exec ims-timescaledb pg_dump -U "$PGUSER" -d "$PGDB" > "$BACKUP_FILE"
    t1=$(date +%s)
    local dump_secs=$((t1 - t0))
    local dump_bytes
    dump_bytes=$(wc -c < "$BACKUP_FILE" | tr -d ' ')
    echo "   dump: ${dump_secs}s, ${dump_bytes} bytes"

    echo "-> live row counts AFTER dump (upper bound -- ongoing writes during the"
    echo "   dump window land here, not in the dump's snapshot)"
    local after_devices after_ldi_data after_alarm_log
    after_devices=$(docker exec ims-timescaledb psql -U "$PGUSER" -d "$PGDB" -t -A -c "SELECT count(*) FROM public.devices;")
    after_ldi_data=$(docker exec ims-timescaledb psql -U "$PGUSER" -d "$PGDB" -t -A -c "SELECT count(*) FROM public.ldi_data;")
    after_alarm_log=$(docker exec ims-timescaledb psql -U "$PGUSER" -d "$PGDB" -t -A -c "SELECT count(*) FROM public.ldi_alarm_log;")
    echo "   devices=$after_devices ldi_data=$after_ldi_data ldi_alarm_log=$after_alarm_log"

    echo "-> restore into throwaway database 'ims_dr_test' (never touches live '$PGDB')"
    docker exec ims-timescaledb psql -U "$PGUSER" -d postgres -c "DROP DATABASE IF EXISTS ims_dr_test;" >/dev/null
    docker exec ims-timescaledb psql -U "$PGUSER" -d postgres -c "CREATE DATABASE ims_dr_test;" >/dev/null
    t0=$(date +%s)
    docker exec -i ims-timescaledb psql -U "$PGUSER" -d ims_dr_test < "$BACKUP_FILE" > "$REPORT_DIR/restore-$STAMP.log" 2>&1
    t1=$(date +%s)
    local restore_secs=$((t1 - t0))
    echo "   restore: ${restore_secs}s (full output: $REPORT_DIR/restore-$STAMP.log)"

    echo "-> restored row counts (must match live)"
    local r_devices r_ldi_data r_alarm_log
    r_devices=$(docker exec ims-timescaledb psql -U "$PGUSER" -d ims_dr_test -t -A -c "SELECT count(*) FROM public.devices;" 2>/dev/null)
    r_ldi_data=$(docker exec ims-timescaledb psql -U "$PGUSER" -d ims_dr_test -t -A -c "SELECT count(*) FROM public.ldi_data;" 2>/dev/null)
    r_alarm_log=$(docker exec ims-timescaledb psql -U "$PGUSER" -d ims_dr_test -t -A -c "SELECT count(*) FROM public.ldi_alarm_log;" 2>/dev/null)
    echo "   devices=$r_devices ldi_data=$r_ldi_data ldi_alarm_log=$r_alarm_log"

    echo "-> cleanup: dropping throwaway database"
    docker exec ims-timescaledb psql -U "$PGUSER" -d postgres -c "DROP DATABASE IF EXISTS ims_dr_test;" >/dev/null

    echo ""
    if [[ "$r_devices" -ge "$before_devices" && "$r_devices" -le "$after_devices" \
       && "$r_ldi_data" -ge "$before_ldi_data" && "$r_ldi_data" -le "$after_ldi_data" \
       && "$r_alarm_log" -ge "$before_alarm_log" && "$r_alarm_log" -le "$after_alarm_log" ]]; then
        echo "VERDICT: PASS -- restored row counts fall within the [before-dump, after-dump] live bracket for every table (dump ${dump_secs}s, restore ${restore_secs}s, ${dump_bytes} bytes)"
    else
        echo "VERDICT: FAIL -- restored counts fall outside the live bracket, see above (a real restore defect, not just live-write drift)"
    fi
    echo ""
}

drill_container_loss() {
    local target="${1:-timescaledb}"
    local container="ims-$target"
    echo "═══════════════════════════════════════════════════"
    echo "  Drill 2: Single-Container-Loss Recovery ($container)"
    echo "═══════════════════════════════════════════════════"

    if ! docker inspect "$container" >/dev/null 2>&1; then
        echo "VERDICT: SKIP -- container $container not found"
        return
    fi

    echo "-> killing $container"
    local t0 t1
    t0=$(date +%s)
    docker kill "$container" >/dev/null

    echo "-> polling for recovery (healthy or running, up to 120s)"
    local recovered="no"
    for _ in $(seq 1 60); do
        sleep 2
        local status
        status=$(docker inspect -f '{{.State.Status}}' "$container" 2>/dev/null)
        if [[ "$status" == "running" ]]; then
            recovered="yes"
            break
        fi
    done
    t1=$(date +%s)
    local recover_secs=$((t1 - t0))

    echo ""
    if [[ "$recovered" == "yes" ]]; then
        echo "VERDICT: PASS -- $container recovered to 'running' in ${recover_secs}s (restart:unless-stopped)"
    else
        echo "VERDICT: FAIL -- $container did not reach 'running' within 120s despite restart:unless-stopped."
        echo "Live-verified 2026-08-10 and reproduced deterministically 2026-08-12 (RestartCount"
        echo "stayed at 0 for a full 5 minutes, not just slow): on this host's Docker Desktop"
        echo "(WSL2 backend), a container killed via 'docker kill' goes to 'exited', but the"
        echo "daemon's own restart-policy engine never fires ('docker events' shows only"
        echo "kill+die, no restart attempt). The compose config is not the problem -- every"
        echo "critical service already sets restart: unless-stopped correctly."
        echo "Compensating control: scripts/container-watchdog.sh polls watched containers and"
        echo "issues 'docker start' on anything not running. With the watchdog deployed (see its"
        echo "header for the recommended Scheduled Task), this drill passes in single-digit"
        echo "seconds -- verified 6x across both timescaledb and node-red on 2026-08-12."
        echo "Falling back to a manual 'docker start' now so this drill doesn't leave the stack"
        echo "down -- that fallback is NOT the thing under test and does not change the FAIL"
        echo "verdict above (Docker's native restart policy alone still did not recover it)."
        docker start "$container" >/dev/null 2>&1
    fi
    echo ""
}

drill_full_recreate() {
    local confirmed="${1:-}"
    echo "═══════════════════════════════════════════════════"
    echo "  Drill 3: Full-Stack Recreate"
    echo "═══════════════════════════════════════════════════"

    if [[ "$confirmed" != "--confirm-destroy" ]]; then
        echo "SKIPPED: this drill runs 'docker compose down -v', which deletes"
        echo "timescaledb_data/prometheus_data/alertmanager_data/grafana_data --"
        echo "i.e. every bit of data in this environment, including whatever is"
        echo "live right now. Re-run with --confirm-destroy to actually execute it."
        echo "VERDICT: SKIPPED (not run without explicit confirmation)"
        echo ""
        return
    fi

    if [[ ! -f "$BACKUP_FILE" ]]; then
        echo "No backup from this run ($BACKUP_FILE not found) -- run 'backup-restore' first so there's something to restore after the wipe."
        echo "VERDICT: ABORTED"
        return
    fi

    echo "-> docker compose down -v (destroys all volumes)"
    local t0 t1
    t0=$(date +%s)
    docker compose down -v

    # Schema first (via db-migrate, from database/migrations/), THEN data
    # -- not a full pg_dump|psql restore. Tried that both ways (restore
    # before migrate, restore after migrate) running this drill for real on
    # 2026-08-13 -- both fail. TimescaleDB's own pg_dump output warns why
    # every single run ("circular foreign-key constraints... You might not
    # be able to restore the dump"): a plain logical dump of a database
    # with continuous aggregates is not reliably restorable, full stop
    # ("cannot alter the internal view of a continuous aggregate",
    # "operation not supported on materialization tables", internal
    # per-chunk table names tied to the instance that produced the dump).
    # See docs/evidence/DR_DRILL_3_FINDINGS.md for both failed attempts.
    #
    # The schema (tables, views, CAGGs, policies) is already fully and
    # correctly reproducible from migrations alone -- proven clean on an
    # empty database. A backup only needs to carry what migrations don't
    # seed: the raw ldi_data/ldi_alarm_log rows. scripts/dr-restore-table-data.py
    # pulls just those out of the dump and restores them through the
    # PARENT table name (TimescaleDB routes to the right chunk itself),
    # sidestepping the internal-chunk-ID problem entirely.
    # timescaledb only, not the full stack -- `docker compose up -d` starts
    # every service including db-migrate (node-red/etc. depend on it), so
    # calling both races two db-migrate runs against each other (found
    # running this drill for real on 2026-08-13: the first, implicit run
    # left migrations partially applied, the second, explicit one then hit
    # a different mid-sequence failure). One explicit run only.
    echo "-> docker compose up -d timescaledb (database only)"
    docker compose up -d timescaledb
    for _ in $(seq 1 30); do
        status=$(docker inspect -f '{{.State.Health.Status}}' ims-timescaledb 2>/dev/null)
        [[ "$status" == "healthy" ]] && break
        sleep 2
    done

    echo "-> docker compose up db-migrate (schema, from database/migrations/)"
    docker compose up db-migrate
    local migrate_exit=$?

    echo "-> restoring ldi_data + ldi_alarm_log row data from $BACKUP_FILE"
    local restore_log="$REPORT_DIR/full-recreate-restore-$STAMP.log"
    : > "$restore_log"
    local data_restore_ok=1
    for table in ldi_data ldi_alarm_log; do
        local tsv="$REPORT_DIR/full-recreate-$STAMP-$table.tsv"
        local cols
        cols=$(python3 scripts/dr-restore-table-data.py "$BACKUP_FILE" "$table" "$tsv" 2>>"$restore_log")
        if [[ -z "$cols" ]]; then
            echo "  $table: extraction failed, see $restore_log" | tee -a "$restore_log"
            data_restore_ok=0
            continue
        fi
        docker cp "$tsv" "ims-timescaledb:/tmp/$table.tsv"
        docker exec -i ims-timescaledb psql -U "$PGUSER" -d "$PGDB" -v ON_ERROR_STOP=1 \
            -c "\\copy $table ($cols) FROM '/tmp/$table.tsv'" >> "$restore_log" 2>&1 \
            || data_restore_ok=0
    done

    echo "-> docker compose up -d (start everything else now that data is restored)"
    docker compose up -d
    t1=$(date +%s)
    local total_secs=$((t1 - t0))

    # Query actual final state rather than trust $migrate_exit alone --
    # if the explicit run above failed, `docker compose up -d` retries
    # db-migrate itself (service_completed_successfully dependency), so
    # the real outcome is whatever that retry left behind, not the first
    # exit code. Same idempotent check-all-pending logic CI's schema-drift
    # gate uses, since it's already the authoritative "is everything
    # really applied" answer.
    local migrate_recheck gated_up
    migrate_recheck=$(bash scripts/migrate.sh 2>&1)
    echo "$migrate_recheck" | grep -q "Pending: 0  Applied: 0  Failed: 0" && migrate_exit=0 || migrate_exit=1
    gated_up="yes"
    for svc in node-red proxy alarm-api; do
        state=$(docker inspect -f '{{.State.Status}}' "ims-$svc" 2>/dev/null)
        [[ "$state" == "running" ]] || gated_up="no"
    done

    echo ""
    if [[ "$migrate_exit" -eq 0 && "$data_restore_ok" -eq 1 && "$gated_up" == "yes" ]]; then
        echo "VERDICT: PASS -- full recreate completed in ${total_secs}s, migrations applied cleanly, ldi_data/ldi_alarm_log restored, node-red/proxy/alarm-api running"
    else
        echo "VERDICT: FAIL -- db-migrate exit ${migrate_exit}, data restore ok=${data_restore_ok}, gated services up=${gated_up} (see $restore_log)"
    fi
    echo ""
}

case "${1:-}" in
    backup-restore) drill_backup_restore ;;
    container-loss) drill_container_loss "${2:-timescaledb}" ;;
    full-recreate) drill_full_recreate "${2:-}" ;;
    all)
        drill_backup_restore
        drill_container_loss timescaledb
        drill_container_loss node-red
        drill_full_recreate "${2:-}"
        ;;
    *)
        echo "Usage: $0 {backup-restore|container-loss [timescaledb|node-red]|full-recreate [--confirm-destroy]|all [--confirm-destroy]}"
        exit 1
        ;;
esac
