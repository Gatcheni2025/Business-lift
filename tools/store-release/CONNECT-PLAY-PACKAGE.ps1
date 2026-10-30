param(
  [string]$UploadCertificateSha256,
  [string]$PlaySigningSha1,
  [string]$PlaySigningSha256,
  [string]$CertificatePath,
  [switch]$DefinitionsOnly
)
$ErrorActionPreference = 'Stop'
$TeyzaProject = 'business-lift-3c19c'
$TeyzaRepo = 'Gatcheni2025/Business-lift'
$TeyzaPlayPackage = 'com.asiyedriver.asiye'

function Invoke-PlayFirebase([string[]]$Arguments) {
  $raw = & firebase @Arguments --project $TeyzaProject --non-interactive --json
  if ($LASTEXITCODE -ne 0) { throw ('Firebase failed: ' + $Arguments[0] + '. Check firebase login.') }
  $reply = ($raw -join "`n") | ConvertFrom-Json
  if ($reply.status -ne 'success') { throw 'Firebase did not return a successful response.' }
  return $reply.result
}
function Normalize-TeyzaPublicHash([string]$Value, [int]$Length) {
  $hash = ($Value -replace '[\s:]','').ToUpperInvariant()
  if ($hash.Length -ne $Length -or $hash -cnotmatch '^[A-F0-9]+$') { throw ('Enter the complete ' + $Length + '-character certificate fingerprint from the existing Teyza app in Play Console.') }
  return $hash
}
function Connect-TeyzaPlayPackage {
  param([string]$UploadCertificateSha256,[string]$PlaySigningSha1,[string]$PlaySigningSha256,[string]$CertificatePath)
  foreach ($tool in @('firebase','gh')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw ('Install and sign in to ' + $tool + ' first.') }
  }
  $certPath = $CertificatePath
  if ([string]::IsNullOrWhiteSpace($certPath)) { $certPath = Join-Path $env:USERPROFILE 'Teyza-Signing\teyza-upload.cer' }
  if (-not (Test-Path -LiteralPath $certPath -PathType Leaf)) {
    throw 'Missing Teyza-Signing\teyza-upload.cer. Use your existing public upload certificate; no replacement key will be generated.'
  }
  if ([string]::IsNullOrWhiteSpace($UploadCertificateSha256)) { $UploadCertificateSha256 = Read-Host 'Play Console > Teyza (com.asiyedriver.asiye) > App integrity > Upload key certificate > SHA-256' }
  if ([string]::IsNullOrWhiteSpace($PlaySigningSha1)) { $PlaySigningSha1 = Read-Host 'Same app > App signing key certificate > SHA-1' }
  if ([string]::IsNullOrWhiteSpace($PlaySigningSha256)) { $PlaySigningSha256 = Read-Host 'Same app > App signing key certificate > SHA-256' }
  $expectedUpload = Normalize-TeyzaPublicHash $UploadCertificateSha256 64
  $playSha1 = Normalize-TeyzaPublicHash $PlaySigningSha1 40
  $playSha256 = Normalize-TeyzaPublicHash $PlaySigningSha256 64
  $certificate = New-Object Security.Cryptography.X509Certificates.X509Certificate2($certPath)
  $algorithm = [Security.Cryptography.SHA256]::Create()
  try {
    $uploadSha1 = $certificate.Thumbprint.ToUpperInvariant()
    $uploadSha256 = ([BitConverter]::ToString($algorithm.ComputeHash($certificate.RawData))).Replace('-','')
  } finally { $certificate.Dispose(); $algorithm.Dispose() }
  if ($uploadSha256 -cne $expectedUpload) { throw 'This certificate does not match the existing com.asiyedriver.asiye Play upload key. Select its existing certificate/key; nothing was changed and no replacement key was generated.' }
  $hashes = @($uploadSha1,$uploadSha256,$playSha1,$playSha256 | Sort-Object -Unique)
  $apps = @(Invoke-PlayFirebase -Arguments @('apps:list','android'))
  $registrations = @($apps | Where-Object { $_.packageName -ceq $TeyzaPlayPackage })
  if ($registrations.Count -gt 1) { throw 'More than one Firebase app matches the Play package. Stop and review the registrations.' }
  if ($registrations.Count -eq 0) {
    $null = Invoke-PlayFirebase -Arguments @('apps:create','android','Teyza Google Play','--package-name',$TeyzaPlayPackage)
    $apps = @(Invoke-PlayFirebase -Arguments @('apps:list','android'))
    $registrations = @($apps | Where-Object { $_.packageName -ceq $TeyzaPlayPackage })
  }
  if ($registrations.Count -ne 1 -or $registrations[0].appId -notmatch '^1:983479810697:android:[a-fA-F0-9]+$') {
    throw 'Could not confirm the Play-package Firebase app in business-lift-3c19c.'
  }
  $appId = $registrations[0].appId
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
    $_.client_info.android_client_info.package_name -ceq $TeyzaPlayPackage })
  if ($config.project_info.project_id -ne $TeyzaProject -or $client.Count -ne 1) {
    throw 'Downloaded SDK configuration does not match Teyza project, Firebase app and Play package.'
  }
  $webIds = @($client[0].oauth_client | Where-Object { $_.client_type -eq 3 } | ForEach-Object { $_.client_id } | Sort-Object -Unique)
  if ($webIds.Count -ne 1 -or $webIds[0] -notmatch '^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$') {
    throw 'Enable Google in Firebase Authentication for business-lift-3c19c, then retry; one Web OAuth client is required.'
  }
  # Only public Firebase SDK configuration is sent, base64 through stdin.
  $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($sdk.fileContents))
  $encoded | & gh secret set TEYZA_ANDROID_GOOGLE_SERVICES_JSON_BASE64 --repo $TeyzaRepo
  if ($LASTEXITCODE -ne 0) { throw 'Could not save Play Firebase SDK configuration to GitHub.' }
  & gh variable set TEYZA_FIREBASE_ANDROID_APP_ID --repo $TeyzaRepo --body $appId
  if ($LASTEXITCODE -ne 0) { throw 'Could not save Play Firebase app ID to GitHub.' }
  & gh variable set TEYZA_GOOGLE_WEB_CLIENT_ID --repo $TeyzaRepo --body $webIds[0]
  if ($LASTEXITCODE -ne 0) { throw 'Could not save the Teyza Web OAuth client ID.' }
  & gh variable set TEYZA_PLAY_UPLOAD_CERT_SHA256 --repo $TeyzaRepo --body $expectedUpload
  if ($LASTEXITCODE -ne 0) { throw 'Could not save the confirmed existing Play upload fingerprint.' }
  Write-Host ('Ready: ' + $TeyzaPlayPackage + ' uses Firebase app ' + $appId + ' and your existing upload key.')
  Write-Host 'Build Android only from fix/teyza-existing-play-package. The signed build will check the actual saved keystore against the Play upload fingerprint.'
}
if (-not $DefinitionsOnly) { Connect-TeyzaPlayPackage -UploadCertificateSha256 $UploadCertificateSha256 -PlaySigningSha1 $PlaySigningSha1 -PlaySigningSha256 $PlaySigningSha256 -CertificatePath $CertificatePath }
