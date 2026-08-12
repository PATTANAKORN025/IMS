#!/bin/bash
# IMS Container Watchdog
#
# Root cause (reproduced live 2026-08-12, matching an earlier finding from
# 2026-08-10): on this host's Docker Desktop (WSL2 backend), a container
# killed via `docker kill` reliably goes to `exited`, but the daemon's
# native restart-policy engine (restart: unless-stopped) never fires --
# confirmed by watching RestartCount stay at 0 for a full 5 minutes after
# the kill, not just "slow". `docker events` during the same kill shows
# only kill+die, no restart attempt. The compose config itself is correct
# (every critical service already sets restart: unless-stopped); this is
# a platform-level gap in when Docker Desktop's restart supervisor
# actually gets invoked, not a misconfiguration in this repo.
#
# This script is the compensating control: an external watchdog that
# does what the restart policy was supposed to do -- notice a critical
# container is down and start it back up. Meant to run periodically
# (systemd timer / cron / Windows Scheduled Task -- same deployment
# pattern already used for scripts/soak-test-report.sh), not continuously
# in the foreground, though --loop is available for that.
#
# Usage:
#   ./scripts/container-watchdog.sh --once     # single check, exit after
#   ./scripts/container-watchdog.sh --loop 10  # check every 10s, forever
#
# Suggested Windows Scheduled Task (mirrors the IMS-SoakTest task):
#   Action: "C:\Program Files\Git\usr\bin\bash.exe" --login -c
#           "cd /c/Projects/IMS && ./scripts/container-watchdog.sh --once"
#   Trigger: every 1 minute

set -uo pipefail
cd "$(dirname "$0")/.."

WATCHED_CONTAINERS=(
    ims-timescaledb
    ims-pgbouncer
    ims-prometheus
    ims-alertmanager
    ims-grafana
    ims-grafana-renderer
    ims-snmpsim
    ims-blackbox
    ims-node-red
)

REPORT_DIR="scripts/dr-test-reports"
LOG_FILE="$REPORT_DIR/watchdog.log"
mkdir -p "$REPORT_DIR"

check_once() {
    local now recovered_any=0
    now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    for c in "${WATCHED_CONTAINERS[@]}"; do
        if ! docker inspect "$c" >/dev/null 2>&1; then
            continue # not present in this compose profile, nothing to watch
        fi
        local status
        status=$(docker inspect -f '{{.State.Status}}' "$c")
        if [[ "$status" != "running" ]]; then
            echo "$now  $c is '$status' -- issuing docker start" | tee -a "$LOG_FILE"
            docker start "$c" >/dev/null 2>&1
            recovered_any=1
        fi
    done
    if [[ "$recovered_any" -eq 0 ]]; then
        echo "$now  all watched containers running" >> "$LOG_FILE"
    fi
}

case "${1:-}" in
    --once)
        check_once
        ;;
    --loop)
        interval="${2:-10}"
        echo "Watchdog loop starting, checking every ${interval}s (Ctrl-C to stop)"
        while true; do
            check_once
            sleep "$interval"
        done
        ;;
    *)
        echo "Usage: $0 {--once|--loop [interval_seconds]}"
        exit 1
        ;;
esac
