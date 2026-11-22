# Teyza Facebook Login - Meta/Firebase production repair

**Scope:** Teyza mobile Shopper/Shop Owner sign-in and the existing /pay/ and /ads/ website portals.
**Operator action required:** This is a configuration failure in Meta's OAuth validation; editing source or merging a PR cannot change Meta or Firebase Console settings.

## Verified source identities (signed workflow #44552959018)

- Firebase project: `business-lift-3c19c`
- Meta App ID **1410815954487567**, present in the actual signed Android/iOS job logs (not only a synthetic optional test)
- Firebase website authDomain: `business-lift-3c19c.firebaseapp.com`
- Firebase **Facebook OAuth redirect URI**:
  `https://business-lift-3c19c.firebaseapp.com/__/auth/handler`
- Public website origins: `https://teyza.co.za`, `https://www.teyza.co.za` if www is in use
- Android application ID: `com.asiyedriver.asiye` (existing Play package - do not change it for an OAuth fix)
- iOS bundle ID: `za.co.teyza.shopper`
- Native iOS Facebook callback scheme: `fb1410815954487567`
- Native Facebook provider: `flutter_facebook_auth: 7.1.5`, enabled by GitHub variables `TEYZA_FACEBOOK_APP_ID` and secret `TEYZA_FACEBOOK_CLIENT_TOKEN` in signed builds

## Fix Meta + Firebase consoles first

1. In **Meta for Developers -> App 1410815954487567 -> Facebook Login -> Settings** (or **Use Cases -> Authentication and Account Creation -> Customize -> Settings**), enable **Client OAuth Login** and **Web OAuth Login**. If the mobile SDK falls back to Chrome Custom Tabs, check the **Embedded Browser OAuth Login** setting as well, within Meta's current policy. Keep strict HTTPS redirect enforcement.
2. Under **Valid OAuth Redirect URIs**, add the **exact** Firebase callback:
   `https://business-lift-3c19c.firebaseapp.com/__/auth/handler`
   Do not enter only `teyza.co.za`, the root of the Firebase domain, or an arbitrary wildcard. If the **actual browser error URL** includes another `redirect_uri`, compare that exact decoded value before approving it; DO NOT share the full URL because its `state` and `code` may be sensitive.
3. Under Meta basic settings, add `teyza.co.za` to **App Domains** and configure Website, Android and iOS platforms with their matching public identifiers. Verify App availability to intended users and required permissions for Facebook Login. **Do not confuse the Facebook Login app with a separate Meta WhatsApp or Pages OAuth app.**
4. Under **Firebase Console -> business-lift-3c19c -> Authentication -> Sign-in method -> Facebook**, enable Facebook and confirm App ID **1410815954487567** and the corresponding Meta **App Secret**. Paste the secret only into Firebase's secure form; never GitHub, chat, browser logs or client code. Under Firebase Auth authorized domains allow `teyza.co.za` and `www.teyza.co.za` only if hosted there; the Firebase auth domain must remain authorized.
5. In **Meta -> App Settings -> Basic -> Android**, add the relevant app key hashes (**base64 of signing certificate SHA-1 bytes**). For **Google Play installed apps**, take the **App signing key certificate SHA-1** from **Play Console -> Setup -> App integrity**. For directly installed signed APKs, use the APK's signing certificate, which can differ. Do **not** paste a literal hexadecimal SHA-1 string in Meta's Key Hashes field. Use `Check-Teyza-Facebook-Auth.ps1 -CertificateSha1 '<40 hex digits>'` to convert it, or pass `-ApkPath` for a signed APK.
6. Under **Meta -> App Settings -> Basic -> iOS**, confirm bundle ID `za.co.teyza.shopper`. The compiled Info.plist must retain the native URL scheme `fb1410815954487567` and client token.
7. **Test website first**: private window -> `https://teyza.co.za/pay/` -> Continue with Facebook, then `https://teyza.co.za/ads/`. Expect the same original Firebase UID for an existing seller. Verify only authenticated, eligible sellers can see the existing checkout; no unauthorised seller access, discounts, duplicate charges or automatic account merges.
8. **Test mobile** on the **installed signed APK**, then **Google Play test track**, then iOS **TestFlight**. For an existing seller already using Google or legacy email, first sign into the original UID and select **Link Facebook** at the website if offered; do not independently register a duplicate Facebook UID. Confirm saved shop, billing entitlement, product ownership and admin approvals remain bound to the same UID.
9. If Meta still says **URL Blocked**, capture ONLY the `redirect_uri` query parameter from the failed Facebook URL (URL decode it locally). Compare it with the Firebase handler and any expected native callback; avoid exposing `state`, auth codes, access tokens or App Secret.
10. If the website succeeds but Android fails, inspect Android **CustomTabActivity**/intent filters and **Key Hashes**; if iOS fails, inspect the **fb<AppID> URL scheme** and Meta client token. A single browser screenshot cannot prove which of these additional platform checks are missing.

## Source repair in this PR

- Android build preparation explicitly declares **FacebookActivity** and **CustomTabActivity**, with `fb_login_protocol_scheme`, and makes configuration idempotent.
- A sign-in blocked redirect now displays a helpful message in the Teyza mobile UI instead of an unhelpful generic provider error.
- A read-only PowerShell diagnostic lists the correct public settings and calculates a Meta Android key hash from an installed APK signing certificate or a Play Console SHA-1 fingerprint. It never reads keystore passwords, Meta App Secret, login tokens or user data.
- Tests verify the Android callback route and the user-facing error message.

## Deployment safety

This PR does **not** modify production `/pay/`, `/ads/`, website hosting, Paystack, WhatsApp business, approved seller records, signing key materials, nor the archived signed 1.0.40+51 release. Its source changes require a separate future mobile version after console repair and successful CI. Facebook login may start working on existing signed builds immediately after correcting Meta/Firebase console configuration, without new downloads.

## Relevant provider documentation

- Firebase: https://firebase.google.com/docs/auth/web/facebook-login
- Flutter Facebook Auth Android: https://facebook.meedu.app/docs/7.x.x/android/
