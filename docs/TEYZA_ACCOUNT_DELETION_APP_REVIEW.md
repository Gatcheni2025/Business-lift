# Teyza account deletion — App Review and operations

**Status: updated PR #97 code; not yet deployed or verified in a signed mobile build.** Do not claim full erasure or Apple compliance until cleanup, provider revocation, backend deployment, and real-device tests have been completed.

## User-visible flow

- Shopper → **Account → Privacy & Security · Delete My Account**
- Seller → **My Business → Privacy & Security · Delete My Account**
- The user signs in, types **DELETE**, accepts the irreversible-deletion notice, and submits.
- Server accepts the authenticated Firebase UID (never a client-supplied UID). Auth must be recent (15 minutes). If stale, the user signs out and signs in again.
- Server records a unique `TZ-DEL-...` reference and a 30-day processing target under `teyzaAccountDeletionRequests/{uid}`. It **disables the old Firebase Authentication UID, revokes its refresh tokens, and deletes the old Auth identity** so the email is available for a new registration. Server-side authenticated APIs already verify token revocation. A successful response includes `signInBlocked: true`; the app automatically clears its local session, shows the reference and cannot sign in again using the old account. This is sign-in closure, not proof of completed data erasure.
- If seller-owned documents are present, the listing is suspended and disabled for new orders, the seller account is marked not listed, any Teyza-stored mandate is marked withdrawn, and billing flagged for closure review.
- A withdrawn internal mandate flag **does not** guarantee cancellation with an external debit-order/payment provider. Operations must separately cancel/verify external collections.

This is an actual deletion request that closes the old account for sign-in immediately, not an email-only instruction. It is **not instant erasure**. The old Firebase Auth identity is removed at account closure, but the deletion queue record remains until eligible personal-data cleanup and any lawful retention review are finished. A login attempt to that disabled identity must fail. Firebase's password, Google and Apple identity providers can permit a *new* account with a fresh UID after closure; this does not restore the deleted UID or its old data. Do not promise a permanent platform-wide ban unless a separate lawful identity-blocking mechanism is built. Legacy `pending_review` requests are closed when status is read; `teyzaDeletionSignInRepair` also deletes any remaining former Auth identities on its scheduled pass. This does not reopen the former account.

## Operator workflow — required for every submitted request

The admin-only backend actions are `ops_account_deletion_queue` and `ops_account_deletion_complete`. These require `teyzaAdmin=true`, a verified admin email and an authentication event no more than 15 minutes old.

1. Review the deletion queue **daily** in Firestore `teyzaAccountDeletionRequests` or through the authenticated admin API. Record `reference`, `requestedAt`, `completeBy`, `authDisabledAt`, `authDeletedAt`; confirm the OLD Firebase Auth UID has been deleted, its sign-in no longer works, and fresh registration results in a distinct UID. Do not use email to authenticate the requester.
2. Confirm open `teyzaMobileOrders` are completed or cancelled. The completion endpoint refuses to proceed with open orders belonging to the account.
3. Cancel any actual **third-party** direct debit, card recurrence, seller fee, or connected payment mandate, and settle unresolved credits/refunds. Changing the Firestore mandate state alone is insufficient.
4. Delete or de-identify user-authored Firestore data and Storage objects not subject to legal retention. Relevant sources include, as applicable:
   - Shopper profile: `teyzaShopperProfiles/{uid}` (saved delivery address, phone, name, email), and any remaining secure on-device data
   - Account / shop: `teyzaSellerAccounts/{uid}`, `teyzaSellerOnboarding/{uid}`, `teyzaPublicShops/{uid}`, `teyzaShopSettings/{uid}`, `teyzaShopLocations/{uid}`, `teyzaShopFrontPhotos/{uid}`, `teyzaCatalogueSubmissions/{uid}`
   - Photos / ID: `teyzaMobileVerification/{uid}`, `teyzaSellerIdentity/{uid}`, `teyzaVerificationPhotos` entries with `ownerUid`, `teyza-private/mobile-verification/{uid}/` and referenced Storage photo objects
   - Products: `teyzaDraftProducts/{uid}/items`, `teyzaProductPhotos/{uid}/items`
   - Messaging: `teyzaMobileChats` documents involving the UID, their `messages` subcollections and `teyzaMobileChatIndex/{uid}/threads`; consider other participants' access while removing authored personal content
   - Ratings / notifications / devices: `teyzaShopRatings` user ratings, `teyzaSellerNotifications/{uid}/items`, `teyzaSellerNotificationPreferences/{uid}`, `teyzaMobileDevices` filtered by `ownerUid`
   - Indexes / rate tracking: `teyzaMobileOrderIndex/{uid}`, `teyzaMobileLimits` records starting with the UID
   - Any older website/legacy customer data, local databases and connected Meta/third-party data systems. Deleting Firebase Authentication alone does **not** erase these records.
5. Examine invoices, receipts, completed orders, finance enquiries, security investigations and other legally required records. Retain only what applicable law requires; limit access and anonymise unnecessary personal details. Do not blindly delete accounting/retention records.
6. For Apple-linked accounts, revoke the user's Sign in with Apple token through Apple's REST API, and inspect connected identity-provider links as applicable. **Apple-token revocation is not implemented automatically in this branch.** Put an operational integration in place before claiming full Sign in with Apple deletion compliance.
7. Once erasure, legal retention decisions, billing closure and identity revocation have **actually** been completed, call the admin `ops_account_deletion_complete` action with `uid`, `confirmedDataErased: true`, `confirmedBillingResolved: true` and `confirmedProviderRevocation: true`. This confirms the already-deleted Firebase Authentication identity and marks the outstanding data-erasure request `completed`. **Do not send this action earlier:** it does not itself purge all legacy collections. When a user account has no business obligations, operations should promptly complete cleanup instead of waiting the full 30 days.
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

1. Shopper creates account → Account → Delete My Account → type DELETE → request → see reference, sign-in is blocked, and local session signs out automatically. Try signing back in with the former email/password: the OLD UID must be absent. A fresh registration may use the same email but must receive a NEW UID, with no old data. Native Google/Apple continuation can automatically create a new Firebase account; this is not restoration of the old UID.
2. Seller logs in → My Business → Delete My Account → see closure and external-billing warnings → request → confirm shop is no longer publicly listed AND Firebase Auth sign-in is disabled regardless of approval status.
3. Stale login requires signing out/in; another UID cannot retrieve a different user's request.
4. Admin sees only the recorded request queue; unresolved orders prevent final deletion; admin finishes actual Firestore/Storage erasure and legal retention checks; Firebase Auth identity is already removed and the remaining data-erasure request is marked completed.
5. Check Apple sign-in revocation, support response and final completion notification. Record the real flow on a physical iPhone using the corrected, signed TestFlight build.

Public explanatory page: `https://teyza.co.za/data-deletion.html`. The updated page must be published separately from the mobile release.

Official Apple requirement: https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion/
