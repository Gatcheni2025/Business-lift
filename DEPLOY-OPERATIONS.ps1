$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if ([int]((node -p "process.versions.node.split('.')[0]") | Select-Object -Last 1) -lt 22) { throw 'Install Node.js 22 or newer.' }
$planEnvFile = Join-Path $PSScriptRoot 'services/teyza-mobile-v39/.env.business-lift-3c19c'
if (-not (Test-Path -LiteralPath $planEnvFile)) { throw 'Restore the existing Paystack plan configuration before deploying. No Firebase resources were changed.' }
$planFileText = Get-Content -LiteralPath $planEnvFile -Raw
$planMatch = [regex]::Match($planFileText, '(?m)^TEYZA_PAYSTACK_MONTHLY_PLAN_CODE=(PLN_[A-Za-z0-9]+)\s*$')
if (-not $planMatch.Success) { throw 'The existing R99 Paystack plan code is missing or invalid. No Firebase resources were changed.' }
$planCode = $planMatch.Groups[1].Value
npm ci --omit=dev --ignore-scripts --no-audit --no-fund --prefix .\tools\admin-release
if ($LASTEXITCODE -ne 0) { throw 'Admin deployment tools could not be installed.' }
npm ci --no-audit --no-fund --prefix .\services\teyza-mobile-v39
if ($LASTEXITCODE -ne 0) { throw 'Backend dependencies could not be installed.' }
npm test --prefix .\services\teyza-mobile-v39
if ($LASTEXITCODE -ne 0) { throw 'Backend tests failed; nothing has been deployed.' }
$firebaseCli = '.\tools\admin-release\node_modules\firebase-tools\lib\bin\firebase.js'
foreach ($secret in @('TEYZA_PAYSTACK_SECRET_KEY','TEYZA_VERIFICATION_ENCRYPTION_KEY','TEYZA_GOOGLE_PLACES_KEY')) {
  & node $firebaseCli functions:secrets:get $secret --project business-lift-3c19c *> $null
  if ($LASTEXITCODE -ne 0) { throw ('The existing Firebase secret is unavailable: ' + $secret + '. Nothing was deployed.') }
}
# Only inspect the key mode in memory; never print or save its value.
$paystackSecret = (& node $firebaseCli functions:secrets:access TEYZA_PAYSTACK_SECRET_KEY --project business-lift-3c19c 2>$null | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or -not $paystackSecret.StartsWith('sk_live_')) {
  $paystackSecret = $null
  throw 'The production Paystack secret is unavailable or is a test key. The production backend blocks test payments; no Firebase resources were changed.'
}
try {
  $headers = @{ Authorization = 'Bearer ' + $paystackSecret }
  $plan = Invoke-RestMethod -Uri ('https://api.paystack.co/plan/' + $planCode) -Headers $headers -TimeoutSec 30
  if ($plan.status -ne $true -or $plan.data.plan_code -ne $planCode -or $plan.data.domain -ne 'live' -or $plan.data.amount -ne 9900 -or $plan.data.currency -ne 'ZAR' -or $plan.data.interval -ne 'monthly' -or ($null -ne $plan.data.invoice_limit -and $plan.data.invoice_limit -ne 0)) {
    throw 'The configured plan is not R99 monthly in ZAR.'
  }
} catch {
  throw 'The existing Paystack plan could not be verified as R99 monthly in ZAR using the production key. Nothing was deployed.'
} finally { $headers = $null; $paystackSecret = $null }
$functions = 'functions:teyza-mobile:teyzaMobile,functions:teyza-mobile:teyzaCatalogueDraftChanged,functions:teyza-mobile:teyzaCatalogueShopChanged,functions:teyza-mobile:teyzaCatalogueApprovalChanged,functions:teyza-mobile:teyzaSellerBillingChanged,functions:teyza-mobile:teyzaPaystackCancellationCreated,functions:teyza-mobile:teyzaPaystackCancellationRetry'
& node $firebaseCli deploy --config .\firebase.teyza-mobile-v39.json --only $functions --project business-lift-3c19c
if ($LASTEXITCODE -ne 0) { throw 'Operations backend deployment failed; admin website was not changed.' }
$health = Invoke-RestMethod -Uri 'https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile' -TimeoutSec 30
if ($health.ok -ne $true -or $health.version -ne '3.25.0' -or $health.googlePlaceClaims -ne $true -or $health.sellerApprovalBeforeCheckout -ne $true -or $health.paystackCheckoutLock -ne $true -or $health.paystackRenewalInvoiceVerification -ne $true -or $health.paystackDeletionCancellationSupport -ne $true -or $health.agentCommissionEnabled -ne $false -or $health.verificationUploads -ne $true -or $health.sellerOnboarding -ne $true -or $health.approvalRequired -ne $true -or $health.paystackCheckoutAvailable -ne $true -or $health.adminOperations -ne $true -or $health.adminReview -ne $true -or $health.adminProductReview -ne $false -or $health.automaticProductPublication -ne $true -or $health.adminComplimentaryAccess -ne $true -or $health.adminPaystackVerify -ne $true -or $health.manualReceiptsRetired -ne $true -or $health.billingMode -ne 'paystack_checkout') { throw 'Seller verification, payment safeguards or product backend health check failed; do not publish the updated admin website.' }
node .\tools\admin-release\run.cjs deploy
if ($LASTEXITCODE -ne 0) { throw 'Admin publication stopped; read the message above.' }
Write-Host 'Open https://teyza.co.za/admin and use your authorised administrator account.'
Write-Host 'This scoped operations deployment does not deploy the WhatsApp workers. Configure and deploy them separately using docs/TEYZA_SELLER_CLAIMS_AND_APPROVAL_WHATSAPP.md.'


