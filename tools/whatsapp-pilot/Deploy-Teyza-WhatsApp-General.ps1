#requires -Version 5.1
<#
 Deploy only the three isolated WhatsApp functions in business-lift-3c19c.
 Default is read-only preflight. An explicit opt-in enables notifications
 for NEW approved, verified-phone and consenting sellers after activation.
 No historical sends, blind retries, Paystack/backend/Hosting publication.
 Never paste API credentials into this script.

 .\tools\whatsapp-pilot\Deploy-Teyza-WhatsApp-General.ps1
 .\tools\whatsapp-pilot\Deploy-Teyza-WhatsApp-General.ps1 -EnableForNewApprovals -ConfirmMetaTemplateApproved -ConfirmConsentPilotSuccessful
#>
[CmdletBinding()]
param(
 [switch]$EnableForNewApprovals,
 [switch]$ConfirmMetaTemplateApproved,
 [switch]$ConfirmConsentPilotSuccessful
)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $root
$project='business-lift-3c19c'
$branch='release/teyza-ads-web-qa-signed-20261111'
$envPath=Join-Path $root 'services\teyza-mobile-v39\.env.business-lift-3c19c'
$firebase=Join-Path $root 'tools\admin-release\node_modules\firebase-tools\lib\bin\firebase.js'
if((git branch --show-current).Trim() -ne $branch){throw "Check out the merged reviewed release branch: $branch"}
if(-not (Test-Path $firebase)){throw 'Pinned firebase-tools missing. Install existing admin-release dependencies first.'}
if(-not (Test-Path $envPath)){throw 'Project environment file missing; refusing to invent runtime config.'}
if((Get-Content $envPath -Raw) -match '(?m)^TEYZA_ADMIN_DEPLOY_ONLY=1\s*$'){
 throw 'Admin-only deploy flag must not be enabled.'}
$source=Get-Content (Join-Path $root 'services\teyza-mobile-v39\whatsapp-approval.js') -Raw
if(-not $source.Contains('getRolloutMode') -or -not $source.Contains('getRolloutStartAt')){
 throw 'General sender source is missing. Pull the reviewed merged release.'}
& node --test 'services/teyza-mobile-v39/whatsapp-approval.test.js' 'services/teyza-mobile-v39/whatsapp-pilot-routing.test.js' 'services/teyza-mobile-v39/whatsapp-webhook.test.js' 'services/teyza-mobile-v39/optional-whatsapp-gate.test.js'
if($LASTEXITCODE -ne 0){throw 'WhatsApp regression tests failed; deployment prohibited.'}
foreach($key in @('TEYZA_WHATSAPP_ACCESS_TOKEN','TEYZA_WHATSAPP_WEBHOOK_VERIFY_TOKEN','TEYZA_WHATSAPP_APP_SECRET')){
 & gcloud secrets describe $key --project $project --format='value(name)' | Out-Null
 if($LASTEXITCODE -ne 0){throw "Missing expected Secret Manager secret $key"}
}
$original=[IO.File]::ReadAllText($envPath)
$required=@{
 'TEYZA_WHATSAPP_PHONE_NUMBER_ID'='^[0-9]{5,25}$'
 'TEYZA_WHATSAPP_API_VERSION'='^v[0-9]+\.[0-9]+$'
 'TEYZA_WHATSAPP_TEMPLATE_NAME'='^[a-z0-9_]+$'
 'TEYZA_WHATSAPP_TEMPLATE_LANGUAGE'='^[a-z]{2,3}(_[A-Z]{2})?$'
 'TEYZA_WHATSAPP_TEMPLATE_HEADER_IMAGE_URL'='^https://(www\.)?teyza\.co\.za/'
}
foreach($key in $required.Keys){
 $value=([regex]::Match($original,"(?m)^$key=([^\r\n]+)")).Groups[1].Value.Trim()
 if($value -notmatch $required[$key]){throw "Existing $key is absent or invalid."}
}
if(-not $EnableForNewApprovals){
 Write-Host 'Preflight PASS. No messages sent, no files modified and no Firebase functions deployed.' -ForegroundColor Green
 return
}
if(-not ($ConfirmMetaTemplateApproved -and $ConfirmConsentPilotSuccessful)){
 throw 'Activation requires both -ConfirmMetaTemplateApproved and -ConfirmConsentPilotSuccessful. Verify Meta APPROVED status and the real pilot before activation.'
}
# This activation date is a no-backfill barrier; never reset it on repeated deploys.
$existing=([regex]::Match($original,'(?m)^TEYZA_WHATSAPP_ALL_STARTED_AT=([^\r\n]+)')).Groups[1].Value
$start=if($existing -match '^[0-9]{13}$'){$existing}else{[string][DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()}
$updates=[ordered]@{
 'TEYZA_WHATSAPP_NOTIFICATIONS_ENABLED'='1'
 'TEYZA_WHATSAPP_ROLLOUT_MODE'='all'
 'TEYZA_WHATSAPP_ALL_STARTED_AT'=$start
}
$modified=$original
foreach($key in $updates.Keys){$modified=[regex]::Replace($modified,"(?m)^$key=.*\r?\n?",'')}
$modified=$modified.TrimEnd()+"`r`n"
foreach($key in $updates.Keys){$modified+="$key=$($updates[$key])`r`n"}
$backup="$envPath.before-whatsapp-general-$(Get-Date -Format yyyyMMddHHmmss)"
Copy-Item $envPath $backup
try {
 [IO.File]::WriteAllText($envPath,$modified)
 $env:FUNCTIONS_DISCOVERY_TIMEOUT='60'
 $scope='functions:teyza-mobile:teyzaWhatsAppWebhook,functions:teyza-mobile:teyzaWhatsAppApprovalCreated,functions:teyza-mobile:teyzaWhatsAppApprovalPending'
 & node $firebase deploy --project $project --config firebase.teyza-mobile-v39.json --only $scope --non-interactive
 if($LASTEXITCODE -ne 0){throw 'Scoped WhatsApp deploy failed. Inspect exact function logs; do not retry blindly.'}
 Write-Host "General WhatsApp enabled for new approved consenting sellers only, start $start." -ForegroundColor Green
 Write-Host "Operational settings retained in .env. Original backup: $backup"
} catch {
 Write-Warning 'Live deploy status may be partial. Preserve logs and existing .env for reconciliation.'
 throw
}
