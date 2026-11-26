param([Parameter(Mandatory=$true)][string]$ManualPath)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
$manual=(Resolve-Path -LiteralPath $ManualPath).Path
$cli=Join-Path $PSScriptRoot 'tools/app-first-release/node_modules/firebase-tools/lib/bin/firebase.js'
if (!(Test-Path -LiteralPath $cli)) { throw 'Install tools/app-first-release dependencies first using npm ci.' }
$source=Join-Path $PSScriptRoot 'services/teyza-mobile-v39'
& node --test (Join-Path $source 'agent-welcome-mail.test.js')
if ($LASTEXITCODE -ne 0) { throw 'Welcome-mail unit tests failed. Nothing deployed.' }
& node -e "const fs=require('node:fs');require(process.argv[1]).validatePdf(fs.readFileSync(process.argv[2]));" (Join-Path $source 'agent-welcome-mail.js') $manual
if ($LASTEXITCODE -ne 0) { throw 'Training manual is not a valid PDF. Nothing deployed.' }
& node $cli functions:secrets:get TEYZA_AGENT_MAIL_ZOHO --project business-lift-3c19c | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Complete Zoho setup first. Nothing deployed.' }
Write-Host 'Deploy only the isolated teyza-agent-mail codebase. Before deploying, confirm the Firestore control document is absent or enabled=false. Existing app, hosting, rules and payment functions are excluded.'
if ((Read-Host 'Type DEPLOY to confirm control is OFF and deploy the isolated worker') -cne 'DEPLOY') { throw 'Cancelled.' }
$stage=Join-Path ([IO.Path]::GetTempPath()) ('teyza-agent-mail-'+[guid]::NewGuid().ToString('N'))
try {
 $dest=Join-Path $stage 'functions'
 New-Item -ItemType Directory -Path $dest -Force | Out-Null
 foreach($name in @('agent-welcome-mail.js','package.json','package-lock.json')) { Copy-Item -LiteralPath (Join-Path $source $name) -Destination $dest }
 Copy-Item -LiteralPath (Join-Path $source 'index.agent-mail-only.js') -Destination (Join-Path $dest 'index.js')
 Copy-Item -LiteralPath $manual -Destination (Join-Path $dest 'Teyza_Field_Agent_Training_Manual.pdf')
 $cfg=Join-Path $stage 'firebase.json'
 '{"functions":[{"source":"functions","codebase":"teyza-agent-mail","runtime":"nodejs22","ignore":["node_modules",".git","firebase-debug.log","firebase-debug.*.log"]}]}' | Set-Content -LiteralPath $cfg -Encoding ascii
 npm ci --prefix $dest --omit=dev --ignore-scripts --no-audit --no-fund
 if ($LASTEXITCODE -ne 0) { throw 'Isolated worker dependency installation failed.' }
 & node $cli deploy --config $cfg --only functions:teyza-agent-mail --project business-lift-3c19c
 if ($LASTEXITCODE -ne 0) { throw 'Isolated welcome worker deployment failed. Keep the control OFF.' }
 Write-Host 'Worker deployed. Automatic sending is OFF until the private control document is explicitly enabled. Follow the verification and rollout checklist in docs/TEYZA_AGENT_WELCOME_MAIL_20261126.md.'
} finally { if(Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force } }
