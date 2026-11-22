#requires -Version 5.1
<# Enable welcomes and menu replies for newly approved, consenting sellers.
   Deploys only the webhook and the two approval workers to the existing project.
   The successful pilot uses the same approved template, image and sender.
#>
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $root
$project='business-lift-3c19c'
$expectedBranch='release/teyza-ads-web-qa-signed-20261111'
$envPath=Join-Path $root 'services\teyza-mobile-v39\.env.business-lift-3c19c'
$firebase=Join-Path $root 'tools\admin-release\node_modules\firebase-tools\lib\bin\firebase.js'
if((git branch --show-current).Trim() -ne $expectedBranch){throw 'Pull the merged release branch before deploying.'}
if($LASTEXITCODE -ne 0){throw 'Git branch check failed.'}
if(git status --porcelain --untracked-files=no){throw 'Commit or stash tracked local edits before deploying the release.'}
if(!(Test-Path $firebase)){throw 'Install the pinned tools/admin-release dependencies first.'}
if(!(Test-Path $envPath)){throw 'Existing project .env file is required; unrelated configuration will be preserved.'}
if(!(Test-Path (Join-Path $root 'services\teyza-mobile-v39\whatsapp-rollout.js'))){throw 'General rollout source missing. Pull the merged release.'}
& node --test services/teyza-mobile-v39/whatsapp-approval.test.js services/teyza-mobile-v39/whatsapp-pilot-routing.test.js services/teyza-mobile-v39/whatsapp-webhook.test.js services/teyza-mobile-v39/optional-whatsapp-gate.test.js
if($LASTEXITCODE -ne 0){throw 'WhatsApp regression tests failed.'}
$original=[IO.File]::ReadAllText($envPath)
if($original -match '(?m)^TEYZA_ADMIN_DEPLOY_ONLY=1\s*$'){throw 'Admin-only discovery override hides the WhatsApp workers.'}
$required=@{
 'TEYZA_WHATSAPP_PHONE_NUMBER_ID'='1466599163197469'
 'TEYZA_WHATSAPP_API_VERSION'='v26.0'
 'TEYZA_WHATSAPP_TEMPLATE_NAME'='teyza_seller_welcome_menu'
 'TEYZA_WHATSAPP_TEMPLATE_LANGUAGE'='en'
 'TEYZA_WHATSAPP_TEMPLATE_HEADER_IMAGE'='true'
 'TEYZA_WHATSAPP_TEMPLATE_BODY_FIELDS'='ownerFirstName,shopName'
}
foreach($key in $required.Keys){
 $value=[regex]::Match($original,"(?m)^$key=([^\r\n]+)").Groups[1].Value.Trim().Trim('"').Trim("'")
 if($value -ne $required[$key]){throw "Existing pilot setting does not match the tested sender/template: $key"}
}
$image=[regex]::Match($original,'(?m)^TEYZA_WHATSAPP_TEMPLATE_HEADER_IMAGE_URL=([^\r\n]+)').Groups[1].Value.Trim().Trim('"').Trim("'")
if($image -notmatch '^https://(www\.)?teyza\.co\.za/'){throw 'The tested welcome image must use Teyza HTTPS hosting.'}
$response=Invoke-WebRequest -Uri $image -Method Head -UseBasicParsing -MaximumRedirection 3
if([int]$response.StatusCode -ne 200 -or $response.Headers['Content-Type'] -notmatch 'image/jpeg'){throw 'Welcome JPEG image is unavailable.'}
foreach($key in @('TEYZA_WHATSAPP_WEBHOOK_VERIFY_TOKEN','TEYZA_WHATSAPP_APP_SECRET','TEYZA_WHATSAPP_ACCESS_TOKEN')){
 & gcloud secrets describe $key --project $project --format='value(name)' | Out-Null
 if($LASTEXITCODE -ne 0){throw "Required WhatsApp secret is unavailable: $key"}
}
$existing=[regex]::Match($original,'(?m)^TEYZA_WHATSAPP_GENERAL_STARTED_AT=([0-9]+)\s*$')
$startedAt=[DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
if($existing.Success -and [long]$existing.Groups[1].Value -gt 0){$startedAt=[long]$existing.Groups[1].Value}
$updates=[ordered]@{
 'TEYZA_WHATSAPP_NOTIFICATIONS_ENABLED'='1'
 'TEYZA_WHATSAPP_ROLLOUT_MODE'='general'
 'TEYZA_WHATSAPP_GENERAL_STARTED_AT'=[string]$startedAt
}
$modified=$original
foreach($key in $updates.Keys){$modified=[regex]::Replace($modified,"(?m)^$key=.*\r?\n?",'')}
$modified=$modified.TrimEnd()+"`r`n"
foreach($key in $updates.Keys){$modified+="$key=$($updates[$key])`r`n"}
$backup="$envPath.whatsapp-general-backup-$(Get-Date -Format yyyyMMddHHmmss)"
Copy-Item $envPath $backup
# Keep the same cutoff in the local config, including after a partial failure.
# Repeating deployment must not silently exclude approvals created meanwhile.
[IO.File]::WriteAllText($envPath,$modified)
$env:FUNCTIONS_DISCOVERY_TIMEOUT='60'
$scope='functions:teyza-mobile:teyzaWhatsAppWebhook,functions:teyza-mobile:teyzaWhatsAppApprovalCreated,functions:teyza-mobile:teyzaWhatsAppApprovalPending'
& node $firebase deploy --project $project --config firebase.teyza-mobile-v39.json --only $scope --non-interactive
if($LASTEXITCODE -ne 0){throw "Deployment failed or partially completed. Keep the current activation timestamp when retrying. Original configuration backup: $backup"}
Remove-Item $backup -Force
Write-Host 'General WhatsApp welcome delivery enabled for new approvals. Check the next approval outbox and signed delivery receipt.'
