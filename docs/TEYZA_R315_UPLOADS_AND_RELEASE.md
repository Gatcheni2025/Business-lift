# Teyza R3.15 — working photo storage and shop-front photographs

App: **1.0.13 (23)**. Mobile service: **3.15.0**.

## Fix the live upload blocker

The configured bucket `business-lift-3c19c.firebasestorage.app` returned HTTP 404
(`The specified bucket does not exist`). Camera capture is already working.
An active Functions endpoint alone does not establish that uploads work.

1. Open https://console.firebase.google.com/project/business-lift-3c19c/storage
2. Choose **Get started**, **US-CENTRAL1**, and **production mode**.
   Keep private access rules. Do not make verification documents public.
3. Extract the R3.15 deployment kit, open PowerShell there and run:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
firebase login
.\DEPLOY-MOBILE.ps1
```

This deploys only `functions:teyza-mobile` in the existing project. It preserves
native registrations, existing authentication, rules and the existing encryption
secret. Do not rotate that key. Health must report version 3.15.0,
`verificationUploads: true`, `uploadStatus: ready`, and `shopFrontPhotos: true`.
Missing storage or permission errors are actionable; the captured image stays
on its page for retry. Successful capture is never reported as successful upload.

## Shop-front photo

Seller registration now includes **Add shop-front photo**. Photograph the
entrance/sign with the rear camera or choose a photo, preview it and explicitly
agree to show it on the shop listing. This is optional and does not invalidate
completed existing registrations. Only the authenticated shop owner can save
or read the preparation photo. It appears on the shopper shop card after
publication. The bucket remains private; the public image endpoint verifies
current publication, moderation state, owner and exact photo reference.
ID/passport/company documents and owner selfies use separate private paths.

## Device acceptance before release

Install the replacement APK, use the same seller account, and retry document
and selfie submission after Storage setup. Confirm success survives refresh.
Add a shop-front picture and check its visibility from the shopper side after
completing registration. Confirm OTP, selected stock, chat, permissions and
account changes on physical Android and iPhone devices.

## Store signing and provider configuration

The Flutter workflow `.github/workflows/teyza-mobile-release.yml` builds Android
AAB and iOS archive automatically. The default artifacts are **unsigned**.
For an uploadable AAB and IPA, open GitHub Actions > Teyza Android and iOS Release
> Run workflow on `feature/teyza-r34-premium-photos-nearby` and select signed release
only after the following settings are supplied in repository Actions settings:

| Platform | Required secrets or variables |
| --- | --- |
| Android secrets | `TEYZA_ANDROID_KEYSTORE_BASE64`, `TEYZA_ANDROID_STORE_PASSWORD`, `TEYZA_ANDROID_KEY_ALIAS`, `TEYZA_ANDROID_KEY_PASSWORD` |
| Apple secrets | `TEYZA_IOS_CERTIFICATE_BASE64`, `TEYZA_IOS_CERTIFICATE_PASSWORD`, `TEYZA_IOS_PROFILE_BASE64`, `TEYZA_IOS_KEYCHAIN_PASSWORD` |
| Apple variable | `TEYZA_APPLE_TEAM_ID` |
| Google variables | `TEYZA_GOOGLE_WEB_CLIENT_ID`, `TEYZA_GOOGLE_IOS_CLIENT_ID` |

Use the existing Play upload key and matching Apple distribution profile for
`za.co.teyza.teyza_shopper` / `za.co.teyza.shopper`. Do not substitute the test key.
Configure Firebase Google/Apple providers, iOS APNs and the actual Play signing
fingerprints. Google OAuth variables are still missing from previous build
manifests; enabling a provider in Firebase alone does not configure native OAuth.
Keep private keys/passwords in GitHub Secrets; never paste them into chat or git.
The workflow fails closed for absent signing credentials and must produce a
signed AAB/IPA in signed mode. Complete store metadata, privacy/data-safety
answers, account-deletion access and physical-device acceptance before submission.
No store submission is performed by this kit.

Official release instructions:
https://docs.flutter.dev/deployment/android
https://docs.flutter.dev/deployment/ios
