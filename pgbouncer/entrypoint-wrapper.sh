#!/bin/sh
# Wrapper: pre-seed userlist.txt with grafana_reader, then run original entrypoint

_AUTH_FILE="${AUTH_FILE:-/etc/pgbouncer/userlist.txt}"
touch "${_AUTH_FILE}"

# Add grafana_reader if missing
if ! grep -q '"grafana_reader"' "${_AUTH_FILE}" 2>/dev/null; then
  echo '"grafana_reader" "grafana_secure"' >> "${_AUTH_FILE}"
fi

# Run original entrypoint with the pgbouncer command as argument
exec /entrypoint.sh pgbouncer /etc/pgbouncer/pgbouncer.ini
