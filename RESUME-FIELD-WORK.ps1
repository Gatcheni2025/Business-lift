$ErrorActionPreference = 'Stop'
$FieldWorkRoot = $PSScriptRoot
Set-Location $FieldWorkRoot
$FieldWorkHealth = Invoke-RestMethod -Uri 'https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile' -TimeoutSec 30
if ($FieldWorkHealth.fieldAgentWorkspace -ne $true -or $FieldWorkHealth.fieldAgentDiscovery -ne $true) {
  throw 'The updated field-team backend is not active. Run DEPLOY-FIELD-WORK.ps1 from this kit instead.'
}
Write-Host 'The field-team backend is active. Resuming the website and admin update.'
& (Join-Path $FieldWorkRoot 'DEPLOY-WEBSITE.ps1')
if ($LASTEXITCODE -ne 0) { throw 'Website publication did not complete.' }
Set-Location $FieldWorkRoot
& (Join-Path $FieldWorkRoot 'DEPLOY-ADMIN.ps1')
if ($LASTEXITCODE -ne 0) { throw 'The website is published, but the admin navigation update did not complete. Open https://teyza.co.za/work.html directly as an administrator.' }
node (Join-Path $FieldWorkRoot 'tools\app-first-release\check-live-seo.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Website and admin publication completed, but live search/header checks need attention.' }
Write-Host 'Website and admin update completed. Open https://teyza.co.za/work.html.'
