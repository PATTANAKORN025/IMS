#!/usr/bin/env bash
set -euo pipefail

echo "=== IMS Deployment Verification ==="
echo ""

# 1. All containers running?
echo "1. Container status:"
docker compose ps --format "table {{.Name}}\t{{.Status}}"
echo ""

# 2. Database connectivity
echo "2. Database connectivity:"
docker compose exec -T timescaledb psql -U ims_admin -d ims -c "SELECT 1 AS connected;" 2>/dev/null && echo "   ✓ Database OK" || echo "   ✗ Database FAILED"
echo ""

# 3. Data flowing?
echo "3. Data flow check (last 5 min):"
docker compose exec -T timescaledb psql -U ims_admin -d ims -c \
  "SELECT device_id, COUNT(*) as rows, MAX(time) as latest FROM public.sys_metrics WHERE time > NOW() - INTERVAL '5 minutes' GROUP BY device_id;" 2>/dev/null
echo ""

# 4. Continuous aggregates populated?
echo "4. Continuous aggregates:"
docker compose exec -T timescaledb psql -U ims_admin -d ims -c \
  "SELECT COUNT(*) as hourly_rows FROM public.sys_hourly;" 2>/dev/null
echo ""

# 5. Prometheus targets
echo "5. Prometheus targets:"
docker compose exec -T prometheus wget -qO- "http://localhost:9090/api/v1/targets" 2>/dev/null | \
  python -c "import json,sys; d=json.load(sys.stdin); [print(f'   {t[\"labels\"].get(\"job\",\"?\")}: {t[\"health\"]}') for t in d.get('data',{}).get('activeTargets',[])]" 2>/dev/null || echo "   (Prometheus not reachable)"
echo ""

# 6. Grafana
echo "6. Grafana:"
curl -sf http://localhost:3000/api/health 2>/dev/null && echo "   ✓ Grafana OK" || echo "   ✗ Grafana FAILED"
echo ""

echo "=== Verification complete ==="
