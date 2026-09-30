<#
.SYNOPSIS
    IMS TimescaleDB Automated Database Backup Script (Windows PowerShell)
.DESCRIPTION
    Dumps the PostgreSQL/TimescaleDB database from the running container,
    compresses the output, and automatically purges archives older than 30 days.
    Compatible with Windows Task Scheduler for daily automated backups.
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\scripts\backup-db.ps1
#>

[CmdletBinding()]
param (
    [string]$BackupDir = ".\backups",
    [int]$RetentionDays = 30
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
Set-Location $rootDir

if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$dumpFileName = "ims_backup_${timestamp}.sql"
$dumpFilePath = Join-Path $BackupDir $dumpFileName
$zipFilePath = Join-Path $BackupDir "${dumpFileName}.zip"

Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host " IMS Database Backup: $timestamp" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Cyan

# Verify container is running
$containerRunning = docker ps --filter "name=ims-timescaledb" --filter "status=running" -q 2>$null
if (-not $containerRunning) {
    Write-Error "ERROR: ims-timescaledb container is not running. Aborting backup."
    exit 1
}

Write-Host "Creating PostgreSQL dump: $dumpFileName..." -ForegroundColor Yellow
$dumpCmd = "docker exec -i ims-timescaledb pg_dump -U ims_admin ims"
Invoke-Expression "$dumpCmd" | Out-File -FilePath $dumpFilePath -Encoding utf8

if ((Get-Item $dumpFilePath).Length -eq 0) {
    Remove-Item -Path $dumpFilePath -Force
    Write-Error "ERROR: Database dump produced an empty file. Backup failed."
    exit 1
}

$rawSize = "{0:N2} MB" -f ((Get-Item $dumpFilePath).Length / 1MB)
Write-Host "Dump complete ($rawSize). Compressing archive..." -ForegroundColor Green

# Compress
Compress-Archive -Path $dumpFilePath -DestinationPath $zipFilePath -Force
Remove-Item -Path $dumpFilePath -Force

$zipSize = "{0:N2} MB" -f ((Get-Item $zipFilePath).Length / 1MB)
Write-Host "Backup finalized: $zipFilePath ($zipSize)" -ForegroundColor Green

# Retention cleanup (purge older than retention period)
Write-Host "Purging backups older than $RetentionDays days..." -ForegroundColor Gray
$cutoff = (Get-Date).AddDays(-$RetentionDays)
$purged = 0

Get-ChildItem -Path $BackupDir -Filter "ims_backup_*" | Where-Object {
    $_.LastWriteTime -lt $cutoff
} | ForEach-Object {
    Write-Host "  Removing expired archive: $($_.Name)" -ForegroundColor DarkGray
    Remove-Item $_.FullName -Force
    $purged++
}

Write-Host "Backup process completed successfully. (Purged: $purged expired)" -ForegroundColor Cyan
Write-Host "════════════════════════════════════════════════════════════" -ForegroundColor Cyan
