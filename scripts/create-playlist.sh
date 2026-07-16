#!/bin/bash
# create-playlist.sh — Creates a Grafana playlist for NOC wall-display rotation
# Usage: ./scripts/create-playlist.sh [GRAFANA_URL] [API_KEY]
# Requires: curl, jq
#
# Kiosk mode URLs:
#   Full TV kiosk (auto-hides chrome, auto-fits panels):
#     http://localhost:3000/d/ims-noc-overview?orgId=1&kiosk=tv&autofitpanels
#
#   Clean kiosk (hides sidebar + topnav, keeps variable controls):
#     http://localhost:3000/d/ims-noc-overview?orgId=1&kiosk
#
#   Embedded kiosk (hides everything, for iframe):
#     http://localhost:3000/d/ims-noc-overview?orgId=1&kiosk=1

set -euo pipefail

GRAFANA_URL="${1:-http://localhost:3000}"
API_KEY="${2:-${GRAFANA_API_KEY:-}}"
INTERVAL="${3:-30}"

if [ -z "$API_KEY" ]; then
    echo "ERROR: Provide Grafana API key as \$2 or GRAFANA_API_KEY env var"
    echo "Usage: $0 <grafana_url> <api_key> [interval_seconds]"
    exit 1
fi

AUTH="Authorization: Bearer ${API_KEY}"

echo "=== IMS NOC Playlist Creator ==="
echo "Grafana: ${GRAFANA_URL}"
echo "Interval: ${INTERVAL}s per dashboard"
echo ""

# 1. Delete any existing IMS playlist
echo "Cleaning existing playlists..."
EXISTING=$(curl -s -H "$AUTH" "${GRAFANA_URL}/api/playlists" 2>/dev/null || echo "[]")
IMS_PID=$(echo "$EXISTING" | python -c "import sys,json; data=json.load(sys.stdin); print(next((p['id'] for p in data if p.get('name','').startswith('IMS')), ''))" 2>/dev/null || echo "")
if [ -n "$IMS_PID" ]; then
    curl -s -X DELETE -H "$AUTH" "${GRAFANA_URL}/api/playlists/${IMS_PID}" > /dev/null
    echo "  Deleted existing playlist (id=${IMS_PID})"
fi

# 2. Create the playlist
echo "Creating playlist..."
PLAYLIST=$(curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
    "${GRAFANA_URL}/api/playlists" \
    -d "{
        \"name\": \"IMS NOC Wall-Display\",
        \"interval\": \"${INTERVAL}s\",
        \"include\": [],
        \"orgId\": 1
    }")

PLAYLIST_ID=$(echo "$PLAYLIST" | python -c "import sys,json; print(json.load(sys.stdin).get('id',''))" 2>/dev/null || echo "")
if [ -z "$PLAYLIST_ID" ]; then
    echo "  ERROR: Failed to create playlist"
    echo "  Response: $PLAYLIST"
    exit 1
fi
echo "  Created playlist (id=${PLAYLIST_ID})"

# 3. Add dashboard items
DASHBOARDS=(
    "ims-noc-overview:NOC Overview:0"
    "ims-engineering:Engineering Drill-Down:1"
    "ims-capacity:Capacity Planning:2"
)

for entry in "${DASHBOARDS[@]}"; do
    IFS=':' read -r uid title order <<< "$entry"
    curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
        "${GRAFANA_URL}/api/playlists/${PLAYLIST_ID}/items" \
        -d "{
            \"dashboardUid\": \"${uid}\",
            \"title\": \"${title}\",
            \"order\": ${order},
            \"value\": \"\"
        }" > /dev/null
    echo "  + ${title} (${uid})"
done

echo ""
echo "=== Playlist Ready ==="
echo "Playlist URL: ${GRAFANA_URL}/playlists/play/${PLAYLIST_ID}"
echo ""
echo "Kiosk Mode URLs (for NOC wall-display):"
echo "  TV mode:     ${GRAFANA_URL}/d/ims-noc-overview?orgId=1&kiosk=tv&autofitpanels"
echo "  Clean mode:  ${GRAFANA_URL}/d/ims-noc-overview?orgId=1&kiosk"
echo "  Embedded:    ${GRAFANA_URL}/d/ims-noc-overview?orgId=1&kiosk=1"
echo ""
echo "To start playlist in kiosk mode on a NOC display:"
echo "  Open: ${GRAFANA_URL}/playlists/play/${PLAYLIST_ID}?kiosk=tv&autofitpanels"
