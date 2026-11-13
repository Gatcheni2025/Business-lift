# Teyza R99 calendar-month proration proposal — 13 November 2026

**Status: DRAFT, production feature flag OFF.** This changes the amount of a real Paystack charge and the legal renewal consent terms. Existing live R99 subscriptions and old R10 agreements are untouched. This draft does not authorise deploy or alteration of Cloud Run/Firebase flags.

## Intended first-month price

An approved, eligible seller who joins in the middle of a South African calendar month pays proportionally for the remaining calendar days **including their joining day**, rounded to the nearest cent using integer subunits:

`firstPaymentCents = Math.round(9900 * (daysInMonth - localDay + 1) / daysInMonth)`

The calendar date is taken from server time converted to **Africa/Johannesburg (UTC+02:00)**, not a user-supplied timezone, browser date, URL, or amount. Charge exactly R99 on day 1. For 12 November 2026: (30 - 12 + 1) / 30 * R99 = **R62.70**, then an **R99 renewal 1 December**. 10 Nov R69.30, 15 Nov R52.80, 20 Nov R36.30, 25 Nov R19.80. For months with 28, 29 or 31 days the calendar divisor changes.

The existing Paystack **PLN... R99 monthly plan code stays unchanged**. An independent one-time first-month hosted card transaction is initialized with the server price. After verified Paystack success, the backend reuses the consented authorization to create the original R99 monthly subscription with `start_date` on the **first of the following calendar month**. Existing renewable subscriptions must never be recreated or moved. There is no new tax assumption, daily charge, automatically collected arrears or rolling 30-day billing.

## Technical safety contract

- New flag `TEYZA_SELLER_PRORATION_ENABLED=true` must be set **only** after the backend, authenticated website and reviewed source hash have all been deployed and tested together; default is false.
- Flag OFF: original R99 initial checkout and `seller-r99-monthly-2026-11` terms remain byte-compatible.
- Flag ON: new explicit consent `seller-r99-calendar-proration-2026-11` is mandatory; authenticated `seller_billing_overview.firstPaymentQuote` gives amount, ZA quote date, remaining days and next renewal.
- Public health advertises `membershipProrationEnabled`, server-priced current-day `membershipInitialChargeCents`, quote date and matching terms. Site requires exact matches of health and UID-bound statement, and sends an expected amount/quote date; backend **recalculates** and rejects stale or forged amounts BEFORE issuing a Paystack checkout.
- Pending Paystack checkout reference locks remain bound to seller UID, original quote, terms and amount; old outstanding payments must be reconciled, never reinitialized at a new price.
- A Paystack payment completed after its quoted **ZA calendar day** is held for refund/reconciliation review and NEVER automatically grants selling access or a recurring R99 schedule. This can happen at the date boundary; do not click the link a day later.
- New signups remain paused during the final 24 hours of the month, reducing the chance of charges hours apart. Existing subscription renewals and past R10 transactions retain their prior contracts.
- Paystack signed webhook still verifies precise transaction amount, currency, environment, UID, reference and owner. Payment return alone never grants access; account deletion or verification changes still put the payment into refund review.
- No store build checkout links are added.

## Handling the already-paid R99 seller who joined on 12 November

This is an **existing verified live R99 charge**. The new rule must NEVER silently create another payment, alter an agreed subscription, reset its due date or mark existing payments as prorated. The prorated equivalent is R62.70 and the difference **R36.30**. A properly authorised operator can review a **one-time R36.30 partial refund** against that exact original Paystack transaction, if eligible, using Paystack's dashboard. Cross-check previous refunds and refunds status; keep an audit note. Do not refund the entire R99, change the fixed recurring plan, or make an automated 'credit' based merely on the user's display name. Preserve seller access and the next R99 renewal on 1 December.

## Release gates (REQUIRED)

1. Run all backend billing, renewal, refund and seller-payment statement tests; regression checks for 28/29/30/31 days, ZA midnight rollover, stale checkout, UID mismatch, old R99 and grandfathered R10.
2. Coordinate backend and `/pay` website files. `web/app-first/public/js/seller-web-billing.mjs` is subject to the exact-byte operator fingerprint gate `docs/TEYZA_PAY_OPERATOR_SOURCE_APPROVAL_20261110.json`; the existing approval applies to **different bytes**. Obtain a fresh explicit operator hash approval for this PR before changing that gate or publishing the new code. Do not infer approval from previous payment-feature approvals.
3. Confirm Paystack's monthly plan really is R99 ZAR and first recurring debit is verified on day 1, with accurate consent, webhook reconciliation, cancellation and no other active recurring subscription for that UID.
4. Deploy the reviewed /pay UI independently, alongside the compatible backend, without replacing unrelated Firebase Hosting files or overwriting the live checkout rollout and secrets. Confirm a safe staging configuration first, then enable the flag only after full smoke testing.
5. For production: retain `TEYZA_SELLER_PAYSTACK_ENABLED=true`, `TEYZA_PAYSTACK_FULL_ROLLOUT_APPROVED=true`, `TEYZA_PAYSTACK_PILOT_UIDS=*`, original Paystack secret bindings and `TEYZA_PAYSTACK_MONTHLY_PLAN_CODE`; do not run a blanket environment replacement.
6. Before enabling for public sellers, confirm store policy and billing terms for the current app releases. A website-first membership flow is separate from any app-store permission to steer digital purchases.
7. Verify that the paid seller from 12 Nov remains active and is NOT charged again or auto-refunded by deploying this change.

## Useful primary provider references

- Paystack Subscription API https://paystack.com/docs/api/subscription/ — `start_date` for delayed recurring debit
- Paystack subscriptions guide https://paystack.com/docs/payments/subscriptions/ — a plan code on transaction initialize overrides the payment amount; DO NOT attach the R99 plan to a prorated initial payment
- Paystack Refunds https://paystack.com/docs/payments/refunds/ — partial refund via an explicit `amount`
