$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Test-Path '.\current-firestore.rules')) {
  throw 'Copy the CURRENT published Firestore rules into current-firestore.rules first. See README-START-HERE.md.'
}
node .\repair-seller-rules.mjs .\current-firestore.rules .\firestore.seller-access.fixed.rules
if ($LASTEXITCODE -ne 0) { throw 'Rules preparation failed. Nothing deployed.' }
firebase deploy --config .\firebase.seller-access.json --only firestore:rules --project business-lift-3c19c
if ($LASTEXITCODE -ne 0) { throw 'Firebase did not complete deployment. Read the error above.' }
Write-Host 'Seller access rules deployed. Reopen the app and tap Retry.'
