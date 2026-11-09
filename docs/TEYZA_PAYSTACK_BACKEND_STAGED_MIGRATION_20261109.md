# Teyza backend-only Paystack migration — staged and payment-disabled
Date: 2026-11-09

## Verified production inputs
- Paystack live merchant plan: `PLN_ud5m0sza4kmr31f`, ZAR 99.00/month, interval monthly, unlimited cycles. Verified directly against the Paystack live plan API by the owner (status true).
- Registered Paystack live webhook `WHK_9cd31bc1` targets `https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile/paystack-webhook`.
- Events selected: charge.success, charge.failed, subscription.create, subscription.disable, subscription.not_renew, subscription.expiring_cards, invoice.update, invoice.payment_failed.
- Paystack webhook ping returned HTTP 200 in 161ms. This confirms connectivity only; not monthly renewal reconciliation or account matching.
- Production backend still runs v3.25.0 old Netcash mode, R49 introduction. Static `https://teyza.co.za/pay` exists and **must stay non-transactional**.

## Changes in this backend-only migration
1. `TEYZA_SELLER_PAYSTACK_ENABLED` remains absent/false. New membership checkout is denied until a separately reviewed launch.
2. Existing Netcash mandates and signed documents stay in Firestore for audit/withdrawal; no new seller mandate submission, administrative Netcash submission/confirmation or manual receipt-based activation is allowed. Historical seven-day processing access is not restarted.
3. Read-only `seller_billing_overview` exposes the authenticated account's verified payment history without crossing seller UIDs. No mobile checkout or external payment links.
4. Both seller membership and shopper physical-goods webhooks authenticate the exact raw body. If `Paystack-Signature` is present, require the configured `whsec_` signing secret, an HMAC SHA512 of `<t>.<raw_body>`, and timestamp within ±5 minutes. Older `x-paystack-signature` continues to work only when modern header is absent. Invalid modern header cannot fall back to legacy.
5. Firebase function `teyzaMobile` explicitly binds the Firebase secret `TEYZA_PAYSTACK_WEBHOOK_SIGNING_SECRET`. Do not put webhook secret or sk_live keys in `.env`, GitHub, logs or chat.
6. Health truthfully shows Netcash creation disabled, historic mandates read-only, introductory R10, R99/month, updated signature verification and seller checkout disabled.
7. Only the Cloud Function `functions:teyza-mobile:teyzaMobile` is deployed; not Firebase Hosting, admin, catalogue triggers, WhatsApp workers or Paystack feature flags. The production checkout link stays on the static holding page.

## Security and review gates BEFORE deployment
- Have an independent reviewer examine backend changes and complete the pending website payment script review separately; PRs #123/#125/#126 are draft and not a general payment launch.
- Configure the new Paystack **live** webhook signing secret in the Paystack dashboard under Developers → API configuration. Copy it into Firebase Secret Manager interactively, not a plaintext file:
  `node .\tools\app-first-release\node_modules\firebase-tools\lib\bin\firebase.js functions:secrets:set TEYZA_PAYSTACK_WEBHOOK_SIGNING_SECRET --project business-lift-3c19c`
  Never share the secret value. Ensure Paystack still sends the old signature until the backend is deployed.
- Existing Firebase secrets `TEYZA_PAYSTACK_SECRET_KEY`, `TEYZA_VERIFICATION_ENCRYPTION_KEY` and `TEYZA_GOOGLE_PLACES_KEY` must already exist.
- In `services/teyza-mobile-v39/.env.business-lift-3c19c`, set **only non-secret values**:
  `TEYZA_PAYSTACK_MONTHLY_PLAN_CODE=PLN_ud5m0sza4kmr31f`
  `TEYZA_SELLER_PAYSTACK_ENABLED=false`
  Preserve any other existing environment entries. Do not overwrite an existing `.env`. Ensure it is ignored by Git.
- Review Paystack Store policy rules for digital business subscription used in Android and iOS; no payment steering should exist inside either app. Checkout launch is not covered by this backend migration.

## Run preflight (NO deployment)
```powershell
Set-Location "$HOME\Downloads\Business-lift"
gh pr checkout 128 --repo Gatcheni2025/Business-lift
npm ci --prefix .\tools\app-first-release
.\DEPLOY-TEYZA-PAYSTACK-BACKEND.ps1
```
This validates Git branch, live plan, required secrets, all backend tests, and confirms the current live backend has seller checkout disabled.

## Staged function-only deploy (only after approved code review and preflight)
```powershell
.\DEPLOY-TEYZA-PAYSTACK-BACKEND.ps1 -Deploy
```
Postdeploy must show:
- `ok=true`; `version=3.25.0`.
- `subscriptionMonthlyCents=9900`, `introductoryFirstMonthCents=1000`.
- `sellerPaystackNewCheckoutDisabled=true`, `paystackCheckoutAvailable=false`, `sellerMembershipBillingMode=checkout_disabled`.
- `sellerMandateRequestV3=false`, `adminNetcashManualSubmission=false`, `historicSellerMandatesReadOnly=true`.
- `paystackModernWebhookSignatureVerification=true`.
- GET `/paystack-webhook` returns 405; Paystack signed ping with the configured signing secret or legacy secret returns 200. Test merchant event deliveries in Paystack history.
- Check that `https://teyza.co.za/pay` still says "Secure payments are not yet available", and `https://teyza.co.za/admin.html` still returns 200.

## What this does NOT establish
A ping or successful deploy does not prove real renewal events, refunds, subscription cancellation and shop reconciliation. New payments cannot be enabled until separate controlled Paystack live testing, consent acceptance, audit logging, charge idempotency, product visibility/UID tests, security review and storefront-policy evaluation pass.

**Rollback:** A Cloud Function rollback requires redeploying the previously reviewed exact source revision using Firebase CLI (with correct prior secrets). This project does not claim to have an automated function rollback. Preserve prior source/CI and existing production configuration before deploying.
