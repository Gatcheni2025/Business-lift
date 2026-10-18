# TEYZA Marketplace — Firebase staging + Flutter (Windows)

This guide applies to the **new Flutter app** in apps/teyza_marketplace. It does **not** update the existing teyza.co.za site.

## 1. Critical website/source distinction

The uploaded Oct-2026 teyza.co.za.zip contains an updated HTML/CSS storefront:
- Dark charcoal #122228, emerald #0da574, coral #ff5238
- Search, quick shops, product and service cards, basket, seller pages
- PHP catalogue and Paystack checkout links used by its JavaScript
- **But the uploaded files api/storefront.php, api/paystack-verify.php and api/paystack-webhook.php are ZERO BYTES.** Treat this ZIP as an incomplete backend archive; do not copy over production.

Other ZIP folders contain seller/user JSON records, server configuration, admin files and logs. Do NOT upload or commit the whole archive to a public GitHub repository. Extract only audited, non-sensitive brand assets when needed.

New Flutter marketplace staging uses separate Firestore collections. It does NOT import seller credentials, live payment tokens or existing PHP stock and orders.

## 2. Firebase project

Create a NEW Firebase project at https://console.firebase.google.com/ — suggested display name: TEYZA Marketplace Dev.
Use the **actual project ID** assigned by Firebase wherever the examples say YOUR_STAGING_PROJECT_ID. A suggested name is not a guarantee the ID is available.

In Firebase console, enable:
- Authentication -> Sign-in method -> Email/Password
- Cloud Firestore -> Create database (choose appropriate staging location)
- Cloud Storage -> Create default bucket (Blaze billing plan is currently required for Cloud Storage). Set billing alerts/budget limits.
- Cloud Functions -> eligible billing/Blaze plan if deploying HTTPS callables
- App Check later for Android and iOS when the signed apps have been registered

Do not use the live business-lift-3c19c project for first tests. The existing seller website's Firebase Auth user accounts will need a separate production integration/migration plan.

## 3. Install CLI on Windows PowerShell

Install Flutter SDK and Android Studio, then ensure flutter is in PATH. Install Node.js LTS.
Open a **new PowerShell** window, then run:

    flutter doctor
    npm install -g firebase-tools
    firebase login
    dart pub global activate flutterfire_cli

Check the reported Android toolchain; accept Android SDK licences where needed:

    flutter doctor --android-licenses

## 4. Generate the native app project

Clone your repository and check out the development branch:

    git clone https://github.com/Gatcheni2025/Business-lift.git
    cd Business-lift
    git checkout feature/teyza-marketplace-foundation
    cd apps/teyza_marketplace

Generate native Android scaffolding:

    flutter create --platforms=android --org za.co.teyza --project-name teyza_marketplace .
    flutter pub get

Register **Android** with Firebase. In Flutter project folder run:

    flutterfire configure --project YOUR_STAGING_PROJECT_ID --platforms android

Verify that the resulting native Firebase files belong to staging, not production.

The current starter uses native Firebase initialization. The generated Android google-services configuration is required for it to sign in and load real Firestore data. When converting to Flutter web or adding more plugins, follow the FlutterFire docs to initialize with the generated DefaultFirebaseOptions.currentPlatform.

Android debug:

    flutter run
    flutter build apk --debug

Android release needs production package ID, Play app signing, tested backend and production-safe payment flows BEFORE publishing. A debug APK is only for internal testing.

## 5. Firebase Rules and Functions (staging only)

From the repository root, install the Cloud Functions dependencies:

    cd functions
    npm ci
    cd ..

Test using the Firebase Emulator Suite:

    firebase --config firebase.marketplace.staging.json --project YOUR_STAGING_PROJECT_ID emulators:start --only auth,firestore,functions,storage

After emulator tests and function code review, deploy the rules to the **staging** project:

    firebase --config firebase.marketplace.staging.json --project YOUR_STAGING_PROJECT_ID deploy --only firestore:rules,storage

