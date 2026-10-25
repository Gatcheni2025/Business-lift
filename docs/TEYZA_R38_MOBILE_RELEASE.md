# Teyza 1.0.6 (16): account access and mobile releases

## Account behaviour

Choose **Shopper** or **Shop Owner** before signing in. The owner choice supports both **Spaza Shop** and **Other Retail / Wholesale**. They use the existing Firebase project `business-lift-3c19c`, with the same email/password as the current website. The saved `teyzaSellerAccounts/{Firebase UID}.category` (`spaza` or `retail`) identifies the workspace. Selecting Owner cannot create a shop, change its type or grant approval.

Shopper accounts can register in the app. New owners register their shop on the Teyza website, then use that same login here. Verified owners can manage private product drafts. Pending shops stay pending, and only server-published active shops appear in discovery. Missing profiles lead to shop setup; unavailable or denied services lead to Retry, without claiming that a saved shop is missing.

The app retains only refresh credentials in platform secure storage, restores sessions through Firebase, clears revoked sessions, and clears owner data when the account changes. The native workspace includes a back button and safe display area.

Email/password is available on Android and iOS. Android Google login appears only when `TEYZA_GOOGLE_WEB_CLIENT_ID` is configured. The initial iOS build uses email/password; native Google and Apple login are not enabled. Before offering Google on iOS, configure its iOS OAuth client/URL scheme and an equivalent privacy-preserving login such as Sign in with Apple. A Google-only account needs its original supported login method or a configured email/password credential; do not claim that device Google authentication has been tested by the unit suite.

## Build and download

Open **Actions → Teyza Android and iOS Release**. PR builds automatically produce:

- `teyza-android-aab-unsigned`: a real release `.aab` with no debug certificate, plus its SHA-256 and release manifest. It must be signed with the existing Play upload key before upload.
- `teyza-ios-release-unsigned`: a compiled device `.xcarchive.tar.gz` with its SHA-256. Extract it on a Mac, open the archive in Xcode Organizer, and sign/export using the registered app's Apple distribution credentials. It is not an installable or TestFlight `.ipa`.

The existing **Teyza Shopper APK** workflow still produces test APKs. These are for device testing and use test signing.

Android keeps `za.co.teyza.teyza_shopper`. The proposed iOS ID defaults to `za.co.teyza.shopper`; set repository variable `TEYZA_IOS_BUNDLE_ID` to the identifier actually registered in Apple Developer and App Store Connect before a signed build. The default is not a claim that an Apple app record exists.

Each artifact includes `release-manifest.json`: version, commit, signing mode, enabled login methods and binary SHA-256. Unsigned builds never silently use a debug upload key. Signed mode fails if the required credentials are absent.

## Signed Android AAB

In GitHub repository Actions secrets, configure the existing upload key:

| Secret | Value |
| --- | --- |
| `TEYZA_ANDROID_KEYSTORE_BASE64` | Base64 of the existing upload `.jks` |
| `TEYZA_ANDROID_STORE_PASSWORD` | Keystore password |
| `TEYZA_ANDROID_KEY_ALIAS` | Upload key alias |
| `TEYZA_ANDROID_KEY_PASSWORD` | Key password |

Run the workflow on the reviewed branch with **signed_release** selected. The workflow signs with that key, verifies the signature, rejects Android Debug certificates and uploads `teyza-android-aab-signed`. It does not generate a replacement key or submit to Play.

For Google login, set public repository variable `TEYZA_GOOGLE_WEB_CLIENT_ID` to the Firebase project's Web OAuth client ID. Register the Android package with the SHA-1/SHA-256 of the Play **app signing** certificate, plus upload/test certificates when testing those builds. The Play signing certificate differs from the upload key. Verify login in a Play internal-testing install.

## Signed iOS IPA

| Repository setting | Value |
| --- | --- |
| Variable `TEYZA_IOS_BUNDLE_ID` | Registered Apple bundle ID |
| Variable `TEYZA_APPLE_TEAM_ID` | Apple Developer team ID |
| Secret `TEYZA_IOS_CERTIFICATE_BASE64` | Apple Distribution certificate and private key exported as `.p12`, base64 encoded |
| Secret `TEYZA_IOS_CERTIFICATE_PASSWORD` | `.p12` password |
| Secret `TEYZA_IOS_PROFILE_BASE64` | Matching App Store distribution `.mobileprovision`, base64 encoded |
| Secret `TEYZA_IOS_KEYCHAIN_PASSWORD` | Temporary CI keychain password |

The same **signed_release** run validates the team, exact bundle ID and App Store profile type, imports credentials into a temporary keychain, configures Runner signing, builds an archive, exports an App Store IPA and verifies the app signature. Signing material is removed afterwards and never included in artifacts. Both platform credentials are needed for a full signed run. Nothing is uploaded to App Store Connect automatically.

## Release acceptance

Automated checks exercise the real Firebase REST adapter with mocked HTTP: shopper signup/signin/reset, secure restoration, expired refresh rejection, failure handling and signout. Widget tests exercise role entry, Spaza and retail profiles, missing registrations and failed permissions. These do not certify live credentials, deployed Firestore rules or native OAuth.

Before store submission, install through Play internal testing and TestFlight, then verify with one shopper, one registered Spaza owner and one registered retail owner: correct saved shop, wrong-password recovery, email verification, logout/reopen, and account isolation. Verify a different UID cannot read or edit another shop's records using the deployed rules/emulator. Keep existing R2.7 seller/draft rules; do not replace production rules with the repository's older full ruleset.

Complete the store records, support/privacy/data-safety disclosures and account-deletion flow, and supply reviewer login accounts. The in-app account-deletion/data-removal flow still needs completion before submission; this build is release preparation, not an assertion of review readiness. Live checkout and order tracking remain outside the current app's active services.

References: [Flutter Android releases](https://docs.flutter.dev/deployment/android), [Flutter iOS releases](https://docs.flutter.dev/deployment/ios), [Apple review guidelines](https://developer.apple.com/app-store/review/guidelines/).
