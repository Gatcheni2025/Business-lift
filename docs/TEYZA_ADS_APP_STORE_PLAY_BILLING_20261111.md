# Teyza Ads — official Google Play Billing and Apple StoreKit2 implementation (11 November 2026)

**Status: DRAFT / NOT DEPLOYED / ZERO PURCHASES ACTIVATED.**

This work is a child of Ads PR #145. It must not be merged or promoted into the existing signed QA build without store product setup and verified end-to-end sandbox testing. The existing R99 monthly membership remains a **separate** website-only Paystack flow and historical R10 subscribers are untouched.

## Business and purchase rules

One *single-use consumable* buys **one** independently approved advertisement for **seven days**, and never renews automatically. The seller selects a whole kilometre radius from **1 to 50 km**, measured around the server-approved shop address. **R29** covers 1–10 km; each whole km beyond 10 adds **R2**. Both stores need **41 separate fixed-price products**; App Store and Google Play cannot charge an arbitrary price calculated by the Flutter app at checkout.

- Submit creative image, headline and description, then pass separate admin moderation **before** purchasing.
- Server creates a signed-in Firebase UID-bound intent, including immutable radius, amount, store and ad ID.
- Flutter queries the exact store SKU and validates that its **actual South African storefront price is ZAR and equals the approved R amount** before opening StoreKit or Play Billing.
- Firebase checks the **real provider purchase**: Google Play Developer API purchased state, token, SKU, timestamp, opaque UID account ID, single purchase; Apple StoreKit2 JWS verified against explicitly provisioned **Apple public root certificate trust anchors**, then current transaction re-fetched with Apple's App Store Server API and checked for revocation, SKU, bundle ID, appAccountToken and timestamp.
- Reusable deterministic appAccountToken UUID binds each purchase to the originating seller UID without exposing email or seller details to the store.
- Firebase uses a SHA-256 purchase ID ledger and a Firestore transaction to prevent purchase-token replay and same-purchase activation of multiple ads.
- A production verified purchase activates the **single approved ad** for exactly 7 days. Sandbox/test purchases use status `store_test` and **never appear on the live shopper feed**.
- Google Play consumables are **consumed server-side after entitlement is recorded**; retries are idempotent if consumption fails. iOS finishes transaction only after Firebase reports success.
- Pending transactions, wrong UID, wrong SKU/price, revoked or already used purchase, seller suspension and creative changes must fail closed. Under dispute, contact support; never prompt a second purchase.
- No separate R29 monthly subscription exists: it is one-time **R29 for 7 days** within 10 km.

## Store product catalogue — configure the exact IDs in both consoles

Set type **Consumable (one-time)**, available in **South Africa**, and configure each listed **ZAR price**, with user-visible text describing **one seven-day ad** and the reach. Preserve the exact product IDs; they are checked byte-for-byte in both app and backend.

| Store product ID | Chosen reach | South African price |
|---|---|---:|
| `teyza_ad7d_r10` | 1–10 km | R29.00 |
| `teyza_ad7d_r11` | 11 km | R31.00 |
| `teyza_ad7d_r12` | 12 km | R33.00 |
| `teyza_ad7d_r13` | 13 km | R35.00 |
| `teyza_ad7d_r14` | 14 km | R37.00 |
| `teyza_ad7d_r15` | 15 km | R39.00 |
| `teyza_ad7d_r16` | 16 km | R41.00 |
| `teyza_ad7d_r17` | 17 km | R43.00 |
| `teyza_ad7d_r18` | 18 km | R45.00 |
| `teyza_ad7d_r19` | 19 km | R47.00 |
| `teyza_ad7d_r20` | 20 km | R49.00 |
| `teyza_ad7d_r21` | 21 km | R51.00 |
| `teyza_ad7d_r22` | 22 km | R53.00 |
| `teyza_ad7d_r23` | 23 km | R55.00 |
| `teyza_ad7d_r24` | 24 km | R57.00 |
| `teyza_ad7d_r25` | 25 km | R59.00 |
| `teyza_ad7d_r26` | 26 km | R61.00 |
| `teyza_ad7d_r27` | 27 km | R63.00 |
| `teyza_ad7d_r28` | 28 km | R65.00 |
| `teyza_ad7d_r29` | 29 km | R67.00 |
| `teyza_ad7d_r30` | 30 km | R69.00 |
| `teyza_ad7d_r31` | 31 km | R71.00 |
| `teyza_ad7d_r32` | 32 km | R73.00 |
| `teyza_ad7d_r33` | 33 km | R75.00 |
| `teyza_ad7d_r34` | 34 km | R77.00 |
| `teyza_ad7d_r35` | 35 km | R79.00 |
| `teyza_ad7d_r36` | 36 km | R81.00 |
| `teyza_ad7d_r37` | 37 km | R83.00 |
| `teyza_ad7d_r38` | 38 km | R85.00 |
| `teyza_ad7d_r39` | 39 km | R87.00 |
| `teyza_ad7d_r40` | 40 km | R89.00 |
| `teyza_ad7d_r41` | 41 km | R91.00 |
| `teyza_ad7d_r42` | 42 km | R93.00 |
| `teyza_ad7d_r43` | 43 km | R95.00 |
| `teyza_ad7d_r44` | 44 km | R97.00 |
| `teyza_ad7d_r45` | 45 km | R99.00 |
| `teyza_ad7d_r46` | 46 km | R101.00 |
| `teyza_ad7d_r47` | 47 km | R103.00 |
| `teyza_ad7d_r48` | 48 km | R105.00 |
| `teyza_ad7d_r49` | 49 km | R107.00 |
| `teyza_ad7d_r50` | 50 km | R109.00 |

