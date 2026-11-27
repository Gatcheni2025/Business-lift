# Teyza registration completion and WhatsApp welcome review

Date: 25 November 2026 (South Africa)

## Review scope and current conclusion

This change improves the existing native business registration in
`apps/teyza_shopper` and its `services/teyza-mobile-v39` backend. The base is
`release/teyza-ads-web-qa-signed-20261111` at
`a3df18c948b5cf7c96b35b9d62081a911e43530f`.

The earlier review of the default branch described older web screens. The
current native release already has a required contact number, optional WhatsApp
consent, three registration stages and five verification checks. It does not
need a second registration system.

The source implements an approval welcome message: an eligible seller opts in,
verifies the registered phone and is approved by an administrator before the
welcome can be queued. It is not an immediate message to every new signup.
Production delivery to a recipient has **not** been verified in this review.

## Changes prepared

### Business owners can resume unfinished work

- Basic registration fields are saved on the device using the existing secure
  storage, scoped to the signed-in user and expiring after seven days.
- Drafts contain business/contact fields and address text. They exclude private
  document images, personal ID/passport numbers, selfies, Google selection or claim tokens,
  ownership attestations and consent checkboxes.
- Restored address text requires a fresh Google address selection. Owners must
  confirm their consent again. Changing the phone clears WhatsApp consent.
- Draft saving is debounced and serialized. A slow save cannot recreate a draft
  after a successful registration removes it. Saving failures offer a retry,
  and owners can explicitly discard a draft.
- Returning owners start at the first unfinished verification step. The app
  shows saved checks, a next action, and distinct submitted/approved states.
- Registration validation explains the missing or invalid input when Next is
  tapped, instead of leaving an unexplained disabled button.

The verification sequence remains identity document, owner selfie, SMS phone
verification, shop-front photo, and shop location. The app distinguishes saving
those checks from submitting the application and receiving approval.

### A completed application must match current evidence

- The server supplies the authoritative five-step progress result.
- Initial submission requires a valid owner-scoped shop photo and a current,
  consented map location matching the registered address, in addition to the
  existing identity, selfie, verified-phone and moderation checks.
- Repeating a completed submission returns its existing result without
  resetting its original timestamp or recreating its public listing.
- Replacement identity/selfie evidence must be submitted before a fresh admin
  approval; an older completion timestamp is insufficient.
- An existing approval survives the scheduled removal of private verification
  files. This requires the approved account, owning evidence IDs, selfie
  submission and verified phone to continue matching the recorded submission.
  Expired pending evidence cannot use this exception to submit or gain approval.
- A previously approved owner's shop pin can still need maintenance. That is
  shown accurately without erasing the original approval or forcing a new
  registration.

Existing publication, membership, payment, moderation and administrator
authorization rules remain in place.

### WhatsApp delivery records are more reliable

- Signed Meta receipts are reconciled with the exact accepted welcome message.
- A receipt arriving before the sender stores Meta's acceptance is retained in
  a small hashed record and applied when acceptance is recorded.
- Older delivery rows without recorded provenance are confirmed only when a
  fresh matching signed receipt arrives. Historical rows are not blindly
  backfilled as delivered.
- Transactions prevent concurrent or late callbacks from replacing delivered
  or read with an earlier state. A late successful receipt can resolve a
  previously failed state.
- If a database acknowledgement is lost after acceptance committed, the sender
  does not overwrite that durable result with an uncertain outcome.
- Uncertain send attempts are not blindly retried, avoiding duplicate welcomes.
- Diagnostic errors retain only safe numeric codes, not raw provider errors,
  message text or recipient details.
- Existing rollout, verified phone, approval, consent, STOP and signature gates
  remain enforced. No additional message series is enabled.

### Administrators can distinguish acceptance from delivery

The WhatsApp overview reports sending state and matched receipt state
separately. Its maximum 100-record sample is explicitly labelled as a sample in
document-ID order; the 101st record is only an overflow indicator. General
webhook event totals are not treated as delivery of a particular welcome.

Business Overview and Verification tabs show a welcome record scoped to the
seller's current verification submission. Current consent is separate from the
historical result of that message. Missing or mismatched records remain
unverified. No send or resend button is added.

| State | What the evidence supports |
| --- | --- |
| Queued | A welcome is waiting for processing. |
| Accepted | Meta accepted the send request. |
| Sent | A signed sent receipt exists; recipient delivery is unconfirmed. |
| Delivered | A signed delivered receipt matches this message. |
| Read | A signed read receipt matches this message. |
| Failed | A signed failure receipt exists, with a safe numeric code when supplied. |
| Uncertain | The send outcome needs investigation before considering a retry. |

