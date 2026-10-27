$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if ([int]((node -p "process.versions.node.split('.')[0]") | Select-Object -Last 1) -lt 22) { throw 'Install Node.js 22 or newer.' }
npm ci --omit=dev --ignore-scripts --no-audit --no-fund --prefix .\tools\admin-release
if ($LASTEXITCODE -ne 0) { throw 'Admin deployment tools could not be installed.' }
npm ci --no-audit --no-fund --prefix .\services\teyza-mobile-v39
if ($LASTEXITCODE -ne 0) { throw 'Backend dependencies could not be installed.' }
npm test --prefix .\services\teyza-mobile-v39
if ($LASTEXITCODE -ne 0) { throw 'Backend tests failed; nothing has been deployed.' }
node .\tools\admin-release\node_modules\firebase-tools\lib\bin\firebase.js deploy --config .\firebase.teyza-mobile-v39.json --only functions:teyza-mobile:teyzaMobile --project business-lift-3c19c
if ($LASTEXITCODE -ne 0) { throw 'Operations backend deployment failed; admin website was not changed.' }
$health = Invoke-RestMethod -Uri 'https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile' -TimeoutSec 30
if ($health.adminOperations -ne $true -or $health.subscriptionMonthlyCents -ne 9900) { throw 'Operations backend capability check failed.' }
node .\tools\admin-release\run.cjs deploy
if ($LASTEXITCODE -ne 0) { throw 'Admin publication stopped; read the message above.' }
Write-Host 'Open https://teyza.co.za/admin and use your authorised administrator account.'
