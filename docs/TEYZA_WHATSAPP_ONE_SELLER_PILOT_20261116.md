# Teyza WhatsApp — one-seller pilot (PR #164)

This PR deliberately does not enable WhatsApp sending in production. Use the existing WABA and sender; do **not** create a new Meta app, rotate Google Play keys, or alter R99/Paystack.

## 1. Verified implementation assumptions

- WABA: `1223581796908043`; sender Phone Number ID: `1466599163197469`; registered number: `+27 79 826 1972`.
- Meta template: `teyza_seller_welcome_menu`, English (`en`), Marketing, active at last UI inspection. IMAGE header, body `{{1}}` seller first name, `{{2}}` shop name, and **static** quick-reply buttons `Start selling on Teyza`, `Advertise on Teyza`, `Talk to consultant`. Static buttons do not need outgoing button payload parameters.
- Existing site JPEG source path: `assets/app/social-preview.jpg` and `web/app-first/public/assets/app/social-preview.jpg`, proposed URL `https://teyza.co.za/assets/app/social-preview.jpg`. **Do not consider it live-verified until the deployment script downloads and validates HTTP 200 JPEG bytes from that exact URL.** This is a preexisting brand banner rather than the Meta template's uploaded sample image.
- The image link must be publicly accessible to Meta without authentication, valid certificate, correct `image/jpeg` and actual JPEG bytes. If URL fails, publish the reviewed asset using the normal website Hosting release, and rerun this preflight; do not bypass the check.
- Graph API v26.0 is configured for the pilot and is still supported by Meta as of November 2026; confirm the Meta app supports it before enabling sends.
- Meta webhook GET challenge was verified earlier, but no signed POST traffic had been observed at last check. **Receiving a verified POST is a separate launch prerequisite.**

## 2. Inbound webhook routing

A signed POST is deduplicated by the webhook before the pilot handler. The pilot action router accepts only the one configured `TEYZA_WHATSAPP_PILOT_SELLER_UID`, matching the current account number and current preferences. It does not retain sender phone, free-form text or raw Meta messages.

| Quick reply | Recorded private route | Operational handoff |
|---|---|---|
| Start selling on Teyza | `start_selling` | `/seller-getting-started.html` |
| Advertise on Teyza | `advertise` | `/ads/` |
| Talk to consultant | `consultant` | Creates `teyzaSupportTickets/wa_<hashed_event>` for the existing authenticated admin support list |
| STOP text | `stop` | Immediately sets `teyzaWhatsAppPreferences/{uid}.optedIn=false`, clears its phone and records `optedOutAt` |

All action receipts are written to `teyzaWhatsAppPilotActions/{sha256}` without PII. STOP and button events are idempotent under repeated Meta callbacks. The handler **routes to Teyza's services**; it does not send unreviewed automated chatbot replies or external payment links to app users. Support staff can handle the consultant ticket from the existing admin system.

Signed status callbacks update `deliveryStatus` and `deliveryStatusAt` on the matching pilot-approved outbox message. `accepted` from Meta is **not** a delivery confirmation.

## 3. Outbound safety boundaries

The two existing optional workers `teyzaWhatsAppApprovalCreated` and `teyzaWhatsAppApprovalPending` remain behind `TEYZA_WHATSAPP_NOTIFICATIONS_ENABLED=1`. Both use `TEYZA_WHATSAPP_PILOT_SELLER_UID` and `TEYZA_WHATSAPP_PILOT_STARTED_AT` to reject other sellers or old queued approvals. The scheduled worker queries only the pilot seller. No outbound send may occur without current approval, current OTP verification on the same Firebase UID, an opted-in matching number, approved current verification submission, an approved Meta template and valid token. A single provider attempt is made; uncertain responses require manual review, not blind retry.

This also means an **already completed** seller approval will not be sent merely because the worker is deployed. For the pilot, complete a legitimate new seller approval *after* workers are enabled. Never fabricate a new approval, bypass compliance, or change a seller's Firestore `optedIn` value manually.

