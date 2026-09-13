# Business Expo Seller Operations

Seller operations are intentionally split into a small number of seller-facing pages:

- `seller-onboarding.html` — guided setup for selling connections, delivery, payments and target audience
- `sales-channels.html` — external selling-platform connections and backend confirmation
- `shop-settings.html` — shop/contact/notification settings
- `network.html` — Business Network profile
- `dashboard.html` — balances, orders and selling activity

The old standalone `banking.html`, `accounting.html` and `seller-setup.html` pages were removed because their useful settings are now handled through the guided setup/backend instead of separate menus.

## Secure fields

Bank account numbers, PayFast merchant keys and PayFast passphrases are saved through Firebase Cloud Functions and encrypted using AES-256-GCM before being stored in Firestore.

Set a 32-byte encryption key before deploying:

```bash
firebase functions:secrets:set FIELD_ENCRYPTION_KEY
```

Generate a compatible key:

```bash
openssl rand -hex 32
```

Seller operations are stored in:

```text
sellerOperations/{businessId}
```

Do not give the browser direct Firestore read/write access to this collection. Use authenticated callable Functions.

Recommended rule:

```text
match /sellerOperations/{businessId} {
  allow read, write: if false;
}
```

## Guided setup data

The four onboarding steps are considered complete when the backend confirms:

1. At least one external selling platform is connected.
2. A fulfilment method has been saved.
3. EFT/bank, PayFast or another payment gateway has been saved.
4. A target audience preference has been saved.

## PayFast

The implementation securely stores seller Merchant ID, Merchant Key and optional passphrase, plus sandbox and Split Payments preferences.

A live marketplace still needs signed PayFast checkout generation and ITN validation. Split Payments can divide transaction proceeds between PayFast accounts; bank settlement still follows PayFast's payout process.

## Delivery

Guided setup captures the seller's fulfilment mode, preferred courier/driver, dispatch address, standard delivery fee and tracking preference. More detailed delivery fields remain supported by the backend for future use.

## Business Network

`network.html` allows a seller to define their category, service area, what they offer, what they need, whether they are discoverable and whether other businesses may contact them.

## Advanced capabilities

Accounting, booking and HR settings remain supported by the backend data model for future product modules, but they are deliberately not shown in the core seller menu until those modules are ready. This keeps the everyday seller experience simple.