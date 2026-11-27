param([switch]$PublishReviewed)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Test-Path '.\current-firestore.rules')) {
  throw 'Save the CURRENT published Firestore rules as current-firestore.rules first. See README-START-HERE.md.'
}
$candidate = '.\firestore.seller-approval.candidate.rules'
if (-not $PublishReviewed) {
  node .\gate-seller-products.mjs .\current-firestore.rules $candidate
  if ($LASTEXITCODE -ne 0) { throw 'Rules preparation stopped. Nothing was deployed.' }
  Write-Host 'Candidate created. Compare it with current-firestore.rules, review overlapping permissions and test it before publishing.'
  Write-Host 'When reviewed, run: .\DEPLOY-SELLER-ACCESS.ps1 -PublishReviewed'
  return
}
if (-not (Test-Path $candidate)) { throw 'Prepare and review the candidate first. Nothing deployed.' }
@{firestore=@{rules='firestore.seller-approval.candidate.rules'}} | ConvertTo-Json -Depth 4 | Set-Content -Encoding utf8 '.\firebase.seller-approval.json'
firebase deploy --config '.\firebase.seller-approval.json' --only firestore:rules --project business-lift-3c19c
if ($LASTEXITCODE -ne 0) { throw 'Firebase did not complete deployment. Read the error above.' }
Write-Host 'Reviewed seller rules deployed. Check pending, paid, complimentary and unrelated users in Rules Playground.'
