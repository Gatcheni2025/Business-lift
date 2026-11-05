# Teyza 1.0.33 (43): signed QA builds and TestFlight

This is an explicitly opted-in **QA-only signing lane** in `.github/workflows/teyza-mobile-release.yml`. It is not approval to deploy to Google Play production or to collect payments. It preserves the stricter Teyza 3.23 backend release gate for ordinary signed distribution.

## Why this lane exists

The production project `business-lift-3c19c` currently has Paystack `sk_test_`, and its R323 backend is not deployed. `DEPLOY-OPERATIONS.ps1` correctly refuses to convert a test key into live billing and must **not** be weakened. The standard signed release is also correctly blocked until the R323 production backend and billing preflight pass.

This signing lane is for obtaining real certificate-signed Android binaries and a signed iOS IPA for limited app/device verification before that production rollout. It **does not enable Paystack test transactions in the production Firebase project**. The store-channel builds explicitly compile `TEYZA_PAYMENT_CHANNEL=store`; since native StoreKit and Play Billing purchases are not yet implemented, the in-app seller subscription purchase path remains unavailable.

**Important:** These QA builds still use the existing `business-lift-3c19c` Firebase accounts, data, storage and mobile service, because the Flutter app is presently hard-coded to that project. They are **not** an isolated payment-testing environment. Use dedicated QA accounts; never conduct test checkout or destructive administrative testing on real customer data. Features requiring backend 3.23 may fail against the older service.

## Run manually on the reviewed code

```powershell
gh workflow run teyza-mobile-release.yml `
  --repo Gatcheni2025/Business-lift `
  --ref fix/teyza-qa-signed-testflight-20261105 `
  -f signed_release=true `
  -f qa_signing_only=true `
  -f platforms=all `
  -f upload_to_testflight=true
```

The workflow invokes the existing production-key Android upload certificate and Apple distribution certificate only to **sign** artifacts. It checks their identity as before. The Android AAB is **not uploaded to Google Play**, and TestFlight upload **does not assign or invite testers**.

After success, download the GitHub Actions artifacts:
- `teyza-android-apk-qa-signed` (installable using the Play upload key; may not update a Play-app-signed installation)
- `teyza-android-aab-qa-signed` (signed AAB; QA-only, not released)
- `teyza-ios-release-qa-signed` (signed IPA and Xcode archive)

Check each `release-manifest.json` for `signing=signed`, `releasePurpose=qa_preview_only`, package identifiers, certificate evidence and hashes. The signed iOS job performs an App Store Connect upload when the separate `upload_to_testflight=true` option is set; confirm processing and internal tester assignments manually in App Store Connect. No device login, real payment, native purchase or version 3.23 seller publication is certified by CI.

## Production release remains separate

Leave `qa_signing_only=false` for the standard signed distribution. The unmodified production preflight still requires `teyzaMobile` 3.23.0, automatic product publication, verified complimentary access, and the configured billing capabilities. Use the existing R323 deployment guide only after live Paystack billing and product QA are ready. To truly test Paystack `sk_test_` with real transactions, first create a separate Firebase staging project with correctly configured native app IDs, API URLs, Auth, Firestore, storage, webhooks and distinct test accounts; that work is not done by this signing workflow.
