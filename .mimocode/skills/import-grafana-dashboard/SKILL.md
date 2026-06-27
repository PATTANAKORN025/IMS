---
name: import-grafana-dashboard
description: Import or update Grafana dashboards via the HTTP API from the command line
---

# Import Grafana Dashboard

Push dashboard JSON files to Grafana via its HTTP API. Used when dashboards are provisioned as files but need manual re-import, or when testing dashboard changes before committing.

## When to Use

- After editing dashboard JSON files in `monitoring/grafana/dashboards/`
- When Grafana shows stale/different version of a dashboard
- When provisioning doesn't auto-reload
- After fixing JSON errors or schema issues

## Quick Import (PowerShell)

```powershell
$dash = Get-Content -Raw "monitoring/grafana/dashboards/ims-noc-overview.json" | ConvertFrom-Json
$body = @{ dashboard = $dash; overwrite = $true } | ConvertTo-Json -Depth 20
$auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("admin:admin"))
$headers = @{ Authorization = "Basic $auth"; "Content-Type" = "application/json" }
Invoke-RestMethod -Uri "http://localhost:3000/api/dashboards/db" -Method POST -Headers $headers -Body $body
```

## Import All Dashboards

```powershell
$auth = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("admin:admin"))
$headers = @{ Authorization = "Basic $auth"; "Content-Type" = "application/json" }

Get-ChildItem "monitoring/grafana/dashboards/*.json" | ForEach-Object {
    $dash = Get-Content -Raw $_.FullName | ConvertFrom-Json
    $body = @{ dashboard = $dash; overwrite = $true } | ConvertTo-Json -Depth 20
    try {
        $result = Invoke-RestMethod -Uri "http://localhost:3000/api/dashboards/db" -Method POST -Headers $headers -Body $body
        Write-Host "OK: $($_.Name) -> $($result.url)"
    } catch {
        Write-Host "FAIL: $($_.Name) -> $($_.Exception.Message)"
    }
}
```

## Verify Import via API

```bash
docker compose exec grafana curl -s http://localhost:3000/api/search?type=dash-db | python -m json.tool
```

## Verify Dashboard Accessible

```bash
docker compose exec grafana curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/dashboards/db/ims-noc-overview
```

Expected: HTTP 200.

## Dashboard UIDs

| File | UID | URL |
|------|-----|-----|
| `ims-noc-overview.json` | `ims-noc-overview` | `/d/ims-noc-overview` |
| `ims-engineering-drilldown.json` | `ims-engineering` | `/d/ims-engineering` |
| `ims-main.json` | `ims-main` | `/d/ims-main` |
| `ims-capacity-planning.json` | `ims-capacity` | `/d/ims-capacity` |

## Notes

- Grafana credentials: `admin:admin` (default from docker-compose)
- `overwrite: true` replaces existing dashboard with same UID
- Dashboard files are read-only mounted in Grafana container — edit JSON files directly
- After import, hard-refresh browser (Ctrl+Shift+R) to clear cache
- If import fails, validate JSON first: `python -c "import json; json.load(open('file.json'))"`
