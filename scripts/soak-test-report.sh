#!/bin/bash
# IMS 72-Hour Soak Test Report
#
# This does NOT run a 72-hour test by itself -- that requires the stack to
# stay up and untouched for 72 real hours, which no single script invocation
# can do. What this gives you:
#   1. A point-in-time health snapshot, safe to run any time.
#   2. A stateful log (soak-test-reports/soak-log.tsv) that this script
#      appends to on every run -- run it periodically (e.g. via cron every
#      15-30 min) across the soak window, then run with --summarize at the
#      end to get a pass/fail verdict covering the whole window.
#
# Usage:
#   ./scripts/soak-test-report.sh              # one snapshot + append to log
#   ./scripts/soak-test-report.sh --summarize   # summarize the whole log
#
# Suggested cron entry to actually run a soak window (Linux/WSL host):
#   */15 * * * * cd /path/to/IMS && ./scripts/soak-test-report.sh >> scripts/soak-test-reports/cron.log 2>&1
# Or on Windows, a Scheduled Task calling this via Git Bash every 15 min.

set -uo pipefail
cd "$(dirname "$0")/.."

REPORT_DIR="scripts/soak-test-reports"
LOG_FILE="$REPORT_DIR/soak-log.tsv"
mkdir -p "$REPORT_DIR"

