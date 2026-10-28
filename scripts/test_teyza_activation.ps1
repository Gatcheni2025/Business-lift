$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$fixture = Join-Path ([System.IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path (Join-Path $fixture 'services/teyza-mobile-v39') -Force | Out-Null
$global:calls = [System.Collections.Generic.List[string]]::new()
$global:badHealth = $false
function firebase {
  $line = $args -join ' '
  $global:calls.Add($line)
  $global:LASTEXITCODE = 0
  if ($line.StartsWith('apps:list android')) { return '{"status":"success","result":[{"packageName":"za.co.teyza.teyza_shopper","appId":"1:983479810697:android:aabb"}]}' }
  if ($line.StartsWith('apps:list ios')) { return '{"status":"success","result":[{"bundleId":"za.co.teyza.shopper","appId":"1:983479810697:ios:ccdd"}]}' }
  if ($line.StartsWith('functions:secrets:get')) { return 'Secret metadata exists' }
  if ($line.StartsWith('deploy')) { return 'Mock deployment only' }
  return '{"status":"success","result":{}}'
}
function npm { $global:LASTEXITCODE = 0 }
function Invoke-RestMethod { if ($global:badHealth) { return @{ok=$true;version='3.12.0'} };return @{ok=$true;version='3.15.0';verificationUploads=$true;shopFrontPhotos=$true;approvalRequired=$true;shopLocations=$true;sellerOnboarding=$true;catalogueProducts=184} }
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
