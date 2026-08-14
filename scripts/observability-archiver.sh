#!/bin/sh
# Observability gap closer -- runs as the ims-observability-archiver service.
#
# Closes the specific gap found investigating the 2026-08-13 16h simulator
# outage: Docker's own json-file log driver (max-size 10m, max-file 5 per
# container) had already rotated past the event by the time anyone looked,
# and there was no restart record at all outside the soak script's own
# 15-minute polling (which only watched 3 containers and, until fixed,
# couldn't even see a manual `docker compose restart`). Three durable,
# rotation-independent records:
#
#   1. Every `docker events` container lifecycle event, appended to a plain
#      host file (this container's own stdout/logs still rotate; the host
#      file this writes to does not).
#   2. Every start/die/restart/kill/oom event, also inserted into
#      public.container_restart_audit (survives even if the host file is
#      lost -- lives in the same database the rest of the evidence does).
#   3. A continuous tail of each critical container's logs into its own
#      host file, so a crash/hang mid-window is still readable days later
#      even after that container's own log driver has rotated past it.
set -eu

ARCHIVE_DIR="${ARCHIVE_DIR:-/archive}"
mkdir -p "$ARCHIVE_DIR"

DB_HOST="${PGHOST:-timescaledb}"
DB_USER="${POSTGRES_USER:?POSTGRES_USER not set}"
DB_NAME="${POSTGRES_DB:?POSTGRES_DB not set}"
export PGPASSWORD="${PGPASSWORD:?PGPASSWORD not set}"

echo "observability-archiver: waiting for database..."
until psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" >/dev/null 2>&1; do
    sleep 2
done
echo "observability-archiver: database ready, starting collectors."

# ── 1+2: docker events -> durable file + DB audit table ────────────────
# Filter server-side to real container lifecycle events only -- unfiltered
# `docker events` includes an exec_start/exec_die pair for every healthcheck
# probe on every container with one configured, which would flood this file
# with routine noise (thousands of lines/hour) with nothing to do with an
# actual restart.
docker events --filter type=container \
    --filter event=create --filter event=start --filter event=stop \
    --filter event=die --filter event=restart --filter event=kill \
    --filter event=oom \
    --format '{{json .}}' | while IFS= read -r line; do
    echo "$line" >> "$ARCHIVE_DIR/docker-events.jsonl"

    action=$(echo "$line" | jq -r '.Action // empty')
    cname=$(echo "$line" | jq -r '.Actor.Attributes.name // empty')
    ts=$(echo "$line" | jq -r '.time // empty')

    case "$action" in
        start|die|restart|kill|oom)
            [ -n "$cname" ] && [ -n "$ts" ] || continue
            escaped=$(echo "$line" | sed "s/'/''/g")
            psql -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=0 -c \
                "INSERT INTO public.container_restart_audit (container_name, event_action, event_time, raw_event) VALUES ('$cname', '$action', to_timestamp($ts), '$escaped'::jsonb);" \
                >/dev/null 2>&1 || echo "observability-archiver: failed to record $action for $cname" >&2
            ;;
    esac
done &

# ── 3: durable per-container crash-log tail ─────────────────────────────
# Restart the tail if the container disappears and comes back (docker logs
# -f exits when the container stops); loop forever per container.
for c in ims-node-red ims-timescaledb ims-grafana ims-alarm-api ims-proxy; do
    (
        while true; do
            docker logs -f --since 0s "$c" >> "$ARCHIVE_DIR/crash-log-${c}.log" 2>&1 || true
            sleep 5
        done
    ) &
done

wait
