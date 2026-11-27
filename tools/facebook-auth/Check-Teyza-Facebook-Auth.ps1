#requires -Version 5.1
<#
Teyza Facebook Login - read-only local verification.
Prints known public redirect settings and (optionally) the Meta Android key
hash for a signed APK or an existing certificate SHA-1 fingerprint.
Never reads or uploads a keystore, token, Facebook app secret or user session.

Examples:
  .\Check-Teyza-Facebook-Auth.ps1
  .\Check-Teyza-Facebook-Auth.ps1 -ApkPath "$HOME\Downloads\Teyza-Release-1.0.40-51\Android-APK\my-app.apk"
  .\Check-Teyza-Facebook-Auth.ps1 -CertificateSha1 "AA:BB:CC:..."
#>
[CmdletBinding()]
param(
    [string]$ApkPath = '',
    [string]$CertificateSha1 = ''
)
$ErrorActionPreference='Stop'
$expectedProject='business-lift-3c19c'
$expectedAuthDomain="$expectedProject.firebaseapp.com"
$expectedRedirect="https://$expectedAuthDomain/__/auth/handler"
$expectedMetaId='1410815954487567'
$expectedAndroidPackage='com.asiyedriver.asiye'
$expectedIosBundle='za.co.teyza.shopper'

function Convert-Sha1HexToMetaKeyHash([string]$hex) {
    $clean = $hex -replace '[^0-9a-fA-F]', ''
    if ($clean -notmatch '^[0-9a-fA-F]{40}$') {
        throw 'Use a 40-hex-character SHA-1 certificate fingerprint. Do not enter the SHA-256 fingerprint.'
    }
    $bytes = New-Object byte[] 20
    for($i=0;$i -lt 20;$i++) {
        $bytes[$i]=[Convert]::ToByte($clean.Substring($i*2,2),16)
    }
    return [Convert]::ToBase64String($bytes)
}

Write-Host 'TEYZA FACEBOOK LOGIN - REQUIRED META CONFIGURATION' -ForegroundColor Cyan
Write-Host "Meta App ID: $expectedMetaId"
Write-Host "Firebase Project: $expectedProject"
Write-Host "Valid OAuth Redirect URI: $expectedRedirect"
Write-Host "Website App Domain: teyza.co.za"
Write-Host "Android package: $expectedAndroidPackage"
Write-Host "iOS bundle ID: $expectedIosBundle"
Write-Host "iOS callback scheme: fb$expectedMetaId"

$repoRoot=Join-Path $HOME 'Downloads\Business-lift'
if(Test-Path (Join-Path $repoRoot '.git')) {
    foreach($file in @('web\app-first\public\js\seller-web-billing.mjs',
                       'web\app-first\public\js\ads-web-billing.mjs')) {
        $path=Join-Path $repoRoot $file
        if(!(Test-Path $path)) {
            Write-Warning "Local copy not found: $file. Use approved GitHub version to inspect."
            continue
        }
        $text=Get-Content $path -Raw
        if($text -notmatch [regex]::Escape($expectedAuthDomain)) {
            Write-Warning "Local $file does not reference the expected Firebase auth domain. Inspect before modifying live website."
        } else {
            Write-Host "Local source matches Firebase auth domain: $file" -ForegroundColor Green
        }
    }
} else {
    Write-Host 'Local Git checkout not present; production callback is shown above.' -ForegroundColor Yellow
}

if($ApkPath -and $CertificateSha1) {
    throw 'Use either -ApkPath OR -CertificateSha1, not both.'
}
if($ApkPath) {
    if(!(Test-Path -LiteralPath $ApkPath -PathType Leaf)) {
        throw "APK path does not exist: $ApkPath"
    }
    $sdkCandidates=@(
        "$env:ANDROID_HOME\build-tools",
        "$env:ANDROID_SDK_ROOT\build-tools",
        "$env:LOCALAPPDATA\Android\Sdk\build-tools"
    ) | Where-Object {$_ -and (Test-Path $_)}
    $signers=@()
    foreach($sdk in $sdkCandidates) {
        $signers+=@(Get-ChildItem -LiteralPath $sdk -Filter 'apksigner.bat' -File -Recurse -ErrorAction SilentlyContinue)
        $signers+=@(Get-ChildItem -LiteralPath $sdk -Filter 'apksigner' -File -Recurse -ErrorAction SilentlyContinue)
    }
    $signer=$signers | Sort-Object FullName -Descending | Select-Object -First 1
    if(!$signer) {
        throw 'Android SDK apksigner not found. Use -CertificateSha1 with the fingerprint from Play Console instead.'
    }
    $cert=@(& $signer.FullName verify --print-certs (Resolve-Path -LiteralPath $ApkPath).Path 2>&1)
    if($LASTEXITCODE -ne 0) {throw 'APK signing certificate verification failed. No key hash printed.'}
    $log=$cert -join "`n"
    $result=[regex]::Match($log,'(?im)Signer #\d+ certificate SHA-1 digest:\s*([0-9a-fA-F:]+)')
    if(!$result.Success) {
        throw 'Could not locate the APK signer certificate SHA-1 fingerprint.'
    }
    $CertificateSha1=$result.Groups[1].Value
}
if($CertificateSha1) {
    $hash=Convert-Sha1HexToMetaKeyHash $CertificateSha1
    Write-Host 'ANDROID META KEY HASH (base64 of SHA-1 signing certificate):' -ForegroundColor Green
    Write-Host $hash
    Write-Host 'Add this under Meta -> Teyza App -> Settings -> Basic -> Android -> Key Hashes.'
    Write-Host 'The Play-installed app and directly installed APK may have DIFFERENT signing certificates.'
} else {
    Write-Host 'To calculate an Android key hash, pass -ApkPath OR -CertificateSha1.'
    Write-Host 'For Play-installed builds, use the app-signing SHA-1 from Play Console -> App integrity.'
}
Write-Host 'No Meta/Firebase settings were changed. This diagnostic is READ-ONLY.' -ForegroundColor Cyan
