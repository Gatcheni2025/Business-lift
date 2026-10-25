param([string]$KeyDirectory, [switch]$DefinitionsOnly)
$ErrorActionPreference = 'Stop'
$script:TeyzaRepository = 'Gatcheni2025/Business-lift'
$script:TeyzaProject = 'business-lift-3c19c'
$script:TeyzaAndroidApp = '1:983479810697:android:14f449587f5787f6db2458'
$script:TeyzaIosApp = '1:983479810697:ios:4aae4823892dd145db2458'
$script:TeyzaPackage = 'za.co.teyza.teyza_shopper'

function Find-TeyzaKeytool {
  $command = Get-Command keytool -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($command) { return $command.Source }
  $candidates = @()
  if ($env:JAVA_HOME) { $candidates += Join-Path $env:JAVA_HOME 'bin\keytool.exe' }
  if ($env:ProgramFiles) {
    $candidates += Join-Path $env:ProgramFiles 'Android\Android Studio\jbr\bin\keytool.exe'
    $candidates += Join-Path $env:ProgramFiles 'Android\Android Studio\jre\bin\keytool.exe'
    foreach ($vendor in @('Microsoft','Eclipse Adoptium')) {
      $folder = Join-Path $env:ProgramFiles $vendor
      if (Test-Path -LiteralPath $folder) {
        $candidates += @(Get-ChildItem -LiteralPath $folder -Directory -ErrorAction SilentlyContinue |
          ForEach-Object { Join-Path $_.FullName 'bin\keytool.exe' })
      }
    }
  }
  foreach ($candidate in $candidates) { if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate } }
  throw 'Java keytool was not found. Run: winget install Microsoft.OpenJDK.21 ; then reopen PowerShell in this folder and retry. Your signing key was not created or changed.'
}
function Read-TeyzaPassword([string]$Prompt) {
  $secure = Read-Host $Prompt -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}
