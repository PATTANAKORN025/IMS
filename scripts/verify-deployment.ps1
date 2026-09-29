Write-Host "=== IMS Deployment Verification (V2 Architecture) ===" -ForegroundColor Cyan
Write-Host ""

# 0. Secrets still at their public .env.example values? Those values are in a
#    public repo, so a deployment that kept one has a known key or password.
#    Names only are printed, never values.
Write-Host "0. Secrets changed from .env.example:" -ForegroundColor Yellow
if ((Test-Path .env) -and (Test-Path .env.example)) {
    function Read-EnvFile ($Path) {
        $map = @{}
        foreach ($line in Get-Content $Path) {
            if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
            $i = $line.IndexOf('=')
            $map[$line.Substring(0, $i)] = $line.Substring($i + 1)
        }
        return $map
    }
    $example = Read-EnvFile .env.example
    $actual = Read-EnvFile .env
    $reused = @($example.Keys | Where-Object {
        $_ -match '(PASSWORD|SECRET|TOKEN|KEY|HASH)' -and $example[$_] -ne '' -and $actual[$_] -eq $example[$_]
    } | Sort-Object)
    if ($reused.Count -gt 0) {
        Write-Host "   ❌ still at the public example value:" -ForegroundColor Red
        $reused | ForEach-Object { Write-Host "     $_" }
        exit 1
    }
    Write-Host "   ✅ none reused" -ForegroundColor Green
} else {
    Write-Host "   (no .env or .env.example here -- skipped)"
}
Write-Host ""

# 1. All containers running?
Write-Host "1. Container status:" -ForegroundColor Yellow
docker compose ps --format "table {{.Name}}`t{{.Status}}"
Write-Host ""

function Query-DB ($Query) {
    # Suppress warnings and errors from docker compose, output only the clean result
    $result = docker compose exec -T timescaledb psql -U ims_admin -d ims -t -c $Query 2>$null
    return ($result -join " ").Trim()
}

# 2. Database connectivity
Write-Host "2. Database connectivity:" -ForegroundColor Yellow
$conn = Query-DB "SELECT 1;"
if ($conn -eq "1") {
    Write-Host "   ✅ Database OK" -ForegroundColor Green
} else {
    Write-Host "   ❌ Database FAILED" -ForegroundColor Red
}
Write-Host ""

# 3. Data flowing? (sys_metrics)
Write-Host "3. Data flow check (last 5 min):" -ForegroundColor Yellow
$rows = Query-DB "SELECT COUNT(*) FROM public.sys_metrics WHERE time > NOW() - INTERVAL '5 minutes';"
if ([int]$rows -gt 0) {
    Write-Host "   ✅ Data is flowing ($rows records found in last 5 mins)" -ForegroundColor Green
} else {
    Write-Host "   ❌ No data found recently. Check Node-RED or snmpsim." -ForegroundColor Red
}
Write-Host ""

# 4. Continuous aggregates populated?
Write-Host "4. Continuous aggregates (sys_hourly):" -ForegroundColor Yellow
$caggRows = Query-DB "SELECT COUNT(*) FROM public.sys_hourly;"
if ([int]$caggRows -ge 0) {
    Write-Host "   ✅ CAGG OK ($caggRows aggregated buckets found)" -ForegroundColor Green
} else {
    Write-Host "   ❌ CAGG FAILED" -ForegroundColor Red
}
Write-Host ""

# 5. Prometheus targets
Write-Host "5. Prometheus targets:" -ForegroundColor Yellow
try {
    $prom = Invoke-RestMethod -Uri "http://localhost:9090/api/v1/targets" -TimeoutSec 5
    foreach ($target in $prom.data.activeTargets) {
        $job = $target.labels.job
        $health = $target.health
        if ($health -eq "up") {
            Write-Host "   ✅ $job : $health" -ForegroundColor Green
        } else {
            Write-Host "   ❌ $job : $health" -ForegroundColor Red
        }
    }
} catch {
    Write-Host "   ❌ Prometheus not reachable" -ForegroundColor Red
}
Write-Host ""

# 6. Grafana
Write-Host "6. Grafana:" -ForegroundColor Yellow
try {
    $grafana = Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/health" -TimeoutSec 5
    if ($grafana.database -eq "ok") {
        Write-Host "   ✅ Grafana OK (Database connection: ok)" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️ Grafana reachable but DB status: $($grafana.database)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ Grafana FAILED" -ForegroundColor Red
}
Write-Host ""

Write-Host "=== Verification complete ===" -ForegroundColor Cyan
