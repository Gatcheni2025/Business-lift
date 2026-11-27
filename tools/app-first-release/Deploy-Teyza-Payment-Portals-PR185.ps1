#requires -Version 5.1
# Deploy only the operator-approved PR #185 Pay/Ads UI from a clean
# Git worktree; preserve local Business-lift edits and seller-billing files.
$ErrorActionPreference = 'Stop'
$repo = 'Gatcheni2025/Business-lift'
$branch = 'release/teyza-ads-web-qa-signed-20261111'
$originalRepo = Join-Path $HOME 'Downloads\Business-lift'
$deploymentTree = Join-Path $HOME 'Downloads\Teyza-PR185-Approved-Hosting'

if (!(Test-Path (Join-Path $originalRepo '.git'))) {
    throw 'Original Business-lift repository not found.'
}
Set-Location $originalRepo
$pr = gh pr view 185 --repo $repo --json mergedAt,mergeCommit | ConvertFrom-Json
if ($LASTEXITCODE -ne 0 -or !$pr.mergedAt -or !$pr.mergeCommit.oid) {
    throw 'PR #185 has not been merged; deployment is blocked.'
}
$expected = $pr.mergeCommit.oid.Trim()

git fetch origin $branch
if ($LASTEXITCODE -ne 0) { throw 'Cannot fetch release branch.' }
$remoteHead = (git rev-parse "origin/$branch").Trim()
if ($remoteHead -ne $expected) {
    throw "Release branch advanced after PR #185. Expected $expected, received $remoteHead."
}
if (Test-Path $deploymentTree) { throw "Worktree already exists: $deploymentTree" }
git worktree add --detach $deploymentTree "origin/$branch"
if ($LASTEXITCODE -ne 0) { throw 'Cannot prepare isolated deployment worktree.' }
$actualHead = (git -C $deploymentTree rev-parse HEAD).Trim()
if ($actualHead -ne $expected) { throw 'Isolated commit SHA mismatch.' }
Set-Location $deploymentTree

$publisher = '.\tools\app-first-release\publish-payment-portals-only.cjs'
if (!(Test-Path $publisher)) { throw 'Scoped publisher missing.' }
node --check $publisher
if ($LASTEXITCODE -ne 0) { throw 'Publisher syntax errors.' }
node $publisher --check
if ($LASTEXITCODE -ne 0) { throw 'Source SHA-256 approval or mirror verification failed.' }

node --test '.\tools\app-first-release\seller-web-billing.test.cjs' '.\tools\app-first-release\ads-web-billing.test.cjs' '.\tools\app-first-release\publish-payment-portals-only.test.cjs'
if ($LASTEXITCODE -ne 0) { throw 'Local payment/advertising tests failed.' }

npm ci --omit=dev --ignore-scripts --no-audit --no-fund --prefix '.\tools\app-first-release'
if ($LASTEXITCODE -ne 0) { throw 'Cannot install scoped Firebase dependencies.' }

Write-Host "Releasing exact reviewed PR #185 SHA $expected" -ForegroundColor Cyan
node $publisher --publish
if ($LASTEXITCODE -ne 0) { throw 'Hosting publication failed. Inspect live release before retrying.' }

foreach ($item in @(
  @{ Url='https://teyza.co.za/pay/'; Needle='Start selling with confidence.' },
  @{ Url='https://teyza.co.za/ads/'; Needle='Put your business in front of nearby shoppers.' }
)) {
    $page = Invoke-WebRequest -Uri $item.Url -UseBasicParsing -ErrorAction Stop
    if ($page.StatusCode -ne 200 -or !$page.Content.Contains($item.Needle)) {
        throw "Published content verification failed for $($item.Url). Inspect rollback metadata."
    }
    Write-Host "Verified LIVE: $($item.Url)" -ForegroundColor Green
}
Write-Host 'Only the five reviewed Pay/Ads source files were published.' -ForegroundColor Green
Write-Host "Retain rollback metadata inside: $deploymentTree"
