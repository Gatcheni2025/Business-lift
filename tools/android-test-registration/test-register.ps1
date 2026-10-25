$ErrorActionPreference = 'Stop'
$fixture = Join-Path ([System.IO.Path]::GetTempPath()) ([guid]::NewGuid().ToString())
New-Item -ItemType Directory -Path $fixture | Out-Null
$global:certificates = [System.Collections.Generic.List[object]]::new()
$global:requests = [System.Collections.Generic.List[string]]::new()
$global:denyList = $false
function firebase {
  $global:LASTEXITCODE = 0
  $line = $args -join ' '
  $global:requests.Add($line)
  if ($global:denyList) { $global:LASTEXITCODE = 1; return '{"status":"error"}' }
  if ($line.StartsWith('apps:list android')) { return '{"status":"success","result":[{"packageName":"za.co.teyza.teyza_shopper","appId":"1:983479810697:android:14f449587f5787f6db2458"}]}' }
  if ($line.StartsWith('apps:android:sha:create')) { $global:certificates.Add(@{shaHash=$args[2]}) }
  if ($line.StartsWith('apps:android:sha:list')) { return (@{status='success';result=@($global:certificates.ToArray())} | ConvertTo-Json -Depth 5 -Compress) }
  return '{"status":"success","result":{}}'
}
try {
  $source = Join-Path $PSScriptRoot 'REGISTER-TEST-APK.ps1'
  $errors = $null
  $null = [System.Management.Automation.Language.Parser]::ParseFile($source,[ref]$null,[ref]$errors)
  if ($errors.Count) { throw ($errors | Out-String) }
  Copy-Item $source $fixture
  @{applicationId='za.co.teyza.teyza_shopper';signing='android-test-only';sha1=('A'*40);sha256=('B'*64)} |
    ConvertTo-Json | Set-Content (Join-Path $fixture 'test-signing-fingerprints.json')
  & (Join-Path $fixture 'REGISTER-TEST-APK.ps1')
  if ($global:certificates.Count -ne 2) { throw 'Both fingerprints were not registered.' }
  & (Join-Path $fixture 'REGISTER-TEST-APK.ps1')
  if ($global:certificates.Count -ne 2) { throw 'Retry duplicated certificate registration.' }
  if ($global:requests | Where-Object { $_ -match 'deploy|secrets|sha:delete|apps:create' -or $_ -notmatch '--project business-lift-3c19c' }) { throw 'Registration exceeded its scope.' }
  $global:denyList = $true
  $failed = $false
  try { & (Join-Path $fixture 'REGISTER-TEST-APK.ps1') } catch { $failed = $true }
  if (-not $failed) { throw 'Permission failure incorrectly passed.' }
  $global:LASTEXITCODE = 0
  Write-Host 'Android certificate helper: correct native identity, both fingerprints, idempotent retries and permission failure passed with mocked Firebase commands.'
} finally {
  Remove-Item $fixture -Recurse -Force
  Remove-Item function:firebase
}
