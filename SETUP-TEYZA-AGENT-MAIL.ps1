param([Parameter(Mandatory=$true)][string]$ManualPath)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$manual = (Resolve-Path -LiteralPath $ManualPath).Path
$cli = Join-Path $PSScriptRoot 'tools/app-first-release/node_modules/firebase-tools/lib/bin/firebase.js'
if (!(Test-Path -LiteralPath $cli)) { throw 'Install tools/app-first-release dependencies first using npm ci.' }
$region = (Read-Host 'Zoho data centre (us, eu, in, au, jp, ca)').Trim().ToLowerInvariant()
if ($region -notin @('us','eu','in','au','jp','ca')) { throw 'Unsupported data centre. Stop and check your Zoho mailbox URL.' }
function Read-Private([string]$prompt) { return [Net.NetworkCredential]::new('', (Read-Host $prompt -AsSecureString)).Password }
Write-Host 'Use the Zoho Self Client signed in as support@teyza.co.za. Scope: ZohoMail.accounts.READ,ZohoMail.messages.CREATE.'
Write-Host 'This sends one [TEST] welcome email with the PDF to support@teyza.co.za only, then stores the OAuth refresh credentials in Firebase Secret Manager.'
if ((Read-Host 'Type TEST to authorize that single internal email') -cne 'TEST') { throw 'Cancelled.' }
try {
 $client = Read-Private 'Zoho client ID'
 $secret = Read-Private 'Zoho client secret'
 $code = Read-Private 'Fresh Zoho grant code'
 $inputJson = @{region=$region;clientId=$client;clientSecret=$secret;code=$code} | ConvertTo-Json -Compress
 $config = ($inputJson | & node (Join-Path $PSScriptRoot 'services/teyza-mobile-v39/agent-welcome-setup.cjs') $manual | Out-String).Trim()
 if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($config)) { throw 'Zoho authorization or internal test failed. Nothing enabled.' }
 $config | & node $cli functions:secrets:set TEYZA_AGENT_MAIL_ZOHO --format=json --project business-lift-3c19c
 if ($LASTEXITCODE -ne 0) { throw 'Secret Manager write failed. Nothing enabled.' }
 Write-Host 'Check support@teyza.co.za for the [TEST] welcome message and open its PDF. Do not enable automatic mail until you verify it.'
} finally { $client=$null;$secret=$null;$code=$null;$inputJson=$null;$config=$null }
