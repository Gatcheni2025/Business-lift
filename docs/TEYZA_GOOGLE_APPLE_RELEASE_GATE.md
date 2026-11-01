# Teyza mobile: Google/Apple authentication and Play production readiness

This is a **release checklist**, not a claim that a real device has already passed authentication.

## Current app identities — never silently change

- Google Play listing Android application ID: `com.asiyedriver.asiye`
- Apple bundle: `za.co.teyza.shopper`
- Firebase project: `business-lift-3c19c` (project number `983479810697`)
- Intended target: the **existing** Teyza Play listing with current testers; do not create a new package or new upload keystore.

## Android — Google Sign-In

1. Play Console → Teyza → App integrity / App signing: copy the **upload certificate** SHA-1 and SHA-256, and the separately issued **Play app-signing certificate** SHA-1 and SHA-256. They may differ.
2. Firebase Console → project `business-lift-3c19c` → Project settings → Your apps: Android registration `com.asiyedriver.asiye`. Register all relevant SHA-1/SHA-256 fingerprints. The **Play app-signing** SHA-1 is required for real installs via the Play testing track; the upload-key SHA-1 is required for locally installed builds signed with that key.
3. Authentication → Sign-in method: enable Google, maintain Email/Password. Check OAuth consent/configuration in Google Cloud if needed. Download fresh `google-services.json` for **com.asiyedriver.asiye**, containing Android OAuth entries for the relevant certificate SHA-1 and a Web OAuth entry.
4. Store the base64-encoded SDK file in GitHub Actions secret `TEYZA_ANDROID_GOOGLE_SERVICES_JSON_BASE64`, and the matching **Android** Firebase app ID in GitHub variable `TEYZA_FIREBASE_ANDROID_APP_ID`. Set `TEYZA_GOOGLE_WEB_CLIENT_ID` to the Web OAuth client ID in this refreshed file. Do not paste secrets into a pull request, CI logs or chat.
5. Keep existing signing secrets. The release workflow now checks the keystore certificate against `TEYZA_PLAY_UPLOAD_CERT_SHA256` and rejects signed builds if the signed upload SHA-1 or Web client is not registered in the Firebase SDK file.
6. Test **install through Play's closed-testing track**, not only a debug or locally signed APK. Google Play's installed certificate may differ from the upload certificate.

## iPhone — Google and Apple Sign-In

1. Firebase → Your apps: verify the iOS application for bundle `za.co.teyza.shopper`; configure `TEYZA_FIREBASE_IOS_APP_ID` in GitHub Actions variables.
2. Configure a **separate iOS OAuth client** for `za.co.teyza.shopper`. Set `TEYZA_GOOGLE_IOS_CLIENT_ID` and `TEYZA_GOOGLE_WEB_CLIENT_ID` in GitHub Actions variables. The release script adds the reversed iOS OAuth URL scheme and Google client IDs to the generated `Info.plist`.
3. Firebase → Authentication → Sign-in method → Apple: enable the provider. For cross-platform or web Apple sign-in, configure the Apple Services ID, Team ID, Key ID and private key in the Firebase Console. Use Apple Developer → Certificates, Identifiers & Profiles to enable **Sign in with Apple** for `za.co.teyza.shopper`. Use the correct service callback `https://business-lift-3c19c.firebaseapp.com/__/auth/handler` where applicable.
4. Recreate the **distribution provisioning profile** after enabling Sign in with Apple, upload it via the existing GitHub secret `TEYZA_IOS_PROFILE_BASE64`, and retain the matching Apple distribution certificate. Set `TEYZA_APPLE_TEAM_ID`. Signed CI rejects a provisioning profile lacking `com.apple.developer.applesignin` or an exact match for `TEAM_ID.za.co.teyza.shopper`.
5. Check the associated domain/private email relay configuration if users choose Hide My Email. Do not force an Apple relay address to match a customer's real email.

## Testing before publishing

Use at least one real **Android phone installed from the existing Play closed-testing link** and a real **iPhone installed through TestFlight**. For each, test fresh-account Google sign-in, returning-account Google sign-in, email/password and password reset, cancellation and network loss, signing out and reopening the app, shopper dashboard, seller dashboard separation, owner verification and shop approval, order placement, notifications, location, shop images and account deletion. On the iPhone also test Apple sign-in (including Hide My Email), plus a returning Apple account. Ensure a Google identity is not automatically granted seller/admin approval.

Record device/OS/app-version, test account type (never passwords), date, result, screenshot/log reference, bug ticket, resolution and retest. Real payment and subscription mandates need separate end-to-end checks before collecting money.

## Play Console: application reviewed but production access denied

The supplied screenshot shows the app completed the minimum closed-test checklist but Google asked for more testing. The **Open testing** track remains locked without production access. Keep a compliant **closed test** active with at least 12 opted-in testers continuously for 14 days, but do not equate that minimum with production approval. Ask testers to use core features repeatedly, collect meaningful feedback, fix defects and retest. Review pre-launch report, crashes/ANRs, account/deletion and content declarations.

When ready, Play Console Dashboard → **Apply for production**. Answer honestly about recruitment, engagement, actual feedback, changes made and confidence from QA evidence. Do not claim user testing, payments or Google/Apple device sign-in have passed unless they really have.

Official reference: https://support.google.com/googleplay/android-developer/answer/14151465

## Build without publishing

```powershell
gh workflow run teyza-mobile-release.yml --repo Gatcheni2025/Business-lift --ref fix/teyza-store-auth-readiness-20261101 -f signed_release=true -f platforms=android
```

Build iOS separately with `-f platforms=ios` after the Apple credentials/profile are ready. **Do not use the unsigned PR build for Play or TestFlight.** Confirm the candidate's version code exceeds the highest version across *all* existing Play tracks. Avoid overlapping manual release runs because the workflow cancels previous runs on the same ref. Download and verify signed candidate artifacts, perform real-device QA, and only then submit an update to the existing testing track. Store publication and rollout are manual.
