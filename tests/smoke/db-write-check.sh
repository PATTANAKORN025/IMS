#!/usr/bin/env bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# IMS — DB Write Smoke Test
# Validates the full Node-RED → PostgreSQL write pipeline
# Exit 0 = success, Exit 1 = pipeline broken
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

set -euo pipefail

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

MACHINE_ID="SMOKE-TEST-$(date +%s)"
INJECT_URL="http://localhost:1880/inject"

echo -e "${GREEN}[SMOKE] Injecting payload: ${MACHINE_ID}${NC}"

# Step 1: POST to Node-RED /inject
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$INJECT_URL" \
  -H "Content-Type: application/json" \
  -d "{\"machine_id\": \"${MACHINE_ID}\"}")

if [ "$HTTP_CODE" -ne 200 ]; then
  echo -e "${RED}[SMOKE] FAIL — /inject returned HTTP ${HTTP_CODE}${NC}"
  exit 1
fi

echo -e "${GREEN}[SMOKE] /inject returned HTTP ${HTTP_CODE}${NC}"

# Step 2: Wait for pipeline processing
echo -e "${GREEN}[SMOKE] Waiting 3s for pipeline...${NC}"
sleep 3

# Step 3: Query TimescaleDB
COUNT=$(docker exec ims-timescaledb psql -U ims_admin -d ims -t -A \
  -c "SELECT COUNT(*) FROM public.machine_telemetry WHERE machine_id = '${MACHINE_ID}';")

COUNT=$(echo "$COUNT" | tr -d '[:space:]')

if [ "$COUNT" -gt 0 ] 2>/dev/null; then
  echo -e "${GREEN}[SMOKE] PASS — Found ${COUNT} row(s) for ${MACHINE_ID}${NC}"
  exit 0
else
  echo -e "${RED}[SMOKE] FAIL — No rows found for ${MACHINE_ID} (count=${COUNT})${NC}"
  exit 1
fi
