#!/usr/bin/env bash
set -euo pipefail

echo "=== IMS Deployment Verification ==="
echo ""

# 0. Secrets still at their public .env.example values? Those values are in a
#    public repo, so a deployment that kept one has a known key or password.
#    Names only are printed, never values.
echo "0. Secrets changed from .env.example:"
if [ -f .env ] && [ -f .env.example ]; then
  reused=$(awk -F= '
    FNR == NR { if ($1 ~ /(PASSWORD|SECRET|TOKEN|KEY|HASH)/ && $0 !~ /^#/) ex[$1] = substr($0, index($0, "=") + 1); next }
    ($1 in ex) && ex[$1] != "" && substr($0, index($0, "=") + 1) == ex[$1] { print $1 }
  ' .env.example .env)
  if [ -n "$reused" ]; then
    echo "   ✗ still at the public example value:"
    echo "$reused" | sed 's/^/     /'
    exit 1
  fi
  echo "   ✓ none reused"
else
  echo "   (no .env or .env.example here -- skipped)"
fi
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
