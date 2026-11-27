# Teyza seller verification and release: start here

This kit is for PR #105 and the seller-verification update. Creating or downloading it does not change the live app, admin site or subscriptions. The live service was 3.20.0 when checked on 5 November 2026; this kit requires version 3.23.0.

## Review before deployment

- Confirm whether the introductory first month is R49 or R99. The current code preserves R49 first month, R99 monthly afterwards and the optional R29 seven-day promotion.
- Complete isolated Paystack sandbox testing before enabling or changing paid service for real sellers. The current production project blocks test-key checkout; the app, backend URLs and storage require separate staging configuration for an isolated end-to-end test.
- Apple StoreKit and Google Play Billing subscription purchases have not been implemented. Store-distributed builds cannot currently complete a new in-app seller subscription. Automatic access applies only to a server-verified paid membership or a separate audited temporary admin exception, and both still require seller verification.
- The deployment uses the existing Firebase project `business-lift-3c19c`, keys and customer data. Never regenerate the existing identity-encryption key or upload key, and never send any key, certificate password, identity document or customer data in chat.

## Prepare a scoped update

Use a trusted Windows PowerShell terminal with Node.js 22, access to the existing Firebase project, and an authenticated Firebase CLI account. Restore the existing environment configuration file `services/teyza-mobile-v39/.env.business-lift-3c19c` within the extracted kit. It must contain the existing verified live R99 monthly Paystack plan code as `TEYZA_PAYSTACK_MONTHLY_PLAN_CODE=PLN_...`; the plan code is not the secret key. Do not include the Paystack secret in that file.

After the review and payment testing above, run:

```powershell
.\DEPLOY-OPERATIONS.ps1
```

The helper checks the plan file, tests the backend, checks the existing Firebase secrets without printing them, and verifies the production Paystack key and R99 ZAR monthly plan without creating a charge. It deploys only the mobile API and the four seller-catalogue/billing synchronization functions. It checks the resulting backend capabilities before applying a scoped admin Hosting overlay, preserving other website pages. If a check fails, follow its error; do not deploy this partial `public` folder with a general Hosting command. If a function deploy fails after it starts, check the reported Firebase state before retrying.

Open `https://teyza.co.za/admin.html` with an authorized administrator. **Seller verification** contains the document review queue; **Sellers & exceptions** contains time-limited audited access exceptions. Confirm approval, rejection recommendations and publication using separate test accounts. Rollback of a Hosting overlay uses the included `ROLLBACK-ADMIN.ps1` and its exact backup record; it does not roll back Cloud Functions or payments.

## Signed app and TestFlight

Once the updated backend is verified and payment and release review are complete, run the signed release workflow on the reviewed PR #105 branch with `platforms=all` and `upload_to_testflight=true`. A successful Android AAB must still be uploaded to the intended Play testing track. Apple accepting the IPA is followed by Apple processing and tester-group assignment; check version 1.0.33, build 43, in App Store Connect. See `docs/TEYZA_MOBILE_RELEASE.md` in the repository for the detailed workflow and device checks.

The existing upload key, Apple signing certificate and App Store Connect key were used by the earlier 1.0.32 build. The separate Shopper APK test key is different; a debug or upload-key APK cannot be assumed to update an existing Play-installed app. Do not create a replacement key or uninstall a tester's app without understanding local data loss.
