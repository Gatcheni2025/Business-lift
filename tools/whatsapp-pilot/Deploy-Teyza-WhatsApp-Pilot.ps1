#requires -Version 5.1
<#
Deploy ONLY the secure inbound webhook, or the two explicitly enabled
single-seller WhatsApp approval workers. Never deploy teyzaMobile or Hosting.
Usage, AFTER PR #164 is merged:
  .\tools\whatsapp-pilot\Deploy-Teyza-WhatsApp-Pilot.ps1 -PilotSellerUid "UID" -DeployWebhook
  .\tools\whatsapp-pilot\Deploy-Teyza-WhatsApp-Pilot.ps1 -PilotSellerUid "UID" -EnableWorkers -ConfirmPilotReady
#>
[CmdletBinding()]
param(
 [Parameter(Mandatory=$true)][ValidatePattern('^[A-Za-z0-9_-]{6,128}$')][string]$PilotSellerUid,
 [Parameter(ParameterSetName='Webhook')][switch]$DeployWebhook,
 [Parameter(ParameterSetName='Workers')][switch]$EnableWorkers,
 [Parameter(ParameterSetName='Workers')][switch]$ConfirmPilotReady
)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $root
$repo='Gatcheni2025/Business-lift'
$project='business-lift-3c19c'
$expectedBranch='release/teyza-ads-web-qa-signed-20261111'
$envPath=Join-Path $root 'services\teyza-mobile-v39\.env.business-lift-3c19c'
$firebase=Join-Path $root 'tools\admin-release\node_modules\firebase-tools\lib\bin\firebase.js'
$banner='https://teyza.co.za/assets/app/social-preview.jpg'
$manifest=Join-Path $root 'services\teyza-mobile-v39\package.json'
if(!(Test-Path $firebase)){throw 'Pinned Firebase CLI missing. Install the pinned admin-release dependencies first.'}
if(!(Test-Path $manifest)){throw 'Teyza functions source missing.'}
if(!(Test-Path (Join-Path $root 'services\teyza-mobile-v39\whatsapp-pilot-routing.js'))){
 throw 'Pilot routing source missing. Checkout the reviewed merged release branch.'}
if((git branch --show-current).Trim() -ne $expectedBranch){throw 'Checkout the reviewed release branch first.'}
if($LASTEXITCODE -ne 0){throw 'Git branch check failed.'}
$prState=(gh pr view 164 --repo $repo --json state --jq '.state').Trim()
if($LASTEXITCODE -ne 0 -or $prState -ne 'MERGED'){
 throw 'PR #164 must be merged and pulled before any live deployment.'}
if((node -p "require('./services/teyza-mobile-v39/package.json').main").Trim() -ne 'index.js'){
 throw 'Functions manifest is not the expected original index.js.'}
# Verify the real public image bytes rather than only trusting a source path.
$head=Invoke-WebRequest -Uri $banner -Method Head -UseBasicParsing -MaximumRedirection 3
if([int]$head.StatusCode -ne 200 -or $head.Headers['Content-Type'] -notmatch 'image/jpeg'){
 throw "Welcome image must serve HTTP 200 image/jpeg at $banner"}
