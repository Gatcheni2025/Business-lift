# Teyza 1.0.33 (43): signed release and TestFlight guide

This candidate contains the seller-verification and automatic-product-publication changes from PR #105. The Android application ID is `com.asiyedriver.asiye`; the iOS bundle ID is `za.co.teyza.shopper`. Keep their existing Play upload key and Apple distribution identity. A signed candidate is not proof of store approval, customer access or a working payment integration.

## Before any release

- Confirm the first-month price. The current draft uses R49 for an eligible first month, then R99 per month, plus an optional R29 seven-day promotion. These amounts are not changed by this release-preparation work.
- Complete real Paystack sandbox testing of checkout, verification, renewal, cancellation, failed payments, refunds and duplicate events in an isolated project. The app, backend URLs and storage currently need staging configuration before such a test. Test payments are blocked on the production Firebase project.
- Store-distributed Android and iOS builds currently disable the external Paystack subscription button. Google Play Billing and Apple StoreKit purchase, server verification and restoration are not implemented; do not claim that these builds can take in-app subscription payments.
- The admin update requires Teyza Mobile `3.23.0`, `automaticProductPublication: true`, `adminProductReview: false` and `adminComplimentaryAccess: true`. The production service reported `3.20.0` on 5 November 2026; run the release health check again before deploying or signing.
- Preserve the existing Firebase project, verification encryption key, Google Places key, Paystack secret and verified R99 ZAR monthly plan code. Do not paste keys into chat, source control or logs. The scoped admin deployment helper checks the existing production key mode and verifies the monthly plan before changing Firebase; it never initiates a payment.
- Review the draft changes, payment behaviour and rollout impact before deploying. `DEPLOY-OPERATIONS.ps1` updates only the mobile API and catalogue/billing synchronization functions, checks the resulting health, and then publishes the admin overlay while preserving the rest of Hosting.

## Build and upload

After the backend and admin update is deployed and verified, use the reviewed branch `feat/teyza-seller-approval-subscription-pilot-20261105`. The workflow independently checks the required backend capabilities and existing signing credentials. Do not bypass a failed release gate.

```powershell
gh workflow run teyza-mobile-release.yml --repo Gatcheni2025/Business-lift --ref feat/teyza-seller-approval-subscription-pilot-20261105 -f signed_release=true -f platforms=all -f upload_to_testflight=true
gh run list --repo Gatcheni2025/Business-lift --workflow teyza-mobile-release.yml --branch feat/teyza-seller-approval-subscription-pilot-20261105 --event workflow_dispatch --limit 5
```

Watch the new run with `gh run watch RUN_ID --repo Gatcheni2025/Business-lift`. Successful output includes `teyza-android-aab-signed`, `teyza-android-apk-signed`, and `teyza-ios-release-signed`. Check each release manifest, application ID, version, hash and certificate. Upload the signed AAB to the intended Play Console testing track separately; producing an artifact does not upload it to Google Play.

The iOS job verifies the signed IPA and uses the existing App Store Connect credentials to upload it. Apple accepting an upload does not mean processing has completed or that testers have access. Check App Store Connect for version 1.0.33, build 43, processing results, required compliance information and tester group assignment. Do not upload the unsigned PR preview to a store.

## Device testing

Use separate test shopper and seller accounts. Verify registration and OTP, private document and selfie review, an approval and a rejection recommendation, automatic product publication under verified paid access, the recorded time-limited administrator exception, orders, notifications and logout. Verify expired or revoked access removes product-selling eligibility without deleting drafts.

The separate Shopper APK workflow needs the original test keystore to update its prior test installs. The signed Play upload key and Google Play app-signing key can also differ. A debug APK or directly installed upload-key APK may not replace a Play-installed or differently signed tester app; do not remove an existing installation without understanding the loss of local app data. Google and phone authentication also depend on registering the actual installed certificate fingerprints in Firebase.

CI uses synthetic accounts and mocked payments. It does not verify real SMS, Google/Apple login, APNs/FCM delivery, merchant payments, Apple processing or physical-device behaviour. Keep release manifests honest about those unverified outcomes.

