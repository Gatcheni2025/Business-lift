param(
  [Parameter(Mandatory=$true)][ValidateSet('Android','iOS')][string]$Platform,
  [Parameter(Mandatory=$true)][string]$GoogleWebClientId,
  [string]$KeystorePath,
  [string]$CertificatePath,
  [string]$ProfilePath,
  [string]$AppleTeamId,
  [string]$GoogleIosClientId
)
$ErrorActionPreference = 'Stop'
$TeyzaRepository = 'Gatcheni2025/Business-lift'
$TeyzaGhCommand = Get-Command gh -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $TeyzaGhCommand) { throw 'Install GitHub CLI from https://cli.github.com, reopen PowerShell, then run gh auth login.' }
if ($GoogleWebClientId -notmatch '^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$') { throw 'Use the Google Web OAuth client ID for the existing Teyza Firebase project.' }

function Read-TeyzaPrivateValue([string]$Prompt) {
  $secure = Read-Host $Prompt -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
}
function Set-TeyzaSecret([string]$Name,[string]$Value) {
  # Secret values go through stdin, never command-line arguments or script output.
  $start = New-Object Diagnostics.ProcessStartInfo
  $start.FileName = $TeyzaGhCommand.Source
  $start.Arguments = 'secret set ' + $Name + ' --repo ' + $TeyzaRepository
  $start.UseShellExecute = $false
  $start.RedirectStandardInput = $true
  $process = [Diagnostics.Process]::Start($start)
  try {
    $process.StandardInput.Write($Value)
    $process.StandardInput.Close()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) { throw ('Could not save GitHub secret ' + $Name) }
  } finally { $process.Dispose() }
}
function Set-TeyzaVariable([string]$Name,[string]$Value) {
  gh variable set $Name --repo $TeyzaRepository --body $Value
  if ($LASTEXITCODE -ne 0) { throw ('Could not save GitHub variable ' + $Name) }
}
function Read-TeyzaFile([string]$FilePath,[string]$Label) {
  if ([string]::IsNullOrWhiteSpace($FilePath) -or -not (Test-Path -LiteralPath $FilePath -PathType Leaf)) { throw ('Choose the existing ' + $Label + ' file.') }
  return [Convert]::ToBase64String([IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $FilePath).Path))
}

# Validate/read the chosen files before making any repository changes.
if ($Platform -eq 'Android') {
  $fileValue = Read-TeyzaFile $KeystorePath 'Teyza upload keystore (.jks/.keystore)'
} else {
  if ($AppleTeamId -notmatch '^[A-Z0-9]{10}$') { throw 'Use the 10-character Apple Developer Team ID for the Teyza profile.' }
  if ($GoogleIosClientId -notmatch '^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$') { throw 'Use the Google iOS OAuth client ID for za.co.teyza.shopper.' }
  $fileValue = Read-TeyzaFile $CertificatePath 'Apple Distribution .p12 (certificate and private key)'
  $profileValue = Read-TeyzaFile $ProfilePath 'Teyza App Store distribution .mobileprovision'
}
gh auth status --hostname github.com
if ($LASTEXITCODE -ne 0) { throw 'Run gh auth login with your authorised GitHub account, then retry.' }

try {
  if ($Platform -eq 'Android') {
    $aliasValue = Read-Host 'Existing Teyza upload key alias'
    if ([string]::IsNullOrWhiteSpace($aliasValue)) { throw 'The upload key alias is required.' }
    $storePassword = Read-TeyzaPrivateValue 'Keystore password'
    if ([string]::IsNullOrEmpty($storePassword)) { throw 'The keystore password is required.' }
    $keyPassword = Read-TeyzaPrivateValue 'Key password (leave empty to use the keystore password)'
    if ([string]::IsNullOrEmpty($keyPassword)) { $keyPassword = $storePassword }
    Set-TeyzaSecret 'TEYZA_ANDROID_KEYSTORE_BASE64' $fileValue
    Set-TeyzaSecret 'TEYZA_ANDROID_STORE_PASSWORD' $storePassword
    Set-TeyzaSecret 'TEYZA_ANDROID_KEY_ALIAS' $aliasValue
    Set-TeyzaSecret 'TEYZA_ANDROID_KEY_PASSWORD' $keyPassword
  } else {
    $certificatePassword = Read-TeyzaPrivateValue 'Apple Distribution .p12 password'
    if ([string]::IsNullOrEmpty($certificatePassword)) { throw 'Export the .p12 with a password and use that password here.' }
    $random = New-Object byte[] 32
    $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $generator.GetBytes($random) } finally { $generator.Dispose() }
    $keychainPassword = [Convert]::ToBase64String($random)
    Set-TeyzaSecret 'TEYZA_IOS_CERTIFICATE_BASE64' $fileValue
    Set-TeyzaSecret 'TEYZA_IOS_CERTIFICATE_PASSWORD' $certificatePassword
    Set-TeyzaSecret 'TEYZA_IOS_PROFILE_BASE64' $profileValue
    Set-TeyzaSecret 'TEYZA_IOS_KEYCHAIN_PASSWORD' $keychainPassword
    Set-TeyzaVariable 'TEYZA_APPLE_TEAM_ID' $AppleTeamId
    Set-TeyzaVariable 'TEYZA_GOOGLE_IOS_CLIENT_ID' $GoogleIosClientId
  }
  Set-TeyzaVariable 'TEYZA_GOOGLE_WEB_CLIENT_ID' $GoogleWebClientId
  Write-Host 'Settings saved. Open Teyza signed Play Store and App Store files in GitHub Actions and re-run all jobs.'
} finally {
  $fileValue = $null; $profileValue = $null; $storePassword = $null; $keyPassword = $null
  $certificatePassword = $null; $keychainPassword = $null; $random = $null
}
