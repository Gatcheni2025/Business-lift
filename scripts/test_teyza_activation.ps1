$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$fixture = Join-Path ([System.IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path (Join-Path $fixture 'services/teyza-mobile-v39') -Force | Out-Null
Copy-Item (Join-Path $root 'services/teyza-mobile-v39/catalogue.json') (Join-Path $fixture 'services/teyza-mobile-v39/catalogue.json')
# Synthetic PLN code is only for a mocked plan gate; no real Paystack credentials are used.
[System.IO.File]::WriteAllText((Join-Path $fixture 'services/teyza-mobile-v39/.env.business-lift-3c19c'),"TEYZA_PAYSTACK_MONTHLY_PLAN_CODE=PLN_test12345`n")
$global:calls = [System.Collections.Generic.List[string]]::new()
$global:badHealth = $false
$global:testKeyMode = $false
function firebase {
  $line = $args -join ' '
  $global:calls.Add($line)
  $global:LASTEXITCODE = 0
  if ($line.StartsWith('apps:list android')) { return '{"status":"success","result":[{"packageName":"com.asiyedriver.asiye","appId":"1:983479810697:android:aabb"}]}' }
  if ($line.StartsWith('apps:list ios')) { return '{"status":"success","result":[{"bundleId":"za.co.teyza.shopper","appId":"1:983479810697:ios:ccdd"}]}' }
  if ($line.StartsWith('functions:secrets:get')) { return 'Secret metadata exists' }
  if ($line.StartsWith('functions:secrets:access')) { if ($global:testKeyMode) { return 'sk_test_FAKE' }; return 'sk_live_FAKE' }
  if ($line.StartsWith('deploy')) { return 'Mock deployment only' }
  return '{"status":"success","result":{}}'
}
function npm { $global:LASTEXITCODE = 0 }
function Invoke-RestMethod { param($Uri,$Headers,$TimeoutSec)
  if ($Uri -like 'https://api.paystack.co/plan/*') { return @{status=$true;data=@{plan_code='PLN_test12345';amount=9900;currency='ZAR';interval='monthly'}} }
  if ($global:badHealth) { return @{ok=$true;version='3.12.0'} };return @{ok=$true;version='3.25.0';agentCommissionEnabled=$false;verificationUploads=$true;shopFrontPhotos=$true;approvalRequired=$true;shopLocations=$true;addressAutocomplete=$true;sellerOnboarding=$true;catalogueProducts=378;catalogueRevision=2;cataloguePhotos=96;shopServices=$true;orderQuotes=$true;orderInboxAlways=$true;accountDeletion=$true;accountDeletionAuthLock=$true;deletedUserReregister=$true;shopperSavedAddresses=$true;approvedFreeDiscovery=$true;freeSellerPlans=$true;paidAreaVisibility=$true;wholesaleSourcing=$true;protectedWholesalePrices=$true;chatModeration=$true;sevenDayTrial=$false;shopperDeletionProfileClear=$true;appleRevocationServer=$true;onceOnlyShopperIdentity=$true;twoWayChatNotifications=$true;wholesaleConnections=$true;strictSevenDayMembership=$false;adminUsers=$true;adminSellerDocuments=$true;automaticProductPublication=$true;adminProductReview=$false;adminComplimentaryAccess=$true;billingMode='paystack_checkout';paystackCheckoutAvailable=$true;subscriptionMonthlyCents=9900;introductoryFirstMonthCents=4900;promotionSevenDaysCents=2900} }
try {
  foreach ($name in @('ACTIVATE-TEYZA.ps1','DEPLOY-MOBILE.ps1','SETUP-VERIFICATION-KEY.ps1')) {
    $errors = $null
    $null = [System.Management.Automation.Language.Parser]::ParseFile((Join-Path $root $name),[ref]$null,[ref]$errors)
    if ($errors.Count -gt 0) { throw ($errors | Out-String) }
    Copy-Item (Join-Path $root $name) $fixture
  }
  & (Join-Path $fixture 'ACTIVATE-TEYZA.ps1') -AndroidSha1 ('A' * 40) -AndroidSha256 ('B' * 64)
  $config = Get-Content (Join-Path $fixture 'services/teyza-mobile-v39/native-config.json') -Raw | ConvertFrom-Json
  if ($config.androidAppId -ne '1:983479810697:android:aabb' -or $config.iosUrlScheme -ne 'app-1-983479810697-ios-ccdd') { throw 'Native app selection failed.' }
  if ($global:calls | Where-Object { $_ -match 'apps:create|secrets:set|--only hosting|--only firestore' }) { throw 'Existing apps, key or unrelated deployment changed.' }
  if (-not ($global:calls | Where-Object { $_ -match '^deploy .*--only functions:teyza-mobile --project business-lift-3c19c' })) { throw 'Scoped service was not deployed.' }
  $beforeTest = @($global:calls | Where-Object { $_ -match '^deploy ' }).Count
  $global:testKeyMode = $true; $failed = $false
  try { & (Join-Path $fixture 'DEPLOY-MOBILE.ps1') } catch { $failed = $true }
  if (-not $failed -or @($global:calls | Where-Object { $_ -match '^deploy ' }).Count -ne $beforeTest) { throw 'A production deploy accepted a test key.' }
  $global:testKeyMode = $false
  $global:badHealth = $true
  $failed = $false
  try { & (Join-Path $fixture 'DEPLOY-MOBILE.ps1') } catch { $failed = $true }
  if (-not $failed) { throw 'Old backend health incorrectly passed.' }
  Write-Host 'Activation helper: native identity, key preservation, certificate registration, scoped deploy and health gate passed with mocked commands.'
} finally {
  Set-Location $root
  Remove-Item $fixture -Recurse -Force
  Remove-Item function:firebase,function:npm,function:Invoke-RestMethod
}


