# Teyza mobile services R3.9

This isolated Firebase codebase connects the Flutter seller and shopper dashboards. It does not replace the website, Places function, existing Firebase project, seller rules or subscription approval flow.

## Deploy from Windows PowerShell

Use Node.js 22 and an authorised Firebase CLI login. The existing project is `business-lift-3c19c`.

1. Run `SETUP-VERIFICATION-KEY.ps1` once from this kit. It creates a random encryption key in Secret Manager and keeps an existing key. Never replace the key while encrypted selfie records still exist.
2. Run `DEPLOY-MOBILE.ps1`. It installs locked dependencies, runs service tests and deploys only codebase `teyza-mobile` with `teyzaMobile` and `teyzaMobilePurgeSelfies`.
3. Open `https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile`. Expect `ok: true`, `version: 3.9.0`. A POST without a Firebase bearer token must return 401.
4. Check that anonymous and unrelated authenticated users cannot directly read any new private collections or the `teyza-private/mobile-verification` Storage prefix. Keep the existing deny-by-default rules. Do not replace the full Firestore/Storage rulesets, and do not add broad authenticated-user access.
5. Install the new APK and test with separate verified shopper, Spaza owner and Retail owner accounts. Configure shop services and hours, submit products/photos for review, exchange messages, request collection/delivery, then confirm and complete from the seller dashboard.

No app client writes approvals, public catalogues, credit decisions or identity-review outcomes. Service requests use verified Firebase identities. Selected screen roles and submitted UID fields are not authorization.

## What is connected

- Owner-read shop summaries; validated delivery fee/radius, collection, card payments, cash-back and chat settings; weekly South African trading hours; saved stock lists.
- Authenticated chat for Firebase UID shop listings, polling while the page is active. Both parties are bound to the conversation; messages are idempotent and rate-limited. Push notifications are not implemented.
- Order requests with server-derived product prices and enabled fulfilment. Confirming reserves published stock in a Firestore transaction. Cancelling releases reservations. Payment is arranged with the shop; this service does not charge cards, disburse cash back or book a courier.
- Private finance enquiries with contact consent, amount and purpose. Status is `enquiry_received`. There is no lender integration, automated approval, loan contract or disbursement.
- Supermarket/wholesaler website links and a saved stock shopping list. The owner completes ordering/payment on the supplier website; no supplier API or commercial partnership is implied.
- Camera selfies, image decoding/re-encoding to remove metadata, AES-256-GCM encryption and a private object path without a download token. Selfies are for manual review, not automated liveness or face matching. A scheduled function removes photos after their 90-day retention period; verify the scheduler runs successfully. No selfie is put in the public shop directory.

## Collections and reviewer actions

Private server-managed collections: `teyzaShopSettings`, `teyzaCreditEnquiries/{ownerUid}/requests`, `teyzaMobileVerification`, `teyzaProductPhotos/{ownerUid}/items`, `teyzaCatalogueSubmissions`, `teyzaMobileChats/{id}/messages`, `teyzaMobileOrders`, `teyzaMobileOrderIndex`, `teyzaMobileChatIndex`, `teyzaMobileLimits`.

Product drafts remain in the existing R2.7 path/schema. Owners can submit a catalogue for review. Only an account with the trusted custom claim `teyzaAdmin: true` can call `catalogue_review` with `sellerUid`. The server also requires the seller account to be approved, its listing active, and the existing public shop to have trusted `catalogueEnabled: true`. Set that flag only for a listing plan entitled to show prices. Base listing or pending shops cannot self-enable a priced catalogue.

A trusted reviewer can call `verification_read` for a seller UID only after signing in within the last five minutes; the response is the decrypted photo, which must not be logged or stored in public assets. `verification_review` accepts `approved` or `needs_new_photo`. This reviews the selfie only; it does not approve or activate the seller account, subscription or public shop. Configure the reviewer claim through an existing authorised Admin SDK environment and preserve its other claims. Never place Admin SDK credentials in Flutter or a public website.

Owner-scoped chronological chat/order/credit indexes avoid cross-account composite indexes. The new collections need no client write permissions: the function uses Admin SDK and performs its own authorization. Existing strict owner-only rules still govern seller profile/draft edits. Approval status and immutable shop category remain protected.

## Provider setup before device sign-in tests

- Firebase Authentication: enable Google and Apple in the existing project.
- Android Google: register `za.co.teyza.teyza_shopper` and the actual test/Play signing SHA fingerprints. Set public GitHub Actions variable `TEYZA_GOOGLE_WEB_CLIENT_ID`.
- iPhone Google: register the exact Apple bundle ID in the same Firebase project. Set `TEYZA_GOOGLE_IOS_CLIENT_ID` to that iOS OAuth client, plus the Web client above. The build adds the reversed URL scheme and both client identifiers.
- Apple: enable Sign in with Apple for the registered App ID and regenerate its App Store profile. Configure the Apple provider/team/key in Firebase, including private email relay when used. The private Apple key stays in Firebase, never in Dart or repository variables. The app uses a random nonce, sends its SHA-256 to Apple and the original nonce to Firebase for verification.
- Device testing is necessary for OAuth, permissions, camera and signed builds. CI adapter tests do not certify live provider configuration. The account-deletion/revocation flow remains a store-release task.
