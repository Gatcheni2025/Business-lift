# Teyza — Spaza-to-Wholesale Marketplace

**Status:** PR #97 candidate. No Firebase deployment, payment collection, commercial supplier contracts or live delivery guarantees are implied by code changes.

## Business roles and experiences

| Registered role | Public discovery | Seller workspace | Purchasing |
|---|---|---|---|
| Shopper | Nearby spaza and other retail listings | Shopper orders, messages, maps | Retail order requests |
| Spaza Shop | Local listing after admin approval and verified R99 Basic listing payment | Manage retail stock and prices, customer orders and shop services | **Buy from wholesalers:** approved Teyza supplier catalogues, wholesale prices and stock order requests |
| Wholesaler / Cash & Carry | Google directory displays real businesses as *unclaimed, public map listings*; registered wholesale inventory is **not** public | Free business registration, verify, approve, select Basic, publish own bulk/pack catalogue and configure collection/delivery | Receive approved-spaza stock requests, confirm stock, arrange payment and fulfilment |
| Other Retail | Nearby retail directory after applicable publication conditions | Standard retail catalogues and orders | Standard retail ordering |

The seller-category key is immutable after registration. A previously registered “Other Retail / Wholesale” merchant remains `retail`; an administrator must separately verify the legitimate business and plan a controlled category migration. **Do not silently recategorize legacy merchants or expose their retail products as wholesale stock.**

## How ordering works

1. Shopper discovery tabs: **Spaza Shops**, **Wholesale**, **Other Retail**. Google-linked results show public name, address, map and credited photographs only; they do not indicate partnership, verified price, available inventory or free delivery.
2. Supplier registers as **Wholesaler / Cash & Carry**, finishes ID/company, selfie, mobile, location and admin verification, chooses R99 Basic and receives trusted current-period billing activation for the private B2B directory. Free accounts can prepare catalogue privately.
3. Supplier publishes product catalogue with an explicitly named **pack size/unit**, price in cents and real stock. A price is set by that merchant, not generated from Google. Supplier opts into delivery/collection, delivery radius and quoted delivery fee; setting zero legitimately advertises R0 delivery.
4. An authenticated spaza owner with completed admin review and an active verified R99 Basic entitlement selects **Buy from wholesalers** from My Business or dashboard header. Server action `wholesale_directory` checks their verified seller identity and active Basic entitlement, then returns only activated wholesale supplier catalogues. Merely signing in as a shopper never unlocks wholesale pricing.
5. Spaza chooses products and quantities; `order_quote` recalculates authoritative prices, stock and delivery charges. `order_request` verifies the spaza buyer **again** in a transaction, verifies the quote ID, and creates an order marked `orderType: wholesale_stock`. The existing order inbox/chat supports confirmation and delivery status. Money is arranged directly with the merchant; no in-app wholesale charge or automatic shipment is implemented.
6. A spaza can add received inventory to **My Products** and set its own retail prices. This initial phase does **not** automatically transfer purchased stock into the spaza’s product inventory; that needs completed-order reconciliation, product/pack mapping and supplier-confirmed quantities before it can be safely automated.

## Safety rules

- Google listings are **discovery only**. No prices, stock, merchant authentication, account claim, Google review ownership or commercial agreement inferred from Google Places.
- Never put wholesale prices in anonymous `publicShops`, public Firestore read rules or public retailer product widgets. `wholesale_directory` requires a signed-in **admin-approved spaza owner with a current Basic entitlement** (legacy accounts without a plan require explicit migration). Both wholesale `order_quote` and `order_request` check again on the backend.
- Client-supplied total is ignored; authoritative server price plus verified delivery price is recomputed, and quote expiry/change requires the buyer to refresh.
- **Free delivery** is an attribute of a specific supplier’s valid live order quote (R0) and fulfilment area, not an automatic R99 membership benefit. Partner-based delivery sponsorship would require an explicit verified entitlement and budget, still to build.
- Products can only appear after merchant approval, catalogue review and trusted Basic billing; an unverified or unpaid supplier cannot place bulk prices in front of buyers.
- R99 for a paid listing/placement inside the same iOS app triggers potential Apple In-App Purchase requirements. Do not begin collecting it in the iOS app until the purchase model is compliant.
- Deletion requests remain independent of seller approval and must actually be processed by operations as documented in `docs/TEYZA_ACCOUNT_DELETION_APP_REVIEW.md`.

## November 2 update — discovery, links, and local services

