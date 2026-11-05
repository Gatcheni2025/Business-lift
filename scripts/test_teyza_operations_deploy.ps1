$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$fixture = Join-Path ([System.IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path (Join-Path $fixture 'services/teyza-mobile-v39') -Force | Out-Null
Copy-Item (Join-Path $root 'DEPLOY-OPERATIONS.ps1') $fixture
$planFile = Join-Path $fixture 'services/teyza-mobile-v39/.env.business-lift-3c19c'
[System.IO.File]::WriteAllText($planFile, "TEYZA_PAYSTACK_MONTHLY_PLAN_CODE=PLN_test12345`n")
$global:operationsCalls = [System.Collections.Generic.List[string]]::new()
$global:operationsScenario = 'ready'
function node {
  $line = $args -join ' '
  $global:operationsCalls.Add($line)
  $global:LASTEXITCODE = 0
  if ($args[0] -eq '-p') { return '22' }
  if ($line -match 'functions:secrets:access') {
    if ($global:operationsScenario -eq 'test-key') { return 'sk_test_FAKE' }
    return 'sk_live_FAKE'
  }
  return
}
function npm { $global:LASTEXITCODE = 0 }
function Invoke-RestMethod { param($Uri,$Headers,$TimeoutSec)
  if ($Uri -like 'https://api.paystack.co/plan/*') {
    $amount = if ($global:operationsScenario -eq 'wrong-plan') { 4900 } else { 9900 }
    return @{status=$true;data=@{plan_code='PLN_test12345';amount=$amount;currency='ZAR';interval='monthly'}}
  }
  if ($global:operationsScenario -eq 'old-health') { return @{ok=$true;version='3.20.0'} }
  return @{ok=$true;version='3.24.0';agentCommissionEnabled=$false;verificationUploads=$true;sellerOnboarding=$true;
    approvalRequired=$true;paystackCheckoutAvailable=$true;adminOperations=$true;adminReview=$true;
    adminProductReview=$false;automaticProductPublication=$true;adminComplimentaryAccess=$true;
    adminPaystackVerify=$true;manualReceiptsRetired=$true;billingMode='paystack_checkout'}
}
function Exercise([string]$Scenario) {
  $global:operationsCalls.Clear(); $global:operationsScenario = $Scenario; $failed = $false
  try { & (Join-Path $fixture 'DEPLOY-OPERATIONS.ps1') } catch { $failed = $true }
  $functionCalls = @($global:operationsCalls | Where-Object { $_ -match 'firebase\.js deploy ' })
  $websiteCalls = @($global:operationsCalls | Where-Object { $_ -match 'run\.cjs deploy' })
  return @{failed=$failed;functions=$functionCalls;website=$websiteCalls}
}
try {
  $result = Exercise 'test-key'
  if (-not $result.failed -or $result.functions.Count -or $result.website.Count) { throw 'Test keys must stop before production changes.' }
  $result = Exercise 'wrong-plan'
  if (-not $result.failed -or $result.functions.Count -or $result.website.Count) { throw 'An incorrect live plan must stop before production changes.' }
  $result = Exercise 'old-health'
  if (-not $result.failed -or $result.functions.Count -ne 1 -or $result.website.Count) { throw 'An old backend must prevent the admin overlay.' }
  $result = Exercise 'ready'
  if ($result.failed -or $result.functions.Count -ne 1 -or $result.website.Count -ne 1) { throw 'Validated scoped deploy did not complete.' }
  $deployment = $result.functions[0]
  foreach ($name in @('teyzaMobile','teyzaCatalogueDraftChanged','teyzaCatalogueShopChanged','teyzaCatalogueApprovalChanged','teyzaSellerBillingChanged')) {
    if ($deployment -notmatch ('functions:teyza-mobile:' + $name)) { throw ('Missing scoped function ' + $name) }
  }
  if ($deployment -match '--only hosting|--only firestore|--force') { throw 'A scoped deploy must not replace unrelated resources.' }
  Remove-Item -LiteralPath $planFile -Force
  $result = Exercise 'ready'
  if (-not $result.failed -or $result.functions.Count -or $result.website.Count) { throw 'Missing environment configuration must stop deployment.' }
  Write-Host 'Operations deploy preflight, scoped functions and admin gate passed with mocked commands.'
} finally {
  Set-Location $root
  Remove-Item $fixture -Recurse -Force
  Remove-Item function:node,function:npm,function:Invoke-RestMethod
}

