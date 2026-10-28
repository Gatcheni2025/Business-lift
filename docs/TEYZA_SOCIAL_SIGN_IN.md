# Teyza Google, Apple and Facebook sign-in

Google works on Android and iOS; Sign in with Apple uses the native iOS button, random nonce and Firebase Apple provider. These existing methods remain in place. Facebook joins the same shopper/shop-owner login form when its native Meta configuration is present. Login purpose never grants seller/admin claims, bypasses ID/OTP approval or signs a subscription mandate. Firebase remains the only account identity; provider tokens are not stored in the session vault. An existing email linked to another provider must use its original sign-in method; no account is silently merged by email.

## Firebase and provider setup

In Firebase project business-lift-3c19c → Authentication → Sign-in method, enable Google and Apple. Keep the existing Android application and iOS bundle za.co.teyza.shopper. Google requires the correct web OAuth client and, on iPhone, the registered iOS OAuth client/callback scheme. Register the actual signing SHA-1/SHA-256 for each Android build, including Google Play App Signing. GitHub variables already used by builds: TEYZA_GOOGLE_WEB_CLIENT_ID and TEYZA_GOOGLE_IOS_CLIENT_ID. Apple requires Sign in with Apple enabled for the bundle/provisioning profile and the matching provider configuration in Firebase. Email login stays available.

For Facebook, create or select the real Meta app with Facebook Login and add the Android and iOS platforms. Set Android package za.co.teyza.shopper and generated activity za.co.teyza.teyza_shopper.MainActivity; register Base64 SHA-1 key hashes for the real development/upload/Play signing certificates. Set iOS bundle za.co.teyza.shopper. The app ID must match Firebase's Facebook provider.

Enable Facebook in Firebase using its Meta App ID and Meta App Secret. Copy Firebase's exact OAuth redirect URI into Meta's valid OAuth redirect URIs. The Meta APP SECRET belongs only in Firebase's provider settings, never in Dart, a mobile environment variable, GitHub build output or a chat message.

Set the following on Gatcheni2025/Business-lift → Settings → Secrets and variables → Actions:

- Variable TEYZA_FACEBOOK_APP_ID: Meta app ID.
- Secret TEYZA_FACEBOOK_CLIENT_TOKEN: Meta Settings → Advanced → Client Token. This is the client token, NOT the app secret. Client tokens are necessarily included in the native app configuration.

Both values are required together. The native wrapper preparation step installs pinned flutter_facebook_auth 7.1.5, generates its Dart bridge, and configures Android resources/manifest or merged iOS URL schemes. Missing configuration leaves Facebook hidden and omits the entire SDK dependency so it cannot break existing Google, Apple, phone or email plugins. Use freshly generated wrappers when changing provider configuration. Local builds must run prepare_mobile_release.py for their platform before flutter pub get. Do not edit the generated bridge manually.

Meta app roles/test accounts can be used while the Meta app is in development. Complete the Meta settings/review and public access requirements before offering login to everyone. Set the public privacy policy https://teyza.co.za/privacy.html and deletion information https://teyza.co.za/data-deletion.html as appropriate in Meta. Do not claim Facebook login is live until verified on a real device using the actual Meta app and Firebase project.

## Privacy and validation

iPhone uses Facebook Limited Login with a SHA-256 nonce sent to Facebook and the matching raw nonce sent with the Firebase ID-token exchange. Android classic access-token and iPhone limited ID-token formats are handled separately. Only email/public_profile permissions are requested. Automatic Meta app-event logging and advertiser-ID collection are disabled; no ATT permission is requested by this integration. Existing privacy declarations must still reflect all SDKs used in the shipped build.

Tests cover provider token exchange, nonce matching, cancellation, empty tokens, sign-out races, secure Firebase-only session persistence, generated configuration preservation, partial settings rejection, SDK-disabled builds, and an SDK-enabled compile/test job with synthetic configuration. This is not a live OAuth acceptance test. After provider setup, test Google and Apple on iPhone and Google/Facebook on Android, including cancel, wrong account, reopen, shopper navigation and shop-owner navigation. Publish a new signed app build only after those checks. No provider-console changes are made automatically.

Primary references:
- https://firebase.google.com/docs/auth/flutter/federated-auth
- https://firebase.google.com/docs/auth/ios/facebook-login
- https://facebook.meedu.app/docs/7.x.x/android/
- https://facebook.meedu.app/docs/7.x.x/ios/
