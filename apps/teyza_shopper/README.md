# Teyza Shopper & Shop Owner 1.0.10 (19)

Premium local-shop discovery, photographic Everyday Essentials and separate seller/shopper dashboards. Shopper navigation remains Home, Shops, Cart, Orders and Account.

Seller read failures now distinguish profile access from private product access. A product-list error leaves the authenticated owner's dashboard available without claiming there are zero products. See [seller access repair](../../tools/seller-access/README-START-HERE.md) to merge scoped rules into the current published rules; the app update alone does not deploy Firestore rules.

Owners choose from **184 catalogue products across 13 categories**, illustrated by 48 product-reference photographs. They enter their own price and stock; approved active shops publish these selected items to their own public range. Custom products and uploaded replacement photos still use catalogue review. See [product catalogue setup](../../docs/TEYZA_R311_PRODUCT_CATALOGUE.md).

Owners manage their profile and private product/photo drafts, submit a catalogue for review, chat with shoppers, manage order requests, set delivery/collection/cash-back services and trading hours, save a stock shopping list, open supermarket ordering websites, request a finance follow-up and submit a private camera selfie for owner review.

Shoppers browse actual published merchant stock, chat with registered shops and request delivery or collection. Server-priced requests are confirmed and fulfilled by owners. Payment is arranged with the shop. Map-directory listings do not imply merchant registration, verified stock or ordering capability.

Google login is implemented for Android and iPhone, and Apple login for iPhone. Provider and signing configuration must be supplied in the existing Firebase project and CI variables. Email/password remains available. New merchant registration stays on the Teyza website, and selecting Shop Owner never grants approval.

The isolated R3.9 mobile backend must be deployed for the new shared services. See [dashboard and provider setup](../../docs/TEYZA_R39_DASHBOARDS.md) and [service deployment](../../services/teyza-mobile-v39/DEPLOY.md). Real credit approval/disbursement, supplier APIs, booked couriers, online payments and automated face/liveness matching are not implemented. Credit is an enquiry, supplier ordering happens on their sites, and selfies await manual review.

**Teyza Shopper APK** builds test installs. **Teyza Android and iOS Release** builds an unsigned AAB and iOS archive, or signed store files when explicitly run with the existing signing credentials. The app is not submitted to either store automatically.

R3.12: native seller shop registration and consent-based camera verification, an owner-scoped notification inbox/optional FCM phone alerts, a recent-login admin review desk and a premium business workspace. See ../../docs/TEYZA_R312_SELLER_EXPERIENCE.md for deployment, reviewer claims and native push configuration.
