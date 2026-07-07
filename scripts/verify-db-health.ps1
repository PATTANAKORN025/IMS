# IMS Database Health & Integrity Check

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "   IMS Database Enterprise Health Check" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan

function Query-DB ($Query) {
    # Suppress warnings and errors from docker compose, output only the clean result
    $result = docker compose exec -T timescaledb psql -U ims_admin -d ims -t -c $Query 2>$null
    return ($result -join " ").Trim()
}

# 1. Verify Hypertables
Write-Host -NoNewline "[1] Checking Hypertables... "
$hypertables = Query-DB "SELECT hypertable_name FROM timescaledb_information.hypertables;"
if ($hypertables -match "sys_metrics" -and $hypertables -match "net_metrics" -and $hypertables -match "ldi_metrics") {
    Write-Host "✅ PASS ($hypertables)" -ForegroundColor Green
} else {
    Write-Host "❌ FAIL (Missing required hypertables: $hypertables)" -ForegroundColor Red
}

# 2. Verify Continuous Aggregates (CAGGs)
Write-Host -NoNewline "[2] Checking Continuous Aggregates... "
$caggs = Query-DB "SELECT view_name FROM timescaledb_information.continuous_aggregates;"
if ($caggs -match "sys_hourly" -and $caggs -match "net_hourly" -and $caggs -match "ldi_hourly") {
    Write-Host "✅ PASS ($caggs)" -ForegroundColor Green
} else {
    Write-Host "❌ FAIL (Missing hourly CAGGs: $caggs)" -ForegroundColor Red
}

# 3. Verify Background Jobs (Refresh & Drop Chunks)
Write-Host -NoNewline "[3] Checking Background Maintenance Jobs... "
$jobs = Query-DB "SELECT proc_name FROM timescaledb_information.jobs;"
if ($jobs -match "policy_refresh_continuous_aggregate" -and $jobs -match "policy_retention") {
    Write-Host "✅ PASS (Auto-Refresh and Data Retention active)" -ForegroundColor Green
} else {
    Write-Host "⚠️ WARNING (Missing retention or refresh policies! Disk may fill up. Found: $jobs)" -ForegroundColor Yellow
}

# 4. Check Disk Compression (TimescaleDB Compression)
Write-Host -NoNewline "[4] Checking Hypertable Compression Status... "
$compression = Query-DB "SELECT hypertable_name FROM timescaledb_information.compression_settings;"
if ([string]::IsNullOrWhiteSpace($compression)) {
    Write-Host "⚠️ WARNING (No tables are configured for TimescaleDB compression!)" -ForegroundColor Yellow
} else {
    Write-Host "✅ PASS (Compression enabled for: $compression)" -ForegroundColor Green
}

Write-Host "===================================================" -ForegroundColor Cyan
Write-Host "   Health Check Completed!" -ForegroundColor Cyan
Write-Host "===================================================" -ForegroundColor Cyan
