$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$major = [int]((node -p "process.versions.node.split('.')[0]") | Select-Object -Last 1)
if ($major -lt 22) { throw 'Install Node.js 22 or newer before deploying Teyza website links.' }
if (-not (Test-Path -LiteralPath '.\web\app-first\public\download.html') -or
    -not (Test-Path -LiteralPath '.\tools\app-first-release\store-links-patch.cjs')) {
  throw 'Run from the current Teyza R320 repository containing the reviewed store links.'
}
npm ci --omit=dev --ignore-scripts --no-audit --no-fund --prefix .\tools\app-first-release
if ($LASTEXITCODE -ne 0) { throw 'Scoped website deployment dependencies failed to install.' }
node .\tools\app-first-release\store-links-patch.cjs deploy
if ($LASTEXITCODE -ne 0) { throw 'Store website publishing was blocked. No unrelated Hosting files should change.' }
