# Shop photo, delivery, cards, messages and order alerts — 1.0.22 (32)

The seller dashboard displays the owner's saved shop-front photo, with Add/Change photo, Orders, Messages and Notifications actions. Delivery on/off, fee, radius, card acceptance, optional cash discount and shopper messaging can be changed directly on the dashboard. The quick controls merge only those settings and preserve collection, cashback, hours and delivery instructions. Full service settings are still in Business. Shop approval and publication rules remain required.

The photo preview is fetched through the authenticated owner's API, including for a pending shop. The public photo endpoint still requires an approved, published shop. Photo versions are cached in memory, cleared on account change and fetched again after replacement. No identity document or verification selfie is used as the shop image.

## Card price and the optional 10%

Card acceptance here means **card payment at the shop**, arranged directly with the merchant. No online card details are collected and no processor charge or new Teyza commission is executed by this release. Cards use the advertised item prices with **zero extra card surcharge**.

The requested 10% option is exposed separately as an **optional 10% cash discount**, off by default. A seller must deliberately select and save it. The discount applies to the item subtotal for cash orders and does not discount delivery. For example, R100 of items plus R15 delivery becomes R105 when a 10% cash discount is enabled; a collection paid by card stays R100. Existing shops receive no new discount automatically.

This distinction follows PASA's South African no-surcharging guidance, which allows a discount for cash rather than a penalty for cards. If the intended 10% is a seller-funded Teyza commission, that is a separate business/payment agreement and is not silently substituted for a card surcharge or cash discount.

- https://pasa.org.za/pasa-clarification-on-card-payment-surcharges/
- https://pasa.org.za/about-payments/pasa-faq/

## Shopper experience

Shop pages show a prominent **Directions to shop** action beside **Message shop** when messaging is enabled. Directions use a valid saved shop pin, otherwise the full address before falling back to the name/area. Zero/zero is not a valid pin. Opening Maps does not require a shopper login; Maps chooses the origin and transport option. Failure to launch gives a retry message. The same helper is used for Google directory listings.

Service rows display the delivery fee or free delivery, card acceptance with no extra charge, and any elected cash discount. Checkout fetches an authenticated server quote and shows the item subtotal, delivery fee, cash discount and final total before the order is sent. Card at shop is a collection option; delivery payment is arranged as cash on delivery. The shop confirms availability and fulfilment. Quotes use current server prices/settings, and order creation rechecks the accepted quote in the same transaction. A changed price, fee or service requires a fresh total. No client price, card fee or total can change the stored amount.

## Order messages and phone alerts

Every order event is retained in the owner's private inbox even if order phone alerts are muted. Repeated delivery of the same Firestore event is deduplicated. Phone delivery respects the owner's preferences, current registered device and OS permission. Lock-screen text identifies an order update without exposing customer names, addresses, messages or item details. Order push taps open Orders, message taps open customer Chat, and another seller's push is ignored. Foreground messages refresh the dashboard and order list; a new inbox event also shows a View orders action. The dashboard's Enable order alerts action requests permission and opts the owner into order phone alerts; the inbox works independently.

Actual phone delivery requires working FCM/APNs configuration and a physical device with permission. The app does not promise delivery when a device is offline, notifications are disabled or provider credentials are missing. On-device checks should cover foreground, background and terminated states with two separate order requests, plus sign-out and an account switch.

## Deploy and build

This release includes the expanded 378-choice catalogue, seller approval and address autocomplete changes. Download the latest `teyza-mobile-r315-deploy-kit` artifact from the checks run on **feature/teyza-shop-service-controls**, extract once into a fresh folder and run in PowerShell with Node 22 and the authorised Firebase CLI account:

```powershell
Unblock-File -LiteralPath '.\DEPLOY-MOBILE.ps1'
.\DEPLOY-MOBILE.ps1
```

The script updates only `functions:teyza-mobile`, retains existing verification/Places secrets and preserves Hosting and Firestore rules. Health must include `shopServices`, `orderQuotes` and `orderInboxAlways`, plus the previous address/approval/catalogue capabilities. After deployment:

```powershell
gh workflow run teyza-mobile-release.yml `
  --repo Gatcheni2025/Business-lift `
  --ref feature/teyza-shop-service-controls `
  -f signed_release=true `
  -f platforms=all
```

Version is **1.0.22 (32)**. The signed gate requires the current backend. The workflow saves store artifacts; iOS upload still requires `upload_existing_ios_run=<successful signed run ID>` on this branch.

Automated checks use synthetic accounts, stock, notifications and photo bytes. They do not change real shop settings, publish a pending shop, collect a card payment, grant a commission or send a real notification. A final device test should save a real shop-front image and delivery fee, view them from a shopper account, open Maps, send two separate orders and verify the owner's inbox/phone alerts.
