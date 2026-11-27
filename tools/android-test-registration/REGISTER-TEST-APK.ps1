$ErrorActionPreference = 'Stop'
$project = 'business-lift-3c19c'
$cert = Get-Content (Join-Path $PSScriptRoot 'test-signing-fingerprints.json') -Raw | ConvertFrom-Json
if ($cert.applicationId -ne 'com.asiyedriver.asiye' -or $cert.signing -ne 'android-test-only' -or
    $cert.sha1 -cnotmatch '^[A-F0-9]{40}$' -or $cert.sha256 -cnotmatch '^[A-F0-9]{64}$') {
  throw 'This is not a valid Teyza test APK certificate file. Nothing changed.'
}
function FirebaseJson([string[]]$Arguments) {
  $output = & firebase @Arguments --project $project --non-interactive --json
  if ($LASTEXITCODE -ne 0) { throw ('Firebase failed: ' + $Arguments[0] + '. Check firebase login and project permissions.') }
  $reply = ($output -join "`n") | ConvertFrom-Json
  if ($reply.status -ne 'success') { throw ('Firebase did not complete ' + $Arguments[0]) }
  return $reply.result
}
$apps = @(FirebaseJson -Arguments @('apps:list','android'))
$target = @($apps | Where-Object { $_.packageName -eq $cert.applicationId })
if ($target.Count -ne 1) { throw 'The activated Teyza Android app was not found. Nothing changed.' }
$appId = $target[0].appId
if ($appId -notmatch '^1:983479810697:android:[a-fA-F0-9]+$') { throw 'Unexpected Firebase Android identity.' }
$existing = @(FirebaseJson -Arguments @('apps:android:sha:list',$appId))
foreach ($hash in @($cert.sha1,$cert.sha256)) {
  if ($existing | Where-Object { ($_.shaHash -replace ':','').ToUpperInvariant() -eq $hash }) {
    Write-Host ('Certificate already registered: ' + $hash.Length + '-character hash.')
  } else {
    $null = FirebaseJson -Arguments @('apps:android:sha:create',$appId,$hash)
  }
}
$verified = @(FirebaseJson -Arguments @('apps:android:sha:list',$appId))
foreach ($hash in @($cert.sha1,$cert.sha256)) {
  if (-not ($verified | Where-Object { ($_.shaHash -replace ':','').ToUpperInvariant() -eq $hash })) {
    throw 'Firebase has not confirmed both certificate fingerprints. Please retry this script.'
  }
}
Write-Host 'Teyza test APK certificate registered. Restart Teyza and request a fresh SMS code.'
