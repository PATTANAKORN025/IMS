#!/bin/bash
# Isolated kiosk/dashboard-refresh concurrency test.
#
# Prior evidence (release-qualification audit, 2026-08-19/20): 1 kiosk ~91ms,
# 6 kiosks ~370-524ms, both measured for real against the LIVE stack. 15/20+
# kiosk numbers in that audit were REASONED, not measured -- explicitly
# flagged as not real evidence. This script measures them for real, without
# touching live infrastructure or its shared resources.
#
# "Isolated" here means a genuinely separate, disposable TimescaleDB
# container -- not just a second database inside the live ims-timescaledb
# container. Two databases in the same Postgres instance still share CPU,
# shared_buffers, WAL, and disk I/O, so a load test against a same-instance
# throwaway database could still degrade the live simulator/dashboards under
# real concurrent load. This script instead: pg_dumps live `ims` (same fast,
# safe, already-proven step scripts/dr-test.sh uses), starts a brand new
# `timescale/timescaledb` container with no network attachment to the app
# stack and no host port published, restores into it using the same
# pre_restore/post_restore + hypertable-FK-repair sequence proven in
# scripts/dr-test.sh, runs the concurrency levels against ONLY that
# container, then destroys it (container + anonymous volume) completely.
#
# The query under test is the real Action Queue panel SQL (Alarm Console /
# Operator Andon dashboards), the same query PHASE 1 of this session's
# planning-bottleneck fix targeted -- this is what a kiosk's refresh cycle
# actually re-runs every 5s (see the dashboard's own `refresh: "5s"`).
#
# Usage: ./scripts/kiosk-load-test.sh [level ...]
#   default levels: 10 20 50 100

set -uo pipefail
cd "$(dirname "$0")/.."

source .env 2>/dev/null || true
PGUSER="${POSTGRES_USER:-ims_admin}"
PGPASSWORD_VAL="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD required in .env}"
PGDB="${POSTGRES_DB:-ims}"
LOADTEST_CONTAINER="ims-loadtest-db"
LOADTEST_IMAGE="timescale/timescaledb:2.29.0-pg16"
REPORT_DIR="scripts/dr-test-reports"
mkdir -p "$REPORT_DIR"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DUMP_FILE="$REPORT_DIR/loadtest-source-$STAMP.sql"
QUERY_FILE="$REPORT_DIR/loadtest-query-$STAMP.sql"

