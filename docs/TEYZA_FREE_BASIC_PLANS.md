# Teyza — Free seller registration and R99 Basic local listing

**Status:** Draft PR #97, not a live production change. Deploy a verified backend and new Android/iOS builds before using this flow with merchants.

## Customer journey
1. A shop owner signs in and registers without being charged. A new `teyzaSellerAccounts/{uid}` record defaults to `listingPlan: 'free'`.
2. The owner sees **Free** or **R99 Basic** after saving their shop details; either choice leads to document, selfie and phone verification.
3. **Free** keeps a private profile and allows shop setup and draft products; it is not listed in local shopper results.
4. **Basic** selects a preference only. No card/debit is charged from selecting Basic. Publishing requires current-month payment recorded by a trusted administrator, seller approval, phone/document compliance and absence of a suspension.
5. When active, the paid shop appears for the local area with `sponsored: true` and a **Featured in your area** label. It ranks above other *locally relevant* merchants while preserving area filtering. This provides improved exposure, **not guaranteed sales**.

## R99 Basic member benefit disclosures

In addition to verified local discovery and featured placement, the seller plan selector and seller-facing website describe these potential benefits:

| Benefit | What a merchant can actually expect |
| --- | --- |
| Business finance / stock loans | Submit an enquiry for consideration by an eligible finance partner; finance is **not automatic** and is subject to approval, affordability and lender conditions. |
| Wholesale stock discounts | Access offers from participating wholesalers when deals are active and available to that merchant. Do not promise a fixed discount or guaranteed lowest price. |
| Free stock delivery | Delivery fee may be waived only for **qualifying wholesale orders** in supported coverage areas, when an identified partner offers the benefit and its conditions are met. Not a promise of free delivery for all orders. |
| Competitive retail pricing | Reduced stock acquisition costs may help sellers select attractive retail prices and improve potential margins. Prices remain seller-controlled; sales, savings and profit are not guaranteed. |

**Operational prerequisite:** These are conditional programme benefits, not four already-proven live services. Before representing any of them as an included active entitlement, publish participating suppliers/lenders, concrete thresholds and coverage, eligibility disclosures, a redemption process and fulfilment ownership. If unavailable, mark the feature as coming soon or remove it from the current-benefit list. Neither plan selection nor a R99 payment may silently create loan, discount or delivery entitlements.

## Trusted entitlement

`publication.entitled(uid,account,billing,now)` returns true for a new seller only when:
- `account.listingPlan === 'basic'`;
- `teyzaBilling/{uid}` belongs to the same UID, is `status: 'paid'`, records `monthlyCents: 9900` and has a `latestPeriod` equal to the current South African billing month.

The account's selected plan **cannot** self-authorise payment or set `billing.status`; the backend recalculates its public listing on trusted billing changes. The shopper directory also checks the current billing period every time, so expiry blocks discovery without waiting for a scheduled change. Listings must never be considered paid merely because the owner chose Basic.

### Legacy merchant migration
Existing approved shops without a `listingPlan` property keep their previous visibility temporarily to prevent an unplanned mass takedown. Back-office staff must review and migrate those merchants to Free/Basic with customer consent and verified billing before claiming every visible shop is subscribed. Do **not** automatically charge or enrol legacy shops.

## Account deletion is independent of approval

The shopper Account page and the seller My Business/error/no-shop screens link directly to `TeyzaDeleteAccountPage`. The `account_deletion_request` action is routed before seller registration, approval, email verification, payment or publication checks. It supports pending, approved, rejected and shopper-only accounts. The user receives a `TZ-DEL-...` reference. Pending deletion stops new service transactions and, for sellers, suspends the public listing.

This is a **deletion request** with a target processing period, not automatic completion of all data erasure. Operations must actually process eligible Firestore/Storage data, external mandates and Sign in with Apple token revocation before closing it. See `docs/TEYZA_ACCOUNT_DELETION_APP_REVIEW.md`. This backend must be deployed before the new iOS client will function; older backend versions can still reject unknown actions or improperly require seller approval.

## Apple review/payment caution

**High priority:** Apple Guideline 3.1.3(g) says advertising placement purchased for display *inside the same app* generally uses In-App Purchase (IAP). Teyza's R99 subscription includes prominent placement in the iOS shopper app. The current plan-selector is informational and does not collect money, but a full purchase/renewal flow for iOS should be designed with StoreKit/App Store Connect products or another explicitly permitted payment model after review of the app's eligibility. Do not redirect iOS users to outside checkout from this plan choice or tell Apple it is a completed iOS payment flow.

Official guidelines: https://developer.apple.com/app-store/review/guidelines/

## Testing
- A pending, approved, rejected and ordinary shopper account must all initiate deletion.
- Registration and a Free selection must not auto-approve, publish, invoice or subscribe a merchant.
- Selecting Basic alone must not publish or charge.
- Only a paid **current-month** trusted billing record and completed seller approval permit publication.
- Expired, wrong UID, pending or partial payment does not allow the new paid listing to be visible.
- Once active, the shop appears in the proper Spaza / Other Retail category and is featured in its area.
- Review the release build on a physical iPhone before Apple App Review. Its previous 1.0.24 (34) build does not include this change.

Deployment order: backend + migration review first; Android and iOS test builds second; only then production App Review. Existing billing and legal records must be preserved during deletion according to applicable retention law.