function Invoke-TeyzaGhJson([string[]]$Arguments) {
  $raw = & gh @Arguments --repo $script:TeyzaRepository
  if ($LASTEXITCODE -ne 0) { throw ('GitHub could not complete ' + $Arguments[0] + '. Check gh auth status and repository access.') }
  return (($raw -join "`n") | ConvertFrom-Json)
}
function Send-TeyzaSecret([string]$Name,[string]$Value) {
  $start = New-Object Diagnostics.ProcessStartInfo
  $start.FileName = (Get-Command gh -CommandType Application | Select-Object -First 1).Source
  $start.Arguments = 'secret set ' + $Name + ' --repo ' + $script:TeyzaRepository
  $start.UseShellExecute = $false
  $start.RedirectStandardInput = $true
  $process = [Diagnostics.Process]::Start($start)
  $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
  try {
    $inputStream = $process.StandardInput.BaseStream
    $inputStream.Write($bytes,0,$bytes.Length)
    $inputStream.Flush()
    $inputStream.Close()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) { throw ('Could not save ' + $Name + '. Your local upload key remains available; rerun this helper to resume.') }
  } finally { [Array]::Clear($bytes,0,$bytes.Length); $process.Dispose() }
}
function Send-TeyzaVariable([string]$Name,[string]$Value) {
  & gh variable set $Name --repo $script:TeyzaRepository --body $Value
  if ($LASTEXITCODE -ne 0) { throw ('Could not save the public setting ' + $Name) }
}
function Invoke-TeyzaKeytool([string[]]$Arguments) {
  & $script:TeyzaKeytool @Arguments
  if ($LASTEXITCODE -ne 0) { throw 'Java could not open or create this Teyza key. Check the password and the message above. The key was not replaced.' }
}
function Get-TeyzaCertificateHashes([string]$CertificatePath) {
  $certificate = New-Object Security.Cryptography.X509Certificates.X509Certificate2($CertificatePath)
  $algorithm = [Security.Cryptography.SHA256]::Create()
  try {
    return @{sha1=$certificate.Thumbprint.ToUpperInvariant();
      sha256=([BitConverter]::ToString($algorithm.ComputeHash($certificate.RawData))).Replace('-','')}
  } finally { $algorithm.Dispose(); $certificate.Dispose() }
}
function Save-TeyzaFirstKey([string]$Directory) {
  $script:TeyzaKeytool = Find-TeyzaKeytool
  $keystore = Join-Path $Directory 'teyza-upload.jks'
  $certificatePath = Join-Path $Directory 'teyza-upload.cer'
  $existing = Test-Path -LiteralPath $keystore -PathType Leaf
  $remoteNames = @(Invoke-TeyzaGhJson -Arguments @('secret','list','--json','name'))
  if (-not $existing -and ($remoteNames | Where-Object { $_.name -eq 'TEYZA_ANDROID_KEYSTORE_BASE64' })) {
    throw 'An Android upload key is already saved in this repository. Locate its matching local backup before continuing; no new key was created.'
  }
  $password = Read-TeyzaPassword $(if ($existing) {'Password for your existing Teyza upload key'} else {'Choose a Teyza upload-key password (at least 8 characters)'})
  $confirm = $null
  $priorPassword = [Environment]::GetEnvironmentVariable('TEYZA_FIRST_RELEASE_PASSWORD','Process')
  try {
    if ($existing) {
      if ([string]::IsNullOrEmpty($password)) { throw 'The existing keystore password is required.' }
      Write-Host 'Resuming with the existing local Teyza key. No replacement key will be generated.'
    } else {
      if ($password.Length -lt 8) { throw 'Choose a password with at least 8 characters and run the helper again.' }
      $confirm = Read-TeyzaPassword 'Enter the same password again'
      if (-not [string]::Equals($password,$confirm,[StringComparison]::Ordinal)) { throw 'Passwords did not match. No key was created.' }
    }
    [Environment]::SetEnvironmentVariable('TEYZA_FIRST_RELEASE_PASSWORD',$password,'Process')
    if (-not $existing) {
      $null = New-Item -ItemType Directory -Path $Directory -Force
      Invoke-TeyzaKeytool -Arguments @('-genkeypair','-keystore',$keystore,'-storetype','JKS','-alias','teyza-upload',
        '-keyalg','RSA','-keysize','4096','-validity','10000','-dname','CN=Teyza Upload, O=Teyza, C=ZA',
        '-storepass:env','TEYZA_FIRST_RELEASE_PASSWORD','-keypass:env','TEYZA_FIRST_RELEASE_PASSWORD','-noprompt')
    }
    Invoke-TeyzaKeytool -Arguments @('-exportcert','-keystore',$keystore,'-alias','teyza-upload',
      '-storepass:env','TEYZA_FIRST_RELEASE_PASSWORD','-file',$certificatePath)
    $hashes = Get-TeyzaCertificateHashes $certificatePath
    $publicInfo = @{applicationId=$script:TeyzaPackage;firebaseAppId=$script:TeyzaAndroidApp;
      signing='production-upload-key';alias='teyza-upload';sha1=$hashes.sha1;sha256=$hashes.sha256}
    $publicInfo | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Directory 'teyza-upload-fingerprints.json') -Encoding UTF8
    Send-TeyzaSecret 'TEYZA_ANDROID_KEYSTORE_BASE64' ([Convert]::ToBase64String([IO.File]::ReadAllBytes($keystore)))
    Send-TeyzaSecret 'TEYZA_ANDROID_STORE_PASSWORD' $password
    Send-TeyzaSecret 'TEYZA_ANDROID_KEY_ALIAS' 'teyza-upload'
    Send-TeyzaSecret 'TEYZA_ANDROID_KEY_PASSWORD' $password
    Write-Host ('Android signing saved. Keep a private backup of ' + $keystore + ' and your password.')
    return $publicInfo
  } finally {
    [Environment]::SetEnvironmentVariable('TEYZA_FIRST_RELEASE_PASSWORD',$priorPassword,'Process')
    $password = $null; $confirm = $null
  }
}
function Invoke-TeyzaFirebaseJson([string[]]$Arguments) {
  $raw = & firebase @Arguments --project $script:TeyzaProject --non-interactive --json
  if ($LASTEXITCODE -ne 0) { throw ('Firebase could not complete ' + $Arguments[0] + '. Run firebase login and retry; your local signing key is preserved.') }
  $reply = ($raw -join "`n") | ConvertFrom-Json
  if ($reply.status -ne 'success') { throw ('Firebase did not complete ' + $Arguments[0]) }
  return $reply.result
}
function Get-TeyzaWebClient([object]$Config) {
  if ($Config.project_info.project_id -ne $script:TeyzaProject) { throw 'Android SDK configuration belongs to a different Firebase project.' }
  $client = @($Config.client | Where-Object {
    $_.client_info.mobilesdk_app_id -eq $script:TeyzaAndroidApp -and
    $_.client_info.android_client_info.package_name -eq $script:TeyzaPackage })
  if ($client.Count -ne 1) { throw 'The SDK configuration does not match the existing Teyza Android app.' }
  $ids = @($client[0].oauth_client | Where-Object { $_.client_type -eq 3 } |
    ForEach-Object { $_.client_id } | Sort-Object -Unique)
  if ($ids.Count -ne 1 -or $ids[0] -notmatch '^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$') {
    throw 'Firebase did not return one Web OAuth client ID. Enable Google in Firebase Authentication > Sign-in method for business-lift-3c19c, then rerun this helper.'
  }
  return $ids[0]
}
function Get-TeyzaPlistValue([xml]$Plist,[string]$Name) {
  $nodes = @($Plist.plist.dict.ChildNodes)
  for ($index=0; $index -lt $nodes.Count-1; $index++) {
    if ($nodes[$index].Name -eq 'key' -and $nodes[$index].InnerText -eq $Name) { return $nodes[$index+1].InnerText }
  }
  return $null
}
function Connect-TeyzaFirebase([object]$PublicInfo) {
  if ($PublicInfo.applicationId -ne $script:TeyzaPackage -or $PublicInfo.firebaseAppId -ne $script:TeyzaAndroidApp -or
      $PublicInfo.signing -ne 'production-upload-key' -or $PublicInfo.sha1 -cnotmatch '^[A-F0-9]{40}$' -or
      $PublicInfo.sha256 -cnotmatch '^[A-F0-9]{64}$') { throw 'The production upload-key fingerprint record is not valid for Teyza.' }
  $apps = @(Invoke-TeyzaFirebaseJson -Arguments @('apps:list','android'))
  $target = @($apps | Where-Object { $_.appId -eq $script:TeyzaAndroidApp -and $_.packageName -eq $script:TeyzaPackage })
  if ($target.Count -ne 1) { throw 'The existing Teyza Android Firebase registration could not be confirmed.' }
  $known = @(Invoke-TeyzaFirebaseJson -Arguments @('apps:android:sha:list',$script:TeyzaAndroidApp))
  foreach ($hash in @($PublicInfo.sha1,$PublicInfo.sha256)) {
    if (-not ($known | Where-Object { ($_.shaHash -replace ':','').ToUpperInvariant() -eq $hash })) {
      $null = Invoke-TeyzaFirebaseJson -Arguments @('apps:android:sha:create',$script:TeyzaAndroidApp,$hash)
    }
  }
  $confirmed = @(Invoke-TeyzaFirebaseJson -Arguments @('apps:android:sha:list',$script:TeyzaAndroidApp))
  foreach ($hash in @($PublicInfo.sha1,$PublicInfo.sha256)) {
    if (-not ($confirmed | Where-Object { ($_.shaHash -replace ':','').ToUpperInvariant() -eq $hash })) { throw 'Firebase has not confirmed both upload certificate hashes. Retry this helper.' }
  }
  $sdk = Invoke-TeyzaFirebaseJson -Arguments @('apps:sdkconfig','android',$script:TeyzaAndroidApp)
  if (-not $sdk.fileContents) { throw 'The Android SDK configuration response was incomplete.' }
  $webId = Get-TeyzaWebClient ($sdk.fileContents | ConvertFrom-Json)
  Send-TeyzaVariable 'TEYZA_GOOGLE_WEB_CLIENT_ID' $webId
  Write-Host 'Production APK certificate and Google Web OAuth client configured for the existing Firebase project.'
  try {
    $ios = Invoke-TeyzaFirebaseJson -Arguments @('apps:sdkconfig','ios',$script:TeyzaIosApp)
    [xml]$plist = $ios.fileContents
    $iosId = Get-TeyzaPlistValue $plist 'CLIENT_ID'
    if ((Get-TeyzaPlistValue $plist 'GOOGLE_APP_ID') -ne $script:TeyzaIosApp -or
        (Get-TeyzaPlistValue $plist 'BUNDLE_ID') -ne 'za.co.teyza.shopper' -or
        $iosId -notmatch '^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$') { throw 'iOS OAuth configuration is not available yet.' }
    Send-TeyzaVariable 'TEYZA_GOOGLE_IOS_CLIENT_ID' $iosId
  } catch { Write-Host 'Android is configured. The iOS OAuth client can be configured with the Apple release setup.' }
}
function Start-TeyzaFirstAndroidRelease([string]$Directory) {
  if ([string]::IsNullOrWhiteSpace($Directory)) {
    if (-not $env:USERPROFILE) { throw 'Supply -KeyDirectory with a private local folder.' }
    $Directory = Join-Path $env:USERPROFILE 'Teyza-Signing'
  }
  $script:TeyzaKeytool = Find-TeyzaKeytool
  foreach ($tool in @('gh','firebase')) {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw ('Install ' + $tool + ' and sign in, then retry. No signing key was created.') }
  }
  & gh auth status --hostname github.com
  if ($LASTEXITCODE -ne 0) { throw 'Complete gh auth login, then retry.' }
  $info = Save-TeyzaFirstKey $Directory
  Connect-TeyzaFirebase $info
  $runs = @(Invoke-TeyzaGhJson -Arguments @('run','list','--workflow','teyza-store-files.yml','--branch','release/teyza-store-files','--limit','1','--json','databaseId,url'))
  if ($runs.Count -ne 1 -or $runs[0].databaseId -notmatch '^\d+$') { throw 'Signing is configured. Open GitHub Actions and re-run the latest Teyza signed store-files workflow.' }
  & gh run rerun $runs[0].databaseId --repo $script:TeyzaRepository
  if ($LASTEXITCODE -ne 0) { throw 'Signing is configured. Open the latest store-files workflow and choose Re-run all jobs.' }
  Write-Host ('Signed build requested: ' + $runs[0].url)
  Write-Host 'Android can now build its signed AAB and APK. Apple signing still needs its distribution certificate, profile and Team ID.'
}
if (-not $DefinitionsOnly) { Start-TeyzaFirstAndroidRelease $KeyDirectory }