## 4. Safe PowerShell deployment (after PR merged and reviewed)

1. First check that PR #164 is merged, and pull its merge commit into `release/teyza-ads-web-qa-signed-20261111`. Do not overwrite the locally modified billing JavaScript files or Hosting backups; use a clean worktree if needed.
2. Ensure pinned `tools/admin-release/node_modules/firebase-tools/lib/bin/firebase.js` is available. Confirm Firebase Secret Manager secrets `TEYZA_WHATSAPP_WEBHOOK_VERIFY_TOKEN`, `TEYZA_WHATSAPP_APP_SECRET`, and, before sending, `TEYZA_WHATSAPP_ACCESS_TOKEN` exist and contain active credentials. Rotate previously exposed Meta tokens. Do not paste token values into chat or GitHub.
3. Verify the approved template has not been altered since the screenshots.
4. Obtain the **single test seller's Firebase UID**, verify their consent is genuine, mobile verified, business approved, and WhatsApp active. Do not use the WhatsApp Phone Number ID as the seller UID.
5. Run, from the repo root:
   ```powershell
   $uid = 'PASTE_REAL_APPROVED_TEST_SELLER_FIREBASE_UID'
   .\tools\whatsapp-pilot\Deploy-Teyza-WhatsApp-Pilot.ps1 -PilotSellerUid $uid
   .\tools\whatsapp-pilot\Deploy-Teyza-WhatsApp-Pilot.ps1 -PilotSellerUid $uid -DeployWebhook
   ```
   The first command is a **no-write** public-image/secret check. The second updates only `teyzaWhatsAppWebhook` with the pilot route config; sender workers still OFF. Existing `teyzaMobile` billing settings are not deployed.
6. Send a fresh WhatsApp message to the Teyza registered number from the test phone, verify an HTTP 200 POST in the Cloud Run `teyzawhatsappwebhook` logs, and inspect the Firestore `teyzaWhatsAppWebhookEvents` collection. Do not continue if no POST was received.
7. Then, only after explicit operator confirmation:
   ```powershell
   .\tools\whatsapp-pilot\Deploy-Teyza-WhatsApp-Pilot.ps1 -PilotSellerUid $uid -EnableWorkers -ConfirmPilotReady
   ```
   This deploys only three explicitly named WhatsApp functions (webhook + two workers), leaves other functions and Hosting unchanged, and starts the cutoff at the current UTC time. **Only approvals created after this point are eligible.** Review a real approval for this test seller, not a prior approval.
8. Inspect `teyzaWhatsAppApprovalOutbox` for `queued` then `accepted` and Meta's `wamid`; wait for `deliveryStatus:delivered` / `read` via signed webhook, and ask seller to confirm the actual phone received the message. Test each quick reply and STOP; verify no further sends after STOP. One-seller limit must stay in place until a separate reviewed rollout.
9. To halt any further new sends, disable the two optional worker functions via a separate reviewed deployment or secure operator action; do not simply clear consent records for unrelated sellers.

### Important deployment boundary

Firebase reads `services/teyza-mobile-v39/.env.business-lift-3c19c` for deployed functions. The PowerShell helper temporarily adds the pilot's nonsecret variables, uses `FUNCTIONS_DISCOVERY_TIMEOUT=60`, runs exact `--only` targets, and restores the original local .env on completion; it does not commit local credentials or modify Paystack. If discovery times out, check Node runtime and build logs before retrying.

## 5. Check results before merger

- `npm test --prefix services/teyza-mobile-v39`: must pass all existing backend tests plus pilot routing/consent/receipt tests.
- Flutter/Android/iOS/build workflow checks must also pass under repository rules. The legacy PR #97 test APK signing key is separate from the existing successful production upload key; do not use the Play upload private key as a substitute.
- PR #163 (explicit signup opt-in screen) is still a separate feature and should be released before general seller onboarding is advertised. The existing registration consent API supports the pilot.
