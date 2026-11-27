# Teyza R3.9 — seller and shopper dashboards

App version: **1.0.7 (17)**. This continues PR #78 and preserves photographic essentials, the premium green/cream design and the five shopper navigation destinations.

## Seller dashboard

Spaza and Other Retail / Wholesale owners keep their saved Firebase identity and category. The dashboard exposes Shop setup, Live chat, Customer orders, Delivery & collect, Trading hours, Finance & credit, Order stock and Verify owner.

Shop setup edits the existing profile, creates/edits/deletes private product drafts, uploads real product photos and submits a catalogue for review. The account's category, approval and listing plan remain protected. Public priced catalogues require an approved active seller, trusted `catalogueEnabled` eligibility and administrator review. Basic active listings can display reviewed product names/photos without public prices. No sample products or invented live stock are published.

The service editor saves delivery fees/radius/notes, collection, cash back, card-payment and chat availability. Approved live listings receive the corresponding public fields. Opening hours cover all seven days, support overnight trading and use South African time.

Order stock offers a persisted restock list and links to the official Shoprite Cash & Carry, Makro and Kit Kat Cash & Carry websites. Checkout and supplier fulfilment happen on the supplier site. Finance & credit records a consented finance follow-up enquiry; a real lending partner and lending decisions are not connected.

Owner verification opens the front camera, previews a selfie and requires submission consent. The backend validates/re-encodes the image, strips metadata and encrypts it before Storage. No selfie is public and no client can mark itself verified. This is manual owner-photo review, not automated biometric matching or liveness detection. Review and shop activation stay separate.

## Shopper dashboard

The signed-in Account page provides Browse shops, Live chat and My orders shortcuts. Registered shop pages show their published products, opening state, offered services and Live chat. Shoppers can add products, choose enabled delivery or pay-and-collect, provide the relevant address/contact and send an order request. Prices and stock are resolved on the server. Order confirmation reserves stock transactionally; cancellation releases it. Both parties can see the request's status and message each other. No online payment is captured.

Chat now uses verified Firebase bearer identities and registered Firebase UID shop IDs. The previous PHP/token chat dependency is removed from the app. Conversation members are checked on every request. Polling runs only while chat is active; remote push is not implemented.

## Google and Apple login

Google is offered on Android and iPhone; Apple is offered on iPhone. Both exchange native provider credentials with the existing Firebase project. Apple uses a cryptographic nonce, stores its optional first-login name and supports private relay email. Provider cancellation does not create an assumed session.

Enable the corresponding providers in Firebase. Set public GitHub Actions variables `TEYZA_GOOGLE_WEB_CLIENT_ID` and `TEYZA_GOOGLE_IOS_CLIENT_ID` from that same project. Android signing SHA fingerprints, the iOS OAuth URL scheme, Apple App ID capability and provisioning profile must match the registered application. The wrapper generator now adds camera/photo usage descriptions, Google iOS configuration and Apple entitlements. Missing Google configuration produces a clear message while email login remains available; native provider setup cannot be certified by mocked adapter tests.

## Deploy and verify

The new service must be deployed before chat, settings, order requests, stock lists, credit enquiries, product-photo submissions and selfie submissions work live. Download the scoped `TEYZA_MOBILE_R39_DEPLOY_KIT.zip`, run `SETUP-VERIFICATION-KEY.ps1` once and `DEPLOY-MOBILE.ps1`. The encryption key is never printed or put in the app. Existing encryption keys are kept. Do not deploy the repository's old full Firestore rules over the current project.

See [service setup and reviewer controls](../services/teyza-mobile-v39/DEPLOY.md). The service's public health response identifies version `3.9.0`; all application actions require a verified Firebase ID token. Administrative review actions additionally require a trusted admin custom claim, and private photo viewing requires recent sign-in. Confirm direct private collection/Storage access is denied to other accounts.

The build workflows continue to produce a test APK, explicit unsigned AAB and unsigned iOS device archive. Signed release mode still requires the real store signing credentials. Run live account, provider, camera, supplier-link and complete shopper-to-owner request tests before store submission. Account deletion/provider revocation, lender integration, courier integration, push notifications and online payment remain separate release tasks.

Technical references: [Apple with Firebase](https://firebase.google.com/docs/auth/ios/apple), [Sign in with Apple plugin](https://pub.dev/packages/sign_in_with_apple), [Google iOS integration](https://pub.dev/packages/google_sign_in_ios/versions/5.9.0), [image picker](https://pub.dev/packages/image_picker).
