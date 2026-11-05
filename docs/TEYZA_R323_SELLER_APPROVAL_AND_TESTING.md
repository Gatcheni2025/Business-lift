# Seller verification and subscription testing

This is a draft stacked on the R320 Paystack work. It is not a production deployment or proof that a real subscription works. Do not merge or deploy it until the payment, mobile and security checks below have passed.

## Seller verification

The admin opens **Seller verification**, selects a registration, opens the current identity/company document and selfie, verifies the registered phone, and approves. A rejection or request for a new selfie requires a recommendation of at least 10 characters. The seller receives the note through the existing verification status and notification flow. A second administrator must review an administrator's own seller account.

Once seller verification and onboarding are complete, products publish automatically if the server has verified a current paid membership or a current, audited administrator exception. Draft ownership, names, prices, stock and server-uploaded photos are validated. A temporary exception is available from **Sellers & exceptions** inside the seller account; it is time-limited, requires a reason and is not a payment. Seller approval is never bypassed. Product availability is revoked when subscription or exceptional access expires or is revoked; drafts remain available for restoration.

## Existing pricing decision

The underlying R320 draft offers an eligible seller R49 for the first month, then R99 per month, and R29 for an optional seven-day promotion. This update preserves that draft pricing. The app shows R99 for a returning seller whose introductory offer was already used. Confirm the pricing and written customer terms before any actual payment or launch.

## What the automated tests do

Backend tests use synthetic Firebase records, fake Paystack responses and locally signed webhook payloads. They cover review notes, automatic publication, unpublished/expired access, complimentary grants, forged products and photos, allowed reference characters, idempotent confirmation retries and simulated recurring events. These are not real Paystack transactions or proof of store billing.

## Before a payment pilot

1. Create a genuinely separate non-production Firebase project, with separate test accounts, storage and a Paystack test key and R99 monthly test plan. The current mobile app, service URLs and storage configuration are tied to the production project; they require explicit staging configuration before this is possible. Sandbox seller checkout is blocked on the production project because test transactions could otherwise change a real account's introductory-offer and subscription records.
2. In that isolated environment, use Paystack's test payment details and test webhook. Verify an initial payment, matching owner, amount and currency, then verify that the seller's paid-until date and product access update correctly. Repeat with failed, abandoned and duplicate confirmations, application restarts, cancellations and expiry. Check that no real money is collected.
3. Exercise an actual R99 renewal and cancellation against Paystack test mode, including a failed renewal and replayed webhook. The recurring-charge handler expects a verified response with a matching plan code and customer; confirm Paystack's actual subscription event and verification payload for this merchant. Confirm the initial offer and renewal consent before any live payment.
4. The Play and iOS builds currently disable external seller checkout; Google Play Billing and Apple StoreKit subscription purchase, server verification and restoration are not implemented. Implement and test the appropriate store billing before promising in-app subscriptions in those builds. Do not use a direct Android build as evidence of Play Store or TestFlight billing.
5. Test registration, private document review and a time-limited complimentary exception separately from payment. Verify that the grant shows as temporary, not paid, and disappears after revocation or expiry.

The live backend version, merchant configuration, store submissions and payment processor cannot be verified from mocked tests. A successful test suite must not be treated as permission to collect money or as confirmation that any new code is already live.
