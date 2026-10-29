$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
firebase functions:secrets:get TEYZA_GOOGLE_PLACES_KEY --project business-lift-3c19c | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'The existing Google Places server key is not available. Check TEYZA_GOOGLE_PLACES_KEY in this Firebase project before deploying. Keep the existing verification encryption key.' }
npm ci --prefix .\services\teyza-mobile-v39 --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
npm test --prefix .\services\teyza-mobile-v39
if ($LASTEXITCODE -ne 0) { throw 'Service tests failed.' }
firebase deploy --config .\firebase.teyza-mobile-v39.json --only functions:teyza-mobile --project business-lift-3c19c
if ($LASTEXITCODE -ne 0) { throw 'Mobile service deployment failed.' }
$health = Invoke-RestMethod -Uri 'https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile' -TimeoutSec 30
$catalogue = Get-Content -LiteralPath '.\services\teyza-mobile-v39\catalogue.json' -Raw | ConvertFrom-Json
$expectedProducts = @($catalogue.products).Count
$expectedPhotos = @($catalogue.photos.PSObject.Properties).Count
if ($health.ok -ne $true -or $health.version -ne '3.15.0' -or $health.sellerOnboarding -ne $true -or
    $health.catalogueProducts -ne $expectedProducts -or $health.catalogueRevision -ne $catalogue.version -or $health.cataloguePhotos -ne $expectedPhotos) {
  throw 'Deployment returned unexpected service health. Do not distribute the app as connected.'
}
if ($health.verificationUploads -ne $true) { throw ('Photo storage is not ready (' + $health.uploadStatus + '). Open Firebase Storage for business-lift-3c19c, choose Get started, US-CENTRAL1 and production mode, then retry. Keep the existing encryption key.') }
if ($health.shopFrontPhotos -ne $true) { throw 'Shop-front photo service was not activated.' }
if ($health.approvalRequired -ne $true -or $health.shopLocations -ne $true -or $health.addressAutocomplete -ne $true -or
    $health.shopServices -ne $true -or $health.orderQuotes -ne $true -or $health.orderInboxAlways -ne $true) { throw 'The current approval, shop-service, order quote and order inbox features were not activated. Deploy this latest kit before building version 1.0.22.' }
Write-Host "Teyza is responding with approval-required publication, full-address autocomplete, shop locations, $expectedProducts catalogue products and $expectedPhotos reference photos."
