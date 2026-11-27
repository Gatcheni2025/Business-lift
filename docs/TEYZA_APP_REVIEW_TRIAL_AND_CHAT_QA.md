# Teyza App Review: trial, shopper deletion, Apple provider and chat safety QA

**Development status:** PR #99 only. Do not deploy to production or resubmit to Apple until current Flutter/Node checks pass, Apple in-app purchasing is resolved, and the signed build is tested on a physical iPhone.

## Seller seven-day trial

- New shops get a single seven-day `trial` entitlement. The clock starts **when the seller passes real administrator approval**, not at installation or registration.
- Once approved, a live Teyza seller can be browsed and shown in nearby discovery, even if no product prices have been published. Sellers must publish **real** product/stock data before checkout is enabled.
- Expired trials cannot publish, accept orders, appear in the verified directory, or access wholesale buyer privileges without valid entitlement. Re-selecting the plan never restarts the dates.
- Existing approved Free shop accounts migrate to a one-time trial when next accessed by the mobile backend. Legacy accounts that have **no `listingPlan` property** remain grandfathered and need a separately reviewed migration.
- No new debit-order mandate is collected through the mobile service. Old mandates must still be reconciled and cancelled where necessary; never assume a Firestore status change terminates an external debit.
- **Not yet implemented:** In-App Purchase for the R99/month continuation. App Store Connect must configure a compliant StoreKit subscription or other Apple-permitted payment method and the server must verify transactions before granting benefits. Do not instruct reviewers to use an off-app payment workaround. Apple may require an IAP-based free introductory offer; obtain confirmation before resubmission.

## Chat moderation

- On a verified conversation, tap **Report message** below a message received from the other participant; select a reason. The server stores a private report containing only the relevant message snapshot.
- Open the conversation's **Chat safety** menu to block the other participant. When either party blocks, **both** parties are prevented from sending additional messages, including by direct API calls. Prior evidence stays readable. The blocker can unblock.
- A trusted admin, logged in recently with a verified account and `teyzaAdmin` claim, opens **Account → Chat moderation reports**, reviews text and reason, and marks it resolved/dismissed.
- The current admin UI records disposition but does **not** automatically ban the reported account, filter all objectionable content, or contact police. Operate an escalation process for threatening or illegal content. Ensure support contact is available.

## Shopper account deletion

- Shopper Account → Privacy & Security → Delete My Account → type `DELETE`, confirm, and submit.
- Auth is disabled/revoked/deleted by the server; the shopper's full saved contact/delivery profile is deleted immediately if it belongs to that UID. Old orders, messages, uploaded media and legally retained records are processed by the documented operational deletion queue, not claimed to be fully erased instantly.
- Verify the previous UID cannot sign in, a new account receives a new UID, and the old address is not restored. Test with a real authorized shopper and dummy information.
- Seller deletion remains available regardless of admin approval.

## Apple provider revocation and sign-in

- Sign in with Apple is present in the Flutter code and Apple entitlement is generated for iOS. The native provider configuration, Apple Developer capability and Firebase Apple provider MUST be verified on a real signed/TestFlight iPhone.
- When Apple is a Firebase linked provider, deletion asks the user for a fresh Apple authorization code, then calls authenticated `account_apple_revoke`. The server verifies Apple linkage and recent Firebase auth, obtains its own OAuth access token, and requests Identity Platform revocation with the **original verified caller Firebase ID token**, recording the revocation when successful.
- If the code cannot be obtained or revocation fails, do **not** lock the user out of account deletion: close the account but clearly disclose the manual Apple provider revocation requirement and have the operator verify it before marking the deletion case completed.
- Confirm live revocation and follow-on sign-in behavior on a real iPhone. The presence of code alone is **not proof** of a working Apple revocation.

## Physical device checklist

1. On iPhone TestFlight, launch Teyza, sign in with Apple, Google, and email using actual provider configurations. Test a shopper with no seller permissions.
2. Save an automatically detected full delivery address (with manual correction); confirm only shops in area display.
3. Verify an approved seller with an empty priced catalogue opens with **Products coming soon**, never **Shop Unavailable**. Verify a seller with actual inventory allows real checkout.
4. Exchange chat messages both directions, report a received message, block a thread from the shopper, attempt to send from the seller, unblock, and retry. Confirm the admin can review the report.
5. Register a new seller; complete OTP, document/selfie and administrator approval, confirm the seven-day trial starts once and an approved shop appears in nearby discovery.
6. Advance the test clock or use local fixtures (not production accounts) to confirm expired trial shuts off access. Verify no debit mandate is requested.
7. Record shopper deletion and Apple-linked deletion with disposable test accounts and confirm admin erasure queue and provider-token follow-up.
8. Capture a physical-device video beginning from launch and showing the functionality requested by Apple Guideline 2.1.

Do **not** distribute a PR's unsigned AAB or iOS build as a signed store release. Deploy the separately tested Firebase mobile backend and create a new manual signed production release only after review.
