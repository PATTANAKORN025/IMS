#!/bin/bash
# generate-showcase.sh — Capture dashboard screenshots for README embedding
#
# Runs the Playwright visual regression script, then copies outputs to both
# tests/screenshots/ (CI artifacts) and assets/ (README/docs).
#
# Usage:
#   ./scripts/generate-showcase.sh
#   make test-visual
#
# Prerequisites:
#   - Node.js with playwright installed: npm install playwright
#   - Chromium browser: npx playwright install chromium
#   - Grafana running: docker compose up grafana
#   - Grafana credentials in env: GRAFANA_USER, GRAFANA_PASS (default: admin/change-me-please)
#
# Output:
#   assets/noc-overview.png
#   assets/engineering-drilldown.png
#   assets/capacity-planning.png
#   assets/meta-monitoring.png
#   tests/screenshots/*.png
#   tests/screenshots/visual-regression-report.json

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ASSETS_DIR="${PROJECT_ROOT}/assets"
SCREENSHOTS_DIR="${PROJECT_ROOT}/tests/screenshots"
REGRESSION_SCRIPT="${PROJECT_ROOT}/tests/playwright/dashboard-visual-regression.js"

echo "=== IMS Dashboard Showcase Generator ==="
echo ""

# 1. Ensure output directories exist
mkdir -p "$ASSETS_DIR" "$SCREENSHOTS_DIR"

# 2. Check prerequisites
if ! command -v npx &> /dev/null; then
    echo "ERROR: npx not found. Install Node.js first."
    exit 1
fi

# 3. Install Playwright if needed
echo "Ensuring Playwright + Chromium are installed..."
npx playwright install chromium 2>/dev/null || true

# 4. Check if Grafana is running
GRAFANA_URL="${GRAFANA_URL:-http://localhost:3000}"
if ! curl -sf "${GRAFANA_URL}/api/health" > /dev/null 2>&1; then
    echo "WARNING: Grafana not reachable at ${GRAFANA_URL}"
    echo "  Start it with: docker compose up -d grafana"
    echo "  Or set GRAFANA_URL to your Grafana instance"
    echo ""
    exit 1
fi
echo "Grafana: ${GRAFANA_URL} — OK"
echo ""

# 5. Run the Playwright capture script
echo "Running Playwright screenshot capture..."
echo "  Script: ${REGRESSION_SCRIPT}"
echo ""
node "$REGRESSION_SCRIPT"
EXIT_CODE=$?

# 6. Copy screenshots to assets/ (for README embedding)
echo ""
echo "Copying screenshots to assets/..."
for png in "$SCREENSHOTS_DIR"/*.png; do
    if [ -f "$png" ]; then
        BASENAME=$(basename "$png")
        cp "$png" "$ASSETS_DIR/$BASENAME"
        echo "  + assets/$BASENAME"
    fi
done

# 7. Summary
echo ""
echo "=== Showcase Ready ==="
echo "Screenshots: ${ASSETS_DIR}/"
echo "  noc-overview.png        — Fleet health envelope, health score, LDI yield risk"
echo "  engineering-drilldown.png — Per-machine gauges, timeseries, power analytics"
echo "  capacity-planning.png   — Disk/CPU/RAM forecast with linear regression"
echo "  meta-monitoring.png     — Pipeline health, deadman alerts, circuit breaker"
echo ""
echo "To embed in README:"
echo '  | ![NOC](assets/noc-overview.png) | ![Eng](assets/engineering-drilldown.png) | ![Cap](assets/capacity-planning.png) |'

exit $EXIT_CODE
