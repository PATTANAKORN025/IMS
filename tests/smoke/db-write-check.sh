#!/bin/sh
set -e
docker compose up -d
sleep 45

ROWS=$(docker exec ims-timescaledb psql -U ims_admin -d ims -tAc "SELECT COUNT(*) FROM public.sys_metrics WHERE time > NOW() - INTERVAL '1 minute'")
NET_ROWS=$(docker exec ims-timescaledb psql -U ims_admin -d ims -tAc "SELECT COUNT(*) FROM public.net_metrics WHERE time > NOW() - INTERVAL '1 minute'")
DEVICE_COUNT=$(docker exec ims-timescaledb psql -U ims_admin -d ims -tAc "SELECT COUNT(*) FROM public.devices WHERE enabled = true")

[ "$ROWS" -gt 0 ]        || { echo "FAIL: sys_metrics empty"; exit 1; }
[ "$NET_ROWS" -gt 0 ]    || { echo "FAIL: net_metrics empty"; exit 1; }
[ "$DEVICE_COUNT" -eq 2 ] || { echo "FAIL: expected 2 enabled devices, got $DEVICE_COUNT"; exit 1; }

curl -sf -X POST http://localhost:1880/alert-webhook -d '{}' -H 'Content-Type: application/json' \
  || { echo "FAIL: alert-webhook 404"; exit 1; }

echo "PASS — pipeline verified end-to-end"
