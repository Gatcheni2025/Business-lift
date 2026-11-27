# Teyza — R99-only membership cutover (11 November 2026)

## Commercial policy

- Free seller registration and approved local discovery remain free.
- New verified Premium membership checkouts cost **R99 immediately**, then **R99 on the first day of each following calendar month** until cancelled.
- The initial R99 grants access through the end of the current calendar month; it is not prorated. Checkout is paused during the last 24 hours of the month to avoid consecutive near-term charges.
- No automatic introductory discount, trial price, client-provided amount, or user-selected campaign code.
- The website and backend use **seller-r99-monthly-2026-11** recurring terms. Paystack's independently verified ZAR monthly plan must remain R99.

## Promotions remain under Teyza admin control

The existing `ops_complimentary_access` / `ops_complimentary_revoke` operations permit a separately authorised, audited 7-, 14-, or 30-day access grant to an approved and verified shop. Grants require an explicit reason, cannot be self-granted, expire automatically, and are not Paystack revenue. Admins can use these for occasional controlled promotions. A general discounted subscription campaign is **not enabled** by this change; it would require separate approval, price/validity rules, customer consent, provider verification and tests. The disabled self-service R29 advertising checkout is unchanged.

## Historical payment safety

- Existing verified introductory/legacy transactions and current memberships retain their paid-through periods and accurate payment statements.
- A pending legacy introductory Paystack checkout must be reconciled by support before the customer can start a new R99 checkout; it is never silently replayed as a new price offer.
- Do not change old payment transaction amounts, charge cards again, shorten subscriptions, cancel live renewals, or auto-create refunds during rollout.
- Do not modify Paystack's actual monthly plan code, Firebase Auth UID mapping, production secrets or publisher entitlements.

## Release sequencing (not deployed by this PR)

1. Review and merge only after backend/website security and Flutter tests pass.
2. Stage and publish the updated static website first. Its health gate intentionally disables new checkout against a backend that still advertises the old introductory price.
3. Deploy the reviewed Cloud Function with `membershipInitialChargeCents: 9900`, `subscriptionMonthlyCents: 9900`, and matching `subscriptionTermsVersion` in its public health response. Keep checkout disabled until the live Paystack plan and terms have been verified.
4. Verify that a new eligible account's quoted initial charge and the independent renewal plan are both **9900 ZAR cents** in the same Paystack environment, and that no lower initial checkout can be produced by user-supplied amounts. Verify callback host, consent, signed webhook, next billing date, and UID continuity.
5. Test existing members, historical payment history, legacy pending-checkout reconciliation, admin promotional grants, and seller entitlement refresh on Android/iOS.
6. Enable the gated checkout only after signed release/QA approvals; verify no duplicated charges or expired grants. The previous standalone Shopper APK test-signing certificate issue is separate and must not be bypassed.

No real payments, subscriptions, promotions, production configuration changes or customer notifications were made while preparing this code.