LEVELS=("$@")
[[ ${#LEVELS[@]} -eq 0 ]] && LEVELS=(10 20 50 100)

cleanup() {
    echo "-> cleanup: removing $LOADTEST_CONTAINER (container + anonymous volume)"
    docker rm -f "$LOADTEST_CONTAINER" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "═══════════════════════════════════════════════════"
echo "  Isolated Kiosk/Dashboard-Refresh Load Test"
echo "═══════════════════════════════════════════════════"

echo "-> pg_dump live '$PGDB' (read-only, same safe step scripts/dr-test.sh uses)"
docker exec ims-timescaledb pg_dump -U "$PGUSER" -d "$PGDB" > "$DUMP_FILE"
echo "   $(wc -c < "$DUMP_FILE" | tr -d ' ') bytes"

echo "-> starting isolated throwaway container '$LOADTEST_CONTAINER'"
echo "   (no network attachment to the app stack, no host port published --"
echo "   reachable only via 'docker exec', zero contention with live 'ims')"
docker rm -f "$LOADTEST_CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$LOADTEST_CONTAINER" \
    -e POSTGRES_USER="$PGUSER" \
    -e POSTGRES_PASSWORD="$PGPASSWORD_VAL" \
    -e POSTGRES_DB="$PGDB" \
    "$LOADTEST_IMAGE" >/dev/null

echo "-> waiting for it to accept connections (the official postgres image does a"
echo "   two-phase startup -- a temporary init-only instance, then a restart into"
echo "   the real one -- so this waits for TWO 'ready to accept connections' log"
echo "   lines, not just the first pg_isready success, which races the restart)"
ready="no"
for _ in $(seq 1 90); do
    ready_count=$(docker logs "$LOADTEST_CONTAINER" 2>&1 | grep -c "database system is ready to accept connections")
    if [[ "$ready_count" -ge 2 ]]; then
        ready="yes"
        break
    fi
    sleep 1
done
if [[ "$ready" != "yes" ]]; then
    echo "VERDICT: BLOCKED -- throwaway container never reached its final ready state"
    exit 1
fi
sleep 1
echo "   ready"

echo "-> priming: CREATE EXTENSION timescaledb + timescaledb_pre_restore()"
docker exec "$LOADTEST_CONTAINER" psql -U "$PGUSER" -d "$PGDB" -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS timescaledb;" >/dev/null
docker exec "$LOADTEST_CONTAINER" psql -U "$PGUSER" -d "$PGDB" -v ON_ERROR_STOP=1 -c "SELECT timescaledb_pre_restore();" >/dev/null

echo "-> restoring dump into isolated container"
t0=$(date +%s)
docker exec -i "$LOADTEST_CONTAINER" psql -U "$PGUSER" -d "$PGDB" < "$DUMP_FILE" > "$REPORT_DIR/loadtest-restore-$STAMP.log" 2>&1
t1=$(date +%s)
echo "   restore: $((t1 - t0))s"

echo "-> timescaledb_post_restore()"
docker exec "$LOADTEST_CONTAINER" psql -U "$PGUSER" -d "$PGDB" -v ON_ERROR_STOP=1 -c "SELECT timescaledb_post_restore();" >/dev/null

echo "-> repairing hypertable-referencing FK constraints (same fix as scripts/dr-test.sh)"
ht_fk_defs=$(docker exec ims-timescaledb psql -U "$PGUSER" -d "$PGDB" -t -A -F'|' -c "
    SELECT r.relname||'|'||c.conname||'|'||pg_get_constraintdef(c.oid)
    FROM pg_constraint c
    JOIN pg_class r ON r.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=r.relnamespace
    WHERE c.contype='f' AND n.nspname='public'
      AND c.confrelid::regclass::text IN (SELECT hypertable_name FROM timescaledb_information.hypertables);")
repaired=0
while IFS='|' read -r tbl conname condef; do
    [[ -z "$tbl" ]] && continue
    exists=$(docker exec "$LOADTEST_CONTAINER" psql -U "$PGUSER" -d "$PGDB" -t -A -c "SELECT 1 FROM pg_constraint WHERE conname='$conname' AND conrelid='public.$tbl'::regclass;" 2>/dev/null)
    if [[ "$exists" != "1" ]]; then
        docker exec "$LOADTEST_CONTAINER" psql -U "$PGUSER" -d "$PGDB" -v ON_ERROR_STOP=1 -c "ALTER TABLE public.\"$tbl\" ADD CONSTRAINT \"$conname\" $condef;" >/dev/null \
            && repaired=$((repaired + 1))
    fi
done <<< "$ht_fk_defs"
echo "   repaired $repaired constraint(s)"

r_devices=$(docker exec "$LOADTEST_CONTAINER" psql -U "$PGUSER" -d "$PGDB" -t -A -c "SELECT count(*) FROM public.devices;" 2>/dev/null)
r_alarms=$(docker exec "$LOADTEST_CONTAINER" psql -U "$PGUSER" -d "$PGDB" -t -A -c "SELECT count(*) FROM public.ldi_alarm_log;" 2>/dev/null)
echo "-> isolated instance ready: devices=$r_devices ldi_alarm_log=$r_alarms"

MACHINE_LIST=$(docker exec ims-timescaledb psql -U "$PGUSER" -d "$PGDB" -t -A -c "
    SELECT string_agg(quote_literal(device_id), ',') FROM public.devices WHERE device_type='ldi' AND enabled=true;")

cat > "$QUERY_FILE" <<SQLEOF
\timing on
WITH real_alarms AS (
  SELECT a.logid AS "logid", a.related_log_id AS "RelatedLogId", a.logdate AS "logdate",
         a.equipmentid AS "Machine", m.severity AS "Severity", l.status AS "Status",
         m.alarm_type AS "Alarm Type", m.alarm_msg AS "Alarm Msg", m.alarm_detail AS "Alarm Detail",
         COALESCE(d.factory, a.factory) AS "Factory", d.mo AS "MO", a.logdate AS "When",
         (EXTRACT(EPOCH FROM a.logdate) * 1000)::BIGINT AS "When_ms",
         CASE WHEN NOW() - a.logdate < INTERVAL '1 hour'
           THEN GREATEST(EXTRACT(MINUTE FROM (NOW() - a.logdate))::INT, 0)::TEXT || 'm'
           ELSE EXTRACT(HOUR FROM (NOW() - a.logdate))::INT || 'h' || LPAD(EXTRACT(MINUTE FROM (NOW() - a.logdate))::INT::TEXT, 2, '0') || 'm'
         END AS "Elapsed",
         CASE COALESCE(c.category, 'UNCLASSIFIED')
           WHEN 'VACUUM' THEN 'Maintenance' WHEN 'CAMERA' THEN 'Maintenance' WHEN 'MOTION' THEN 'Maintenance'
           WHEN 'MOTOR' THEN 'Maintenance' WHEN 'ENVIRONMENT' THEN 'Facility' WHEN 'NETWORK' THEN 'Automation'
           WHEN 'PLC' THEN 'Automation' WHEN 'COMMUNICATION' THEN 'Automation' WHEN 'DATABASE' THEN 'IT'
           WHEN 'ALIGNMENT' THEN 'Process Engineering' WHEN 'CALIBRATION' THEN 'Process Engineering'
           WHEN 'REGISTRATION' THEN 'Process Engineering' WHEN 'PROCESS' THEN 'Process Engineering'
           ELSE 'Maintenance'
         END AS "Owner"
  FROM public.ldi_alarm_log a
  JOIN public.ldi_alarm_ms_code m ON a.errorcode::TEXT = m.alarm_code::TEXT
  LEFT JOIN public.ldi_data d ON d.log_id = a.related_log_id
    AND d."time" BETWEEN a.logdate - INTERVAL '10 minutes' AND a.logdate + INTERVAL '10 minutes'
  LEFT JOIN public.v_ldi_alarm_category c ON c.alarm_code = a.errorcode::TEXT
  LEFT JOIN public.ldi_alarm_lifecycle l ON l.logdate = a.logdate AND l.logid = a.logid
  WHERE m.severity IN ('Critical', 'Major')
    AND a.logdate > NOW() - INTERVAL '5 minutes'
    AND a.equipmentid IN ($MACHINE_LIST)
    AND l.status IS DISTINCT FROM 'RESOLVED'
), with_action AS (
  SELECT "logid","RelatedLogId","logdate","Machine","Severity","Status","Alarm Type","Alarm Msg","Alarm Detail","Factory","MO","When","When_ms","Elapsed","Owner",
    CASE "Owner" WHEN 'Maintenance' THEN 'CALL MAINT' WHEN 'Facility' THEN 'CHECK HVAC'
      WHEN 'Automation' THEN 'CHECK AUTOMATION' WHEN 'IT' THEN 'CALL IT' WHEN 'Process Engineering' THEN 'CHECK PROCESS' END AS "Action"
  FROM real_alarms
), combined AS (
  SELECT * FROM with_action
  UNION ALL
  SELECT NULL,NULL,NULL,NULL,'NONE','NONE',NULL,'NO ACTIVE CRITICAL/MAJOR ALARMS',NULL,NULL,NULL,NOW(),0,NULL,NULL,NULL
  WHERE NOT EXISTS (SELECT 1 FROM with_action)
)
SELECT * FROM combined
ORDER BY (CASE "Severity" WHEN 'Critical' THEN 0 WHEN 'Major' THEN 1 WHEN 'NONE' THEN 2 ELSE 3 END), "When" DESC
LIMIT 50;
SQLEOF
docker cp "$QUERY_FILE" "$LOADTEST_CONTAINER:/tmp/query.sql" >/dev/null

echo ""
for n in "${LEVELS[@]}"; do
    echo "-> level: $n concurrent kiosks (each firing the Action Queue query once, simultaneously)"
    workdir="/tmp/kiosk-$n"
    docker exec "$LOADTEST_CONTAINER" bash -c "
        mkdir -p $workdir
        for i in \$(seq 1 $n); do
            ( psql -U $PGUSER -d $PGDB -X --no-psqlrc -f /tmp/query.sql > $workdir/w\$i.log 2>&1 ) &
        done
        wait
    "
    docker exec "$LOADTEST_CONTAINER" bash -c "grep -h '^Time:' $workdir/w*.log" > "$REPORT_DIR/loadtest-$n-times-$STAMP.txt" 2>/dev/null
    fail_count=$(docker exec "$LOADTEST_CONTAINER" bash -c "grep -l '^ERROR' $workdir/w*.log 2>/dev/null | wc -l" | tr -d ' ')
    times_ms=$(sed -n 's/^Time: \([0-9.]*\) ms.*/\1/p' "$REPORT_DIR/loadtest-$n-times-$STAMP.txt")
    count=$(echo "$times_ms" | grep -c . || true)
    if [[ "$count" -lt 1 ]]; then
        echo "   FAIL -- no successful queries captured, fail_count=$fail_count"
        continue
    fi
    sorted=$(echo "$times_ms" | sort -n)
    p50=$(echo "$sorted" | awk -v c="$count" 'NR==int(c*0.50)+1')
    p95=$(echo "$sorted" | awk -v c="$count" 'NR==int(c*0.95)+1')
    p99=$(echo "$sorted" | awk -v c="$count" 'NR==int(c*0.99)+1')
    max=$(echo "$sorted" | tail -1)
    min=$(echo "$sorted" | head -1)
    echo "   completed=$count/$n fail=$fail_count min=${min}ms p50=${p50}ms p95=${p95}ms p99=${p99}ms max=${max}ms"
done

echo ""
echo "VERDICT: measured for real against isolated infrastructure -- see per-level output above and $REPORT_DIR/loadtest-*-times-$STAMP.txt"
echo "(cleanup runs automatically on exit via trap)"