- The seller registration question now distinguishes **Spaza Shop Owner**, **Wholesaler supplying Spaza Shops** and **Other Business / Services**. Registered sellers are restored to their seller workspace on login. The dashboard shows sourcing for spaza owners and bulk stock offers for wholesalers.
- A spaza owner's **Buy from wholesalers** page now has two separate lists: **approved Teyza wholesale sellers** with private orderable stock, and **Google-listed nearby wholesalers** using the registered shop address through geocoding. Google listing results cannot accept an order merely because they exist in Maps.
- A Google-listed wholesaler may have a **Request supplier link** button. An authenticated spaza owner can create one rate-limited request in `teyzaWholesaleLinkRequests` via the server action `wholesale_link_request`; it is an admin follow-up lead, **not** a Google Business claim, a connected wholesaler, a price agreement or a confirmed order. The business must still register and pass verification.
- Shopper business cards show **Buy here** only for live verified Teyza merchants. A Google-only business explicitly shows **Shop Unavailable**, while keeping Maps directions. A trusted same-name, same-location Teyza shop may be matched in the UI and its actual published range opened.
- **Other Businesses** expands the public directory to salons, barber shops, upholstery, furniture, plumbers, electrical services, local retail and repair providers. Pure service-area providers are labelled **Service area — check coverage** rather than fabricating a pin or distance.
- Public business telephone numbers are fetched only on opening a listing through the new `/shopper-place-contact.php` endpoint. Google Places national phone number is a higher-cost Enterprise field; avoid requesting it during every search or promising it on every business. Configure quota/budget alerts before production.
- The prominent **Verify my shopper account** action was removed from the Google-only shop profile. Optional Firebase email verification remains available in the account settings for capabilities whose backend requires a verified contact.
- The new Places endpoint and mobile supplier-link action **require a new scoped Firebase Functions deployment**. Updating the website alone or installing a new APK will not activate the server changes.
- Prior account deletion ZIP download link error: use the directly linked GitHub Actions artifact `teyza-mobile-r315-deploy-kit` from the PR's latest successful **Teyza Android and iOS Release** check, rather than an outdated older ZIP. After extracting, run `DEPLOY-MOBILE.ps1` in PowerShell from the kit root. Also deploy Places via `firebase deploy --only functions:teyza-places --config firebase.teyza-places-v34.json --project business-lift-3c19c` from an up-to-date repository checkout. The kit archive alone may not contain the Places source.
- Check actual deployed `teyzaMobile` health returns `accountDeletionAuthLock:true` for sign-in closure, and `teyzaPlaces/health` shows wholesale discovery enabled. Complete real-device Android/iPhone acceptance testing before publishing.

## Deployment and acceptance checklist

1. Verify backend tests: `npm test --prefix services/teyza-mobile-v39` and Google Places tests `npm test --prefix services/teyza-places-v34`.
2. Validate Flutter test/analyzer workflows on the PR branch. Product, role and Google Places views must work on a physical Android and iPhone.
3. After authorized deployment review, deploy scoped `teyza-places` functions with `firebase deploy --only functions:teyza-places --config firebase.teyza-places-v34.json --project business-lift-3c19c`; verify its GET /health announces `wholesaleDiscovery:true`.
4. Deploy scoped mobile backend using `DEPLOY-MOBILE.ps1` from the checked-out release branch. It requires the existing Google Places key and verifies `wholesaleSourcing:true` and `protectedWholesalePrices:true`; do not modify Firebase secrets or deploy unrelated functions.
5. Run real user-journey QA with **disposable** verified spaza, wholesaler, shopper and unapproved seller accounts. Confirm public shopper never receives wholesale price; verified Basic spaza can quote/order; rejected/unverified spaza is blocked; R0 delivery is only displayed when the approved wholesaler opts in and a live quote confirms it.
6. Have a real supplier post sample stocked items with explicit pack quantities and prices; exercise acknowledgement, fulfilment and cancellations. Confirm B2B orders also appear in the spaza’s **My wholesale stock orders** page.
7. Verify public Google Places maps/logo/photo attribution and external terms; Google discovery cannot be used to manufacture wholesale offers. Review eligibility of all credit and pricing marketing statements.
8. Test releases; update Apple reviewer accounts, deletion workflow and physical-device recordings for the newly reviewed build.

**Not yet delivered:** Supplier integration feeds, paid wholesale checkout/Paystack funds transfer, automatic replenishment, automated supplier stock reconciliation into spaza retail inventory, guaranteed R0 deliveries, negotiated bulk discounts, or live wholesale partner contracts. These need additional commercial agreements, data mapping, payment validation and order fulfilment testing.