$tmp=[IO.Path]::GetTempFileName()
try{
 Invoke-WebRequest -Uri $banner -OutFile $tmp -UseBasicParsing -MaximumRedirection 3 | Out-Null
 $bytes=[IO.File]::ReadAllBytes($tmp)
 if($bytes.Length -lt 1024 -or $bytes[0] -ne 255 -or $bytes[1] -ne 216 -or
   $bytes[$bytes.Length-2] -ne 255 -or $bytes[$bytes.Length-1] -ne 217){
  throw 'Welcome image is not a valid JPEG file.'}
}finally{Remove-Item $tmp -Force -ErrorAction SilentlyContinue}
Write-Host "Public JPEG header is reachable and verified: $banner"
foreach($key in @('TEYZA_WHATSAPP_WEBHOOK_VERIFY_TOKEN','TEYZA_WHATSAPP_APP_SECRET')){
 gcloud secrets describe $key --project $project --format='value(name)' | Out-Null
 if($LASTEXITCODE -ne 0){throw "Required webhook secret not provisioned: $key"}
}
if($EnableWorkers){
 if(!$ConfirmPilotReady){throw 'Add -ConfirmPilotReady after checking approved template, OTP, consent and test seller.'}
 gcloud secrets describe TEYZA_WHATSAPP_ACCESS_TOKEN --project $project --format='value(name)' | Out-Null
 if($LASTEXITCODE -ne 0){throw 'Sender access-token secret has not been provisioned.'}
}
if(!$DeployWebhook -and !$EnableWorkers){
 Write-Host 'Read-only checks succeeded. Specify -DeployWebhook or -EnableWorkers explicitly.'
 return
}
if(!(Test-Path $envPath)){throw 'Current project .env file not found; refusing to overwrite unknown configuration.'}
$env:FUNCTIONS_DISCOVERY_TIMEOUT='60'
# Preserve every existing Paystack and other environment setting.
$original=[IO.File]::ReadAllText($envPath)
if($original -match '(?m)^TEYZA_ADMIN_DEPLOY_ONLY=1\s*$'){
 throw 'Admin-only discovery override is enabled. WhatsApp worker exports are hidden.'
}
$workerFlag = '0'
if($EnableWorkers){ $workerFlag = '1' }
$updates=[ordered]@{
 'TEYZA_WHATSAPP_NOTIFICATIONS_ENABLED'=$workerFlag
 'TEYZA_WHATSAPP_PILOT_SELLER_UID'=$PilotSellerUid
 'TEYZA_WHATSAPP_PHONE_NUMBER_ID'='1466599163197469'
 'TEYZA_WHATSAPP_API_VERSION'='v26.0'
 'TEYZA_WHATSAPP_TEMPLATE_NAME'='teyza_seller_welcome_menu'
 'TEYZA_WHATSAPP_TEMPLATE_LANGUAGE'='en'
 'TEYZA_WHATSAPP_TEMPLATE_HEADER_IMAGE'='true'
 'TEYZA_WHATSAPP_TEMPLATE_HEADER_IMAGE_URL'=$banner
 'TEYZA_WHATSAPP_TEMPLATE_BODY_FIELDS'='ownerFirstName,shopName'
}
# Only approval records created AFTER worker activation may be attempted.
if($EnableWorkers){
 $updates['TEYZA_WHATSAPP_PILOT_STARTED_AT']=[string][DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
}else{
 $existing=[regex]::Match($original,'(?m)^TEYZA_WHATSAPP_PILOT_STARTED_AT=([^\r\n]+)')
 if($existing.Success){$updates['TEYZA_WHATSAPP_PILOT_STARTED_AT']=$existing.Groups[1].Value}
}
$modified=$original
foreach($key in $updates.Keys){
 $modified=[regex]::Replace($modified,"(?m)^$key=.*\r?\n?",'')
}
$modified=$modified.TrimEnd()+"`r`n"
foreach($key in $updates.Keys){$modified+="$key=$($updates[$key])`r`n"}
$backup="$envPath.whatsapp-pilot-backup-$(Get-Date -Format yyyyMMddHHmmss)"
Copy-Item $envPath $backup
try{
 [IO.File]::WriteAllText($envPath,$modified)
 if($EnableWorkers){
  $scope='functions:teyza-mobile:teyzaWhatsAppWebhook,functions:teyza-mobile:teyzaWhatsAppApprovalCreated,functions:teyza-mobile:teyzaWhatsAppApprovalPending'
 }else{
  $scope='functions:teyza-mobile:teyzaWhatsAppWebhook'
 }
 Write-Host "Deploying only $scope to $project"
 & node $firebase deploy --project $project --config firebase.teyza-mobile-v39.json --only $scope --non-interactive
 if($LASTEXITCODE -ne 0){throw 'Firebase deploy failed. Do not retry blindly.'}
 Write-Host 'Scope-limited WhatsApp deployment completed.'
}finally{
 [IO.File]::WriteAllText($envPath,$original)
 Remove-Item $backup -Force -ErrorAction SilentlyContinue
 Write-Host 'Original local .env restored.'
}
