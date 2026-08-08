#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════
# Grafana Library Panels — idempotent HTTP API provisioning.
#
# Grafana has NO file-based provisioning provider for library panels
# (only datasources/dashboards/alerting/plugins get that). The
# pre-existing monitoring/grafana/provisioning/libraries/libraries.yml
# + monitoring/grafana/library-panels/*.json scaffold looked like a
# provisioning setup but was never actually read by Grafana -- verified
# empirically (GET /api/library-elements returned 0 elements after a
# full container restart, and Grafana's own startup log never mentions
# "libraries" the way it does for every provider it actually has).
# Real library panels only exist as rows in Grafana's own database,
# created via its HTTP API. This script is the reproducible substitute:
# run it once after Grafana is up and it creates/updates every panel in
# library-panels/*.json by a fixed, hand-chosen uid (not Grafana's
# auto-generated one), so dashboard JSON can safely reference that uid
# even on a completely fresh deploy.
#
# Idempotent: re-running PATCHes existing elements to match the JSON
# source of truth in library-panels/ rather than erroring on conflict.
#
# Usage: bash scripts/provision-library-panels.sh
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# This runs host-side (curls Grafana from outside the compose network),
# unlike most scripts here which docker exec into a container that
# already has its env baked in via docker-compose -- so load .env here.
if [ -f .env ]; then
    set -a
    # shellcheck disable=SC1091
    source .env
    set +a
fi

GRAFANA_URL=${GRAFANA_URL:-http://localhost:${GRAFANA_PORT:-3000}}
GRAFANA_USER=${GRAFANA_ADMIN_USER:-admin}
GRAFANA_PASS=${GRAFANA_ADMIN_PASSWORD:?set GRAFANA_ADMIN_PASSWORD in .env}
FOLDER_TITLE=${GRAFANA_FOLDER:-IMS}
LIB_DIR=monitoring/grafana/library-panels
HELPER=scripts/lib/grafana_library_helper.py

auth() { curl -s -u "$GRAFANA_USER:$GRAFANA_PASS" "$@"; }

echo "==> waiting for Grafana at $GRAFANA_URL"
for i in $(seq 1 60); do
    if auth -o /dev/null -w '%{http_code}' "$GRAFANA_URL/api/health" 2>/dev/null | grep -q '^200$'; then
        break
    fi
    sleep 2
done

echo "==> resolving folder uid for '$FOLDER_TITLE'"
FOLDER_UID=$(auth "$GRAFANA_URL/api/folders" | python3 "$HELPER" folder-uid "$FOLDER_TITLE")
if [ -z "$FOLDER_UID" ]; then
    echo "ERROR: no folder titled '$FOLDER_TITLE' found -- dashboards must provision first" >&2
    exit 1
fi
echo "    folder uid: $FOLDER_UID"

for f in "$LIB_DIR"/*.json; do
    [ -f "$f" ] || continue
    uid=$(python3 "$HELPER" spec-uid "$f")
    name=$(python3 "$HELPER" spec-name "$f")

    exists=$(auth "$GRAFANA_URL/api/library-elements/$uid" | python3 "$HELPER" element-exists)

    payload_file="$LIB_DIR/.payload.tmp.json"
    trap 'rm -f "$payload_file"' EXIT

    if [ "$exists" = "yes" ]; then
        echo "==> updating library panel: $name ($uid)"
        version=$(auth "$GRAFANA_URL/api/library-elements/$uid" | python3 "$HELPER" element-version)
        python3 "$HELPER" build-payload "$f" "$FOLDER_UID" "$version" > "$payload_file"
        auth -X PATCH "$GRAFANA_URL/api/library-elements/$uid" \
            -H "Content-Type: application/json" \
            --data-binary "@$payload_file" -o /dev/null -w '    HTTP %{http_code}\n'
    else
        echo "==> creating library panel: $name ($uid)"
        python3 "$HELPER" build-payload "$f" "$FOLDER_UID" > "$payload_file"
        auth -X POST "$GRAFANA_URL/api/library-elements" \
            -H "Content-Type: application/json" \
            --data-binary "@$payload_file" -o /dev/null -w '    HTTP %{http_code}\n'
    fi
    rm -f "$payload_file"
done

echo "==> done"
auth "$GRAFANA_URL/api/library-elements" | python3 "$HELPER" list-elements
