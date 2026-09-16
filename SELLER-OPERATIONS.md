# Business Expo Seller Operations

Seller operations now run through the same-origin PHP backend. Firestore and Firebase Cloud Functions are not used for seller data.

Core seller pages:

- `seller-onboarding.html` — guided setup for selling connections, delivery, payments and target audience
- `sales-channels.html` — external selling-platform connections
- `shop-settings.html` — shop/contact/notification settings
- `delivery-settings.html` — fulfilment and delivery preferences
- `network.html` — Business Network profile
- `dashboard.html` — balances, orders and selling activity

## PHP storage

Seller settings are accessed through:

```text
/api/settings.php
```

The browser sends the Firebase Authentication ID token only to prove the user's identity. PHP validates the token and stores the seller data in the protected server-side `storage/` directory. Firebase Authentication remains identity-only; Firestore is not used.

## Sensitive payment fields

Bank account numbers, PayFast Merchant Keys and PayFast passphrases are encrypted server-side with AES-256-GCM before they are written to disk.

Set a strong server-only key:

```text
BUSINESS_EXPO_DATA_KEY=<64-character-random-hex-value>
```

Generate one with:

```bash
openssl rand -hex 32
```

Never commit this value to GitHub. The API only returns masked bank-account information such as the final four digits, and it never returns PayFast keys/passphrases to the browser.

## Guided setup completion

The four setup steps are considered complete when PHP confirms:

1. At least one external selling platform is connected.
2. A fulfilment method has been saved.
3. EFT/bank, PayFast or another payment gateway has been saved.
4. A target audience preference has been saved.

## Payments

The PHP settings backend supports:

- EFT/banking details
- PayFast Merchant ID, Merchant Key, passphrase and sandbox preference
- another gateway name/reference

A live marketplace checkout still requires signed PayFast checkout generation and ITN validation. Those payment-processing endpoints should decrypt secrets only on the server and must never expose them to browser JavaScript.

## Delivery

Seller setup captures fulfilment mode, preferred courier/driver, dispatch address, delivery fee, free-delivery threshold, delivery radius, customer pickup and tracking preference.

## Business Network

`network.html` stores category, service area, what the business offers, what it needs, discoverability and contact preference through the PHP settings API.

## Data path

```text
Browser
  → Firebase Authentication (identity only)
  → Authorization: Bearer <ID token>
  → www.businessexpo.co.za/api/*.php
  → protected PHP storage
```

There is no browser-to-Firestore or browser-to-Firebase-Functions seller operations path.
