# Teyza account deletion — App Review and operations

**Status: proposed code, not a deployed or accepted Apple build.** Do not promise compliance until the backend and app are deployed, the processes below are staffed and exercised on a physical iPhone.

## User-visible flow

- Shopper → **Account → Privacy & Security · Delete My Account**
- Seller → **My Business → Privacy & Security · Delete My Account**
- The user signs in, types **DELETE**, accepts the irreversible-deletion notice, and submits.
- Server accepts the authenticated Firebase UID (never a client-supplied UID). Auth must be recent (15 minutes). If stale, the user signs out and signs in again.
- Server records a unique `TZ-DEL-...` reference and a 30-day processing target under `teyzaAccountDeletionRequests/{uid}`. The client can copy the reference, see `pending_review` and sign out.
- If seller-owned documents are present, the listing is suspended and disabled for new orders, the seller account is marked not listed, any Teyza-stored mandate is marked withdrawn, and billing flagged for closure review.
- A withdrawn internal mandate flag **does not** guarantee cancellation with an external debit-order/payment provider. Operations must separately cancel/verify external collections.

This is an actual deletion request, not an email-only instruction. It is **not instant erasure**.

## Operator workflow — required for every submitted request

The admin-only backend actions are `ops_account_deletion_queue` and `ops_account_deletion_complete`. These require `teyzaAdmin=true`, a verified admin email and an authentication event no more than 15 minutes old.

1. Review the deletion queue **daily** in Firestore `teyzaAccountDeletionRequests` or through the authenticated admin API. Record `reference`, `requestedAt`, `completeBy`; do not use email to authenticate the requester.
2. Confirm open `teyzaMobileOrders` are completed or cancelled. The completion endpoint refuses to proceed with open orders belonging to the account.
3. Cancel any actual **third-party** direct debit, card recurrence, seller fee, or connected payment mandate, and settle unresolved credits/refunds. Changing the Firestore mandate state alone is insufficient.
4. Delete or de-identify user-authored Firestore data and Storage objects not subject to legal retention. Relevant sources include, as applicable:
   - Account / shop: `teyzaSellerAccounts/{uid}`, `teyzaSellerOnboarding/{uid}`, `teyzaPublicShops/{uid}`, `teyzaShopSettings/{uid}`, `teyzaShopLocations/{uid}`, `teyzaShopFrontPhotos/{uid}`, `teyzaCatalogueSubmissions/{uid}`
   - Photos / ID: `teyzaMobileVerification/{uid}`, `teyzaSellerIdentity/{uid}`, `teyzaVerificationPhotos` entries with `ownerUid`, `teyza-private/mobile-verification/{uid}/` and referenced Storage photo objects
   - Products: `teyzaDraftProducts/{uid}/items`, `teyzaProductPhotos/{uid}/items`
   - Messaging: `teyzaMobileChats` documents involving the UID, their `messages` subcollections and `teyzaMobileChatIndex/{uid}/threads`; consider other participants' access while removing authored personal content
   - Ratings / notifications / devices: `teyzaShopRatings` user ratings, `teyzaSellerNotifications/{uid}/items`, `teyzaSellerNotificationPreferences/{uid}`, `teyzaMobileDevices` filtered by `ownerUid`
   - Indexes / rate tracking: `teyzaMobileOrderIndex/{uid}`, `teyzaMobileLimits` records starting with the UID
   - Any older website/legacy customer data, local databases and connected Meta/third-party data systems. Deleting Firebase Authentication alone does **not** erase these records.
5. Examine invoices, receipts, completed orders, finance enquiries, security investigations and other legally required records. Retain only what applicable law requires; limit access and anonymise unnecessary personal details. Do not blindly delete accounting/retention records.
6. For Apple-linked accounts, revoke the user's Sign in with Apple token through Apple's REST API, and inspect connected identity-provider links as applicable. **Apple-token revocation is not implemented automatically in this branch.** Put an operational integration in place before claiming full Sign in with Apple deletion compliance.
7. Once erasure, legal retention decisions, billing closure and identity revocation have **actually** been completed, call the admin `ops_account_deletion_complete` action with `uid`, `confirmedDataErased: true`, `confirmedBillingResolved: true` and `confirmedProviderRevocation: true`. This deletes the Firebase Authentication identity and marks the request `completed`. **Do not send this action earlier:** it does not itself purge all legacy collections.
8. Confirm completion to the requester using the contact channel and reference originally collected while active, without sending their sensitive documents. Keep a minimal completion audit according to approved retention policy.

**Privacy:** Do not expose `teyzaAccountDeletionRequests` to direct client Firestore reads. The server allows authenticated status reads only for the requester's UID, and admin-only queue access.

## Deployment

This change requires a **new Flutter iOS build** and a backend deployment of the existing `teyza-mobile` Firebase functions codebase. Do not redeploy the entire Firebase project or replace working Firestore rules.

Check locally:

```powershell
cd services/teyza-mobile-v39
npm ci
npm test
cd ../../apps/teyza_shopper
flutter pub get
flutter analyze
flutter test
```

Deploy only after code review, operational acceptance testing and security checks. Review the existing `services/teyza-mobile-v39/DEPLOY.md` and existing Firebase CLI aliases; a published mobile app cannot call `account_deletion_request` until the backend includes it.

## Physical iPhone acceptance tests for Apple

1. Shopper creates account → Account → Delete My Account → type DELETE → request → see reference → sign out.
2. Seller logs in → My Business → Delete My Account → see closure and external-billing warnings → request → confirm shop is no longer publicly listed.
3. Stale login requires signing out/in; another UID cannot retrieve a different user's request.
4. Admin sees only the recorded request queue; unresolved orders prevent completion; admin finishes actual erasure and legal retention checks; Firebase Auth account removed.
5. Check Apple sign-in revocation, support response and final completion notification. Record the real flow on a physical iPhone using the corrected, signed TestFlight build.

Public explanatory page: `https://teyza.co.za/data-deletion.html`. The updated page must be published separately from the mobile release.

Official Apple requirement: https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion/
