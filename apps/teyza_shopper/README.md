# Teyza Shopper & Business — 1.0.49+59 candidate

The Flutter application for local shopping, business registration and seller operations. This source candidate includes the home, checkout and dashboard update described in [the release review](../../docs/TEYZA_HOME_CHECKOUT_DASHBOARDS_20261125.md).

## App journeys

The app opens to the public home. Authentication and directory loading run independently, so a slow connection or a restored business account cannot hold the user at a login/loading screen. Guests can browse shops, search published products and build a basket. Checkout and personal account features request sign-in when needed, and checkout sign-in returns to the retained basket.

Shopper navigation groups Home, Discover, Shop, Orders and Account. The account overview provides orders, messages, saved delivery information, payment preferences and contact verification. A business owner can explicitly open the business workspace from the same identity. Approval and category permissions remain server-controlled.

Business registration is native: business details, an authoritative selected address and fresh consent lead into identity, owner selfie, mobile verification, shop photo and location checks. Device drafts expire after seven days and are scoped to the signed-in owner; they do not contain identity evidence, signed address receipts or consent. Business subtypes are stored separately from the canonical seller permissions.

## Shopping and payments

Only actual published merchant stock is offered for product checkout. Map-directory entries do not imply registration, verified stock or ordering capability. Sellers provide their own prices and quantities, including supported piece/bag/cup and other portion units. Wholesale and service-business tools retain separate access rules.

Seller settings distinguish online order requests, online payments, card acceptance at the shop, collection and delivery. A preference does not establish that the shop is approved or its payout connection is ready. The dashboard displays the current server readiness and the next useful action.

Online payment is available for eligible physical-goods orders after the seller confirms stock. The backend initializes Paystack with the authoritative order amount and verified settlement connection; the shopper supplies card/bank details on Paystack. Teyza verifies provider results and signed webhooks before showing a payment as paid. Returning from checkout is not proof of payment. Digital seller membership and promotion billing are separate from shopper purchases.

Google and Apple verification can be linked to the same shopper account where supported. Existing email/password users retain sign-in and email verification; new-account choices use the configured provider flows. Native authentication still requires the existing Firebase/OAuth configuration and matching signing identity.

## Validation and release

Resolve packages with `flutter pub get`, analyze with `flutter analyze --no-fatal-infos`, and run `flutter test`. The committed lock file pins this candidate's dependency resolution. Set `TEYZA_CAPTURE_UI=1` when running the preview tests to capture actual Flutter screens under `build/ui-preview/`; those tests use fictional merchant and shopper fixtures.

The existing release workflow generates Android/iOS wrappers and applies `scripts/prepare_mobile_release.py`, including the native launch styling. Android retains package `com.asiyedriver.asiye`; iOS retains bundle `za.co.teyza.shopper` and minimum iOS 15.0. Signed production builds require backend 3.26.0 and its new commerce-readiness flags. Public capability flags do not establish a particular seller's live payout readiness.

PR workflow outputs are unsigned previews. Manual distribution builds use the existing signing credentials; TestFlight upload is a separate explicit workflow option. Google Play submission and public store approval are separate release steps. Source validation does not mean this candidate has been installed on a device or published to either store.

The release review lists the exact backend targets, Hosting return page and remaining device/payment checks. The earlier registration/WhatsApp v3 update kit does not contain this candidate.