if [[ "${1:-}" == "--summarize" ]]; then
    if [[ ! -f "$LOG_FILE" ]]; then
        echo "No soak log yet at $LOG_FILE -- run this script (without --summarize) periodically first."
        exit 1
    fi
    N=$(($(wc -l < "$LOG_FILE") - 1))
    FIRST_TS=$(awk -F'\t' 'NR==2{print $1}' "$LOG_FILE")
    LAST_TS=$(tail -1 "$LOG_FILE" | awk -F'\t' '{print $1}')
    FIRST_EPOCH=$(date -d "$FIRST_TS" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%SZ" "$FIRST_TS" +%s)
    LAST_EPOCH=$(date -d "$LAST_TS" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%SZ" "$LAST_TS" +%s)
    SPAN_HOURS=$(awk -v a="$FIRST_EPOCH" -v b="$LAST_EPOCH" 'BEGIN{printf "%.1f", (b-a)/3600}')

    # First-to-last span alone doesn't prove continuous coverage -- a log
    # with 12 samples on day 1 and 1 sample 6 days later spans >72h but has
    # a 6-day blind spot in between (found live, 2026-08-21: exactly this
    # log, after this session's earlier work left a gap since 2026-08-15).
    # A real soak needs no gap larger than a few missed cron ticks, not just
    # a wide first/last span -- so also track the largest gap between
    # consecutive samples and gate on that too.
    MAX_GAP_MIN=0
    prev_epoch=""
    while IFS=$'\t' read -r ts _; do
        [[ "$ts" == "timestamp" || -z "$ts" ]] && continue
        epoch=$(date -d "$ts" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%SZ" "$ts" +%s)
        if [[ -n "$prev_epoch" ]]; then
            gap_min=$(( (epoch - prev_epoch) / 60 ))
            [[ "$gap_min" -gt "$MAX_GAP_MIN" ]] && MAX_GAP_MIN="$gap_min"
        fi
        prev_epoch="$epoch"
    done < "$LOG_FILE"
    GAP_LIMIT_MIN=60

    echo "═══════════════════════════════════════════════════"
    echo "  IMS Soak Test Summary"
    echo "═══════════════════════════════════════════════════"
    echo "Samples: $N   Window: $FIRST_TS -> $LAST_TS  (${SPAN_HOURS}h elapsed)"
    echo "Largest gap between consecutive samples: ${MAX_GAP_MIN}min (want <= ${GAP_LIMIT_MIN}min -- a wide"
    echo "gap means no real coverage during that time, span alone doesn't prove it)"
    if awk -v h="$SPAN_HOURS" 'BEGIN{exit !(h>=72)}' && [[ "$MAX_GAP_MIN" -le "$GAP_LIMIT_MIN" ]]; then
        echo "Window length: PASS (>= 72h span, no gap > ${GAP_LIMIT_MIN}min)"
        WINDOW_OK=1
    else
        echo "Window length: FAIL -- span >= 72h alone is not enough; needs continuous coverage"
        echo "(keep this script running periodically -- e.g. every 15min via cron/Scheduled Task --"
        echo "and re-summarize once there's no gap wider than ${GAP_LIMIT_MIN}min across a 72h+ span)"
        WINDOW_OK=0
    fi
    echo ""

    MAX_FAILED=$(awk -F'\t' 'NR>1{print $3}' "$LOG_FILE" | sort -n | tail -1)
    MAX_OVERFLOW=$(awk -F'\t' 'NR>1{print $4}' "$LOG_FILE" | sort -n | tail -1)
    ANY_RESTART=$(awk -F'\t' 'NR>1 && $5=="yes"{c++} END{print c+0}' "$LOG_FILE")
    ANY_FIRING=$(awk -F'\t' 'NR>1 && $6!="0"{c++} END{print c+0}' "$LOG_FILE")
    MAX_DB_MB=$(awk -F'\t' 'NR>1{print $7}' "$LOG_FILE" | sort -n | tail -1)
    MIN_DB_MB=$(awk -F'\t' 'NR>1{print $7}' "$LOG_FILE" | sort -n | head -1)

    echo "Ingest failures ever nonzero in a sample: max=$MAX_FAILED (want 0)"
    echo "Buffer overflows ever nonzero in a sample: max=$MAX_OVERFLOW (want 0)"
    echo "Samples where any container had restarted since last sample: $ANY_RESTART (want 0)"
    echo "Samples with >=1 non-Watchdog alert firing: $ANY_FIRING (want 0)"
    echo "DB size drift: ${MIN_DB_MB}MB -> ${MAX_DB_MB}MB"
    echo ""
    if [[ "$MAX_FAILED" == "0" && "$MAX_OVERFLOW" == "0" && "$ANY_RESTART" == "0" && "$ANY_FIRING" == "0" && "$WINDOW_OK" == "1" ]]; then
        echo "VERDICT: PASS"
    elif [[ "$MAX_FAILED" == "0" && "$MAX_OVERFLOW" == "0" && "$ANY_RESTART" == "0" && "$ANY_FIRING" == "0" ]]; then
        echo "VERDICT: INCOMPLETE -- all health counters clean so far, but window length/continuity not yet satisfied (see above)"
    else
        echo "VERDICT: FAIL -- see nonzero counters above"
    fi
    exit 0
fi

# ── Single snapshot ──────────────────────────────────────────────────────
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)

INSERTS=$(curl -sf http://localhost:1880/metrics 2>/dev/null | awk '/^ims_pipeline_inserts_total /{print $2}')
FAILED=$(curl -sf http://localhost:1880/metrics 2>/dev/null | awk '/^ims_pipeline_inserts_failed_total /{print $2}')
OVERFLOWS=$(curl -sf http://localhost:1880/metrics 2>/dev/null | awk '/^ims_pipeline_buffer_overflows_total /{print $2}')
INSERTS=${INSERTS:-NaN}; FAILED=${FAILED:-NaN}; OVERFLOWS=${OVERFLOWS:-NaN}

RESTARTED="no"
for c in ims-timescaledb ims-node-red ims-grafana; do
    RC=$(docker inspect --format='{{.RestartCount}}' "$c" 2>/dev/null || echo "?")
    # RestartCount only increments when the daemon's own restart-policy
    # (restart: unless-stopped) fires after a crash -- it does NOT change
    # for a deliberate `docker compose restart`/`docker restart`, so that
    # class of restart went completely undetected here (found live,
    # 2026-08-14: two manual node-red restarts during Soak Attempt 4 logged
    # as restarted=no). StartedAt changes on every restart regardless of
    # cause, so track both and flag on either changing.
    STARTED=$(docker inspect --format='{{.State.StartedAt}}' "$c" 2>/dev/null || echo "?")
    STATE_FILE="$REPORT_DIR/.restart_${c}"
    PREV=$(cat "$STATE_FILE" 2>/dev/null || echo "${RC}|${STARTED}")
    echo "${RC}|${STARTED}" > "$STATE_FILE"
    if [[ "${RC}|${STARTED}" != "$PREV" ]]; then RESTARTED="yes"; fi
done

COUNT_FIRING_PY="$REPORT_DIR/.count_firing.py"
cat > "$COUNT_FIRING_PY" <<'PYEOF'
import json, sys
try:
    alerts = json.load(sys.stdin)
    n = sum(1 for a in alerts if a.get('status', {}).get('state') == 'active' and a.get('labels', {}).get('alertname') != 'Watchdog')
    print(n)
except Exception:
    print('NaN')
PYEOF
FIRING=$(curl -sf http://localhost:9093/api/v2/alerts 2>/dev/null | python3 "$COUNT_FIRING_PY" 2>/dev/null)
FIRING=${FIRING:-NaN}

DB_MB=$(docker exec ims-timescaledb psql -U ims_admin -d ims -t -c "SELECT pg_database_size('ims')/1024/1024;" 2>/dev/null | xargs)
DB_MB=${DB_MB:-NaN}

if [[ ! -f "$LOG_FILE" ]]; then
    printf "timestamp\tinserts_total\tinserts_failed_total\tbuffer_overflows_total\tany_container_restarted\tnon_watchdog_alerts_firing\tdb_size_mb\n" > "$LOG_FILE"
fi
printf "%s\t%s\t%s\t%s\t%s\t%s\t%s\n" "$TS" "$INSERTS" "$FAILED" "$OVERFLOWS" "$RESTARTED" "$FIRING" "$DB_MB" >> "$LOG_FILE"

echo "[$TS] inserts=$INSERTS failed=$FAILED overflows=$OVERFLOWS restarted=$RESTARTED alerts_firing=$FIRING db_mb=$DB_MB"
echo "Logged to $LOG_FILE"
