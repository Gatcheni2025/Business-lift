$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if ([int]((node -p "process.versions.node.split('.')[0]") | Select-Object -Last 1) -lt 22) { throw 'Install Node.js 22 or newer, then retry.' }
npm ci --omit=dev --ignore-scripts --no-audit --no-fund --prefix .\tools\app-first-release
if ($LASTEXITCODE -ne 0) { throw 'Website helper dependency installation failed.' }
node .\tools\app-first-release\run.cjs rollback
if ($LASTEXITCODE -ne 0) { throw 'Website update stopped. Read the message above. Do not deploy this partial public folder with firebase deploy.' }
