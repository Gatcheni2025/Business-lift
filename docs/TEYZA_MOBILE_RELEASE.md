# Teyza 1.0.25 (35): mobile release guide

This candidate includes the seller dashboard, shop photo and service controls, order quotes and alerts, shopper directions, full-address autocomplete and the 378-choice catalogue with 96 reference-photo types. Logout clears the local account and returns the app to the shopper view without waiting for optional Facebook SDK cleanup. The native iOS launch assets use Teyza's existing brand.

## Accounts and services

Shop owners register and complete verification in the app. A pending shop stays pending until the separate seller approval process is complete. Choosing seller mode never grants approval. Owners manage products, orders, messages, delivery and payment-at-shop settings from their seller dashboard. Logging out restores the shopper view and clears private account state.

Both native platforms use the existing Firebase project, business-lift-3c19c. Android's existing Play application ID is com.asiyedriver.asiye. The iOS bundle ID remains za.co.teyza.shopper and must match the registered Apple identifier through TEYZA_IOS_BUNDLE_ID.

Email/password, Google, Apple on iOS, and phone verification are implemented. Their native configuration and Firebase providers must be enabled for the installed build. Google requires TEYZA_GOOGLE_WEB_CLIENT_ID and, on iOS, TEYZA_GOOGLE_IOS_CLIENT_ID. Google and phone authentication on Android also depend on the installed certificate's registered SHA-1/SHA-256 fingerprints. Optional Facebook login is included only when the real Meta app ID and client token are configured. Never use example Meta credentials for a production release.

The R99 mandate records consent. Billing is currently manual_receipt; signing a mandate does not debit an account. Payment at the shop, verified receipts and recorded commission payouts do not initiate a bank transfer or automatic debit order. A provider integration and merchant activation are separate work.

The field-agent portal is a website at /work.html. Deploy its backend and Hosting kit separately; installing this native app alone does not publish the work pages or SEO fixes.

For the existing Android listing, complete [the package/certificate connection](TEYZA_EXISTING_PLAY_APP.md) first. A compiled iOS archive is not an uploaded TestFlight build. For this wholesale-marketplace release, build and upload a newly signed IPA, then confirm Apple processing and tester access in App Store Connect.

## Build a signed candidate

Use reviewed PR #97 branch `feat/teyza-account-deletion-review-20261101`, which includes the current wholesaler and spaza marketplace. Deploy and verify the latest scoped Google Places and mobile services first. The signed workflow stops if `wholesaleSourcing`, `protectedWholesalePrices`, account deletion, or Basic billing publication controls are not confirmed active. Existing Android upload-key and Apple distribution/profile credentials are reused; do not generate replacement keys.

```powershell
gh workflow run teyza-mobile-release.yml --repo Gatcheni2025/Business-lift --ref feat/teyza-account-deletion-review-20261101 -f signed_release=true -f platforms=all -f upload_to_testflight=true
```

Find and watch the successful signed run:

```powershell
gh run list --repo Gatcheni2025/Business-lift --workflow teyza-mobile-release.yml --branch feat/teyza-account-deletion-review-20261101 --event workflow_dispatch --limit 5
```

Signed artifacts are `teyza-android-aab-signed` and `teyza-ios-release-signed`; test APKs are separately available in the Teyza Shopper APK Actions run. The Android artifact includes the production-key AAB and APK; the Apple artifact includes the signed IPA and archive. Each contains release-manifest.json with the version, commit, signing mode, enabled configuration flags, catalogue counts and binary hashes.

Pull-request artifacts named unsigned are compilation checks. The Shopper APK workflow uses a separate test key; its APKs are for device testing and are not Play production uploads. The release manifest keeps storeSubmitted and device-verification flags false because packaging does not establish those outcomes.

## Send the completed IPA to Apple

For a manual signed workflow dispatch with `upload_to_testflight=true`, the signed iOS job now uploads its SHA-256-verified IPA to App Store Connect in the same run. This uses existing GitHub secrets `TEYZA_ASC_ISSUER_ID`, `TEYZA_ASC_KEY_ID`, `TEYZA_ASC_PRIVATE_KEY`. Upload success is **not** equivalent to Apple processing completion or TestFlight tester availability. If an already successful **signed** run exists and you chose not to upload at build time, you can reuse that IPA in the existing upload-only workflow mode. Replace the run ID below:

```powershell
$SignedRunId = "REPLACE_WITH_THE_SUCCESSFUL_SIGNED_RUN_ID"
gh workflow run teyza-mobile-release.yml --repo Gatcheni2025/Business-lift --ref feat/teyza-account-deletion-review-20261101 -f "upload_existing_ios_run=$SignedRunId"
```

This reuses the signed IPA and the existing TEYZA_ASC_ISSUER_ID, TEYZA_ASC_KEY_ID and TEYZA_ASC_PRIVATE_KEY secrets. Confirm successful Apple processing and tester access in App Store Connect; a green GitHub build alone does not confirm TestFlight availability. Upload the signed AAB through the appropriate Play Console testing or release track separately.

## Device acceptance

Install the intended signed version through Play internal testing and TestFlight. Confirm version 1.0.25 and build 35. The GitHub PR run's `teyza-shopper-arm64-test-apk` is test-key signed (`com.asiyedriver.asiye`, version code 2035) and cannot be installed over the already Play-signed app without uninstalling the old app; do not uninstall without considering local data. Exercise these checks using separate shopper and seller accounts:

- Email/password, Google, Apple on iOS, phone OTP, password recovery and logout/reopen preserve the correct Firebase account.
- Seller mode has products, orders, messages, finance and business tools. Signing out closes private seller pages and returns to shopper navigation.
- A pending shop is not publicly discoverable. An approved, correctly located shop has its current photo and shopper directions.
- Product edits, delivery settings, payment-at-shop options and accepted order quotes agree with the saved order total.
- A real order creates a private inbox entry; foreground/background phone alerts and taps reach the correct owner's orders.
- Camera and location permissions, ID verification, the private mandate and the separate owner confirmation journey work on physical Android/iPhone devices.

Automated tests use synthetic accounts, messages, images, positions and receipts. They do not establish live OAuth, SMS, APNs/FCM delivery, banking activation or store acceptance. Review the current privacy/support/deletion pages, store declarations and reviewer access before submission.
