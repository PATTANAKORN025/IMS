#!/bin/sh
set -e
docker compose up -d
sleep 45

ROWS=$(docker exec ims-timescaledb psql -U ims_admin -d ims -tAc "SELECT COUNT(*) FROM public.sys_metrics WHERE time > NOW() - INTERVAL '1 minute'")
NET_ROWS=$(docker exec ims-timescaledb psql -U ims_admin -d ims -tAc "SELECT COUNT(*) FROM public.net_metrics WHERE time > NOW() - INTERVAL '1 minute'")
DEVICE_COUNT=$(docker exec ims-timescaledb psql -U ims_admin -d ims -tAc "SELECT COUNT(*) FROM public.devices WHERE enabled = true")
LDI_ROWS=$(docker exec ims-timescaledb psql -U ims_admin -d ims -tAc "SELECT COUNT(*) FROM public.ldi_data")

[ "$ROWS" -gt 0 ]        || { echo "FAIL: sys_metrics empty"; exit 1; }
[ "$NET_ROWS" -gt 0 ]    || { echo "FAIL: net_metrics empty"; exit 1; }
[ "$DEVICE_COUNT" -eq 2 ] || { echo "FAIL: expected 2 enabled devices, got $DEVICE_COUNT"; exit 1; }
[ "$LDI_ROWS" -gt 0 ]    || { echo "FAIL: ldi_data empty"; exit 1; }

curl -sf -X POST http://localhost:1880/alert-webhook -d '{}' -H 'Content-Type: application/json' \
  || { echo "FAIL: alert-webhook 404"; exit 1; }

# /ldi-telemetry must be registered (regression guard for build-flows.sh
# silently dropping a split flow file) and must reject requests without a
# valid key rather than accepting them.
LDI_UNAUTH=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:1880/ldi-telemetry \
  -H "Content-Type: application/json" -d '[]')
[ "$LDI_UNAUTH" = "401" ] || { echo "FAIL: /ldi-telemetry unauthenticated request returned $LDI_UNAUTH, expected 401"; exit 1; }

curl -sf -X POST http://localhost:1880/ldi-telemetry \
  -H "Content-Type: application/json" -H "x-api-key: $INGEST_API_KEY" -d '[]' \
  || { echo "FAIL: /ldi-telemetry not registered (404) or rejected a valid key"; exit 1; }

echo "PASS — pipeline verified end-to-end"
