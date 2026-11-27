# Teyza shopper ads — radius and moderation pilot (11 November 2026)

## Commercial definition
- Separate from the R99 monthly seller membership and **separate from the B2B wholesaler-to-spaza ad system**.
- One-time **7-day** advertisement; no automatic renewal. A seller submits or purchases another campaign to run again.
- Approved spaza and local-business/retail accounts only; active verified seller and accurate saved pin required.
- **R29** for any 1–10 km radius, then **R2 per additional whole km**, from **11 to 50 km**. Formula in cents: \`2900 + max(0, radiusKm - 10) * 200\`. Examples: 10km R29, 15km R39, 20km R49, 30km R69, 50km R109.
- Radius is measured using great-circle distance from the owner's verified shop pin to the shopper's chosen area/delivery location. It is **not** the seller phone's GPS, kilometres of driving, or an exact estimated audience size.
- No advertiser-supplied amount is trusted. The server recalculates and pins the price to the immutable submitted radius and approved location.

## Seller flow
1. Open **Teyza Ads** from the spaza or local-business dashboard.
2. Enter heading and description; choose a JPEG/PNG creative with consent, select a radius with the 1–50 km slider.
3. Submit for review without paying. The uploaded image is private and is not served publicly.
4. Another authorised administrator inspects image and copy, then approves or rejects it with a recorded decision. Approval makes the ad **approved_unpaid**, not live.
5. When a supported payment rail is enabled, the seller pays the quoted **one-time 7-day** price. Separate Paystack charge is signed/verified server-side: exact Teyza reference, shop Firebase UID, ad ID, ZAR amount, environment and customer.
6. Only once **both approval and paid verification** are present is the ad **active** and visible in the shopper home feed. The seven-day clock starts after the verified payment, not at upload. An ad expires automatically, and suspended owners' or relocated shops' ads disappear from the feed.

## App Store and Google Play payment constraints
- **Paystack direct APK**: Native Flutter Paystack checkout is available only if built as independently distributed Android with \`TEYZA_PAYMENT_CHANNEL=direct\` *and* separately gated by \`TEYZA_ADS_DIRECT_PAYSTACK_ENABLED=true\` plus \`TEYZA_SELLER_PAYSTACK_ENABLED=true\`. Both are intentionally **disabled** in the production rollout. Treat direct payment as a separate explicitly approved release, not as an automatic extension of the R99 rollout.
- **Google Play / App Store**: In-app purchases of advertisements that display within Teyza must follow the stores' digital-goods purchase rules. Apple's guideline 3.1.3(g) explicitly requires IAP for same-app advertisements, and Google Play generally requires Google Play Billing for digital purchases unless a recognized exception applies. **Do not use in-app Paystack buttons or prompts to circumvent these requirements.** The store build currently shows status and does not initiate payment. Play Billing/StoreKit backend-verification integration is pending.
- Existing monthly seller membership purchase remains website-only and unchanged in this PR.

## Admin & user safety
- Admin portal > Product activity contains a separate **Teyza Ads** review panel, distinct from wholesaler promotions.
- Reviewers must inspect the image before confirming approval. Same-account review forbidden. Rejection requires a meaningful reason. Audits are written.
- Public creative endpoint serves only actively paid, reviewed, unexpired ads from unchanged approved shop pins.
- Shopper feed returns no private seller IDs beyond the public shop ref, no personal contact or payment details.
- Paystack ambiguous initialization is marked \`needs_attention\` and never silently retried. Approved ad payment after revoked status enters refund review.
- Approved/paid campaigns are displayed with explicit **Sponsored** disclosure. Ad reporting and moderation policy must be validated in physical-device and App Store/Play review.

## Release gate
Draft PR #145 is **not deployed**. Keep \`TEYZA_ADS_DIRECT_PAYSTACK_ENABLED=false\` for staging. Verify \`node --test services/teyza-mobile-v39/shopper-ads.test.js\`, the full backend suite, Flutter tests, admin UI and backend production health checks. Review actual Paystack settlement, cancellation/refunds, manual moderation throughput, ad image retention, geographic accuracy, and rate limits before any real payment. Existing R99 pilot and current shoppers must be unaffected.
