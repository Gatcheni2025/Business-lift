# Native Teyza field-agent mobile release — 1.0.41+52

## User journey
The field worker applies at https://teyza.co.za/work.html using an existing Firebase Teyza identity. Admin approves the application only after reviewing ID/passport and CV. The mobile app uses the **same UID** as the Shopper sign-in. A server request to `agent_profile` must report `status=approved` and the matching UID before the role chooser offers Agent.

The options are Shopper, Agent and Seller/Business. Choosing Agent never grants Firestore privileges, credits a R90 reward, or makes a seller Premium. Backend authorization remains compulsory on every visit/photo/action; pending and suspended agents cannot use the field workspace.

Agent mode: town and GPS discovery, verified Teyza/Google/wholesale pins when native maps keys are configured, real listings and directions. New owner-approved visit → save GPS onsite → private shop-front photo → in-shop agent selfie → manually open WhatsApp invitation with owner consent → owner signs in and confirms through Teyza owner-confirm page → Admin review. R90 records are verified, payable manually, not transferred by this app.

## Native Google Maps SDK key prerequisites
The existing `teyza-maps` website Maps JavaScript API key is **not suitable for Android/iOS apps**. In Google Cloud create separate API keys for the **Maps SDK for Android** and **Maps SDK for iOS**, enable their APIs and link the appropriate billing configuration. Restrict Android key to the existing Play application ID `com.asiyedriver.asiye` and all relevant signing-certificate SHA-1 fingerprints (Play App Signing and the reviewed QA/upload certificate where testing). Restrict iOS key to `za.co.teyza.shopper` (or the exact already registered iOS bundle ID). Do not share unrestricted keys or put keys in the repository.

Add two GitHub Actions secrets: `TEYZA_GOOGLE_MAPS_ANDROID_KEY` and `TEYZA_GOOGLE_MAPS_IOS_KEY`. `prepare_mobile_release.py` inserts them only into generated native wrappers; the Flutter release command enables GoogleMap only when the key is present. If absent, unsigned/QA builds show genuine shop results and external directions, **not a fake or blank native map**. Production signed builds fail closed when a requested platform is missing its native Maps key.

## Release gates
- Review and merge PR only after the **Teyza Android and iOS Release** PR workflow compiles/analyzes/tests, plus existing shopper and seller mode tests.
- Never deploy a newer Firebase backend, migrate accounts, change Play upload keys or alter Paystack to make this mobile UI compile.
- App version in `pubspec.yaml` is `1.0.41+52`, above `1.0.40+51`. Confirm Play Console's currently published version code before upload.
- The original release workflow already requires Google/Facebook/Apple/Firebase configuration, Android upload keystore and Apple signing secrets. Do not substitute another keystore for Play or TestFlight.
- Sign a QA build first, using real accounts created specifically for QA and a genuine approved test agent. Confirm role chooser, switching, near-me results and permissions before Play production and TestFlight rollout.

## Operator commands after merge

From Windows PowerShell, on a clean checkout at the reviewed merge SHA:

```powershell
$ErrorActionPreference = "Stop"
Set-Location "$HOME\Downloads\Business-lift"
git fetch origin
git switch release/teyza-ads-web-qa-signed-20261111
git pull --ff-only origin release/teyza-ads-web-qa-signed-20261111

# Review CI first, and explicitly request one signed QA run.
$sha = (git rev-parse HEAD).Trim()
gh workflow run teyza-mobile-release.yml --repo Gatcheni2025/Business-lift `
  --ref release/teyza-ads-web-qa-signed-20261111 `
  -f signed_release=true -f qa_signing_only=true `
  -f platforms=all -f upload_to_testflight=false `
  -f expected_source_sha=$sha

gh run list --repo Gatcheni2025/Business-lift --workflow teyza-mobile-release.yml --limit 5
```

After the QA build is completed, download its **specific successful run** artifacts (signed Android APK and AAB, and signed iOS IPA if Apple signing is configured) using `gh run download <run-id> --repo Gatcheni2025/Business-lift -D .\teyza-qa-1.0.41`. No artifacts are created by the PR merge alone.

For production, request `qa_signing_only=false` only after mobile and backend checks are green and Play versioning is confirmed. Upload to TestFlight is optional and requires an approved App Store Connect setup. iOS `.ipa` is not an Android file and cannot be installed on Android. Apple/TestFlight availability depends on Apple signing and the Apple account, not just Flutter compilation.

## Explicit pilot checks
1. Field agent signs in via existing Shopper login; approved UID gets Shopper / Agent / Seller choice. A pending agent and a different UID do not.
2. Agent opens map, selects Durban or another real area. Registered shops are not offered for duplicate fresh registration.
3. Agent visits a consenting shop, verifies name/address, captures live GPS, a fresh shop-front image and an in-shop selfie using the phone camera. No gallery reuse.
4. Agent sends a WhatsApp message **manually with owner permission**. It is not a server-delivered message. The owner signs in using their own Teyza account and confirms.
5. Admin sees private evidence and accepts or requests changes; agent cannot self-approve or receive R90 from a pending seller.
6. Seller sees Premium benefits separately; the app must never initiate unapproved external payment or misreport already paid rewards.
7. Switch to Shopper, Seller and Agent without changing the Firebase UID or losing private shopper data, on both Android and iOS.
