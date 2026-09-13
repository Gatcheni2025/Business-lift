# Business Expo Seller Operations

Business Expo now includes a seller setup hub at `seller-setup.html` for:

- Banking and payout destination
- PayFast merchant settings
- Delivery and parcel preferences
- Accounting configuration
- Booking-service configuration
- HR service configuration
- Partner Network profile

## Secure fields

Bank account numbers, PayFast merchant keys and PayFast passphrases are saved through Firebase Cloud Functions and encrypted using AES-256-GCM before being stored in Firestore.

Set a 32-byte encryption key before deploying:

```bash
firebase functions:secrets:set FIELD_ENCRYPTION_KEY
```

Generate a compatible key, for example:

```bash
openssl rand -hex 32
```

The backend stores seller operations in:

```text
sellerOperations/{businessId}
```

Do not give the browser direct Firestore read/write access to this collection. Access should remain through authenticated callable functions.

Recommended rule:

```text
match /sellerOperations/{businessId} {
  allow read, write: if false;
}
```

## PayFast

The current implementation securely captures the seller's Merchant ID, Merchant Key and optional passphrase, plus sandbox and Split Payments preferences.

For a live marketplace payment flow, Business Expo still needs to implement the signed PayFast checkout request and ITN validation. PayFast Split Payments must also be enabled/configured according to the merchant/platform relationship.

Important: Split Payments can divide transaction proceeds between PayFast accounts when a buyer pays. Bank settlement remains subject to PayFast's payout process and the designated South African bank account.

## Delivery

Sellers can choose:

- Courier service
- Own driver/team
- Customer pickup
- Digital/no-delivery products
- Mixed fulfilment

They can also save a dispatch address, delivery pricing, free-delivery threshold, own-delivery radius, parcel types and tracking preference.

## Accounting

Seller settings include:

- Accounting enabled/disabled
- VAT status and VAT number
- Invoice prefix
- Financial year end
- Automatic invoices
- Expense tracking

## Booking Services

Service businesses can enable booking and define:

- Appointment duration
- Buffer time
- Minimum booking notice
- Cancellation notice
- Service location
- Booking address/link

## HR

Seller HR preferences include employee count, payroll frequency, payslips, leave tracking and attendance tracking.

## Partner Network

Businesses can opt into discovery and define their category, service area, what they offer, what they need and whether other businesses may contact them.
