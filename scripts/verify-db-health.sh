#!/bin/bash
# IMS Database Health & Integrity Check
# This script verifies TimescaleDB hypertables, continuous aggregates, and retention policies.

set -e

echo "==================================================="
echo "   IMS Database Enterprise Health Check"
echo "==================================================="

# Command wrapper for querying DB
query_db() {
    docker compose exec -T timescaledb psql -U ims_admin -d ims -t -c "$1" | sed '/^[[:space:]]*$/d' | xargs
}

# 1. Verify Hypertables
echo -n "[1] Checking Hypertables... "
HYPERTABLES=$(query_db "SELECT hypertable_name FROM timescaledb_information.hypertables;")
if [[ "$HYPERTABLES" == *"sys_metrics"* && "$HYPERTABLES" == *"net_metrics"* && "$HYPERTABLES" == *"ldi_metrics"* ]]; then
    echo "✅ PASS ($HYPERTABLES)"
else
    echo "❌ FAIL (Missing required hypertables: $HYPERTABLES)"
    exit 1
fi

# 2. Verify Continuous Aggregates (CAGGs)
echo -n "[2] Checking Continuous Aggregates... "
CAGGS=$(query_db "SELECT view_name FROM timescaledb_information.continuous_aggregates;")
if [[ "$CAGGS" == *"sys_hourly"* && "$CAGGS" == *"net_hourly"* && "$CAGGS" == *"ldi_hourly"* ]]; then
    echo "✅ PASS ($CAGGS)"
else
    echo "❌ FAIL (Missing hourly CAGGs: $CAGGS)"
    exit 1
fi

# 3. Verify Background Jobs (Refresh & Drop Chunks)
echo -n "[3] Checking Background Maintenance Jobs... "
JOBS=$(query_db "SELECT proc_name FROM timescaledb_information.jobs;")
if [[ "$JOBS" == *"policy_refresh_continuous_aggregate"* && "$JOBS" == *"policy_retention"* ]]; then
    echo "✅ PASS (Auto-Refresh and Data Retention active)"
else
    echo "⚠️ WARNING (Missing retention or refresh policies! Disk may fill up. Found: $JOBS)"
    # We don't exit 1 here so we can see the full output, but it's a warning.
fi

# 4. Verify PgBouncer Connection (Pooling Layer)
echo -n "[4] Checking PgBouncer Connection Pooler... "
if docker compose ps --format '{{.Name}} {{.Status}}' | grep -q '^ims-pgbouncer .*Up'; then
    echo "✅ PASS (PgBouncer is accessible internally)"
else
    echo "❌ FAIL (PgBouncer container is not running)"
    exit 1
fi

# 5. Check Disk Compression (TimescaleDB Compression)
echo -n "[5] Checking Hypertable Compression Status... "
COMPRESSION=$(query_db "SELECT hypertable_name FROM timescaledb_information.compression_settings;")
if [[ -z "$COMPRESSION" ]]; then
    echo "⚠️ WARNING (No tables are configured for TimescaleDB compression!)"
else
    echo "✅ PASS (Compression enabled for: $COMPRESSION)"
fi

echo "==================================================="
echo "   Health Check Completed!"
echo "==================================================="
