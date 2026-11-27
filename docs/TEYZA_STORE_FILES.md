# Teyza — signed files for Google Play and Apple App Store

Current app: **1.0.13 (23)**. Android package: `za.co.teyza.teyza_shopper`.
iOS bundle: `za.co.teyza.shopper`. Existing native Firebase identities, R3.15
uploads/registration and R3.16 admin source are retained.

## Files and current status

| File | Use |
| --- | --- |
| Signed `.aab` | Upload to Google Play Console, initially Internal testing |
| Production-signed `.apk` | Install directly on Android; same upload key and version as the AAB |
| Signed `.ipa` | Upload to App Store Connect/TestFlight with Transporter or Xcode |
| Existing test APK | Phone testing only; uses the retained Android test certificate |
| Existing unsigned AAB / unsigned Xcode archive | Build preparation only; not uploadable store releases |

The new **Teyza signed Play Store and App Store files** workflow runs on pushes
to `release/teyza-store-files`. Its configuration job lists only missing setting
names and uploads a small configuration report. It selects whichever platform
has complete signing/OAuth settings; it does not create a replacement upload key
or fall back to unsigned files. Once settings are supplied, open the latest run
and choose **Re-run all jobs**. This works without first merging the workflow
into `main` for the manual Run workflow button.

Actions: https://github.com/Gatcheni2025/Business-lift/actions
Secrets: https://github.com/Gatcheni2025/Business-lift/settings/secrets/actions
Variables: https://github.com/Gatcheni2025/Business-lift/settings/variables/actions

## Set signing credentials from Windows

### First Teyza release — create the Android upload key

First-release status has been confirmed. Download the updated setup kit, extract
it, open PowerShell in that folder and run:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
.\FIRST-ANDROID-RELEASE.ps1
```

GitHub CLI is already authenticated as `Gatcheni2025`. The helper also needs
Java `keytool` (a JDK or Android Studio supplies it) and the existing Firebase CLI
login for `business-lift-3c19c`. If Java is unavailable it stops before creating
or uploading a key. Install Java with `winget install Microsoft.OpenJDK.21`,
then reopen PowerShell and retry the helper. If Firebase asks for authentication, run `firebase login`
and rerun the same helper.

Choose and confirm your own password when prompted; its text stays hidden. The
helper creates **`%USERPROFILE%\Teyza-Signing\teyza-upload.jks`**, alias
`teyza-upload`, with RSA 4096 and 10,000-day validity. It sends the four Android
signing settings directly to GitHub Secrets; no production private key is created
inside ChatGPT or included in this download. Keep a private backup of the local
keystore and password. A retry opens the existing key and never regenerates it.
An unrelated pre-existing repository key blocks creation until its backup is
located. Failed network/configuration steps leave the local keystore available.

The helper registers the public upload-certificate SHA-1/SHA-256 against the
existing Teyza Android Firebase app and reads its SDK configuration to obtain
the unique Web OAuth client. It preserves existing certificate hashes, native
registrations, rules, data, secrets and deployments. It also saves the iOS OAuth
client when available from the matching existing iOS SDK configuration. If no
unique Web OAuth client is returned, enable Google in Firebase Authentication's
Sign-in method and rerun; it does not guess an ID or recreate the Firebase app.

After Android setup it automatically requests a rerun of the latest signed
store-file workflow. Android can build while Apple signing is still incomplete.
This is a build request, not a Play Store submission. When the first AAB is
enrolled in Google Play App Signing, also register the **Google Play app-signing
certificate's SHA-1 and SHA-256** in the same Firebase Android app. Google Play
signs distributed installs with that certificate; the upload certificate used
by the direct APK remains registered as well.

### Existing signing files / Apple setup

The optional `SET-STORE-SIGNING.ps1` helper uses GitHub CLI, asks for passwords
securely, and sends private values directly to GitHub Secrets through stdin.
Run it only on your own computer with your existing Teyza signing files. The
setup ZIP contains code/instructions, not private keys or certificates.

Install GitHub CLI from https://cli.github.com, open PowerShell in the extracted
setup kit, and run:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force
gh auth login
```

