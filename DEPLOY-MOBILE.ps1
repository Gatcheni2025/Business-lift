$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
firebase functions:secrets:get TEYZA_GOOGLE_PLACES_KEY --project business-lift-3c19c | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'The existing Google Places server key is not available. Check TEYZA_GOOGLE_PLACES_KEY in this Firebase project before deploying. Keep the existing verification encryption key.' }
firebase functions:secrets:get TEYZA_PAYSTACK_SECRET_KEY --project business-lift-3c19c | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Configure TEYZA_PAYSTACK_SECRET_KEY in Firebase Secret Manager before deploying. Never put the secret in Git or chat.' }
firebase functions:secrets:get TEYZA_WHATSAPP_ACCESS_TOKEN --project business-lift-3c19c | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'The WhatsApp workers require TEYZA_WHATSAPP_ACCESS_TOKEN. Configure the sender and approved template first; see docs/TEYZA_SELLER_CLAIMS_AND_APPROVAL_WHATSAPP.md. Nothing deployed.' }
$planEnvFile = Join-Path $PSScriptRoot 'services/teyza-mobile-v39/.env.business-lift-3c19c'
if (-not (Test-Path -LiteralPath $planEnvFile)) {
  throw 'Restore services/teyza-mobile-v39/.env.business-lift-3c19c with the existing verified ZAR R99 monthly Paystack plan code before deploying. Test keys must not be used in the production project.'
}
$planFileText = Get-Content -LiteralPath $planEnvFile -Raw
$planMatch = [regex]::Match($planFileText, '(?m)^TEYZA_PAYSTACK_MONTHLY_PLAN_CODE=(PLN_[A-Za-z0-9]+)\s*$')
if (-not $planMatch.Success) {
  throw 'The local Paystack plan setting must contain a valid PLN_ identifier. No payment keys belong in the env file.'
}
$planCode = $planMatch.Groups[1].Value
# Confirm the production secret and plan without printing or persisting the key.
$paystackSecret = (& firebase functions:secrets:access TEYZA_PAYSTACK_SECRET_KEY --project business-lift-3c19c 2>$null | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or -not $paystackSecret.StartsWith('sk_live_')) {
  $paystackSecret = $null
  throw 'Production Paystack secret is unavailable or is a test key. Nothing was deployed.'
}
try {
  $headers = @{ Authorization = 'Bearer ' + $paystackSecret }
  $plan = Invoke-RestMethod -Uri ('https://api.paystack.co/plan/' + $planCode) -Headers $headers -TimeoutSec 30
  if ($plan.status -ne $true -or $plan.data.plan_code -ne $planCode -or $plan.data.amount -ne 9900 -or $plan.data.currency -ne 'ZAR' -or $plan.data.interval -ne 'monthly') { throw 'Unexpected plan.' }
} catch {
  throw 'The existing Paystack plan could not be verified as R99 monthly in ZAR. Nothing was deployed.'
} finally { $headers = $null; $paystackSecret = $null }
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
if ($health.ok -ne $true -or $health.version -ne '3.25.0' -or $health.sellerOnboarding -ne $true -or
    $health.catalogueProducts -ne $expectedProducts -or $health.catalogueRevision -ne $catalogue.version -or $health.cataloguePhotos -ne $expectedPhotos) {
  throw 'Deployment returned unexpected service health. Do not distribute the app as connected.'
}
if ($health.verificationUploads -ne $true) { throw ('Photo storage is not ready (' + $health.uploadStatus + '). Open Firebase Storage for business-lift-3c19c, choose Get started, US-CENTRAL1 and production mode, then retry. Keep the existing encryption key.') }
if ($health.agentCommissionEnabled -ne $false) { throw 'Agent commission retirement has not been activated.' }
if ($health.adminUsers -ne $true -or $health.adminSellerDocuments -ne $true -or $health.automaticProductPublication -ne $true -or $health.adminProductReview -ne $false -or $health.adminComplimentaryAccess -ne $true) { throw 'Administrator verification and automatic-product capabilities did not activate.' }
if ($health.shopFrontPhotos -ne $true) { throw 'Shop-front photo service was not activated.' }
if ($health.chatModeration -ne $true -or $health.sevenDayTrial -ne $false -or $health.shopperDeletionProfileClear -ne $true -or $health.appleRevocationServer -ne $true -or $health.onceOnlyShopperIdentity -ne $true -or $health.twoWayChatNotifications -ne $true -or $health.wholesaleConnections -ne $true -or $health.strictSevenDayMembership -ne $false) { throw 'New Apple review requirements are not active in Firebase yet.' }
if ($health.accountDeletion -ne $true -or $health.accountDeletionAuthLock -ne $true -or $health.deletedUserReregister -ne $true -or $health.shopperSavedAddresses -ne $true -or $health.approvedFreeDiscovery -ne $true -or $health.freeSellerPlans -ne $true -or $health.paidAreaVisibility -ne $true -or $health.wholesaleSourcing -ne $true -or $health.protectedWholesalePrices -ne $true) { throw 'Updated deletion, Free/Basic plans and paid discovery are not active. Keep the app out of release.' }
if ($health.approvalRequired -ne $true -or $health.shopLocations -ne $true -or $health.addressAutocomplete -ne $true -or
    $health.shopServices -ne $true -or $health.orderQuotes -ne $true -or $health.orderInboxAlways -ne $true) { throw 'The current approval, shop-service, order quote and order inbox features were not activated. Deploy this latest kit before building the current app release.' }
if ($health.billingMode -ne 'paystack_checkout' -or $health.paystackCheckoutAvailable -ne $true -or
    $health.subscriptionMonthlyCents -ne 9900 -or $health.introductoryFirstMonthCents -ne 4900 -or
    $health.promotionSevenDaysCents -ne 2900) {
  throw 'Paystack configuration is not ready. Verify the existing production secret, R99 plan and R49/R29 prices. Never use a test key on the production project.'
}
Write-Host "Teyza is responding with approval-required publication, full-address autocomplete, shop locations, $expectedProducts catalogue products and $expectedPhotos reference photos."