Deploy only these six marketplace callable functions to staging, not the existing website's functions:

    firebase --config firebase.marketplace.staging.json --project YOUR_STAGING_PROJECT_ID deploy --only functions:registerMarketplaceShop,functions:configureMarketplaceFulfilment,functions:publishMarketplaceListing,functions:unpublishMarketplaceListing,functions:placeMarketplaceOrder,functions:reviewMarketplaceOrder,functions:requestMarketplaceService,functions:respondMarketplaceServiceRequest,functions:decideMarketplaceServiceQuote

The marketplace Functions are in functions/marketplace.js and exported by functions/index.js. They require the Cloud Functions deployment environment but no Paystack keys.

When staging functions are running, **do not test real live customer payments**. The first order flow is a cash-on-fulfilment request and stays unpaid.

## 6. Test merchant / buyer path

1. Create two DIFFERENT staging Firebase Auth accounts (merchant on website and customer in the app).
2. Seller opens merchant-marketplace.html on an appropriate STAGING hosting origin -> Register marketplace shop -> pending.
3. In staging Firestore, a trusted admin changes only teyzaMarketplaceShops/{sellerUid}.status from pending to approved after a test verification. The mobile app has no permission to self-approve.
4. On the merchant website, approved seller publishes a test item with real price and stock.
5. Buyer explores it, adds it to basket and requests pickup or delivery offered by the seller.
6. Seller sees the order on merchant-marketplace.html, accepts or declines. On acceptance, server decreases stock transactionally.
7. Seller marks ready then fulfilled, and buyer sees its status. PaymentStatus remains unpaid.
8. Merchant lists a test service on website -> buyer opens Services tab, requests a quote -> merchant sends quote -> buyer accepts/declines in Activity. No booking charge is made.

Merchant product photos can be selected from the device gallery and uploaded to the staging Storage bucket after shop approval. Test JPG/PNG only, under 5 MB. Storage rule source: storage.marketplace.rules.

Run at least ownership, stock concurrency, invalid order, collection/delivery and cancellation tests before inviting real merchants.

## 7. iOS and TestFlight

On a Mac with Xcode and Apple Developer membership, generate iOS native scaffolding:

    cd apps/teyza_marketplace
    flutter create --platforms=ios --org za.co.teyza --project-name teyza_marketplace .
    flutterfire configure --project YOUR_STAGING_PROJECT_ID --platforms ios

After adding image_picker, confirm Info.plist includes NSPhotoLibraryUsageDescription with a clear explanation of why the app needs product photos. Verify iOS bundle ID, App Store Connect application, iOS signing team and capabilities, then test device sign-in and upload a signed build. The FlutterFire docs require iOS 15+ for recent Firebase Flutter SDKs. Do not reuse another brand's bundle identifier or signing configuration.

## 8. Remaining before production

- Complete real merchant identity/location verification and administrator UI
- Native service booking, shop availability, delivery radius and real ETA
- Payment service provider approval, signed callbacks, refunds and full settlement reconciliation
- Stock refunds/cancellation, push notifications, seller support, consumer policies, POPIA safeguards
- Live website -> marketplace product import (secure seller opt-in, server-side only)
- iOS Android release signing, app store listing, end-to-end tests

## References

- https://firebase.google.com/docs/flutter/setup
- https://firebase.google.com/docs/functions/callable
- https://docs.flutter.dev/deployment/android
- https://firebase.google.com/docs/storage/flutter/upload-files

## Two-platform reminder

Shopper app: Shop / Services / Activity / Basket / Account only. Business owner onboarding and marketplace administration belong on the website. Use merchant-marketplace.html on a staging hosting origin with a staging Firebase config. Do **not** publish that page to the live site with production credentials until the matching Functions, Rules, migration and merchant approval process have been validated. See TEYZA-PLATFORM-ARCHITECTURE.md.
