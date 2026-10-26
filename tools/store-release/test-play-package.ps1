$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/CONNECT-PLAY-PACKAGE.ps1" -DefinitionsOnly
$scratch = Join-Path ([IO.Path]::GetTempPath()) ('teyza-play-' + [Guid]::NewGuid().ToString('N'))
$priorProfile = $env:USERPROFILE
$script:Created = $false
$script:Fingerprints = @()
$script:Writes = @()
$script:AppId = '1:983479810697:android:aabbcc'
function firebase {
  $line = $args -join ' '
  $global:LASTEXITCODE = 0
  $result = $null
  if ($line.StartsWith('apps:list android')) {
    $result = @()
    if ($script:Created) { $result = @(@{packageName='za.co.teyza.shopper';appId=$script:AppId}) }
  } elseif ($line.StartsWith('apps:create android Teyza Google Play --package-name za.co.teyza.shopper')) {
    $script:Created = $true; $result = @{appId=$script:AppId}
  } elseif ($line.StartsWith('apps:android:sha:list')) {
    $result = @($script:Fingerprints | ForEach-Object { @{shaHash=$_} })
  } elseif ($line.StartsWith('apps:android:sha:create')) {
    $script:Fingerprints += $args[2]; $result = @{}
  } elseif ($line.StartsWith('apps:sdkconfig android')) {
    $config = @{project_info=@{project_id='business-lift-3c19c'};client=@(@{client_info=@{
      mobilesdk_app_id=$script:AppId;android_client_info=@{package_name='za.co.teyza.shopper'}}})}
    $result = @{fileContents=($config | ConvertTo-Json -Depth 8 -Compress)}
  } else { throw 'Unexpected Firebase call in test.' }
  @{status='success';result=$result} | ConvertTo-Json -Depth 10 -Compress
}
function gh {
  $line = $args -join ' '
  $script:Writes += $line
  $global:LASTEXITCODE = 0
  if ($line.StartsWith('secret set ')) {
    $encoded = (@($input) -join '').Trim()
    $sdk = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encoded)) | ConvertFrom-Json
    if ($sdk.client[0].client_info.android_client_info.package_name -ne 'za.co.teyza.shopper') { throw 'Wrong SDK was uploaded.' }
  }
}
try {
  $env:USERPROFILE = $scratch
  $dir = Join-Path $scratch 'Teyza-Signing'
  $null = New-Item -ItemType Directory -Path $dir -Force
  $rsa = [Security.Cryptography.RSA]::Create(2048)
  $req = New-Object Security.Cryptography.X509Certificates.CertificateRequest('CN=Disposable test key',$rsa,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.RSASignaturePadding]::Pkcs1)
  $cert = $req.CreateSelfSigned([DateTimeOffset]::UtcNow.AddDays(-1),[DateTimeOffset]::UtcNow.AddDays(1))
  $path = Join-Path $dir 'teyza-upload.cer'
  [IO.File]::WriteAllBytes($path,$cert.Export([Security.Cryptography.X509Certificates.X509ContentType]::Cert))
  Connect-TeyzaPlayPackage
  if (-not $script:Created -or $script:Fingerprints.Count -ne 2 -or $script:Writes.Count -ne 2) { throw 'Missing registration or configuration writes.' }
  Connect-TeyzaPlayPackage
  if ($script:Fingerprints.Count -ne 2) { throw 'Retry duplicated certificate registration.' }
  if ($script:Writes -match 'secret set TEYZA_ANDROID_KEYSTORE_BASE64') { throw 'Existing upload key was replaced.' }
  Write-Host 'Play-package registration, public SDK transfer and safe retry tests passed.'
} finally {
  if ($cert) { $cert.Dispose() }; if ($rsa) { $rsa.Dispose() }
  $env:USERPROFILE = $priorProfile
  Remove-Item -LiteralPath $scratch -Recurse -Force -ErrorAction SilentlyContinue
}
