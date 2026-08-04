#!/bin/sh
# Query Budget Smoke Check
#
# Runs the representative panel queries measured in
# docs/phase2-baseline-metrics.md against a live DB and asserts each
# completes within CI_BUDGET_MS. Meant to run in the CI "integration-chaos"
# stage, which already brings up timescaledb + the simulator.
#
# Threshold is deliberately generous (2000ms, not the 300ms this was
# measured against in dev): CI's freshly-started stack has run for only a
# couple of minutes when this executes, so ldi_data has orders of magnitude
# less data than the dev environment these queries were measured against
# (weeks of accumulated telemetry, ~180ms worst case for the heaviest
# panel). This check isn't trying to reproduce that number in CI -- it
# can't, the data isn't there yet -- it's a tripwire for a genuinely
# pathological regression (an accidental cartesian join, a missing index,
# an N+1 pattern) that would blow way past any reasonable budget regardless
# of data volume. The real P95 number lives in docs/phase2-baseline-metrics.md,
# measured against real data, and should be re-measured by hand after any
# change to these queries -- not enforced tightly here.
set -e

CI_BUDGET_MS="${CI_BUDGET_MS:-2000}"
DB_EXEC="docker exec ims-timescaledb psql -U ims_admin -d ims -tAc"

check_query() {
  label="$1"
  sql="$2"
  start=$(date +%s%N)
  $DB_EXEC "$sql" > /dev/null
  end=$(date +%s%N)
  ms=$(( (end - start) / 1000000 ))
  echo "  $label: ${ms}ms"
  if [ "$ms" -gt "$CI_BUDGET_MS" ]; then
    echo "FAIL: $label took ${ms}ms, over the ${CI_BUDGET_MS}ms budget"
    exit 1
  fi
}

echo "Query Budget Smoke Check (budget: ${CI_BUDGET_MS}ms)"

check_query "v_machine_spc_fleet aggregate" \
  "SELECT MIN(worst_cpk) FROM public.v_machine_spc_fleet;"

check_query "v_machine_spc_ranking (Cpk/StdDev, CROSS JOIN LATERAL unpivot)" \
  "SELECT COUNT(*) FROM public.v_machine_spc_ranking;"

check_query "ldi_data_1m CAGG trend read" \
  "SELECT COUNT(*) FROM public.ldi_data_1m WHERE bucket > NOW() - INTERVAL '2 hours';"

check_query "RCA category JOIN (v_ldi_alarm_context x v_ldi_alarm_category)" \
  "SELECT COUNT(*) FROM public.v_ldi_alarm_context c JOIN public.v_ldi_alarm_category cat ON cat.alarm_code = c.errorcode;"

echo "PASS — all sampled queries within budget"
