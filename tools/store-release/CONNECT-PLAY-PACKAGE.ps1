param([switch]$DefinitionsOnly)
$ErrorActionPreference = 'Stop'
$TeyzaProject = 'business-lift-3c19c'
$TeyzaRepo = 'Gatcheni2025/Business-lift'
$TeyzaPlayPackage = 'za.co.teyza.shopper'

function Invoke-PlayFirebase([string[]]$Arguments) {
  $raw = & firebase @Arguments --project $TeyzaProject --non-interactive --json
  if ($LASTEXITCODE -ne 0) { throw ('Firebase failed: ' + $Arguments[0] + '. Check firebase login.') }
  $reply = ($raw -join "`n") | ConvertFrom-Json
  if ($reply.status -ne 'success') { throw 'Firebase did not return a successful response.' }
  return $reply.result
}
function Connect-TeyzaPlayPackage {
  foreach ($tool in @('firebase','gh')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw ('Install and sign in to ' + $tool + ' first.') }
  }
  $certPath = Join-Path $env:USERPROFILE 'Teyza-Signing\teyza-upload.cer'
  if (-not (Test-Path -LiteralPath $certPath -PathType Leaf)) {
    throw 'Missing Teyza-Signing\teyza-upload.cer. Use your existing public upload certificate; no replacement key will be generated.'
  }
  $apps = @(Invoke-PlayFirebase -Arguments @('apps:list','android'))
  $registrations = @($apps | Where-Object { $_.packageName -eq $TeyzaPlayPackage })
  if ($registrations.Count -gt 1) { throw 'More than one Firebase app matches the Play package. Stop and review the registrations.' }
  if ($registrations.Count -eq 0) {
    $null = Invoke-PlayFirebase -Arguments @('apps:create','android','Teyza Google Play','--package-name',$TeyzaPlayPackage)
    $apps = @(Invoke-PlayFirebase -Arguments @('apps:list','android'))
    $registrations = @($apps | Where-Object { $_.packageName -eq $TeyzaPlayPackage })
  }
  if ($registrations.Count -ne 1 -or $registrations[0].appId -notmatch '^1:983479810697:android:[a-fA-F0-9]+$') {
    throw 'Could not confirm the Play-package Firebase app in business-lift-3c19c.'
  }
  $appId = $registrations[0].appId
  $certificate = New-Object Security.Cryptography.X509Certificates.X509Certificate2($certPath)
  $algorithm = [Security.Cryptography.SHA256]::Create()
  try {
    $hashes = @($certificate.Thumbprint.ToUpperInvariant(),
      ([BitConverter]::ToString($algorithm.ComputeHash($certificate.RawData))).Replace('-',''))
  } finally { $certificate.Dispose(); $algorithm.Dispose() }
  $known = @(Invoke-PlayFirebase -Arguments @('apps:android:sha:list',$appId))
  foreach ($hash in $hashes) {
    if (-not ($known | Where-Object { ($_.shaHash -replace ':','').ToUpperInvariant() -eq $hash })) {
      $null = Invoke-PlayFirebase -Arguments @('apps:android:sha:create',$appId,$hash)
    }
  }
  $confirmed = @(Invoke-PlayFirebase -Arguments @('apps:android:sha:list',$appId))
  foreach ($hash in $hashes) {
    if (-not ($confirmed | Where-Object { ($_.shaHash -replace ':','').ToUpperInvariant() -eq $hash })) {
      throw 'Firebase did not confirm the upload certificate fingerprints. Retry without generating a new key.'
    }
  }
  $sdk = Invoke-PlayFirebase -Arguments @('apps:sdkconfig','android',$appId)
  $config = $sdk.fileContents | ConvertFrom-Json
  $client = @($config.client | Where-Object {
    $_.client_info.mobilesdk_app_id -eq $appId -and
    $_.client_info.android_client_info.package_name -eq $TeyzaPlayPackage })
  if ($config.project_info.project_id -ne $TeyzaProject -or $client.Count -ne 1) {
    throw 'Downloaded SDK configuration does not match Teyza project, Firebase app and Play package.'
  }
  # Only public Firebase SDK configuration is sent, base64 through stdin.
  $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($sdk.fileContents))
  $encoded | & gh secret set TEYZA_ANDROID_GOOGLE_SERVICES_JSON_BASE64 --repo $TeyzaRepo
  if ($LASTEXITCODE -ne 0) { throw 'Could not save Play Firebase SDK configuration to GitHub.' }
  & gh variable set TEYZA_FIREBASE_ANDROID_APP_ID --repo $TeyzaRepo --body $appId
  if ($LASTEXITCODE -ne 0) { throw 'Could not save Play Firebase app ID to GitHub.' }
  Write-Host ('Ready: ' + $TeyzaPlayPackage + ' uses Firebase app ' + $appId + ' and your existing upload key.')
  Write-Host 'Run the corrected Teyza store-files workflow after this helper succeeds.'
}
if (-not $DefinitionsOnly) { Connect-TeyzaPlayPackage }
