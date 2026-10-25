param([Parameter(Mandatory=$true)][string]$Uid, [switch]$Revoke)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if ($Uid -notmatch '^[A-Za-z0-9_-]{1,128}$') { throw 'Use the administrator User UID from Firebase Authentication.' }
npm ci --omit=dev --ignore-scripts --no-audit --no-fund --prefix .\tools\admin-release
if ($LASTEXITCODE -ne 0) { throw 'Admin helper dependency installation failed.' }
$action = 'grant'
if ($Revoke) { $action = 'revoke' }
node .\tools\admin-release\run.cjs $action $Uid
if ($LASTEXITCODE -ne 0) { throw 'Reviewer access setup stopped. Read the message above.' }
