$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
npm ci --prefix .\services\teyza-mobile-v39 --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
npm test --prefix .\services\teyza-mobile-v39
if ($LASTEXITCODE -ne 0) { throw 'Service tests failed.' }
firebase deploy --config .\firebase.teyza-mobile-v39.json --only functions:teyza-mobile --project business-lift-3c19c
if ($LASTEXITCODE -ne 0) { throw 'Mobile service deployment failed.' }
$health = Invoke-RestMethod -Uri 'https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile' -TimeoutSec 30
if ($health.ok -ne $true -or $health.version -ne '3.13.0' -or $health.sellerOnboarding -ne $true -or $health.catalogueProducts -ne 184) {
  throw 'Deployment returned unexpected service health. Do not distribute the app as connected.'
}
Write-Host 'Teyza mobile 3.13.0 is responding with seller onboarding and 184 catalogue products.'
