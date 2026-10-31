$ErrorActionPreference = 'Stop'
$FieldWorkRoot = $PSScriptRoot
Set-Location $FieldWorkRoot
& (Join-Path $FieldWorkRoot 'DEPLOY-MOBILE.ps1')
if ($LASTEXITCODE -ne 0) { throw 'The mobile backend deployment did not complete.' }
$FieldWorkHealth = Invoke-RestMethod -Uri 'https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile' -TimeoutSec 30
if ($FieldWorkHealth.fieldAgentWorkspace -ne $true -or $FieldWorkHealth.fieldAgentDiscovery -ne $true -or $FieldWorkHealth.fieldAgentDocuments -ne $true -or $FieldWorkHealth.fieldAgentAdminAreas -ne $true) { throw 'The field-agent backend is not active. Website publication was not started.' }
Set-Location $FieldWorkRoot
& (Join-Path $FieldWorkRoot 'DEPLOY-WEBSITE.ps1')
if ($LASTEXITCODE -ne 0) { throw 'The website overlay did not complete.' }
Set-Location $FieldWorkRoot
& (Join-Path $FieldWorkRoot 'DEPLOY-ADMIN.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Website and backend are active, but the admin navigation update did not complete. You can open https://teyza.co.za/work.html directly as an administrator.' }
node (Join-Path $FieldWorkRoot 'tools\app-first-release\check-live-seo.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Publication completed but live search/header checks need attention. Check the reported URL and keep the rollback backup.' }
Write-Host 'Teyza Work is ready at https://teyza.co.za/work.html. Approve your field agents before assigning visits.'
Write-Host 'Mandates record consent. Debit-order collection and commission transfers require separate payment-provider/bank processing.'
