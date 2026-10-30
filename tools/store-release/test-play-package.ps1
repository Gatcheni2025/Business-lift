$ErrorActionPreference = 'Stop'
. "$PSScriptRoot/CONNECT-PLAY-PACKAGE.ps1" -DefinitionsOnly
$scratch = Join-Path ([IO.Path]::GetTempPath()) ('teyza-play-' + [Guid]::NewGuid().ToString('N'))
$priorProfile = $env:USERPROFILE
$script:Created = $false
$script:Fingerprints = @()
$script:Writes = @()
$script:AppId = '1:983479810697:android:aabbcc'
$script:SdkPackage = 'com.asiyedriver.asiye'
function firebase {
  $line = $args -join ' '
  $global:LASTEXITCODE = 0
  $result = $null
  if ($line.StartsWith('apps:list android')) {
    $result = @()
    if ($script:Created) { $result = @(@{packageName='com.asiyedriver.asiye';appId=$script:AppId}) }
  } elseif ($line.StartsWith('apps:create android Teyza Google Play --package-name com.asiyedriver.asiye')) {
    $script:Created = $true; $result = @{appId=$script:AppId}
  } elseif ($line.StartsWith('apps:android:sha:list')) {
    $result = @($script:Fingerprints | ForEach-Object { @{shaHash=$_} })
  } elseif ($line.StartsWith('apps:android:sha:create')) {
    $script:Fingerprints += $args[2]; $result = @{}
  } elseif ($line.StartsWith('apps:sdkconfig android')) {
    $config = @{project_info=@{project_id='business-lift-3c19c'};client=@(@{client_info=@{
      mobilesdk_app_id=$script:AppId;android_client_info=@{package_name=$script:SdkPackage}};oauth_client=@(@{client_type=3;client_id='fixture-web.apps.googleusercontent.com'})})}
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
    if ($sdk.client[0].client_info.android_client_info.package_name -ne 'com.asiyedriver.asiye') { throw 'Wrong SDK was uploaded.' }
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
  $algorithm = [Security.Cryptography.SHA256]::Create()
  try { $uploadSha = ([BitConverter]::ToString($algorithm.ComputeHash($cert.RawData))).Replace('-','') } finally { $algorithm.Dispose() }
  $rejected = $false
  try { Connect-TeyzaPlayPackage -UploadCertificateSha256 ('E'*64) -PlaySigningSha1 ('C'*40) -PlaySigningSha256 ('D'*64) } catch { $rejected = $true }
  if (-not $rejected -or $script:Created -or $script:Writes.Count -ne 0) { throw 'Mismatched Play certificate was not rejected before changes.' }
  Connect-TeyzaPlayPackage -UploadCertificateSha256 $uploadSha -PlaySigningSha1 ('C'*40) -PlaySigningSha256 ('D'*64)
  if (-not $script:Created -or $script:Fingerprints.Count -ne 4 -or $script:Writes.Count -ne 4) { throw 'Missing registration or configuration writes.' }
  Connect-TeyzaPlayPackage -UploadCertificateSha256 $uploadSha -PlaySigningSha1 ('C'*40) -PlaySigningSha256 ('D'*64)
  if ($script:Fingerprints.Count -ne 4) { throw 'Retry duplicated certificate registration.' }
  if ($script:Writes -match 'secret set TEYZA_ANDROID_KEYSTORE_BASE64') { throw 'Existing upload key was replaced.' }
  $before = $script:Writes.Count
  $script:SdkPackage = 'za.co.teyza.shopper'
  $rejected = $false
  try { Connect-TeyzaPlayPackage -UploadCertificateSha256 $uploadSha -PlaySigningSha1 ('C'*40) -PlaySigningSha256 ('D'*64) } catch { $rejected = $true }
  if (-not $rejected -or $script:Writes.Count -ne $before) { throw 'A different package SDK reached GitHub settings.' }
  Write-Host 'Existing Play package, upload/Play certificate registration, wrong-key/wrong-SDK rejection and safe retry tests passed.'
} finally {
  if ($cert) { $cert.Dispose() }; if ($rsa) { $rsa.Dispose() }
  $env:USERPROFILE = $priorProfile
  Remove-Item -LiteralPath $scratch -Recurse -Force -ErrorAction SilentlyContinue
}
