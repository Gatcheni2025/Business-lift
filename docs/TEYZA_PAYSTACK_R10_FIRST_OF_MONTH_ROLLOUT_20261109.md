# Teyza R10 introductory Paystack membership — staged rollout (9 Nov 2026)

**Status:** Draft. This branch is NOT deployed, does not authorize live charges, and is not a store-compliant release approval.

## Pricing decision
- Shop registration and free discovery are free, subject to verified shop identity.
- Eligible **new** approved sellers pay **R10 once** at the website checkout. It provides product-selling access through the end of that South African calendar month.
- Recurring **R99 per month** begins on the **first day of the following month** (00:00 UTC / 02:00 South African time) and runs on day 1 until cancelled.
- Returning subscribers who previously used the introductory price may pay R99 on initial checkout and then R99 on the first of the next month; the page discloses the amount. Consider a returning-member prorating enhancement before broad rollout.
- New checkouts are blocked during the last 24 hours of each month to avoid an unexpectedly rapid R99 renewal.
- R10 is a paid introductory offer, **not a free trial** and not a R99 prorated calculation. No end-of-month top-up is charged. Sellers must explicitly consent to the R99 schedule.
- The R29/7-day optional promotion checkout remains disabled pending separate review.

## Old Netcash mandate handling
- New Netcash mandate creation, review, provider submission and provider-confirmation access grants are retired at the mobile service dispatch layer. Previously submitted mandates remain readable and withdrawable; do **not** erase signed consent or private audit trails.
- Any existing temporary processing access expires according to its original deadline, not a newly granted term.
- Do not automatically migrate existing Netcash bank accounts or debit instructions into Paystack. A seller must initiate a new Paystack checkout and card authorisation.

## Live launch prerequisites (all required)
1. Confirm SA card recurring support and the ability to schedule day-1 billing with Paystack using a controlled test merchant and live subscription plan. Paystack plan must equal ZAR R99 monthly; `TEYZA_PAYSTACK_MONTHLY_PLAN_CODE` is a backend-only environment variable. Run real gateway integration checks before enabling. No test payments in production Firebase.
2. Configure webhook at the correct HTTPS Teyza service `/paystack-webhook` endpoint, with HMAC validation, idempotency, verified amount, plan, currency, subscriber and status. Verify cancellation/refunds and reconcile Paystack events after interruptions.
3. Check Apple App Store and Google Play seller-membership external purchasing rules for the actual Teyza marketplace, including whether the app may mention the website or directly unlock digital products. Seek store-policy approval before app-store distribution.
4. Test seller verification (same Firebase UID across seller app, admin, seller mandate archive, Paystack checkout and public directory), and confirm no Paystack charge until identity/account verified.
5. Confirm website shows R10 initial payment only for new eligible sellers, R99 for returning, an explicit first-of-month recurring consent, cancellation link and correct payment return confirmation.
6. Ensure `TEYZA_SELLER_PAYSTACK_ENABLED` is **absent/false** in both staging and production by default. Enable it **only after** the previous gates and a controlled production deploy. The public health endpoint must change to `sellerPaystackNewCheckoutDisabled:false`, `paystackCheckoutAvailable:true`, `introductoryFirstMonthCents:1000`, `sellerMembershipBillingMode:'paystack_card_subscription'`. The backend server alone controls price, entitlement and payment confirmation.
7. Deploy the same revision of Firebase backend and website, then make a separate signed QA build. The production CI gate requires `introductoryFirstMonthCents:1000` to prevent signing a backend-mismatched release.
8. Inspect fraud, refunds, retry locks, plan/webhook subscriptions and any existing mandate cancellation requests for possible double billing. Log auditable decisions, not sensitive card or bank credentials.

## Acceptance tests
- Approved/verified real seller UID + R10 Paystack success -> one paid entitlement until first of next month, saved products publicly visible in the shop's radius.
- Pending seller UID, stale selfie, incomplete OTP, incorrect plan code, incorrect webhook signature or out-of-date terms -> **no live entitlement**.
- Repeated callback/webhook and temporary network loss -> at most one active Paystack subscription or an explicit manual review state; never a second charge.
- Sign up 30 November, inside final 24 hours -> no checkout until 1 December.
- 1 December -> first R99 renewal only if consented, payment verified and not cancelled.
- Existing Netcash records -> historical read-only; no new debit/paid status inferred.
- Wholesalers -> shopper catalogue remains empty; any wholesaler billing for advertising requires a separate reviewed workflow.