**Apple:** App Store Connect > Teyza app > Monetization / In-App Purchases. Create the listed consumable IAP products, supply required localisation, review screenshots and pricing (including tax settings), and make them available to TestFlight sandbox testers. Configure In-App Purchase capability for the verified bundle (current release workflow default: `za.co.teyza.shopper`).

**Google:** Play Console > Monetize with Play > Products > One-time products. Create/activate the listed 41 product IDs and their consumable purchase options at the exact South African prices; configure license testers and an internal testing track. The package ID must be copied from the **actual signed Android app** and registered in Google Play Developer API access.

Products MUST be activated in both stores and return the expected price through official store APIs before `TEYZA_ADS_STORE_BILLING_ENABLED=true` can be considered.

## Firebase deploy configuration (no live secrets in repository)

- `TEYZA_ADS_STORE_BILLING_ENABLED=false` until distinct operator approval and all provider checks pass.
- `TEYZA_ADS_STORE_SANDBOX_ALLOWED=false` in production; true **only** in the isolated QA environment. Test purchases never display as live paid ads even in QA.
- `TEYZA_GOOGLE_PLAY_PACKAGE`: exact Android package name verified from signed app; Google Cloud Functions runtime service account needs **Google Play Android Publisher API** access and Play Console purchase validation/consumption permissions.
- `TEYZA_APPLE_IAP_BUNDLE_ID`: exact signed app bundle ID.
- `TEYZA_APPLE_IAP_APP_ID`: numeric App Store Connect App Apple ID.
- `TEYZA_APPLE_IAP_KEY_ID`: authorised In-App Purchase / App Store Server API signing key ID.
- `TEYZA_APPLE_IAP_ISSUER_ID`: issuer ID from App Store Connect.
- Firebase Secret Manager secret `TEYZA_APPLE_IAP_API_PRIVATE_KEY`: PEM/PKCS8 content of **Store Server API signing key**; do not paste in chat or commit.
- Firebase Secret Manager secret `TEYZA_APPLE_IAP_ROOTS_BASE64`: base64 of UTF-8 JSON array of base64 DER **Apple public root certificates**, downloaded directly from the official <https://www.apple.com/certificateauthority/> source and verified against Apple's published certificate details. Treat these as a trusted store-verification config; do not fetch random website certificates during checkout.
- Deploy **only** after both new Firebase secrets exist and the Play service account is linked/authorised. The new source attaches both secrets to `teyzaMobile`; deploying without secrets will fail.
- Source dependencies are locked: `@apple/app-store-server-library@3.1.0`, `google-auth-library@11.3.4`, official Flutter `in_app_purchase` plugins. Security and QA review required; the lock was rebuilt by a feature-branch-only GitHub action using `npm install --package-lock-only --ignore-scripts`, verified by `npm ci --ignore-scripts`.

## Release gates — remaining

1. CI backend regression, Flutter analyze/tests and unsigned Android/iOS previews must pass.
2. Confirm app account token is carried from Flutter `applicationUserName` through native StoreKit2 appAccountToken and Google Play obfuscated account ID on physical test devices (fail-closed if missing).
3. Test product not found, wrong country/price, cancelled/pending purchases, repeat/replay, Android server consume, iOS StoreKit receipt verification and full seven-day expiry on an **isolated Firebase QA project**, with fake/test purchase credentials.
4. Implement and test **App Store Server Notifications V2** and **Google Play Real-Time Developer Notifications / voided purchases** for cancellation, refund and chargebacks, including full entitlement revocation. Manual refund-review flow is not a substitute for production automation.
5. Validate seller changes, location accuracy, content-report workflow, media retention and national scaling of the existing 80-row feed.
6. Review Apple/Google metadata and in-app purchase compliance before using production keys; complete a new signed APK/AAB and TestFlight QA build with a fresh versionCode/CFBundleVersion and Apple provisioning.

**Important:** PR #148 is not permission to change the previously approved R99 Paystack payment JavaScript or to re-enable the R99 pilot checkout. New seller membership activation is a distinct operator-controlled step.
