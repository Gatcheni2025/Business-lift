$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'FIRST-ANDROID-RELEASE.ps1') -DefinitionsOnly
$script:RealKeytool = Find-TeyzaKeytool
$testFolder = Join-Path ([IO.Path]::GetTempPath()) ('teyza-key-fixture-' + [guid]::NewGuid().ToString('N'))
$script:Passwords = New-Object 'Collections.Generic.Queue[string]'
$script:SavedSecrets = @{}
$script:SavedVariables = @{}
$script:RemoteKey = $false
$script:FailSecret = $false
$script:FixturePassword = 'Test-only P@ssw0rd-42!'
$script:KeyCommands = New-Object 'Collections.Generic.List[object]'
$script:OriginalKeytoolFunction = ${function:Invoke-TeyzaKeytool}

function Read-TeyzaPassword([string]$Prompt) { return $script:Passwords.Dequeue() }
function Invoke-TeyzaGhJson([string[]]$Arguments) {
  if ($script:RemoteKey) { return @([pscustomobject]@{name='TEYZA_ANDROID_KEYSTORE_BASE64'}) }
  return @()
}
function Send-TeyzaSecret([string]$Name,[string]$Value) {
  if ($script:FailSecret) { throw 'Simulated GitHub upload failure' }
  $script:SavedSecrets[$Name] = $Value
}
function Send-TeyzaVariable([string]$Name,[string]$Value) { $script:SavedVariables[$Name] = $Value }
function Invoke-TeyzaKeytool([string[]]$Arguments) {
  $script:KeyCommands.Add($Arguments)
  if ($Arguments -contains $script:FixturePassword) { throw 'Password leaked into command arguments.' }
  & $script:OriginalKeytoolFunction -Arguments $Arguments
}
function Assert-Teyza([bool]$Value,[string]$Message) { if (-not $Value) { throw $Message } }
function Hash-TeyzaFile([string]$Path) { return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash }

