# Teyza R320 — Free registration, Paystack product listings and promotions

Status: Development PR ONLY. NOT DEPLOYED. Stacked on the Teyza R319 administrator branch.

## Seller flow
- Register/login and owner verification are free. No trial, mandate or payment page on signup.
- Approved verified shops can appear in local results with no products.
- Add Product and Add Custom Product open Upgrade if membership is unpaid. R49 one-time introductory first month; then R99 per month. Product publication and order taking require a verified active membership. Expired paid shops keep their approved shop profile.
- Promote business is available only to currently paid members. R29 buys seven days of clearly labelled sponsored placement. Display only in locally relevant shopper results. Existing promotions extend after successful verified payment.
- Historical trials stop authorizing listings and are migrated to free; existing manual paid R99 entitlements remain valid through the recorded billing month. Never autocharge existing members.

## Paystack activation — setup required by account owner
1. Create a monthly plan in Paystack with amount 9900 cents, ZAR, monthly. Set TEYZA_PAYSTACK_MONTHLY_PLAN_CODE to its PLN_ plan code in Cloud Functions environment. Backend checks exact plan amount, currency and billing interval.
2. Set Firebase Secret Manager TEYZA_PAYSTACK_SECRET_KEY to the correct merchant secret (test first, then live). Never commit or expose merchant secret.
3. Register Paystack webhook at https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile/paystack-webhook with raw-body X-Paystack-Signature SHA512 verification.
4. Configure the callback at https://www.teyza.co.za/?payment=return. Payment only grants access after backend Paystack verification. The app has I have paid · verify payment.
5. Initial R49 is collected as one-time charge. Once verified, the backend attempts to create a delayed R99 recurring plan subscription using Paystack reusable card authorization. If Paystack cannot verify reusable authorization or setup fails, renewalSetup is action_required and renewal must not be represented as automatic.
6. For paid members, Manage or cancel opens Paystack subscription self-service. Verify this flow on the merchant test account before switching live.
7. Verify webhook retries and duplicate charges, exact membership end time, promo eligibility, cancelled/failed subscriptions, refunds and deletion.

## Platform review
- iOS: purchases of in-app digital advertising/placements normally require Apple In-App Purchase (App Review Guideline 3.1.3(g)). The Flutter screen never sends iPhone users to Paystack; configure StoreKit and server receipt validation separately before iOS paid seller access.
- Google Play generally requires Play Billing for purchases unlocking digital seller listing functionality and in-app boosts. No Paystack checkout should appear in Google Play store builds absent an applicable exception. Google Play Billing must be implemented before release.
- Teyza's Flutter checkout uses a compile-time distribution flag. Store builds default to TEYZA_PAYMENT_CHANNEL=store, which disables the external Paystack button; only independent/direct distribution compiled with --dart-define=TEYZA_PAYMENT_CHANNEL=direct enables it. Do not set this flag on Google Play or App Store submissions.
- iOS and Google Play purchase flows are not yet implemented; test merchant integration is only a staging/independent-distribution option.
- This branch does not supply a working StoreKit product nor real Paystack merchant credentials. Do not deploy to production until policies, subscriptions and end-to-end payment scenarios pass.

## Security and release gates
- Prices and references are set by server. Promotion and membership writes are trusted server-only; webhooks verify HMAC raw body and verified Paystack transaction amounts.
- Verify Firebase rules prohibit clients from granting billing, promotion and public catalogue state, and prevent unauthorised Firestore draft writes from becoming public.
- Backend and Flutter tests plus staged Android physical checkout, owner approval, logout, prepaid card failures, account deletion, two-way chat and prior orders.
- Dependency: stacked PRs #99-#103. Do not merge or deploy automatically. Avoid partial Hosting deploys that overwrite unrelated website pages.


## Repair for signed run 41793649417

The November 4, 2026 signed workflow stopped on Firebase preflight. Production was still Teyza Mobile **3.17.0** with `sevenDayTrial=true`, `strictSevenDayMembership=true`, `billingMode=manual_receipt` and missing R319 admin + R320 Paystack flags. This is a **backend deployment/configuration blocker**, not Android or iOS certificate failure.

