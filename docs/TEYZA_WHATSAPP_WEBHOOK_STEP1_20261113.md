# Step 1 — Teyza WhatsApp Cloud API webhook (isolated release)

## Scope
Creates `teyzaWhatsAppWebhook` as a standalone, public Firebase Functions v2 HTTPS endpoint in `us-central1` under codebase `teyza-mobile`. The endpoint processes only Meta's handshake (GET) and signed WhatsApp Cloud API events (POST). It does **not** enable or deploy the `teyzaWhatsAppApprovalCreated` or `teyzaWhatsAppApprovalPending` outbound sender workers, WhatsApp login, or any Paystack function.

GET `hub.mode=subscribe` must include a verification token matching the Firebase Secret Manager `TEYZA_WHATSAPP_WEBHOOK_VERIFY_TOKEN`, and a numeric challenge. The endpoint returns the exact challenge only on success. POST must contain `X-Hub-Signature-256: sha256=<hex>` computed over raw request bytes with **Meta App Secret** stored in Firebase Secret Manager as `TEYZA_WHATSAPP_APP_SECRET`. Wrong, missing or malformed signatures get 403; malformed payloads get 400; unexpected HTTP methods get 405. Firestore failures return 503 to trigger Meta redelivery.

Each signed inbound message or status transition gets a deterministic hash ID and an atomic Firestore create in `teyzaWhatsAppWebhookEvents`. Meta retries do not duplicate records. Different delivery states can be recorded separately. Only a bounded `kind`, `eventType`, `receivedAt`, schema version and source are saved. Message contents, phone numbers, contact data, raw payload and provider message IDs are never persisted. This first iteration does **not** automatically reply, map inbound conversations to users or update existing outgoing message records. A future reviewed PR can implement these safely. Admin > WhatsApp delivery lists only aggregated sample counts via its recent-admin-only API.

## Prerequisites
1. Review and merge the PR after backend/admin CI passes. Keep outbound WhatsApp notifications disabled.
2. Have Firebase CLI authentication with permission to set secrets and deploy Gen 2 functions, and `gcloud` installed for retrieving the deployed function URL.
3. In Meta App Dashboard > App settings > Basic obtain the **Meta App Secret**, not Facebook Client Token and not WhatsApp Cloud API Access Token. Treat it as privileged. A separate random Verify Token is your own secret value that must match the token entered in Meta.
4. Do **not** paste either secret in GitHub, chat, logs, committed .env files or admin pages.

## Windows PowerShell — configure secrets
Execute from `$HOME\Downloads\Business-lift` after the reviewed merge is pulled. Generate a random verification token and copy it to the clipboard for the **interactive** Firebase prompt. Keep it safely in your approved password manager for later Meta setup. Firebase Secret Manager versions are not automatically exposed to other functions.

```powershell
$ErrorActionPreference='Stop'
Set-Location "$HOME\Downloads\Business-lift"
$firebase = '.\tools\admin-release\node_modules\firebase-tools\lib\bin\firebase.js'
if (-not (Test-Path $firebase)) { npm ci --prefix .\tools\admin-release --no-audit --no-fund }
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed' }
$bytes = New-Object byte[] 32
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
$verifyToken = -join ($bytes | ForEach-Object { $_.ToString('x2') })
Set-Clipboard -Value $verifyToken
Write-Host 'Random webhook verification token copied to clipboard (not printed). Save it securely and paste into the Firebase prompt.'
node $firebase functions:secrets:set TEYZA_WHATSAPP_WEBHOOK_VERIFY_TOKEN --project business-lift-3c19c
if ($LASTEXITCODE -ne 0) { throw 'Verify Token secret creation failed' }
Write-Host 'Retrieve Meta App Secret from Meta App Settings > Basic. Do not use the WhatsApp access token or Facebook Client Token.'
node $firebase functions:secrets:set TEYZA_WHATSAPP_APP_SECRET --project business-lift-3c19c
if ($LASTEXITCODE -ne 0) { throw 'Meta App Secret creation failed' }
```

The Firebase CLI secret prompt is interactive; paste the verification token when prompted and then separately paste the **Meta App Secret** for the second prompt. For Meta's `Verify token` field, use the same `$verifyToken` you saved to a password manager, not the App Secret. Do not run `Get-Secret` or print either value.

## Windows PowerShell — isolated deployment and exact URL
Use a reviewed commit pin and a clean checkout. Avoid running `firebase deploy --only functions` or a command that deploys other Teyza functions.

```powershell
$ErrorActionPreference='Stop'
Set-Location "$HOME\Downloads\Business-lift"
git fetch origin
if ($LASTEXITCODE -ne 0) { throw 'Fetch failed' }
git switch release/teyza-ads-web-qa-signed-20261111
if ($LASTEXITCODE -ne 0) { throw 'Switch failed' }
git pull --ff-only origin release/teyza-ads-web-qa-signed-20261111
if ($LASTEXITCODE -ne 0) { throw 'Pull failed' }
# Verify the expected reviewed merge SHA from the final PR review before deployment.
$firebase = '.\tools\admin-release\node_modules\firebase-tools\lib\bin\firebase.js'
node $firebase deploy --project business-lift-3c19c --config firebase.teyza-mobile-v39.json --only functions:teyza-mobile:teyzaWhatsAppWebhook
if ($LASTEXITCODE -ne 0) { throw 'Isolated webhook deploy failed' }
$callback = (gcloud functions describe teyzaWhatsAppWebhook --gen2 --region us-central1 --project business-lift-3c19c --format='value(serviceConfig.uri)').Trim()
if ($LASTEXITCODE -ne 0 -or -not $callback -or $callback -notmatch '^https://') { throw 'Could not verify exact webhook URL' }
Write-Host "META CALLBACK URL: $callback"
```

If gcloud is not installed, the Firebase CLI typically prints a Function URL after successful deployment; verify it against Firebase Console > Functions. Do not guess the URL. In Meta > WhatsApp > Basic setup > Production setup > Configure Webhooks, paste the URL and the **matching Verify Token**, then select `Verify and save` and subscribe to `messages`. Test with Meta's test event and one opted-in message. Do not publish outbound WhatsApp workers yet.

## Security and testing
Unit tests cover challenge, HMAC validation of raw bytes, changed/forged signatures, malformed JSON and unrelated objects, deduplication across redeliveries, separate delivery state transitions, privacy-safe storage, and Firestore failures. Production readiness requires a real Meta verification request, signed POST and admin diagnostics. A 200 for GET does **not** establish that production POST delivery works or that Meta subscriptions have been added.