try {
  $script:Passwords.Enqueue($script:FixturePassword)
  $script:Passwords.Enqueue($script:FixturePassword)
  [Environment]::SetEnvironmentVariable('TEYZA_FIRST_RELEASE_PASSWORD','prior-fixture-value','Process')
  $info = Save-TeyzaFirstKey $testFolder
  $keystore = Join-Path $testFolder 'teyza-upload.jks'
  $originalHash = Hash-TeyzaFile $keystore
  Assert-Teyza ($info.sha1 -cmatch '^[A-F0-9]{40}$' -and $info.sha256 -cmatch '^[A-F0-9]{64}$') 'Public certificate digests were not generated.'
  Assert-Teyza ($script:SavedSecrets.Count -eq 4) 'Four exact Android signing settings were not saved.'
  Assert-Teyza ($script:SavedSecrets['TEYZA_ANDROID_STORE_PASSWORD'] -ceq $script:FixturePassword) 'The chosen password was changed.'
  Assert-Teyza ($script:SavedSecrets['TEYZA_ANDROID_KEY_PASSWORD'] -ceq $script:FixturePassword) 'The alias key uses a different password.'
  Assert-Teyza ([Convert]::ToBase64String([IO.File]::ReadAllBytes($keystore)) -ceq $script:SavedSecrets['TEYZA_ANDROID_KEYSTORE_BASE64']) 'The uploaded key differs from the local backup.'
  Assert-Teyza ($env:TEYZA_FIRST_RELEASE_PASSWORD -ceq 'prior-fixture-value') 'The child password environment was not restored.'
  Write-Host 'PASS: real JKS generation, certificate export, secret values and password-environment restoration.'

  $script:Passwords.Enqueue($script:FixturePassword)
  $null = Save-TeyzaFirstKey $testFolder
  Assert-Teyza ((Hash-TeyzaFile $keystore) -ceq $originalHash) 'A rerun replaced the keystore.'
  Assert-Teyza (@($script:KeyCommands | Where-Object { $_ -contains '-genkeypair' }).Count -eq 1) 'Resume generated another key.'
  Write-Host 'PASS: rerunning resumes with the exact same private key.'

  $script:FailSecret = $true
  $script:Passwords.Enqueue($script:FixturePassword)
  $failed = $false
  try { $null = Save-TeyzaFirstKey $testFolder } catch { $failed = $true }
  Assert-Teyza $failed 'A failed GitHub write was accepted.'
  Assert-Teyza ((Hash-TeyzaFile $keystore) -ceq $originalHash) 'A GitHub failure damaged the local backup.'
  Assert-Teyza ($env:TEYZA_FIRST_RELEASE_PASSWORD -ceq 'prior-fixture-value') 'A failure left the child password environment set.'
  $script:FailSecret = $false
  Write-Host 'PASS: failed remote writes preserve the key and restore the environment.'

  $script:RemoteKey = $true
  $other = Join-Path $testFolder 'other'
  $failed = $false
  try { $null = Save-TeyzaFirstKey $other } catch { $failed = $true }
  Assert-Teyza ($failed -and -not (Test-Path $other)) 'An existing remote upload key was silently replaced.'
  $script:RemoteKey = $false
  Write-Host 'PASS: an unmatched existing remote upload key blocks new key creation.'

  $script:Passwords.Enqueue('A-valid-password-42')
  $script:Passwords.Enqueue('Different-password-42')
  $failed = $false
  try { $null = Save-TeyzaFirstKey $other } catch { $failed = $true }
  Assert-Teyza ($failed -and -not (Test-Path $other)) 'Mismatched passwords created a key.'
  Write-Host 'PASS: password mismatch leaves no private files.'

  $script:FirebaseCalls = New-Object 'Collections.Generic.List[object]'
  $script:RegisteredHashes = @()
  $script:WrongApp = $false
  $script:WebClients = @(@{client_type=3;client_id='fixture-web.apps.googleusercontent.com'})
  function Invoke-TeyzaFirebaseJson([string[]]$Arguments) {
    $script:FirebaseCalls.Add($Arguments)
    switch ($Arguments[0]) {
      'apps:list' { return @(@{appId=$script:TeyzaAndroidApp;packageName=$(if($script:WrongApp){'different.app'}else{$script:TeyzaPackage})}) }
      'apps:android:sha:list' { return @($script:RegisteredHashes | ForEach-Object { @{shaHash=$_} }) }
      'apps:android:sha:create' { $script:RegisteredHashes += $Arguments[2]; return @{} }
      'apps:sdkconfig' {
        if ($Arguments[1] -eq 'android') {
          return @{fileContents=(@{project_info=@{project_id=$script:TeyzaProject};client=@(@{
            client_info=@{mobilesdk_app_id=$script:TeyzaAndroidApp;android_client_info=@{package_name=$script:TeyzaPackage}};
            oauth_client=$script:WebClients})} | ConvertTo-Json -Depth 10)}
        }
        return @{fileContents=('<plist><dict><key>GOOGLE_APP_ID</key><string>'+$script:TeyzaIosApp+'</string><key>BUNDLE_ID</key><string>za.co.teyza.shopper</string><key>CLIENT_ID</key><string>fixture-ios.apps.googleusercontent.com</string></dict></plist>')}
      }
      default { throw 'Unexpected Firebase mutation.' }
    }
  }
  Connect-TeyzaFirebase $info
  Assert-Teyza ($script:RegisteredHashes.Count -eq 2) 'Production hashes were not registered.'
  Assert-Teyza ($script:SavedVariables['TEYZA_GOOGLE_WEB_CLIENT_ID'] -eq 'fixture-web.apps.googleusercontent.com') 'The canonical Web OAuth client was not selected.'
  Assert-Teyza ($script:SavedVariables['TEYZA_GOOGLE_IOS_CLIENT_ID'] -eq 'fixture-ios.apps.googleusercontent.com') 'The matching iOS SDK OAuth client was not selected.'
  Connect-TeyzaFirebase $info
  Assert-Teyza ($script:RegisteredHashes.Count -eq 2) 'A retry duplicated certificate registrations.'
  Assert-Teyza (-not ($script:FirebaseCalls | Where-Object { $_[0] -match 'apps:create|deploy|secrets|delete' })) 'The helper changed unrelated Firebase resources.'
  Write-Host 'PASS: existing native IDs, idempotent fingerprint registration and SDK-based OAuth discovery.'

  $script:WrongApp = $true
  $failed = $false
  try { Connect-TeyzaFirebase $info } catch { $failed = $true }
  Assert-Teyza $failed 'A different native package was accepted.'
  $script:WrongApp = $false
  $script:WebClients += @{client_type=3;client_id='different-web.apps.googleusercontent.com'}
  $failed = $false
  try { Connect-TeyzaFirebase $info } catch { $failed = $true }
  Assert-Teyza $failed 'An ambiguous Web OAuth client was guessed.'
  Write-Host 'PASS: unrelated packages and ambiguous OAuth clients are rejected.'
} finally {
  Remove-Item -LiteralPath $testFolder -Recurse -Force -ErrorAction SilentlyContinue
  [Environment]::SetEnvironmentVariable('TEYZA_FIRST_RELEASE_PASSWORD',$null,'Process')
  $script:SavedSecrets.Clear(); $script:FixturePassword=$null
}