From the **R320 branch** (not a stale R319 or R315 ZIP) on a trusted Windows terminal with Node.js 22 and Firebase CLI:
1. In the Paystack **test merchant** dashboard, verify/create a **ZAR 99.00/month** subscription plan. Record its `PLN_...` code, not its API secret.
2. In PowerShell, at the repository root, run `firebase login`; then `firebase functions:secrets:set TEYZA_PAYSTACK_SECRET_KEY --project business-lift-3c19c`. Enter the test secret into the secure CLI prompt; never paste it into source control, chat, or logs.
3. Create the private file `services/teyza-mobile-v39/.env.business-lift-3c19c` with just `TEYZA_PAYSTACK_MONTHLY_PLAN_CODE=PLN_YOUR_REAL_CODE`. The repository gitignore excludes this file. Verify the plan is for **ZAR** and **monthly**, not daily/weekly.
4. Review the production-side effects: migrating old trial shop accounts to free and restricting new product catalogues to paid members affects existing sellers. Arrange merchant acceptance testing and a release window before proceeding.
5. Run `.\DEPLOY-MOBILE.ps1` from PowerShell at the repository root. This runs backend tests and scoped Functions deployment, checks live service health for **3.20.0**, the two disabled trial flags, R319 admin fields, Paystack readiness and the exact prices. It does **not** deploy Firebase Hosting.
6. Inspect `https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile` in a browser; health must show `ok:true`, `version:"3.20.0"`, `billingMode:"paystack_checkout"`, `paystackCheckoutAvailable:true`, `sevenDayTrial:false`. Configure the signed Paystack webhook route as documented above, test it using **test** payments and verify reconciliation and renewals.
7. Only after staging/business testing passes, re-run the signed workflow from `feat/teyza-free-signup-paystack-products-promotion-20261104` with signed AAB/APK + IPA and TestFlight upload enabled.

**Do not** run the old R315 `DEPLOY-MOBILE.ps1`: its health checks explicitly demand v3.18.0 and a seven-day trial. The updated R320 helper checks v3.20.0 instead. Avoid merging PR #104 or charging real customers before the renewal, webhook, cancellation, Play and Apple billing QA gates are complete.

## Signed Android + iOS internal distribution — build 41

Release source is draft PR #104, branch `feat/teyza-free-signup-paystack-products-promotion-20261104` and app version `1.0.31+41`. The official workflow is:
https://github.com/Gatcheni2025/Business-lift/actions/workflows/teyza-mobile-release.yml

**Before generating store-signed files**, deploy and verify Teyza Mobile Firebase service **3.20.0** (using the scoped operations/mobile service deployment kit, not a partial Firebase Hosting deployment). Its health endpoint must report `sevenDayTrial=false`, `strictSevenDayMembership=false`, `billingMode=paystack_checkout`, `paystackCheckoutAvailable=true` and exact ZAR cent prices 4900, 9900 and 2900. Requires the configured **Paystack Secret Manager** secret and monthly R99 Paystack plan. The signed workflow refuses an incompatible or missing backend.

To run **after the above checks pass**, open the workflow → Run workflow → **Use workflow from** `feat/teyza-free-signup-paystack-products-promotion-20261104` → `platforms=all`, `signed_release=true`, `upload_to_testflight=true`, `upload_existing_ios_run` blank. The workflow checks old Android Play upload certificate, Firebase Android OAuth, Apple Sign In certificate/profile, builds signed **.aab** and **.apk**, signs **.ipa** and uploads to **TestFlight** when opt-in and App Store Connect API secrets work. Download artifacts `teyza-android-aab-signed` and `teyza-ios-release-signed` from the successful run; confirm the signed APK is included in the Android artifact's release package.

The regular **Teyza Shopper APK** PR workflow is *separate* and currently requires original PR #97 tester keystore; do not replace or rotate that certificate. The signed store release uses the original Play upload key instead.

**App identity warning:** the existing Play Console-compatible Android package in this repository is `com.asiyedriver.asiye` even though the product is branded Teyza; the iOS bundle is `za.co.teyza.shopper`. Confirm that the targeted existing Play listing is actually Teyza before publishing a new AAB. Do **not** silently rename either identifier or overwrite an unrelated app.

**Store-policy gate:** Apple and Google Play purchases of in-app digital placements/listings require applicable platform billing; the build defaults to disabling Paystack checkout in store distribution. StoreKit and Play Billing aren't implemented in this draft, so the resulting TestFlight is suitable for internal QA, **not approval as a completed paid-feature release**.