For Android, use the existing Teyza **upload keystore**, its alias and passwords:

```powershell
.\SET-STORE-SIGNING.ps1 -Platform Android `
  -KeystorePath "C:\path\to\teyza-upload.jks" `
  -GoogleWebClientId "YOUR_WEB_CLIENT_ID.apps.googleusercontent.com"
```

If this is Teyza's first Google Play release and no upload key exists, create
an upload keystore locally following Flutter's official Android signing guide.
Keep a private backup. If Teyza already has a Play app, use that app's existing
upload key or complete Google's upload-key reset process. The Android debug/test
keystore is not a production upload key. Do not reuse Asiye/Tavora keys by guess.

For iOS, export an **Apple Distribution .p12 including its private key** and a
matching **App Store distribution provisioning profile** for `za.co.teyza.shopper`.
Enable Sign in with Apple and Push Notifications on that Apple App ID. Then run:

```powershell
.\SET-STORE-SIGNING.ps1 -Platform iOS `
  -CertificatePath "C:\path\to\Teyza-Distribution.p12" `
  -ProfilePath "C:\path\to\Teyza-AppStore.mobileprovision" `
  -AppleTeamId "YOURTEAMID1" `
  -GoogleWebClientId "YOUR_WEB_CLIENT_ID.apps.googleusercontent.com" `
  -GoogleIosClientId "YOUR_IOS_CLIENT_ID.apps.googleusercontent.com"
```

The helper generates a password only for the CI runner's temporary signing
keychain. It does not generate or rotate an Apple distribution certificate.
Keep passwords, keystores, .p12 and provisioning files off chat and out of git.

Alternatively add these existing values directly in repository Actions settings:

| Platform | GitHub Secrets | GitHub Variables |
| --- | --- | --- |
| Android | `TEYZA_ANDROID_KEYSTORE_BASE64`, `TEYZA_ANDROID_STORE_PASSWORD`, `TEYZA_ANDROID_KEY_ALIAS`, `TEYZA_ANDROID_KEY_PASSWORD` | `TEYZA_GOOGLE_WEB_CLIENT_ID` |
| iOS | `TEYZA_IOS_CERTIFICATE_BASE64`, `TEYZA_IOS_CERTIFICATE_PASSWORD`, `TEYZA_IOS_PROFILE_BASE64`, `TEYZA_IOS_KEYCHAIN_PASSWORD` | `TEYZA_APPLE_TEAM_ID`, `TEYZA_GOOGLE_WEB_CLIENT_ID`, `TEYZA_GOOGLE_IOS_CLIENT_ID` |

Google OAuth IDs must belong to the existing Firebase project. A Web API key
is not an OAuth client ID. Firebase Google/Apple providers and iOS APNs setup
still need correct provider-side configuration; compiling the app does not
establish physical-device login or push acceptance.

## Download and upload signed builds

After a successful run, download these artifacts at the bottom of its page:

- **teyza-android-aab-signed**: contains the signed AAB, production-signed APK,
  manifest hashes, public certificate details and Android target/identity checks.
- **teyza-ios-release-signed**: contains the signed IPA, signed Xcode archive
  and release manifest. The App Store profile must match the Apple team/bundle
  and Apple sign-in capability. CI removes private signing files after building.

Android packaging verifies the AAB signature, rejects debug certificates, checks
the actual APK application ID/version, target API 36 or higher, signature
verification, the same certificate on APK/AAB and 16 KiB ZIP alignment. A new
Google Play upload must use a version code greater than any already uploaded
version; if 23 has been used in your Play account, bump the app build before rerun.

Upload the AAB to Play Console Internal testing and upload the IPA with
Transporter/Xcode to App Store Connect/TestFlight. The workflow creates files;
it does not submit or publish a store listing. Confirm Google/Apple sign-in,
phone OTP, private registration uploads, seller approval, shop photos and push
on physical devices before requesting store review. Existing release manifests
retain unverified device flags until a real test is recorded.

Official references:
https://docs.flutter.dev/deployment/android
https://docs.flutter.dev/deployment/ios
https://developer.android.com/google/play/requirements/target-sdk
