<#
  TEYZA R327 premium admin + manual Netcash mandate handoff.
  From repository checkout:
    .\DEPLOY-TEYZA-ADMIN-R327.ps1 -Mode Preview
    .\DEPLOY-TEYZA-ADMIN-R327.ps1 -Mode Deploy -ConfirmDeployment
    .\DEPLOY-TEYZA-ADMIN-R327.ps1 -Mode Rollback -ConfirmDeployment

  Deploy backend first; patch ONLY 17 admin files/aliases in existing Firebase Hosting.
  No manual Netcash collections or seller-paid entitlements occur during deployment.
#>
[CmdletBinding()]
param(
  [ValidateSet("Preview","Deploy","Rollback")][string]$Mode="Preview",
  [switch]$ConfirmDeployment,
  [string]$ExpectedSourceSha=""
)
Set-StrictMode -Version Latest
$ErrorActionPreference="Stop"
$repo=$PSScriptRoot
$project="business-lift-3c19c"
$expectedBranch="feat/teyza-premium-admin-start-selling-20261107"
Push-Location $repo
try {
  function Check([string]$label,[string]$executable,[string[]]$items) {
    Write-Host $label -ForegroundColor Cyan
    & $executable @items
    if ($LASTEXITCODE -ne 0) { throw "$label failed. Deployment halted." }
  }
  if (!(Test-Path "web/teyza-admin/public/admin.html") -or
      !(Test-Path "firebase.teyza-mobile-v39.json")) {
    throw "Run this script from the Teyza Git checkout. No changes made."
  }
  $branch=(& git branch --show-current).Trim()
  if ($LASTEXITCODE -ne 0 -or $branch -ne $expectedBranch) {
    throw "Expected reviewed branch $expectedBranch, found $branch. No changes made."
  }
  $sha=(& git rev-parse HEAD).Trim()
  if ($LASTEXITCODE -ne 0 -or $sha -notmatch '^[a-f0-9]{40}$') {
    throw "Could not verify Git commit. No changes made."
  }
  if ($ExpectedSourceSha -and $sha -ne $ExpectedSourceSha) {
    throw "Source SHA differs from the requested reviewed commit. No changes made."
  }
  $dirty=@(& git status --porcelain --untracked-files=no)
  if ($LASTEXITCODE -ne 0 -or $dirty.Count -gt 0) {
    throw "Tracked local edits are present. Commit or restore them first."
  }
  $version=(& node --version).Trim()
  if ($LASTEXITCODE -ne 0 -or $version -notmatch '^v(\d+)') { throw "Node.js 22 or newer required." }
  if ([int]$Matches[1] -lt 22) { throw "Node.js 22 or newer required." }
  Write-Host "Teyza admin R327 source: $sha"
  if ($Mode -eq "Rollback") {
    if (!$ConfirmDeployment) {
      throw "Rollback changes live Hosting. Re-run with -ConfirmDeployment."
    }
    if (!(Test-Path "tools/admin-release/node_modules/firebase-tools/lib/bin/firebase.js")) {
      Check "Restore pinned Firebase deployment dependencies" "npm" @("ci","--prefix","tools/admin-release","--ignore-scripts","--no-audit","--no-fund")
    }
    # Emergency rollback does not depend on the currently deployed backend
    # or a fresh build passing; it verifies only that our exact release is live.
    Check "Restore preceding Teyza Hosting version" "node" @("tools/admin-release/run.cjs","rollback")
    Write-Host "Only Hosting restored. Verify signed-in access and backend state." -ForegroundColor Yellow
    exit 0
  }
  Check "Install backend dependencies" "npm" @("ci","--prefix","services/teyza-mobile-v39","--no-audit","--no-fund")
  Check "Run backend security and mandate tests" "npm" @("test","--prefix","services/teyza-mobile-v39")
  Check "Install admin deployment dependencies" "npm" @("ci","--prefix","tools/admin-release","--ignore-scripts","--no-audit","--no-fund")
  Check "Verify admin overlay, rollback, users and mandate tests" "npm" @("test","--prefix","tools/admin-release")
  foreach($asset in @(
    "web/teyza-admin/public/js/teyza-app-admin.js",
    "web/teyza-admin/public/js/teyza-operations.js",
    "web/teyza-admin/public/js/teyza-mandate-pdf.mjs"
  )) {
    Check "Syntax-check $asset" "node" @("--check",$asset)
  }
  if ($Mode -eq "Preview") {
    Write-Host "PREVIEW COMPLETE. No Firebase resources changed." -ForegroundColor Green
    Write-Host "For live publication, use -Mode Deploy -ConfirmDeployment."
    exit 0
  }

  $runner="tools/admin-release/node_modules/firebase-tools/lib/bin/firebase.js"
  if (!(Test-Path $runner)) {throw "Pinned Firebase CLI unavailable."}
  if (!$ConfirmDeployment) {throw "Live deployment requires -ConfirmDeployment."}

  # Preserve the legacy Paystack plan environment for existing subscriptions.
  # Never copy secrets into repository files or the chat.
  $legacyEnv="services/teyza-mobile-v39/.env.business-lift-3c19c"
  if (!(Test-Path $legacyEnv)) {
    throw "Existing ignored Firebase .env missing. Restore private backup first."
  }
  $rawEnv=Get-Content -LiteralPath $legacyEnv -Raw
  if ($rawEnv -notmatch '(?m)^TEYZA_PAYSTACK_MONTHLY_PLAN_CODE=PLN_[A-Za-z0-9]+\s*$') {
    throw "Existing Paystack monthly plan code missing. No changes made."
  }
  foreach($secret in @(
    "TEYZA_PAYSTACK_SECRET_KEY",
    "TEYZA_VERIFICATION_ENCRYPTION_KEY",
    "TEYZA_GOOGLE_PLACES_KEY"
  )) {
    & node $runner functions:secrets:get $secret --project $project *> $null
    if($LASTEXITCODE -ne 0){throw "Missing existing Firebase secret: $secret. No changes made."}
  }
  Write-Host "Deploying reviewed teyzaMobile backend; WhatsApp functions and Meta secrets are excluded." -ForegroundColor Cyan
  # Firebase CLI can request secrets belonging to unrelated functions during
  # source discovery, even when --only selects one function. The isolated
  # entrypoint exports ONLY teyzaMobile and restores package.json afterward.
  # It is non-interactive and cannot create a placeholder WhatsApp secret.
  Check "Publish ONLY teyzaMobile with isolated function discovery" "node" @(
    "tools/admin-release/deploy-mobile-only.cjs"
  )

  # Hosting is not patched unless the LIVE backend confirms required capabilities.
  Check "Patch 17 admin routes/assets only, verify and publish" "node" @(
    "tools/admin-release/run.cjs","deploy"
  )
  Write-Host "R327 admin update published. No Netcash debit or seller entitlement created." -ForegroundColor Green
  Write-Host "Test https://www.teyza.co.za/admin.html in a fresh login session."
  Write-Host "For rollback: .\DEPLOY-TEYZA-ADMIN-R327.ps1 -Mode Rollback -ConfirmDeployment"
}
finally { Pop-Location }
