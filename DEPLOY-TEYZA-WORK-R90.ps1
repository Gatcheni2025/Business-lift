$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$project = 'business-lift-3c19c'
$envFile = Join-Path $PSScriptRoot 'services/teyza-mobile-v39/.env.business-lift-3c19c'
if (-not (Test-Path -LiteralPath $envFile)) {
    throw 'STOP: restore the existing verified production .env.business-lift-3c19c before deploying. Do not replace payment settings.'
}
$envText = Get-Content -LiteralPath $envFile -Raw
if ($envText -notmatch '(?m)^TEYZA_PAYSTACK_MONTHLY_PLAN_CODE=PLN_[A-Za-z0-9]+\s*$') {
    throw 'STOP: the existing live Paystack monthly plan configuration is missing.'
}
$plan = [regex]::Match($envText, '(?m)^TEYZA_PAYSTACK_MONTHLY_PLAN_CODE=(PLN_[A-Za-z0-9]+)\s*
    & firebase functions:secrets:get $secret --project $project | Out-Null
    if ($LASTEXITCODE -ne 0) { throw ('Required Firebase secret is unavailable: ' + $secret) }
}
$healthUri = 'https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile'
$before = Invoke-RestMethod -Uri $healthUri -TimeoutSec 30
if ($before.ok -ne $true -or $before.fieldAgentWorkspace -ne $true) { throw 'Live Teyza backend health is not ready.' }
npm ci --prefix .\services\teyza-mobile-v39 --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Backend dependency installation failed.' }
npm test --prefix .\services\teyza-mobile-v39
if ($LASTEXITCODE -ne 0) { throw 'Backend tests failed. No deployment occurred.' }
npm ci --prefix .\tools\app-first-release --ignore-scripts --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Scoped Work publisher dependency installation failed.' }
npm test --prefix .\tools\app-first-release
if ($LASTEXITCODE -ne 0) { throw 'Website and scoped publishing tests failed. No deployment occurred.' }

Write-Host 'Deploying only the existing teyzaMobile HTTPS function, not all functions or Hosting.'
& firebase deploy --config .\firebase.teyza-mobile-v39.json --only functions:teyzaMobile --project $project
if ($LASTEXITCODE -ne 0) { throw 'Targeted field backend deployment failed; Work Hosting was not published.' }
$after = Invoke-RestMethod -Uri $healthUri -TimeoutSec 30
if ($after.ok -ne $true -or $after.agentRewardReviewEnabled -ne $true -or $after.agentRewardCents -ne 9000 -or $after.agentCommissionEnabled -ne $false) {
    throw 'Backend does not report verified R90 reward review. Work publication blocked.'
}
foreach ($property in @('billingMode','subscriptionMonthlyCents','sellerPaystackNewCheckoutDisabled','membershipProrationEnabled','paystackRolloutMode','shopperAdsWebPaystackEnabled','paystackCheckoutAvailable')) {
    if ([string]$before.$property -ne [string]$after.$property) {
        throw ('STOP: live payment configuration changed unexpectedly: ' + $property + '. Work Hosting publication blocked; investigate the backend release.')
    }
}
Write-Host 'Verified R90 backend and unchanged payment health. Publishing only authenticated Work assets.'
node .\tools\app-first-release\publish-work-only.cjs deploy
if ($LASTEXITCODE -ne 0) { throw 'Scoped Work publication failed. Backend is deployed but Work Hosting is unchanged.' }
Write-Host 'Teyza Work release published. Test approved-agent login, Google Maps, directions, seller approval and R90 admin verification.'
).Groups[1].Value
# Fail closed if a different plan or test secret might be deployed to the live seller backend.
$paymentSecret = $null
try {
    $paymentSecret = (& firebase functions:secrets:access TEYZA_PAYSTACK_SECRET_KEY --project $project 2>$null | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $paymentSecret.StartsWith('sk_live_')) {
        throw 'Live production Paystack key not available; nothing deployed.'
    }
    $planStatus = Invoke-RestMethod -Uri ('https://api.paystack.co/plan/' + $plan) -Headers @{Authorization = 'Bearer ' + $paymentSecret} -TimeoutSec 30
    if ($planStatus.status -ne $true -or $planStatus.data.plan_code -ne $plan -or
        $planStatus.data.amount -ne 9900 -or $planStatus.data.currency -ne 'ZAR' -or
        $planStatus.data.interval -ne 'monthly') {
        throw 'The configured Paystack plan does not match the approved R99 ZAR monthly plan.'
    }
}
finally { $paymentSecret = $null }
foreach ($secret in @('TEYZA_GOOGLE_PLACES_KEY','TEYZA_PAYSTACK_SECRET_KEY','TEYZA_PAYSTACK_WEBHOOK_SIGNING_SECRET','TEYZA_VERIFICATION_ENCRYPTION_KEY')) {
    & firebase functions:secrets:get $secret --project $project | Out-Null
    if ($LASTEXITCODE -ne 0) { throw ('Required Firebase secret is unavailable: ' + $secret) }
}
$healthUri = 'https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile'
$before = Invoke-RestMethod -Uri $healthUri -TimeoutSec 30
if ($before.ok -ne $true -or $before.fieldAgentWorkspace -ne $true) { throw 'Live Teyza backend health is not ready.' }
npm ci --prefix .\services\teyza-mobile-v39 --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Backend dependency installation failed.' }
npm test --prefix .\services\teyza-mobile-v39
if ($LASTEXITCODE -ne 0) { throw 'Backend tests failed. No deployment occurred.' }
npm test --prefix .\tools\app-first-release
if ($LASTEXITCODE -ne 0) { throw 'Website and scoped publishing tests failed. No deployment occurred.' }

Write-Host 'Deploying only the existing teyzaMobile HTTPS function, not all functions or Hosting.'
& firebase deploy --config .\firebase.teyza-mobile-v39.json --only functions:teyzaMobile --project $project
if ($LASTEXITCODE -ne 0) { throw 'Targeted field backend deployment failed; Work Hosting was not published.' }
$after = Invoke-RestMethod -Uri $healthUri -TimeoutSec 30
if ($after.ok -ne $true -or $after.agentRewardReviewEnabled -ne $true -or $after.agentRewardCents -ne 9000 -or $after.agentCommissionEnabled -ne $false) {
    throw 'Backend does not report verified R90 reward review. Work publication blocked.'
}
foreach ($property in @('billingMode','subscriptionMonthlyCents','sellerPaystackNewCheckoutDisabled','membershipProrationEnabled','paystackRolloutMode','shopperAdsWebPaystackEnabled','paystackCheckoutAvailable')) {
    if ([string]$before.$property -ne [string]$after.$property) {
        throw ('STOP: live payment configuration changed unexpectedly: ' + $property + '. Work Hosting publication blocked; investigate the backend release.')
    }
}
Write-Host 'Verified R90 backend and unchanged payment health. Publishing only authenticated Work assets.'
node .\tools\app-first-release\publish-work-only.cjs deploy
if ($LASTEXITCODE -ne 0) { throw 'Scoped Work publication failed. Backend is deployed but Work Hosting is unchanged.' }
Write-Host 'Teyza Work release published. Test approved-agent login, Google Maps, directions, seller approval and R90 admin verification.'
