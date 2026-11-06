param(
  [switch]$RequireUpdatedBackend,
  [switch]$RunLocalTests
)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
Set-Location -LiteralPath $root
$project = 'business-lift-3c19c'

function Assert-Exists([string]$relative) {
  $file = Join-Path $root ($relative.Replace('/',[IO.Path]::DirectorySeparatorChar))
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
    throw "Missing required pilot file: $relative. Nothing was deployed."
  }
}

Write-Host 'Teyza website seller pilot: READ-ONLY preflight' -ForegroundColor Cyan
Write-Host "Firebase project: $project"

foreach ($file in @(
  'DEPLOY-OPERATIONS.ps1',
  'DEPLOY-WEBSITE.ps1',
  'services/teyza-mobile-v39/index.js',
  'services/teyza-mobile-v39/billing-paystack.js',
  'tools/seller-access/PREPARE-CURRENT-RULES.ps1',
  'tools/seller-access/DEPLOY-SELLER-ACCESS.ps1',
  'tools/admin-release/package-lock.json',
  'tools/app-first-release/package-lock.json',
  'web/teyza-admin/public/admin.html',
  'public/seller-subscriptions.html',
  'public/js/seller-web-billing.mjs',
  'FILE-HASHES.json'
)) { Assert-Exists $file }

$manifest = Get-Content -LiteralPath (Join-Path $root 'FILE-HASHES.json') -Raw | ConvertFrom-Json
$count = 0
foreach ($property in $manifest.PSObject.Properties) {
  Assert-Exists $property.Name
  $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $root ($property.Name.Replace('/',[IO.Path]::DirectorySeparatorChar)))).Hash.ToLowerInvariant()
  if ($actual -ne [string]$property.Value) {
    throw "The pilot package file was modified: $($property.Name). No Firebase resources were changed."
  }
  $count++
}
Write-Host "Package integrity: verified $count files" -ForegroundColor Green

$node = & node -p "process.versions.node.split('.')[0]"
if ($LASTEXITCODE -ne 0 -or [int]$node -lt 22) {
  throw 'Node.js 22 or newer is required. Nothing was deployed.'
}
Write-Host "Node.js: suitable (major version $node)"

$envPath = Join-Path $root 'services/teyza-mobile-v39/.env.business-lift-3c19c'
if (-not (Test-Path -LiteralPath $envPath -PathType Leaf)) {
  Write-Warning 'Private Paystack plan configuration is not present. Restore the verified existing .env file before deployment; do not create a different plan or put a secret in the ZIP.'
} else {
  $text = Get-Content -LiteralPath $envPath -Raw
  if ($text -notmatch '(?m)^TEYZA_PAYSTACK_MONTHLY_PLAN_CODE=PLN_[A-Za-z0-9]+\s*$') {
    throw 'Existing Paystack plan configuration is invalid. Do not deploy.'
  }
  Write-Host 'Local R99 Paystack plan code: format valid (plan not remotely verified).'
}
$rulesPath = Join-Path $root 'tools/seller-access/firestore.seller-approval.candidate.rules'
if (Test-Path -LiteralPath $rulesPath -PathType Leaf) {
  Write-Host 'Seller-access rules candidate exists; recheck published rules and review the current diff before deploying.' -ForegroundColor Yellow
} else {
  Write-Host 'Rules candidate not yet prepared in this kit. Prepare from current published rules after installing the pinned Firebase CLI.' -ForegroundColor Yellow
}
try {
  $live = Invoke-RestMethod -Method Get -Uri 'https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile' -TimeoutSec 30
} catch {
  throw 'Cannot read the live Teyza service health. Stop before deploying.'
}
if ($live.ok -ne $true) { throw 'The live service is not healthy. Stop before deploying.' }
$ready = $live.version -eq '3.25.0' -and $live.sellerApprovalBeforeCheckout -eq $true -and
  $live.approvalRequired -eq $true -and $live.paystackCheckoutAvailable -eq $true -and
  $live.introductoryFirstMonthCents -eq 4900 -and $live.subscriptionMonthlyCents -eq 9900 -and
  $live.billingMode -eq 'paystack_checkout'
Write-Host "Production service version: $($live.version)"
Write-Host "Secure website subscription capabilities ready: $ready"
if ($RequireUpdatedBackend -and -not $ready) {
  throw 'Production is not the reviewed 3.25.0 backend. Website payments must remain disabled.'
}
if ($RunLocalTests) {
  Write-Host 'Running local tests; these do not charge Paystack or modify Firebase.'
  & npm ci --prefix .\services\teyza-mobile-v39 --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'Backend dependency install failed.' }
  & npm test --prefix .\services\teyza-mobile-v39
  if ($LASTEXITCODE -ne 0) { throw 'Backend tests failed.' }
  & node --test '.\tools\app-first-release\seller-web-billing.test.cjs'
  if ($LASTEXITCODE -ne 0) { throw 'Website subscription tests failed.' }
}
Write-Host 'RESULT: Preflight finished. No Firebase settings, rules, secrets, website or payments were changed.' -ForegroundColor Green
Write-Host 'NEXT: Read START-HERE-PILOT.md. Approval, sandbox and Paystack reconciliation checks are mandatory before any live release.'
