# Teyza R3.13 — connected seller registration

Flutter version **1.0.11 (21)**; scoped mobile service **3.13.0**.

## What changes

The “shop services are not connected” message was caused by a 404 at the mobile
Cloud Function. A new app alone cannot deploy that missing service. The app now
shows an actionable activation reference instead of suggesting endless retries.

Camera capture no longer waits for service health. A seller can create a pending
shop profile and add private catalogue drafts through the existing owner-only
Firestore rules when the mobile endpoint is unavailable. Camera previews and
private drafts do not claim a successful verification or public listing.

Registration is resumable from **Complete registration & start selling**:

1. Choose **Individual seller** or **Registered company**, independently of Spaza
   versus Retail / Wholesale. Companies must supply their registered name and
   company registration number.
2. Individuals submit an ID or passport number and a clear document photograph.
   Companies submit a clear photograph of their company registration certificate.
   A camera photo or an existing document photo is supported; PDF import is not
   implemented in this release.
3. Submit a front-camera owner selfie with explicit consent.
4. Verify the registered mobile number with a real Firebase SMS OTP.
5. Finish setup. The server rechecks every requirement and publishes the shop and
   the seller’s selected canonical catalogue, including the seller’s actual
   prices and stock. Selecting a role or submitting `phoneVerified: true` grants
   no entitlement. Admin review is separate: completed shops can sell while
   identity review is pending; only approved identities receive the badge.

This completion entitlement is `sellingEnabled`, written only by the server.
Existing billing, payment and sponsor fields are preserved; this does not record
payment or set the legacy paid-plan `catalogueEnabled` flag. Existing basic
listings that have not completed this new flow retain their previous behavior.
Custom products and replacement product photos retain catalogue review.

## Activate the missing service

Use Node 22, the Firebase CLI and an account authorised for the existing
`business-lift-3c19c` project. Extract the complete deployment kit, open PowerShell
in that folder, and run:

```powershell
firebase login
.\ACTIVATE-TEYZA.ps1 -AndroidSha1 YOUR_INSTALLED_APK_SHA1 -AndroidSha256 YOUR_INSTALLED_APK_SHA256
```

Replace those two placeholders with the verified public certificate fingerprints
in `test-signing-fingerprints.json` from the same Android test-build artifact.
The APK SHA-256 hash is different from its signing-certificate SHA-256: use the
`sha1` and `sha256` fields. For the Play-distributed build, register the Play App
Signing certificate fingerprints instead of the test certificate. The SHA
arguments are optional when the correct certificate is already registered.

The helper reuses native apps matching the existing Android package
`za.co.teyza.teyza_shopper` and iOS bundle `za.co.teyza.shopper`, or creates those
native registrations if missing. It rejects other project/native app IDs, writes
public native configuration, preserves an existing verification encryption key,
runs backend tests, and deploys **only** the `teyza-mobile` functions codebase.
It checks live health and fails unless it reports **3.13.0**,
`sellerOnboarding: true` and `catalogueProducts: 184`. Hosting and unrelated
functions are not deployed. No production deployment was performed in the coding
session that prepared this release.

In the [Firebase Authentication console](https://console.firebase.google.com/project/business-lift-3c19c/authentication/providers):

- Enable **Phone** and permit the intended SMS regions, including South Africa.
  Confirm billing/SMS quota and Android SHA-1/SHA-256 settings.
- Register actual native app identities. Android can load its validated native
  app ID from the deployed service when a preparation build has no compiled ID.
- For subsequent native builds, set the two public CI variables written into
  `TEYZA-NATIVE-BUILD-VARIABLES.txt`. iOS must be rebuilt with its registered app
  ID so the encoded Firebase Auth callback scheme is compiled into Info.plist.
  APNs, background remote notifications and real Apple distribution signing are
  also required. These preparation artifacts are unsigned for the stores.

If private Firestore operations return 403, use the retained **R3.10 seller
access repair** with a copy of the CURRENT published rules. Its scoped merge
preserves unrelated collections. Do not replace live rules with the repository’s
legacy root rules. Identity/onboarding records are server-only; do not add client
read/write grants for those collections to resolve seller access errors.

## Identity privacy and administrator review

Documents and selfies are re-encoded without metadata and AES-GCM encrypted in
private storage, with no public download token. ID/passport numbers and submitted
company document details are encrypted separately. Every upload gets a cleanup
record before storage, including interrupted and replacement captures. Private
evidence expires after 90 days. The cleanup also removes the encrypted submitted
document details; registered business profile fields are retained separately.

The server reads the actual Firebase Auth user record and requires the shop
number to match its linked phone provider. SMS linking supplies the existing
session’s ID token; a conflicting phone account, different UID, new-user response
or temporary proof cannot silently create a second seller. Sign-out/account
changes clear pending proof. There is no test OTP bypass in application code. Android instant verification
uses a server-minted native session for the same UID, links the actual native
phone credential, then checks the original REST session’s current phone provider.
The temporary native session signs out after linking. A phone-bootstrap token
cannot renew administrator review access. Its Cloud Functions runtime service
account needs IAM Service Account Credentials API / signBlob permission for
Admin SDK custom-token signing; grant only the required service-account signing
permission if the installed project does not already provide it. Manual SMS
code linking does not require custom-token signing.

A trusted reviewer needs `teyzaAdmin: true`, verified email and authentication
within five minutes. The server requires recent view receipts for BOTH current
private images and binds approval to their exact submission/evidence IDs. An
administrator cannot approve their own shop. The existing reviewer-claim helper
preserves other custom claims. Review images/details clear on backgrounding or
account changes; the UI offers no public document URL.

Replacing documents invalidates earlier reviews. A phone change pauses selling
until the new number is verified and setup is completed again. A rejected or
paused-by-review seller cannot bypass moderation by resubmitting or completing
again. A pending identity never displays an approved badge.

## Required acceptance before store submission

Use two fresh test accounts on physical devices: one individual Spaza seller,
one registered company/retail seller. Verify actual SMS delivery/linking, camera
permission denial and recovery, private evidence upload, resumable registration,
public seller-specific stock, admin document/selfie review and a moderation pause.
Confirm identity images/numbers/phone do not appear in public directory responses.

The automated checks and unsigned artifacts establish implementation/build
readiness; they do not establish live SMS delivery, a deployed backend, identity
accuracy, APNs delivery or store approval. This is manual document/selfie review,
not an automated face match or government identity validation.

Implementation references: [Firebase Flutter Phone Auth](https://firebase.google.com/docs/auth/flutter/phone-auth),
[existing-account phone linking](https://docs.cloud.google.com/identity-platform/docs/reference/rest/v1/accounts/signInWithPhoneNumber),
[iOS Firebase Auth callback scheme](https://github.com/firebase/firebase-ios-sdk/blob/main/FirebaseAuth/Sources/Swift/AuthProvider/PhoneAuthProvider.swift),
[Firebase CLI native app management](https://firebase.google.com/docs/cli).
