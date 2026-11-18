# Teyza seller signup — WhatsApp opt-in

## User journey
- Seller registers as a spaza shop, wholesaler or other local business.
- The **Mobile / WhatsApp number** field is used for seller identity/OTP verification. There is currently one linked seller phone; using a different WhatsApp destination without verifying it is not supported.
- Seller confirms that the registered mobile number is also the number on which they use WhatsApp, then **separately and voluntarily** checks “Yes, send me my Teyza approval result and getting-started information on WhatsApp.” Both are initially unchecked.
- If consent is declined, seller registration and normal in-app notifications still work. No WhatsApp preferences document is generated for opt-out during new registration.
- If selected, Teyza stores the seller Firebase UID, normalised phone, timestamp, consent version seller-approval-v2 and optedIn:true in a private Firestore preferences document. It does **not** send a WhatsApp message merely upon registration.
- The seller must verify control of that mobile number using Firebase OTP, complete seller identity/selfie compliance and receive Admin approval. The approved welcome template worker checks opt-in is active, the recipient equals the approved account phone, and Firebase Auth reports verified phone linkage before a message is attempted.
- Seller may withdraw consent in seller verification; the backend clears the WhatsApp destination and sets optedIn:false. The existing safety gate checks the current preference before any send. A user who changes mobile number must re-verify it. Existing registrations may opt in from seller verification without re-registering.
- A checked WhatsApp box does not guarantee that Meta recognises the destination as a WhatsApp account. Meta API success is a submission acknowledgement, not delivery.
- There is no WhatsApp-based signup or sign-in and no free-form outbound welcome message in this PR. The approved Meta marketing template remains governed by its own reviewed sender credentials/opt-in and exact Meta template component structure.

## Deploy sequencing
1. Run backend + Flutter widget and build tests; merge only after review.
2. Deploy only the reviewed `teyzaMobile` backend in a coordinated release, preserving R99 proration environment settings. This is needed to enforce new consent matching and versioning before releasing the new mobile binary.
3. Sign and test Android APK/AAB and iOS TestFlight. Test opt-out, explicit opt-in, OTP, Admin approval, withdrawal, and old installed app version. No live WhatsApp worker activation is part of this release.
4. Confirm Meta webhook inbound POST diagnostics and safe worker configuration separately before enabling approved seller welcome messages.

Existing older app builds continue using consentVersion seller-approval-v1 when they submit the older explicit checkbox. The server retains that version for compatibility. Updating preferences in the newer onboarding flow records v2.
