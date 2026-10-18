# TEYZA Marketplace mobile starter

Flutter Android + iOS project files and platform signing have NOT yet been generated. The existing teyza.co.za website is deliberately untouched.

## Setup on a developer workstation

1. Install Flutter (Dart SDK at least 3.6), Android Studio and Xcode for iOS.
2. Create a NEW Firebase staging project. Do not target the live Business Lift project.
3. In apps/teyza_marketplace run:
   - flutter create --platforms android,ios --org za.co.teyza .
   - flutter pub get
   - dart pub global activate flutterfire_cli
   - flutterfire configure --project YOUR_STAGING_PROJECT_ID --platforms android,ios
4. Enable Email/Password in Firebase Authentication for the staging project.
5. Review the isolated marketplace Functions and Firestore rules on the GitHub feature branch. Install/test them on staging, NOT on production.
6. Run flutter run on a real Android device or iPhone test device.

## How to test this first stage

- Buyer explores public active listings without sign-in.
- Seller signs in and registers a shop. Status starts pending.
- A trusted staging admin approves the shop by setting status to approved in its Firestore document. This is manual in the starter.
- Approved seller adds product title, category, price in Rand, stock and optional HTTPS image link.
- Buyer adds item to basket, signs in and selects offered pickup or delivery.
- Buyer submits an order REQUEST. Server recalculates all prices and the shop delivery fee.
- Merchant accepts or declines, then marks ready and fulfilled.
- Accepting decrements stock atomically. No payment is charged and paymentStatus stays unpaid.
- Buyer can view order status. Service booking, wholesale ordering and finance are not active.

## Safety considerations

- Email/password is the only UI auth method currently wired; provider configuration alone is insufficient for Google, Apple or phone login.
- Public catalogue read is limited to approved shops / active listings by Firestore rules. Orders are only readable by the buyer or selling shop.
- Client writes to marketplace collections are prohibited. Use authenticated Cloud Functions only.
- This starter does NOT include production-quality cash reconciliation, delivery radius checks, geolocation search, food handling compliance, moderation, order cancellation/restocking, image capture/upload, refunds, payment splits, push alerts, wholesale checkout or lending.
- Before deployment, add App Check, monitoring, quotas, staging tests, indexes as needed, verification admin, delivery coverage and a full payment/fulfilment state machine.
- Legacy business products in the PHP workspace do not automatically become marketplace listings. Build opt-in secure server-side sync after confirming schema and merchant approvals.

## Recommended verification

- Confirm all code from this branch is correctly deployed to a separate staging Firebase project.
- Ensure seller A cannot publish as seller B, read seller B orders, or accept seller B orders.
- Pending seller cannot create public listings.
- Wrong-shop products, unknown IDs, service listings, invalid quantities and stock shortages all reject checkout.
- Same request ID must not generate duplicate orders.
- Two competing seller acceptances for the final stock unit must not both succeed.
- Cash-unpaid order must not show a paid status.
- Android/iOS builds and authentication sign-in must be tested on devices.

Status: not yet built, deployed or release-ready.