The API's configuration check is labelled as belonging to the API instance. It
does not claim that the separate sending worker is deployed, enabled or running.
The phone ID and Meta API-version format checks also correct overescaped
regular expressions that rejected valid configured values.

## Live observations and limits

The public health endpoint responded successfully during this review:

`https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile`

It reported version `3.25.0`, registration/onboarding availability, verification
uploads ready, WhatsApp approval opt-in, Google place claims, address
autocomplete and shop-front photos. This confirms API availability and exposed
capability flags. It does not confirm deployed sender configuration, a current
Meta subscription, delivery receipts, or the store build on an owner's device.

The supplied Firebase screenshot identifies the matching project
`business-lift-3c19c`. A screenshot of General project settings does not grant
authenticated access to the message records. Firebase access was suggested;
no active Firebase tool/connection was available for live receipt inspection.

No production registration was submitted, no WhatsApp was sent, and no backend,
admin site or mobile release was deployed in this review. Meta ad budgets,
campaigns and activation states were not modified.

## Validation

- Full backend suite: **380 tests passed, zero failures** after installing the
  repository's locked dependencies. Local Node was `24.22.3`; CI declares
  Node 22 and must also pass before release.
- Includes receipt ordering/concurrency, early callbacks, consent/STOP,
  sender/submission isolation, registration completion, replacement evidence,
  retention, moderation and existing commerce regressions.
- Native focused suite: **37 tests passed** covering draft restore, retention,
  user isolation, submission cleanup, validation, resume, legacy responses and
  submitted/approved states. The analyzer completed without errors or warnings
  (seven existing Material/Radio deprecation infos).
- Offline widget screenshots exercised resumed and awaiting-review screens.
  The small-phone case also checks a 320-pixel viewport at 1.5x text scaling.
  These previews do not replace a signed-device or live registration test.
- Admin: 36 operations tests passed; changed browser scenarios are added and
  syntax checked. Local execution was blocked because Chromium was absent and
  the official Playwright download returned HTTP 403. Run those scenarios in CI.

Reproduction from the repository:

```sh
cd services/teyza-mobile-v39
npm ci --ignore-scripts --no-audit --no-fund
npm test
```

From `apps/teyza_shopper`, with Flutter installed:

```sh
flutter pub get
flutter test --no-pub test/registration_completion_test.dart \
  test/seller_onboarding_test.dart test/seller_experience_test.dart \
  test/shop_address_test.dart
dart analyze lib/seller_registration.dart lib/seller_onboarding.dart \
  lib/seller_registration_draft.dart test/registration_completion_test.dart
TEYZA_CAPTURE_UI=1 flutter test --no-pub test/registration_completion_test.dart \
  --plain-name 'Resumed and submitted registration remain readable on small phones'
```

## Release and live verification still required

1. Review this change against the current release branch and pass its Node 22,
   Flutter and admin-browser CI jobs.
2. Review deployment scope for the mobile API, WhatsApp worker/webhook modules
   and admin assets. Preserve the existing approved template and rollout
   configuration. Building code alone does not update deployed functions.
3. Create the appropriate signed Android/iOS builds and confirm the installed
   version. The app supports the older onboarding response while the new API
   fields roll out, but the new server validation requires a backend release.
4. Use authenticated read access to inspect an opted-in approved seller's
   current welcome record and its matched signed receipt. Record acceptance,
   sent, delivered and read separately. Do not infer a successful delivery from
   a template approval, worker flag or HTTP response.
5. If an end-to-end send is still necessary, choose an explicitly approved test
   recipient and seller first. Inspect existing attempts to avoid duplicate
   messages. A live test was not authorized to an identified recipient here.
6. Exercise fresh signup, exit/reopen, a rejected upload, OTP retry, submission,
   admin review and approval on a signed device build. Confirm owners can leave
   and resume, and that their own device receives the expected welcome.

Abandonment reminders at later intervals are a separate change. Current
registration consent describes an approval update and getting-started link;
it does not establish permission for a new reminder series. A reminder rollout
needs explicit matching opt-in, approved message content, a precise unfinished
step destination, deduplication and stop conditions when the owner completes or
opts out. No reminder schedule or expanded consent was silently introduced.
