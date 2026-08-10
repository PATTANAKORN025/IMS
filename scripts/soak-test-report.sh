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

    echo "═══════════════════════════════════════════════════"
    echo "  IMS Soak Test Summary"
    echo "═══════════════════════════════════════════════════"
    echo "Samples: $N   Window: $FIRST_TS -> $LAST_TS  (${SPAN_HOURS}h elapsed)"
    if awk -v h="$SPAN_HOURS" 'BEGIN{exit !(h>=72)}'; then
        echo "Window length: PASS (>= 72h)"
    else
        echo "Window length: NOT YET 72h -- keep this script running periodically and re-summarize later."
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
    if [[ "$MAX_FAILED" == "0" && "$MAX_OVERFLOW" == "0" && "$ANY_RESTART" == "0" && "$ANY_FIRING" == "0" ]]; then
        echo "VERDICT: PASS (pending window length -- see above)"
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
    STATE_FILE="$REPORT_DIR/.restart_${c}"
    PREV=$(cat "$STATE_FILE" 2>/dev/null || echo "$RC")
    echo "$RC" > "$STATE_FILE"
    if [[ "$RC" != "$PREV" ]]; then RESTARTED="yes"; fi
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
