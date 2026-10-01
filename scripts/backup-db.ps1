<#
.SYNOPSIS
    IMS TimescaleDB database backup (Windows PowerShell)
.DESCRIPTION
    Same output as scripts/backup-db.sh: pg_dump writes a gzipped plain-SQL
    dump inside the container (-Z) and docker cp copies the file out. The dump
    never passes through the PowerShell pipeline, which would re-encode it
    (console code page, BOM, CRLF). Role and database come from .env.
    Purges dumps older than the retention period. Task Scheduler friendly.
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\scripts\backup-db.ps1
#>

[CmdletBinding()]
param (
    [string]$BackupDir = ".\backups",
    [int]$RetentionDays = 30
)

$ErrorActionPreference = "Stop"

$rootDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $rootDir

function Get-EnvValue([string]$Key, [string]$Default) {
    if (Test-Path ".env") {
        $line = Get-Content ".env" | Where-Object { $_ -match "^$Key=" } | Select-Object -Last 1
        if ($line) {
            $v = ($line -replace "^$Key=", "").Trim().Trim('"').Trim("'")
            if ($v) { return $v }
        }
    }
    return $Default
}

$dbUser = Get-EnvValue "POSTGRES_USER" "ims_admin"
$dbName = Get-EnvValue "POSTGRES_DB" "ims"
$container = "ims-timescaledb"

if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$fileName = "ims_backup_${timestamp}.sql.gz"
$tmp = "/tmp/$fileName"
$dest = Join-Path $BackupDir $fileName

$running = docker ps -q --filter "name=^${container}$" --filter "status=running"
if (-not $running) {
    Write-Error "$container is not running. Aborting backup."
}

Write-Host "Backing up $dbName to $dest..."
try {
    docker exec $container pg_dump -U $dbUser -d $dbName -Z 6 -f $tmp
    if ($LASTEXITCODE -ne 0) { throw "pg_dump failed (exit $LASTEXITCODE)" }

    docker cp "${container}:${tmp}" $dest
    if ($LASTEXITCODE -ne 0) { throw "docker cp failed (exit $LASTEXITCODE)" }
}
finally {
    docker exec $container rm -f $tmp 2>$null | Out-Null
}

# gzip magic bytes 1F 8B
$fs = [System.IO.File]::OpenRead((Resolve-Path $dest))
try { $b0 = $fs.ReadByte(); $b1 = $fs.ReadByte() } finally { $fs.Dispose() }
if ($b0 -ne 0x1F -or $b1 -ne 0x8B) {
    Remove-Item $dest -Force
    Write-Error "$dest is not a gzip file. Backup failed."
}

$size = "{0:N2} MB" -f ((Get-Item $dest).Length / 1MB)
Write-Host "Done: $dest ($size)"

$cutoff = (Get-Date).AddDays(-$RetentionDays)
Get-ChildItem -Path $BackupDir -Filter "ims_backup_*" |
    Where-Object { $_.LastWriteTime -lt $cutoff } |
    ForEach-Object {
        Write-Host "  Removing expired: $($_.Name)"
        Remove-Item $_.FullName -Force
    }
