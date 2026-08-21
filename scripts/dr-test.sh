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
    local before_file="$REPORT_DIR/counts-before-$STAMP.txt"
    local after_file="$REPORT_DIR/counts-after-$STAMP.txt"

    echo "-> live row/chunk counts BEFORE dump (this is a live ingesting system --"
    echo "   counts bracket the dump snapshot rather than assuming a single instant)"
    bash scripts/dr-verify-restore.sh ims-timescaledb "$PGUSER" "$PGDB" --dump-counts > "$before_file"
    echo "   captured $(wc -l < "$before_file") table/chunk counts -> $before_file"

    echo "-> pg_dump live '$PGDB' to $BACKUP_FILE"
    t0=$(date +%s)
    docker exec ims-timescaledb pg_dump -U "$PGUSER" -d "$PGDB" > "$BACKUP_FILE"
    t1=$(date +%s)
    local dump_secs=$((t1 - t0))
    local dump_bytes
    dump_bytes=$(wc -c < "$BACKUP_FILE" | tr -d ' ')
    echo "   dump: ${dump_secs}s, ${dump_bytes} bytes"

    echo "-> live row/chunk counts AFTER dump (upper bound -- ongoing writes during"
    echo "   the dump window land here, not in the dump's snapshot)"
    bash scripts/dr-verify-restore.sh ims-timescaledb "$PGUSER" "$PGDB" --dump-counts > "$after_file"
    echo "   captured $(wc -l < "$after_file") table/chunk counts -> $after_file"

    echo "-> restore into throwaway database 'ims_dr_test' (never touches live '$PGDB')"
    docker exec ims-timescaledb psql -U "$PGUSER" -d postgres -c "DROP DATABASE IF EXISTS ims_dr_test;" >/dev/null
    docker exec ims-timescaledb psql -U "$PGUSER" -d postgres -c "CREATE DATABASE ims_dr_test;" >/dev/null

    echo "-> priming ims_dr_test: CREATE EXTENSION timescaledb + timescaledb_pre_restore()"
    echo "   (undocumented-by-omission gotcha: without this, TimescaleDB's own DDL hooks"
    echo "   reject pg_dump's literal 'ALTER TABLE ONLY ... ADD CONSTRAINT' on a hypertable"
    echo "   parent, and per-chunk COPY blocks can outrun _timescaledb_catalog.hypertable"
    echo "   metadata load order -- both reproduced live, see restore log ERROR lines below"
    echo "   if this step is skipped)"
    docker exec ims-timescaledb psql -U "$PGUSER" -d ims_dr_test -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS timescaledb;" >/dev/null
    docker exec ims-timescaledb psql -U "$PGUSER" -d ims_dr_test -v ON_ERROR_STOP=1 -c "SELECT timescaledb_pre_restore();" >/dev/null

    t0=$(date +%s)
    docker exec -i ims-timescaledb psql -U "$PGUSER" -d ims_dr_test < "$BACKUP_FILE" > "$REPORT_DIR/restore-$STAMP.log" 2>&1
    t1=$(date +%s)
    local restore_secs=$((t1 - t0))
    echo "   restore: ${restore_secs}s (full output: $REPORT_DIR/restore-$STAMP.log)"

    echo "-> timescaledb_post_restore() (re-enables background workers, re-points FK"
    echo "   check triggers, verifies catalog version compatibility)"
    docker exec ims-timescaledb psql -U "$PGUSER" -d ims_dr_test -v ON_ERROR_STOP=1 -c "SELECT timescaledb_post_restore();" >/dev/null

    echo "-> scanning restore log for SQL errors (row counts alone do not prove a"
    echo "   structural restore succeeded -- a table can be fully populated by COPY"
    echo "   while its constraint/index/trigger statements failed separately)"
    local restore_error_count
    restore_error_count=$(grep -c "^ERROR:" "$REPORT_DIR/restore-$STAMP.log" || true)
    echo "   ERROR lines in restore log: $restore_error_count"
    if [[ "$restore_error_count" -gt 0 ]]; then
        grep -n "^ERROR:" "$REPORT_DIR/restore-$STAMP.log" | sed 's/^/     /'
    fi

    echo "-> repairing FK constraints whose REFERENCES target is a hypertable"
    echo "   (root cause, verified live 2026-08-21: while timescaledb.restoring=on, TimescaleDB's"
    echo "   DDL hook that normally makes 'ADD CONSTRAINT ... REFERENCES <hypertable>' hypertable-aware"
    echo "   is bypassed -- pg_dump's literal ALTER TABLE statement then falls back to plain Postgres"
    echo "   ONLY-semantics validation against the hypertable PARENT's row set, which is always empty"
    echo "   by design (all rows live in chunks), so the ADD CONSTRAINT fails even though the"
    echo "   referenced row genuinely exists in the correct chunk. Reproduced deterministically twice;"
    echo "   confirmed the identical statement succeeds immediately once re-run after"
    echo "   timescaledb_post_restore() turns restoring back off. This step detects any such FK missing"
    echo "   from the restored DB and re-applies it now, in normal mode, from the source's own"
    echo "   pg_get_constraintdef() -- not a hardcoded table/column list, so it covers any future"
    echo "   FK-to-hypertable relationship, not just today's one instance.)"
    local ht_fk_defs repaired=0
    ht_fk_defs=$(docker exec ims-timescaledb psql -U "$PGUSER" -d "$PGDB" -t -A -F'|' -c "
        SELECT r.relname||'|'||c.conname||'|'||pg_get_constraintdef(c.oid)
        FROM pg_constraint c
        JOIN pg_class r ON r.oid=c.conrelid
        JOIN pg_namespace n ON n.oid=r.relnamespace
        WHERE c.contype='f' AND n.nspname='public'
          AND c.confrelid::regclass::text IN (SELECT hypertable_name FROM timescaledb_information.hypertables);")
    while IFS='|' read -r tbl conname condef; do
        [[ -z "$tbl" ]] && continue
        local exists
        exists=$(docker exec ims-timescaledb psql -U "$PGUSER" -d ims_dr_test -t -A -c "SELECT 1 FROM pg_constraint WHERE conname='$conname' AND conrelid='public.$tbl'::regclass;" 2>/dev/null)
        if [[ "$exists" != "1" ]]; then
            echo "   repairing: public.$tbl.$conname"
            if docker exec ims-timescaledb psql -U "$PGUSER" -d ims_dr_test -v ON_ERROR_STOP=1 -c "ALTER TABLE public.\"$tbl\" ADD CONSTRAINT \"$conname\" $condef;" >>"$REPORT_DIR/restore-$STAMP.log" 2>&1; then
                repaired=$((repaired + 1))
            else
                echo "   FAILED to repair public.$tbl.$conname -- see $REPORT_DIR/restore-$STAMP.log"
            fi
        fi
    done <<< "$ht_fk_defs"
    echo "   repaired $repaired hypertable-referencing FK constraint(s)"

    echo ""
    echo "-> structural comparison (source '$PGDB' vs restored 'ims_dr_test')"
    local structural_pass=1
    bash scripts/dr-verify-restore.sh ims-timescaledb "$PGUSER" "$PGDB" ims_dr_test "$before_file" "$after_file" \
        > "$REPORT_DIR/structural-compare-$STAMP.log" 2>&1 || structural_pass=0
    cat "$REPORT_DIR/structural-compare-$STAMP.log"

    echo "-> cleanup: dropping throwaway database"
    docker exec ims-timescaledb psql -U "$PGUSER" -d postgres -c "DROP DATABASE IF EXISTS ims_dr_test;" >/dev/null

    echo ""
    echo "-> raw restore_error_count=$restore_error_count is diagnostic only, not the pass/fail gate:"
    echo "   the hypertable-referencing-FK error above is expected and auto-repaired by the step"
    echo "   before this one -- the real gate is whether the repaired end-state actually matches"
    echo "   the source structurally, which is what the comparison below checks for real."
    if [[ "$structural_pass" -eq 1 ]]; then
        echo "VERDICT: PASS -- all structural comparisons passed against the repaired restore (dump ${dump_secs}s, restore ${restore_secs}s, ${dump_bytes} bytes, ${repaired} FK constraint(s) repaired)"
    else
        echo "VERDICT: FAIL -- structural comparison failed after repair attempt; see $REPORT_DIR/structural-compare-$STAMP.log"
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
