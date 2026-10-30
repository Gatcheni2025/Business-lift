param(
  [ValidatePattern('^$|^[A-Fa-f0-9:]{40,95}$')][string]$AndroidSha1 = '',
  [ValidatePattern('^$|^[A-Fa-f0-9:]{64,95}$')][string]$AndroidSha256 = ''
)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$project = 'business-lift-3c19c'
function FirebaseJson([string[]]$Arguments) {
  $output = & firebase @Arguments --project $project --non-interactive --json
  if ($LASTEXITCODE -ne 0) { throw ('Firebase failed: ' + $Arguments[0] + '. Check firebase login and project permissions.') }
  $reply = ($output -join "`n") | ConvertFrom-Json
  if ($reply.status -ne 'success') { throw ('Firebase did not complete ' + $Arguments[0]) }
  return $reply.result
}
function FindNative([string]$Platform,[string]$Identity,[string]$Field,[string]$Flag) {
  $apps = @(FirebaseJson -Arguments @('apps:list',$Platform))
  $matching = @($apps | Where-Object { $_.$Field -eq $Identity })
  if ($matching.Count -gt 1) { throw ('Multiple native registrations match ' + $Identity + '. Select the intended native app in Firebase first.') }
  if ($matching.Count -eq 1) { return $matching[0] }
  return (FirebaseJson -Arguments @('apps:create',$Platform,'Teyza-Shopper',$Flag,$Identity))
}
Write-Host 'Connecting the existing Teyza project. No Hosting or legacy functions are deployed.'
$android = FindNative 'android' 'com.asiyedriver.asiye' 'packageName' '--package-name'
$ios = FindNative 'ios' 'za.co.teyza.shopper' 'bundleId' '--bundle-id'
if ($android.appId -notmatch '^1:983479810697:android:[a-fA-F0-9]+$' -or $ios.appId -notmatch '^1:983479810697:ios:[a-fA-F0-9]+$') {
  throw 'Unexpected Firebase native app identity. Nothing deployed.'
}
$config = @{ androidPackageName='com.asiyedriver.asiye'; androidAppId=$android.appId; iosAppId=$ios.appId; iosUrlScheme=('app-' + $ios.appId.Replace(':','-')) }
[System.IO.File]::WriteAllText((Join-Path $PSScriptRoot 'services/teyza-mobile-v39/native-config.json'),($config | ConvertTo-Json),[System.Text.UTF8Encoding]::new($false))
$variables = "TEYZA_FIREBASE_ANDROID_APP_ID=$($android.appId)`nTEYZA_FIREBASE_IOS_APP_ID=$($ios.appId)`n"
[System.IO.File]::WriteAllText((Join-Path $PSScriptRoot 'TEYZA-NATIVE-BUILD-VARIABLES.txt'),$variables,[System.Text.UTF8Encoding]::new($false))
if ($AndroidSha1) { $null = FirebaseJson -Arguments @('apps:android:sha:create',$android.appId,$AndroidSha1) }
if ($AndroidSha256) { $null = FirebaseJson -Arguments @('apps:android:sha:create',$android.appId,$AndroidSha256) }
& (Join-Path $PSScriptRoot 'SETUP-VERIFICATION-KEY.ps1')
& (Join-Path $PSScriptRoot 'DEPLOY-MOBILE.ps1')
Write-Host 'Mobile service health confirmed. Enable Authentication > Phone in Firebase, permit the intended SMS regions and register the installed APK signing SHA-1/SHA-256.'
Write-Host 'Use TEYZA-NATIVE-BUILD-VARIABLES.txt for future CI builds. iPhone release still requires APNs, distribution signing and a native rebuild.'
Write-Host 'Verify a real SMS, private document/selfie upload, completed seller listing and shopper product range on a physical phone before release.'
