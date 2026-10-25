$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if ([int]((node -p "process.versions.node.split('.')[0]") | Select-Object -Last 1) -lt 22) { throw 'Install Node.js 22 or newer, then retry.' }
npm ci --omit=dev --ignore-scripts --no-audit --no-fund --prefix .\tools\admin-release
if ($LASTEXITCODE -ne 0) { throw 'Admin helper dependency installation failed.' }
node .\tools\admin-release\run.cjs deploy
if ($LASTEXITCODE -ne 0) { throw 'Admin publication stopped. Read the message above. Do not deploy this partial public folder with firebase deploy.' }
Write-Host 'Open https://teyza.co.za/admin and sign in with your authorised reviewer account.'
