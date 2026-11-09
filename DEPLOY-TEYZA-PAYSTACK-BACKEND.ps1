param(
  [switch]$Deploy
)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

# A two-stage rollout. Default runs PRE-FLIGHT ONLY; -Deploy changes the
# existing Firebase Cloud Function but cannot activate Paystack checkout.
# Static /pay, Hosting, admin, other Firebase functions, and Firestore records
# are never deployed/mutated by this script.
$project = 'business-lift-3c19c'
$planCode = 'PLN_ud5m0sza4kmr31f'
$healthUrl = 'https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile'
$envFile = '.\services\teyza-mobile-v39\.env.business-lift-3c19c'
$firebaseCli = '.\tools\app-first-release\node_modules\firebase-tools\lib\bin\firebase.js'

if (-not (Test-Path $firebaseCli -PathType Leaf)) {
  throw 'Install Firebase CLI: npm ci --prefix .\tools\app-first-release. Nothing deployed.'
}
if (-not (Test-Path $envFile -PathType Leaf)) {
  throw 'Missing local backend .env. Create only TEYZA_PAYSTACK_MONTHLY_PLAN_CODE=PLN_ud5m0sza4kmr31f and TEYZA_SELLER_PAYSTACK_ENABLED=false in the Teyza service .env first. Do not put any secret API key in .env.'
}
$values = Get-Content $envFile
$planMatches = @($values | Where-Object { $_ -ceq ('TEYZA_PAYSTACK_MONTHLY_PLAN_CODE=' + $planCode) })
if ($planMatches.Count -ne 1) {
  throw 'R99 production plan configuration is absent or mismatched. No resources changed.'
}
if (@($values | Where-Object { $_ -match '^TEYZA_SELLER_PAYSTACK_ENABLED\s*=\s*true\s*$' }).Count -gt 0) {
  throw 'Checkout flag is enabled! Refusing staged migration. Set TEYZA_SELLER_PAYSTACK_ENABLED=false before any deployment.'
}
$branch = (& git branch --show-current | Out-String).Trim()
if ($branch -ne 'fix/teyza-paystack-backend-migration-safe-20261109') {
  throw ('Expected reviewed backend branch, found ' + $branch + '. No deployment.')
}
& git diff --quiet
if ($LASTEXITCODE -ne 0) { throw 'Tracked files have changes. Deploy only from the exact reviewed commit.' }
& git diff --cached --quiet
if ($LASTEXITCODE -ne 0) { throw 'Staged changes are present. Deploy only from the exact reviewed commit.' }

Write-Host 'Checking existing Firebase secret metadata (never printing credentials)...'
foreach ($name in @('TEYZA_PAYSTACK_SECRET_KEY','TEYZA_PAYSTACK_WEBHOOK_SIGNING_SECRET',
    'TEYZA_VERIFICATION_ENCRYPTION_KEY','TEYZA_GOOGLE_PLACES_KEY')) {
  & node $firebaseCli functions:secrets:get $name --project $project *> $null
  if ($LASTEXITCODE -ne 0) {
    throw ('Firebase secret ' + $name + ' is not configured. Complete Paystack webhook signing-secret setup first. No resources changed.')
  }
}
Write-Host 'Verifying the existing Paystack plan in live mode, without displaying secrets...'
$key = $null
try {
  $key = (& node $firebaseCli functions:secrets:access TEYZA_PAYSTACK_SECRET_KEY --project $project 2>$null | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $key.StartsWith('sk_live_')) {
    throw 'Live Paystack merchant credentials were unavailable.'
  }
  $result = Invoke-RestMethod -Method Get -Uri ('https://api.paystack.co/plan/' + $planCode) -Headers @{ Authorization = ('Bearer ' + $key) } -TimeoutSec 30
  $plan = $result.data
  if ($result.status -ne $true -or $plan.plan_code -ne $planCode -or
      $plan.domain -ne 'live' -or $plan.amount -ne 9900 -or
      $plan.currency -ne 'ZAR' -or $plan.interval -ne 'monthly' -or
      ($null -ne $plan.invoice_limit -and $plan.invoice_limit -ne 0)) {
    throw 'Paystack live merchant plan mismatch.'
  }
} finally { $key = $null; Remove-Variable key -ErrorAction SilentlyContinue }
Write-Host 'Verified plan: R99.00, ZAR, monthly, live.'

Write-Host 'Installing and running all Teyza backend regression tests...'
npm ci --prefix '.\services\teyza-mobile-v39' --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Backend npm install failed. No deployment.' }
npm test --prefix '.\services\teyza-mobile-v39'
if ($LASTEXITCODE -ne 0) { throw 'Backend tests failed. No deployment.' }

$old = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 30
if ($old.ok -ne $true -or $old.sellerPaystackNewCheckoutDisabled -ne $true) {
  throw 'Current production backend is not safely disabled. Investigate before deploying.'
}
Write-Host ('Current production version: ' + $old.version)
Write-Host 'Safety preflight passed. Checkout remains DISABLED.'
if (-not $Deploy) {
  Write-Host 'PRE-FLIGHT ONLY. No Firebase resources were changed.'
  Write-Host 'Use -Deploy only after independent PR review and a configured Paystack signing secret.'
  return
}

Write-Host 'Deploying ONLY the teyzaMobile Firebase Cloud Function...'
& node $firebaseCli deploy --project $project --config '.\firebase.teyza-mobile-v39.json' --only 'functions:teyza-mobile:teyzaMobile'
if ($LASTEXITCODE -ne 0) { throw 'Firebase function deployment failed. Do not enable checkout.' }

$new = Invoke-RestMethod -Uri $healthUrl -TimeoutSec 30
if ($new.ok -ne $true -or $new.version -ne '3.25.0' -or
    $new.introductoryFirstMonthCents -ne 1000 -or
    $new.subscriptionMonthlyCents -ne 9900 -or
    $new.sellerPaystackNewCheckoutDisabled -ne $true -or
    $new.paystackCheckoutAvailable -ne $false -or
    $new.sellerMembershipBillingMode -ne 'checkout_disabled' -or
    $new.billingMode -ne 'paystack_checkout' -or
    $new.historicSellerMandatesReadOnly -ne $true -or
    $new.sellerMandateRequestV3 -ne $false -or
    $new.adminNetcashManualSubmission -ne $false -or
    $new.paystackModernWebhookSignatureVerification -ne $true) {
  throw 'Unexpected live backend health after deployment. Keep checkout disabled and investigate immediately.'
}
try {
  Invoke-WebRequest -Method Get -Uri ($healthUrl+'/paystack-webhook') -UseBasicParsing -TimeoutSec 20 -ErrorAction Stop | Out-Null
  throw 'Webhook GET was unexpectedly accepted.'
} catch {
  if (-not $_.Exception.Response -or [int]$_.Exception.Response.StatusCode -ne 405) {
    throw 'Webhook did not return the required HTTP 405 on GET. Investigate before any live payment activation.'
  }
}
Write-Host 'SAFE BACKEND MIGRATION COMPLETE: R10 intro / R99 monthly; no Netcash collection; signed webhooks; checkout DISABLED.'
Write-Host 'Static https://teyza.co.za/pay and admin Hosting were not changed.'
