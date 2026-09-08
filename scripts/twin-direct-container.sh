#!/usr/bin/env bash
# Starts a throwaway Factory Twin container for direct-mode scene verification.
#
# The production twin publishes no host port on purpose: its only access
# control is the proxy's auth_request gate against Grafana's session. A direct
# run needs a reachable port, and the safe way to get one is a container bound
# to loopback that is removed when the run finishes.
#
# Never publish these on 0.0.0.0. That reaches past the auth gate, and the
# default mount is the real private/ directory.
#
#   twin-direct-container.sh up            # 127.0.0.1:4199, real private/ mount
#   twin-direct-container.sh up --nogeo    # 127.0.0.1:4198, empty private/ mount
#   twin-direct-container.sh down          # removes both
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE="ims-factory-twin-3d"
LABEL="ims.role=scratch-test"
ACTION="${1:-up}"
MODE="${2:-}"

down() {
  # By label, so a container renamed or started by an older version of this
  # script is still found rather than silently left running.
  local ids
  ids="$(docker ps -aq --filter "label=$LABEL" || true)"
  [ -n "$ids" ] && docker rm -f $ids >/dev/null || true
  docker rm -f ims-twin-verify ims-twin-nogeo >/dev/null 2>&1 || true
  echo "scratch twin containers removed"
}

case "$ACTION" in
  down) down ;;
  up)
    if [ "$MODE" = "--nogeo" ]; then
      NAME=ims-twin-nogeo; PORT=4198
      MOUNT="$(mktemp -d)"   # deliberately empty: proves the no-geometry path
    else
      NAME=ims-twin-verify; PORT=4199
      MOUNT="$ROOT/services/factory-twin-3d/private"
    fi
    # Rebuild first. A stale image has twice produced a false regression
    # failure that looked like a product defect.
    docker build -q -t "$IMAGE" "$ROOT/services/factory-twin-3d" >/dev/null
    docker rm -f "$NAME" >/dev/null 2>&1 || true

    # Carry the running production container's database settings across, so
    # /api/state answers here too and the scene is checked against real
    # telemetry rather than a 500. Read from the live container and passed
    # straight to `docker run`; never printed, never written to a file.
    ENVARGS=()
    while IFS= read -r kv; do
      [ -n "$kv" ] && ENVARGS+=(-e "$kv")
    done < <(docker inspect ims-factory-twin-3d \
      --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
      | grep -E '^(PG[A-Z]+|PORT)=' || true)
    [ ${#ENVARGS[@]} -eq 0 ] && \
      echo "warning: ims-factory-twin-3d not running; /api/state will 500" >&2

    docker run -d --rm --name "$NAME" --label "$LABEL" \
      --network ims_ims-internal \
      -p "127.0.0.1:$PORT:4100" \
      -v "$MOUNT:/app/private:ro" \
      "${ENVARGS[@]}" \
      "$IMAGE" >/dev/null
    echo "$NAME listening on http://127.0.0.1:$PORT/ (loopback only, NO auth gate)"
    echo "TWIN_DIRECT_URL=http://127.0.0.1:$PORT/ node tests/playwright/factory-twin-regression.js"
    ;;
  *) echo "usage: $0 [up [--nogeo] | down]" >&2; exit 2 ;;
esac
