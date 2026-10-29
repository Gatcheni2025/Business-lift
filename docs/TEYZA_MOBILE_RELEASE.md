# Teyza 1.0.23 (33): mobile release guide

This candidate includes the seller dashboard, shop photo and service controls, order quotes and alerts, shopper directions, full-address autocomplete and the 378-choice catalogue with 96 reference-photo types. Logout clears the local account and returns the app to the shopper view without waiting for optional Facebook SDK cleanup. The native iOS launch assets use Teyza's existing brand.

## Accounts and services

Shop owners register and complete verification in the app. A pending shop stays pending until the separate seller approval process is complete. Choosing seller mode never grants approval. Owners manage products, orders, messages, delivery and payment-at-shop settings from their seller dashboard. Logging out restores the shopper view and clears private account state.

Both native platforms use the existing Firebase project, business-lift-3c19c. Android's application ID is za.co.teyza.shopper. The iOS bundle ID defaults to the same value and must match the registered Apple identifier through TEYZA_IOS_BUNDLE_ID.

Email/password, Google, Apple on iOS, and phone verification are implemented. Their native configuration and Firebase providers must be enabled for the installed build. Google requires TEYZA_GOOGLE_WEB_CLIENT_ID and, on iOS, TEYZA_GOOGLE_IOS_CLIENT_ID. Google and phone authentication on Android also depend on the installed certificate's registered SHA-1/SHA-256 fingerprints. Optional Facebook login is included only when the real Meta app ID and client token are configured. Never use example Meta credentials for a production release.

The R99 mandate records consent. Billing is currently manual_receipt; signing a mandate does not debit an account. Payment at the shop, verified receipts and recorded commission payouts do not initiate a bank transfer or automatic debit order. A provider integration and merchant activation are separate work.

The field-agent portal is a website at /work.html. Deploy its backend and Hosting kit separately; installing this native app alone does not publish the work pages or SEO fixes.

## Build a signed candidate

Use the reviewed feature/teyza-field-work-and-search branch, which includes the preceding catalogue and seller-service updates. Deploy the latest scoped Firebase kit first. Existing Android upload-key and Apple distribution/profile credentials are reused; do not generate replacement keys.

```powershell
gh workflow run teyza-mobile-release.yml --repo Gatcheni2025/Business-lift --ref feature/teyza-field-work-and-search -f signed_release=true -f platforms=all
```

Find and watch the successful signed run:

```powershell
gh run list --repo Gatcheni2025/Business-lift --workflow teyza-mobile-release.yml --branch feature/teyza-field-work-and-search --event workflow_dispatch --limit 5
```

Signed artifacts are teyza-android-aab-signed and teyza-ios-release-signed. The Android artifact includes the production-key AAB and APK; the Apple artifact includes the signed IPA and archive. Each contains release-manifest.json with the version, commit, signing mode, enabled configuration flags, catalogue counts and binary hashes.

Pull-request artifacts named unsigned are compilation checks. The Shopper APK workflow uses a separate test key; its APKs are for device testing and are not Play production uploads. The release manifest keeps storeSubmitted and device-verification flags false because packaging does not establish those outcomes.

## Send the completed IPA to Apple

A successful signed build saves files on GitHub. App Store Connect upload is a separate workflow mode. Replace the value below with the successful signed run ID from this same branch:

```powershell
$SignedRunId = "REPLACE_WITH_THE_SUCCESSFUL_SIGNED_RUN_ID"
gh workflow run teyza-mobile-release.yml --repo Gatcheni2025/Business-lift --ref feature/teyza-field-work-and-search -f "upload_existing_ios_run=$SignedRunId"
```

This reuses the signed IPA and the existing TEYZA_ASC_ISSUER_ID, TEYZA_ASC_KEY_ID and TEYZA_ASC_PRIVATE_KEY secrets. Confirm successful Apple processing and tester access in App Store Connect; a green GitHub build alone does not confirm TestFlight availability. Upload the signed AAB through the appropriate Play Console testing or release track separately.

## Device acceptance

Install the intended signed version through Play internal testing and TestFlight. Confirm version 1.0.23 and build 33. Exercise these checks using separate shopper and seller accounts:

- Email/password, Google, Apple on iOS, phone OTP, password recovery and logout/reopen preserve the correct Firebase account.
- Seller mode has products, orders, messages, finance and business tools. Signing out closes private seller pages and returns to shopper navigation.
- A pending shop is not publicly discoverable. An approved, correctly located shop has its current photo and shopper directions.
- Product edits, delivery settings, payment-at-shop options and accepted order quotes agree with the saved order total.
- A real order creates a private inbox entry; foreground/background phone alerts and taps reach the correct owner's orders.
- Camera and location permissions, ID verification, the private mandate and the separate owner confirmation journey work on physical Android/iPhone devices.

Automated tests use synthetic accounts, messages, images, positions and receipts. They do not establish live OAuth, SMS, APNs/FCM delivery, banking activation or store acceptance. Review the current privacy/support/deletion pages, store declarations and reviewer access before submission.
