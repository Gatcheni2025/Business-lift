# Teyza R3.12 — seller notifications, native registration and review

App version 1.0.10 (20); mobile service 3.12.0. Continues the existing 184-product photographic catalogue and seller-access repair.

## Seller experience

The green/ink/cream owner workspace has a shop identity card, real product count, notification badge, setup progress and eight business tools. It does not invent sales figures or balances. Setup progress records profile, photo submission and a non-empty product range; a submitted photo is still labelled awaiting review.

New owners create an email account inside the app, confirm their email, open their owner workspace, register shop details and continue to the camera. Existing Google/Apple users use their existing verified identity. `seller_register` binds the Firebase UID/email on the server, creates only a pending/not-listed private seller account, and cannot overwrite an existing account. Spaza and retail/wholesale are supported. The seller may resume camera capture later when permission is denied or the camera is cancelled.

The front-camera flow previews the photo, allows retakes and requires explicit consent before upload. Native permission descriptions and Android lost-activity recovery are included. Photos are stripped of metadata, encrypted with the existing AES-GCM secret and kept outside public download-token storage. Every capture, including superseded photos, has a 90-day cleanup record. Manual review is not biometric matching or liveness detection.

## Notifications

Each seller has a private chronological inbox for order requests/status changes, customer chat, stock crossing five units or reaching zero, registration and verification. Tapping an update opens the relevant workspace tool; read markers and four preference switches are owner-scoped. The foreground dashboard/inbox refreshes every 25 seconds and on resume; account changes clear previous data. Latest 60 entries are shown, with unread badges capped at 99+.

Firestore events create a deterministic notification document from each event ID, making event replay idempotent. An isolated delivery trigger sends generic lock-screen text to up to 20 current devices registered to that seller; no customer, message or selfie content enters the push payload. Device registration is bound to the authenticated owner, expires after seven days and is renewed on app startup. Expired/invalid tokens are excluded or invalidated. Transient delivery retries may duplicate a system alert; notification IDs/collapse tags reduce duplicates, and inbox entries remain unique.

Phone alerts require explicit opt-in. Native auto-registration is disabled before consent. Logout unregisters and deletes the device token with bounded best-effort cleanup. Notification taps check the receiving UID before opening the workspace. The private API uses the existing REST-authenticated Firebase account; Firebase Messaging does not create a second logged-in identity.

## Admin review

The Account screen shows Seller review desk only when the ID token contains the advisory `teyzaAdmin` custom claim. All queue, photo and decision authorization is enforced again on the server using a verified token. An administrator must have signed in within five minutes; token refresh alone does not extend that period. The queue paginates 30 submissions at a time and contains no public photo URLs.

An admin opens a registration, views the current decrypted selfie in memory and confirms review before approving. The server records the photo view and transactionally requires its exact submission ID/current pending state, a recent viewing receipt and a different reviewer UID from the seller. Decisions are approved, needs-new-photo (with a note), or rejected (with a note). Replacement photos invalidate earlier decisions; concurrent reviews cannot both succeed. A separate immutable-per-submission audit record captures reviewer, decision, reason and time. Photos clear from the admin UI on backgrounding or account change.

Approving sets only owner approval. It does not mark a listing paid, change listingStatus or enable priced catalogues. Requesting a new photo or rejecting suspends an existing public shop while preserving plan data. The trusted existing listing activation process handles billing and relisting after approval. Historical selfie submissions without a submission ID use their server submission time as an optimistic identifier.

## Activation and release setup

1. Deploy `TEYZA_MOBILE_R312_DEPLOY_KIT.zip` using the included key-preserving setup and scoped deploy scripts. Health must report 3.12.0, sellerNotifications true and adminReview true. Keep deny-by-default protection on the new private collections and private Storage prefix; do not deploy the legacy root rules as a replacement.
2. In an authorised local Admin SDK environment, run `node services/teyza-mobile-v39/set-teyza-admin.js EXACT_FIREBASE_USER_UID --grant` for the intended email-verified reviewer. This preserves other claims. Do not grant by an unverified email string or make the claim client-writable. Revoke with `--revoke`, which also revokes refresh tokens. Sign out/in to obtain the claim. No actual grant is performed by this change.
3. Register/confirm the existing native Android and iOS apps in Firebase. Set public GitHub build variables `TEYZA_FIREBASE_ANDROID_APP_ID` and `TEYZA_FIREBASE_IOS_APP_ID` to their native app IDs (not the website app ID), then rebuild. Blank variables leave phone alerts visibly unavailable while the inbox remains usable. The existing Google OAuth variables remain separately required for Google login.
4. For iOS push, upload the APNs authentication key to Firebase, enable Push Notifications for the exact Apple App ID and regenerate a matching distribution profile. Generated wrappers include production APS entitlement and remote-notification/background-fetch modes. Builds target iOS 15+. Enable the Firebase Cloud Messaging API and confirm function-service-account messaging permission.
5. Test two different sellers and a shopper on physical devices: permission denial/cancellation/retake, photo submission and review, stale submission rejection, independent unread badges, chat/order/stock alerts, background push, logout/account switching and each preference. CI cannot certify camera hardware, APNs credentials or actual delivery.

Private additions: `teyzaSellerNotifications/{uid}/items`, `teyzaSellerNotificationPreferences`, `teyzaMobileDevices`, `teyzaVerificationViews/{reviewerUid}/submissions`, `teyzaSellerReviewAudit`, `teyzaVerificationPhotos`. These are Admin-SDK-only through the mobile API, with no new client Firestore grants.

The scoped codebase now contains eleven functions: mobile API, selfie purge, three catalogue synchronizers, four seller event producers, customer-message producer and push delivery. No other function codebases, rules, Hosting or Places deployment is included. Store packages remain unsigned preparation artifacts until real upload/distribution credentials and outstanding store requirements are completed.
