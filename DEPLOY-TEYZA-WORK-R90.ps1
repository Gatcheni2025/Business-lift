$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$project = 'business-lift-3c19c'
$envFile = Join-Path $PSScriptRoot 'services/teyza-mobile-v39/.env.business-lift-3c19c'

if (-not (Test-Path -LiteralPath $envFile)) {
    throw 'STOP: Restore your existing verified production .env.business-lift-3c19c before deploying. Do not replace payment settings.'
}
$envText = Get-Content -LiteralPath $envFile -Raw
$planMatch = [regex]::Match($envText, '(?m)^TEYZA_PAYSTACK_MONTHLY_PLAN_CODE=(PLN_[A-Za-z0-9]+)\s*$')
if (-not $planMatch.Success) {
    throw 'STOP: The existing production R99 monthly Paystack plan configuration is missing.'
}
$planCode = $planMatch.Groups[1].Value

foreach ($secret in @(
    'TEYZA_GOOGLE_PLACES_KEY',
    'TEYZA_PAYSTACK_SECRET_KEY',
    'TEYZA_PAYSTACK_WEBHOOK_SIGNING_SECRET',
    'TEYZA_VERIFICATION_ENCRYPTION_KEY'
)) {
    & firebase functions:secrets:get $secret --project $project | Out-Null
    if ($LASTEXITCODE -ne 0) { throw ('Required Firebase secret is unavailable: ' + $secret) }
}

$paymentSecret = $null
try {
    $paymentSecret = (& firebase functions:secrets:access TEYZA_PAYSTACK_SECRET_KEY --project $project 2>$null | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or -not $paymentSecret.StartsWith('sk_live_')) {
        throw 'Production Paystack secret is unavailable or is a test key. No deployment occurred.'
    }
    $planResponse = Invoke-RestMethod -Uri ('https://api.paystack.co/plan/' + $planCode) -Headers @{Authorization = 'Bearer ' + $paymentSecret} -TimeoutSec 30
    if ($planResponse.status -ne $true -or
        $planResponse.data.plan_code -ne $planCode -or
        $planResponse.data.amount -ne 9900 -or
        $planResponse.data.currency -ne 'ZAR' -or
        $planResponse.data.interval -ne 'monthly') {
        throw 'The configured production Paystack plan is not the approved R99 ZAR monthly plan.'
    }
}
finally { $paymentSecret = $null }

$healthUri = 'https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile'
$before = Invoke-RestMethod -Uri $healthUri -TimeoutSec 30
if ($before.ok -ne $true -or $before.fieldAgentWorkspace -ne $true) {
    throw 'Live Teyza field backend health is not ready.'
}

npm ci --prefix .\services\teyza-mobile-v39 --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Backend dependency installation failed.' }
npm test --prefix .\services\teyza-mobile-v39
if ($LASTEXITCODE -ne 0) { throw 'Backend tests failed. No deployment occurred.' }

npm ci --prefix .\tools\app-first-release --ignore-scripts --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Work publisher dependency installation failed.' }
npm test --prefix .\tools\app-first-release
if ($LASTEXITCODE -ne 0) { throw 'Work and scoped publishing tests failed. No deployment occurred.' }

Write-Host 'Deploying the existing teyzaMobile HTTPS function only. Other functions and Hosting are not targeted.'
& firebase deploy --config .\firebase.teyza-mobile-v39.json --only 'functions:teyza-mobile:teyzaMobile' --project $project
if ($LASTEXITCODE -ne 0) { throw 'Targeted backend deployment failed. Work Hosting was not published.' }

$after = Invoke-RestMethod -Uri $healthUri -TimeoutSec 30
if ($after.ok -ne $true -or $after.agentRewardReviewEnabled -ne $true -or
    $after.agentRewardCents -ne 9000 -or $after.agentCommissionEnabled -ne $false) {
    throw 'Backend does not report verified R90 rewards review. Work publication blocked.'
}
foreach ($property in @(
    'billingMode',
    'subscriptionMonthlyCents',
    'sellerPaystackNewCheckoutDisabled',
    'membershipProrationEnabled',
    'paystackRolloutMode',
    'shopperAdsWebPaystackEnabled',
    'paystackCheckoutAvailable'
)) {
    if ([string]$before.$property -ne [string]$after.$property) {
        throw ('STOP: live payment configuration changed unexpectedly: ' + $property +
            '. Work publication blocked. Investigate the backend release.')
    }
}

Write-Host 'R90 backend confirmed; payment health unchanged. Publishing only the Teyza Work UI.'
node .\tools\app-first-release\publish-work-only.cjs deploy
if ($LASTEXITCODE -ne 0) {
    throw 'Work publication failed. Backend is deployed, but Work Hosting remains unchanged.'
}
Write-Host 'Teyza Work published. Verify approved-agent login, map, directions and an Admin-approved pilot reward.'
