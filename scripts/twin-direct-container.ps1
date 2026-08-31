<#
.SYNOPSIS
  Starts a throwaway Factory Twin container for direct-mode scene verification.

.DESCRIPTION
  The production twin publishes no host port on purpose: its only access
  control is the proxy's auth_request gate against Grafana's session. A direct
  run needs a reachable port, and the safe way to get one is a container bound
  to loopback that is removed when the run finishes.

  Never publish these on 0.0.0.0. That reaches past the auth gate, and the
  default mount is the real private/ directory.

.EXAMPLE
  .\scripts\twin-direct-container.ps1 up
  .\scripts\twin-direct-container.ps1 up -NoGeo
  .\scripts\twin-direct-container.ps1 down
#>
[CmdletBinding()]
param(
    [ValidateSet('up', 'down')]
    [string]$Action = 'up',
    [switch]$NoGeo
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$image = 'ims-factory-twin-3d'
$label = 'ims.role=scratch-test'

function Remove-ScratchTwins {
    # By label, so a container renamed or started by an older version of this
    # script is still found rather than silently left running.
    $ids = docker ps -aq --filter "label=$label"
    if ($ids) { docker rm -f $ids | Out-Null }
    foreach ($n in @('ims-twin-verify', 'ims-twin-nogeo')) {
        docker rm -f $n 2>$null | Out-Null
    }
    Write-Output 'scratch twin containers removed'
}

if ($Action -eq 'down') { Remove-ScratchTwins; return }

if ($NoGeo) {
    $name = 'ims-twin-nogeo'
    $port = 4198
    # Deliberately empty: proves the no-geometry path.
    $mount = Join-Path ([System.IO.Path]::GetTempPath()) ("twin-nogeo-" + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $mount -Force | Out-Null
}
else {
    $name = 'ims-twin-verify'
    $port = 4199
    $mount = Join-Path $root 'services\factory-twin-3d\private'
}

# Rebuild first. A stale image has twice produced a false regression failure
# that looked like a product defect.
docker build -q -t $image (Join-Path $root 'services\factory-twin-3d') | Out-Null
docker rm -f $name 2>$null | Out-Null
docker run -d --rm --name $name --label $label `
    --network ims_ims-internal `
    -p "127.0.0.1:${port}:4100" `
    -v "${mount}:/app/private:ro" `
    $image | Out-Null

Write-Output "$name listening on http://127.0.0.1:$port/ (loopback only, NO auth gate)"
Write-Output "TWIN_DIRECT_URL=http://127.0.0.1:$port/ node tests/playwright/factory-twin-regression.js"
