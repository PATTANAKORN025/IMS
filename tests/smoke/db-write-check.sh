#!/bin/sh
set -e
docker compose up -d
sleep 45

ROWS=$(docker exec ims-timescaledb psql -U ims_admin -d ims -tAc "SELECT COUNT(*) FROM public.sys_metrics WHERE time > NOW() - INTERVAL '1 minute'")
NET_ROWS=$(docker exec ims-timescaledb psql -U ims_admin -d ims -tAc "SELECT COUNT(*) FROM public.net_metrics WHERE time > NOW() - INTERVAL '1 minute'")
# Scoped to device_type='server': this check validates the infra/SNMP seed
# fleet specifically, not the full devices table -- real LDI machines (type
# 'ldi') are enabled independently and correctly outnumber this fixed seed.
DEVICE_COUNT=$(docker exec ims-timescaledb psql -U ims_admin -d ims -tAc "SELECT COUNT(*) FROM public.devices WHERE enabled = true AND device_type = 'server'")

[ "$ROWS" -gt 0 ]        || { echo "FAIL: sys_metrics empty"; exit 1; }
[ "$NET_ROWS" -gt 0 ]    || { echo "FAIL: net_metrics empty"; exit 1; }
[ "$DEVICE_COUNT" -eq 2 ] || { echo "FAIL: expected 2 enabled server devices, got $DEVICE_COUNT"; exit 1; }

# the webhook needs the bearer token: a 200 with it proves the wiring, and a
# 401 without it proves the check is on
: "${ALERT_WEBHOOK_TOKEN:?export ALERT_WEBHOOK_TOKEN (from .env) to check the alert webhook}"
curl -sf -X POST http://localhost:1880/alert-webhook -d '{}' -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${ALERT_WEBHOOK_TOKEN}" \
  || { echo "FAIL: alert-webhook rejected or missing"; exit 1; }
[ "$(curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:1880/alert-webhook -d '{}' -H 'Content-Type: application/json')" = "401" ] \
  || { echo "FAIL: alert-webhook accepted a request without the token"; exit 1; }

echo "PASS — pipeline verified end-to-end"
