# TEYZA: customer app + business website (product decision, 18 Oct 2026)

## Definitive role split

**Teyza mobile app (Android + iOS): for consumers only.**
- Shop local spaza stores, grocery sellers, independent retailers and other merchants.
- Search by product/category and, once enabled, verified neighbourhood and accurate real availability.
- Basket, server-quoted checkout, shop collection or delivery based on the shop's actual capabilities.
- View purchases, request services, compare quotes, accept/decline quotes, manage customer account.
- Future: real in-app card payments, delivery tracking, quick reordering, saved addresses, vouchers and reviews.
- No seller registration, inventory management, wholesale dashboards, funding applications or banking details in the shopper app.

**teyza.co.za: business website and merchant operating system.**
- Existing site registration, identity verification, multi-business profile and administration remain.
- Marketplace onboarding for spaza shops, informal retailers, service businesses and wholesalers, manual approval.
- Catalog, products and services, stock availability, prices and packaging, photos, offers.
- Mobile-app customer orders, status progression, fulfilment, collection and local delivery settings.
- Service enquiries, quotes, future calendar/bookings, teams and service completion.
- Banking, account reconciliation, cashbook, invoices, quotes, statements, tax reports and expense capture.
- Stock acquisition: wholesale suppliers, pack/volume pricing, supplier quotes, delivery options and pooled buying.
- Funding: partner-originated stock finance / invoice finance application workflow, subject to verification and legal review; no unlicensed lending.
- Marketing: promotions, WhatsApp notifications (with consent), referral/loyalty programme, digital catalog and customer feedback.
- People/HR: staff roles and store permissions, shifts, tills, payroll integrations.
- Operations: POS, barcode scanning, returns/stock adjustment, low-stock alerts, branches, reports and admin support.
- Administration: seller verification, prohibited items, complaints, compliance and user permissions.

## Product boundaries

| Action | Customer mobile app | Merchant website |
|---|---|---|
| Find and compare shops/products | Yes | Merchant management only |
| Purchase and pay for goods | Yes after approved payment integration | Manage orders and reconciliation |
| Request a service quote | Yes | Answer and quote |
| List goods / set prices | No | Yes |
| Manage stock and staff | No | Yes |
| Configure delivery and collection | Choose available option | Set offered methods, fees, radius and schedule |
| Buy bulk wholesale goods | No | Yes, future |
| Request inventory funding | No | Yes, future regulated partner referral |
| Bookkeeping, payout statements | No | Yes |
| Manage merchant KYC and branches | No | Yes |

## Sixty60 benchmark, not a blanket promise

Aim for an intuitive checkout that can be finished quickly. The phrase 'Sixty60' refers to shopping in around 60 seconds and qualifying groceries arriving in approximately 60 minutes, not physical delivery in 60 seconds.

TEYZA is multi-merchant, so delivery times vary by shop, inventory, traffic, riders and local distance. Implement backend-calculated availability, prep times, delivery coverage, capacity and realistic ETA before advertising 60-minute service. Offer collection when delivery is not enabled.

## Shared authenticated marketplace backend

- Firebase staging project separate from existing deployed Teyza/Business Lift production Firebase until migration.
- Shopper app signs in with Firebase and reads only active/public catalogues and the logged-in shopper's order and service enquiries.
- Merchant website signs in with Firebase and accesses only its own shop, marketplace listings, customer orders, and service enquiries.
- Callable Cloud Functions enforce all catalog prices, stock, merchant/identity ownership and valid order state transitions.
- No direct web/mobile write to Firestore orders, service requests or seller verification records.
- Existing legacy product/order data live in a separate PHP workspace in the repo; this is NOT the marketplace backend. Future opt-in seller sync must run server-side, with explicit mapping, stock audits and permission checks.
- Critical: uploaded teyza.co.za.zip is not suitable for public source publishing; it contains potentially sensitive data/logs and incomplete PHP endpoints. Don't upload the ZIP to public GitHub.

## Implemented in draft PR #56

- Customer app: Shop, Services, Activity, Basket, Account navigation; no seller/wholesale tabs.
- Customer service request: describe task, location, optional date, request quote; quote appears in Activity and can be accepted/declined. No payment or calendar appointment is made.
- New merchant-marketplace.html and js/merchant-marketplace.js: marketplace shop onboarding, listing publishing, mobile orders and service quote responses. Existing dashboard/store/landing pages link to it.
- Funding, wholesale, bookkeeping, HR, loyalty and POS featured as planned, not live.
- Flutter and Firebase configs remain staging-only, new native build/test workflow. Site is not deployed by this PR.

## Recommended roadmap

**Milestone A — end-to-end pilot:** staging project, merchant approval, shopper listings, single-shop checkout, pickup/own delivery request, service quote, verified cloud security, Flutter Android APK & iOS build, alerts and order cancellation.

**Milestone B — local 60-minute fulfilment pilot:** onboard verified shops in one selected area, set operating hours, actual radius/delivery riders, prep capacity and ETAs. Track achieved on-time rates. No fixed 60-minute guarantee across all shops.

**Milestone C — payment, refunds and reconciliation:** marketplace-capable PSP with approved merchant KYC and settlement structure, signed webhooks, payment and refund states, statements.

**Milestone D — merchant business OS:** synced inventory, barcode/POS, accounting ledger, branches and staff roles, daily reporting, verified supplier relationships.

**Milestone E — wholesale and approved business financing:** wholesale orders, group buys and optional finance applications via authorised third-party funders after compliance review.

## Risk and quality gates before launch

- Firestore and Storage security tests including two different customers and sellers.
- End-to-end quote and order security/concurrency tests, duplicate order prevention, stock management and cancellation.
- Auth provider setup (email/password initially; Google/Apple/phone only after configured).
- Marketplace seller verification, allowed goods, service licence checks when applicable, consumer protection and POPIA.
- Delivery coverage, returns, support and honest ETA.
- Payments and funds disbursement only after provider approval. Funding offers only via appropriately regulated partners.
- Avoid mixing business owner account data with shopper account permissions.

Status: design and developer branch implemented in part; not production ready. The existing live website has not been redeployed.
