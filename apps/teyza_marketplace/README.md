# TEYZA Marketplace — Flutter Android and iOS

**Status: developer foundation, not released to Play Store, App Store or Firebase production.**

The original site at teyza.co.za is preserved. This native **customer-only app** lives in its own folder and independent Firebase marketplace collections. It follows the brand colours and mobile shop layout extracted from the uploaded October 2026 teyza.co.za.zip:

- Charcoal #122228, emerald #0da574, coral #ff5238 and white cards.
- Custom TEYZA logo painted natively, hero, local seller shelf, quick categories, search, product/service tabs and responsive product grid.
- Shopper: explore real Firestore items, view details, add to basket, choose merchant collection or delivery, request order, view order history.
- Services: request a quote from a provider; view and accept/decline quoted work. Quote acceptance does not automatically book an appointment or pay.
- Merchants manage business registration, listings, mobile customer orders and service quotes on the **merchant-marketplace.html website page** (separate from the Flutter app).
- Wholesale and inventory credit are future merchant website modules; the customer app does not contain them.
- Order requests are CASH-ON-FULFILMENT ONLY and are NOT marked paid. No real card charges, settlement or escrow.

## Start here

Read **FIREBASE_SETUP_WINDOWS.md** in this folder for Windows PowerShell, Firebase staging, FlutterFire CLI, Android tests, Firebase emulators and a Mac/iOS TestFlight path.

Summary of the commands, once Flutter/Node/Firebase CLI are installed:

    cd apps/teyza_marketplace
    flutter create --platforms=android --org za.co.teyza --project-name teyza_marketplace .
    flutter pub get
    flutterfire configure --project YOUR_STAGING_PROJECT_ID --platforms android
    flutter run

From the repo root, review Firebase stage rules in firebase.marketplace.staging.json, firestore.rules and storage.marketplace.rules. Deploy to your **new staging** project only.

GitHub Actions workflow:
- .github/workflows/teyza-marketplace-flutter.yml
- Generates a temporary native Android project, resolves packages, analyzes Dart, runs tests and attempts an internal debug APK.
- Do not treat a green CI build as live payment/compliance verification.

## Role separation

The Android/iOS app contains Shop, Services, Activity, Basket and Account. It intentionally contains no merchant registration or wholesale tab. The merchant portal is merchant-marketplace.html on the website development branch. Read TEYZA-PLATFORM-ARCHITECTURE.md in repo root for full division of responsibilities.

## Staged backend

- Cloud Functions: functions/marketplace.js.
- Collections: teyzaMarketplaceShops, teyzaMarketplaceListings, teyzaMarketplaceOrders, teyzaMarketplaceServiceRequests.
- Images: merchant-side product image publishing uses verified HTTPS links in the current portal; separate Storage rules are staged for future merchant photo uploads.
- Security: server computes catalog price, checks available stock and seller ownership, and only a verified approved shop may add listings.
- Seller stock decreases in a Firestore transaction when an order is accepted.

## Important source archive finding

The uploaded ZIP contains a newer website UI and checkout JavaScript than the GitHub main branch, but its api/storefront.php, api/paystack-verify.php and api/paystack-webhook.php entries are all **zero bytes**. Those endpoints must be recovered/verified on the actual server before building a production sync, web/native shared checkout or Paystack integration. The ZIP also contains logs and seller JSON records — NEVER commit the entire archive to a public repository.

## To reach production

1. Verify merchant identity, legal requirements and trading address.
2. Connect existing website products only through a consent-based, server-to-server import.
3. Add order cancellations and inventory restoration, location-based discovery, real service booking, notifications, delivery tracking and dispute handling.
4. Add payments only after marketplace processor approval and server-verified settlement / refunds.
5. Add finance only through properly authorised credit partners.
6. Pass Android/iOS release builds, real-device testing, Firebase Emulator security tests and consumer/POPIA review.

Until those gates pass, keep this PR in draft.
