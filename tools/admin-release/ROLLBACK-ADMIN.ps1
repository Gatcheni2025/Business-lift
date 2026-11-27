$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Test-Path .\hosting-backup-R316.json)) { throw 'Run from the same extracted kit used for publication; its hosting-backup-R316.json is required.' }
npm ci --omit=dev --ignore-scripts --no-audit --no-fund --prefix .\tools\admin-release
if ($LASTEXITCODE -ne 0) { throw 'Admin helper dependency installation failed.' }
node .\tools\admin-release\run.cjs rollback
if ($LASTEXITCODE -ne 0) { throw 'Rollback stopped. Read the message above.' }
