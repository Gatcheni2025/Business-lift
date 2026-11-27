# TEYZA Marketplace — Product and Technical Roadmap

Status: FOUNDATION ONLY. The existing TEYZA website and production branch are unchanged.

## Purpose
Make TEYZA a township-first marketplace for spaza shops, informal sellers, neighbourhood retailers, wholesalers and service providers. Customers can order for collection or local delivery. Spaza owners also get B2B stock purchasing, collective buying opportunities and, later, voluntary credit referrals through authorised finance partners.

## Separate experiences
- Existing teyza.co.za: retain the current web shop, customer tools, seller admin and PHP-based business workspace.
- New Flutter Android/iOS app: customer browsing, basket, orders, seller signup, merchant orders and product creation.
- Teyza Wholesale: restricted B2B catalogue, pack sizes, MOQs, volume pricing, quotes and verified supplier fulfilment (later).
- Teyza Finance: future opt-in referral/service by approved third-party credit providers; no Teyza lending or client-side credit balance.
- Teyza Admin: verify shops and documents, suppliers, products, orders, disputes, payouts and abuse. Manual approval is essential for the starter.

## Why new data collections?
The present Business-lift repository uses a PHP workspace API, api/workspace.php, for much of the seller product and order data, stored in server-side per-user JSON files. The new Flutter app cannot simply read all those records from Firestore.

Keep the old seller workspace untouched. Build the marketplace using separate collections:
- teyzaMarketplaceShops: verified public shop metadata and seller fulfilment settings.
- teyzaMarketplaceListings: public products (only active) and advertised services.
- teyzaMarketplaceOrders: authenticated buyer/seller read, server-only writes.
- teyzaMarketplaceWholesaleOffers and teyzaMarketplaceFinancing: denied to public clients pending B2B/lending partner implementation.

Before syncing legacy products, create a secure opt-in, server-to-server migration: map each seller to an approved shop, verify image rights, pricing and stock, and never expose internal/sensitive PHP JSON records to public clients.

## Stage 0 — What this branch implements
- New Flutter starter in apps/teyza_marketplace (Android and iOS project directories must be generated).
- Customer catalogue discovery, categories, one-store basket, pickup or store delivery requests, order history.
- Firebase email/password sign-in and seller registration.
- Seller publishes listings only after a trusted administrator approves the marketplace shop.
- Callable Functions validate customer-requested orders against live server prices, stock, seller ownership and permitted fulfilment.
- Order starts pending_seller and unpaid. Seller accepts, declines or progresses it; inventory decrements in transaction on acceptance.
- Wholesale and stock-credit tabs are explanatory placeholders, not active lending.
- Changes are in a GitHub feature branch only. No website changes have been deployed.

## Phase 1 — Public marketplace pilot
- Built-out seller verification/admin approvals (identity, trading location and food-handling obligations as applicable).
- Shop hours, verified pickup addresses, geospatial discovery, map-based distance, delivery radius and truthful estimated times.
- Photo uploads with private storage permissions; catalog sync from opted-in existing Teyza web sellers.
- Push notifications for new orders and updates; out-of-stock and closing-time logic.
- Refunds/cancellation, stock restoration, returns, disputes, fraud controls, rate limiting and Firebase App Check.
- Delivery handover verification, driver tracking, customer support and seller ratings.
- Measured fulfilment targets. Sixty-minute deliveries should be an optional service target, NOT a blanket promise.

## Phase 2 — Payments and settlements
- Only after a payment service provider formally approves the marketplace merchant/subaccount structure.
- Card checkout, signed payment webhook, merchant onboarding, fee ledger, tax invoice, reconciliation, refunds, chargebacks.
- Distinguish cash-on-collection, cash-on-delivery and prepaid card; no ambiguous payment statuses.
- Never treat an order as paid because the driver or seller marked it fulfilled.
- Disclose platform commission and delivery fees. Pilot pricing is to be decided, not hardcoded.

## Phase 3 — Teyza Wholesale
- Onboard verified wholesalers and suppliers; pack size, carton/each units and MOQ pricing.
- Spaza inventory replenishment, supply cart and delivery slot selection.
- Offer pooled purchasing when participating suppliers agree. Provide receipts, price history and supplier issue management.
- Wholesale prices are available only to verified wholesale buyers, not anonymous retail customers.

## Phase 4 — Inventory credit
- Credit offers only through appropriately licensed/authorised financial partners after South African legal review.
- Eligibility and affordability assessment done by partner; explicit consent, clear cost/interest, complaints and privacy.
- Do NOT create your own informal credit wallet, lend directly or promise automatic approval.

## Service providers
Service listings may be advertised in the foundation but cannot be placed in the physical-products basket. Add separate enquiry, quotation, appointment booking and proof-of-completion journeys, with relevant dispute rules.

## Launch gates — NOT yet complete
- Native Android .apk/.aab and iOS builds, tested on real devices.
- Firebase staged project and CI pipelines, local emulator security/race-condition tests.
- End-to-end sign-in, seller approval, listing, checkout, seller fulfilment and inventory tests.
- Admin and moderation launch, product migration review, delivery operations and formal policy terms.
- POPIA privacy safeguards, Consumer Protection Act terms and ECTA electronic transaction disclosures.
- Approved payout provider and credit partner before those options go live.

This branch is a developer starting point, not a production launch or proof that the existing website is functioning end-to-end.
