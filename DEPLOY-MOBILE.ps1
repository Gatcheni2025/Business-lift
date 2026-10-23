$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
npm ci --prefix .\services\teyza-mobile-v39 --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
npm test --prefix .\services\teyza-mobile-v39
if ($LASTEXITCODE -ne 0) { throw 'Service tests failed.' }
firebase deploy --config .\firebase.teyza-mobile-v39.json --only functions:teyza-mobile --project business-lift-3c19c
if ($LASTEXITCODE -ne 0) { throw 'Mobile service deployment failed.' }
Write-Host 'Check https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile for version 3.9.0.'
