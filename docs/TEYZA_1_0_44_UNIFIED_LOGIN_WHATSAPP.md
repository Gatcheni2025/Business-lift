# Teyza 1.0.45 (56): one sign-in, shop details and general approval welcomes

This follows the 1.0.44 (55) release in PR #206.

The Account tab opens one Google/Facebook/Apple sign-in screen. Existing email
users can expand their email/password form. New registration offers **Shopper**
or **Seller**; Seller then offers **Spaza shop owner**, **Business owner** or
**Wholesaler**. The choice preselects registration and never grants approval.

After authentication, the app reads the existing seller, shopper and approved
agent records for the authenticated Firebase UID. One account opens directly.
Multiple existing account types show **Select account**. A first social login
without a completed registration offers the same two registration choices.
Lookup failures offer a retry; they are never treated as a new account.
Provider collisions require the original sign-in method. No identity, payment,
approval or shop is transferred merely because email addresses match.

The shop About card includes its published photo, verified status, address, opening hours and Directions/Message actions in one cream and white card.
Service rows use larger labels, green availability states and responsive layouts
for narrow screens and larger text. Unknown service states stay unconfirmed.

## Provider activation

Android Facebook preparation includes `FacebookActivity`, `CustomTabActivity`
and the `fb<app-id>` callback, without duplicating them on repeated preparation.
Meta login errors retain enough information to identify redirect failures.
Google logout clears the optional native session without delaying local logout.
Firebase's `needConfirmation` response now asks for the original account method.
iOS can use the Google client ID already written to its prepared Info.plist.

Meta app **1410815954487567** must allow the Firebase callback
`https://business-lift-3c19c.firebaseapp.com/__/auth/handler` and the actual
installed app's Android key hash. Firebase Facebook must use that same Meta app.
See `tools/facebook-auth/README.md` and its read-only APK diagnostic.

Google Android authentication requires the actual installed APK's SHA-1 under
Firebase project `business-lift-3c19c`, package `com.asiyedriver.asiye`, with its
matching web OAuth client. The debug preview's signing certificate can differ
from the upload and Google Play certificates. A compiled APK does not establish
that Google or Facebook's live provider settings are correct.

Each new mobile preview includes `test-signing-fingerprints.json`, containing
the compiled APK's public SHA-1/SHA-256, Meta key hash and Firebase callback.
It also compares the certificate against the configured Android Firebase SDK
when that SDK is available. No client token or SDK credential is exported.

## WhatsApp general rollout

After merging and pulling the release branch on the authenticated deployment
computer, run:

```powershell
.\tools\whatsapp-pilot\Deploy-Teyza-WhatsApp-General.ps1 -EnableForNewApprovals
```

This uses the existing pilot's sender, approved welcome template and image.
It deploys only `teyzaWhatsAppWebhook`, `teyzaWhatsAppApprovalCreated` and
`teyzaWhatsAppApprovalPending`. The existing seller API and payment functions
are outside its deployment scope.

The script preserves unrelated environment settings and enables:

```dotenv
TEYZA_WHATSAPP_NOTIFICATIONS_ENABLED=1
TEYZA_WHATSAPP_ROLLOUT_MODE=all
TEYZA_WHATSAPP_ALL_STARTED_AT=<activation milliseconds>
```

The build 55 `all` mode remains supported; `general` is also accepted. A launcher call without `-EnableForNewApprovals` runs read-only checks.

It recovers a missing local cutoff from the deployed worker and retains the activation timestamp for repeated/partially failed deployments.
Historical queued approvals are skipped. New welcomes still require a current
approved seller and matching approved verification submission, explicit current
consent and an Auth-verified phone matching the seller's saved phone.
The transaction claims each outbox entry once. Unknown provider outcomes require
review; they are never automatically retried. Recovery rotates through pending
records so an older configuration failure cannot starve new sellers.

General mode also enables signed delivery receipts and menu replies for every
eligible seller. An ambiguous shared number gets no menu response; STOP revokes
all matching consents. Pilot mode remains available, and the pilot deployment
helper explicitly selects it.

Deploying app source does not activate these functions. After deployment,
verify the next genuine opted-in seller approval: the outbox must move from
`queued` to `accepted`, followed by a signed `delivered` or `read` receipt.
Test Start selling, Advertise, Consultant and STOP on that seller's phone.
Local automated tests mock Meta delivery and do not establish live delivery.
