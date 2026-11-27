# Teyza controlled production authentication and payment validation

Status: **OPERATOR SOURCE GATE APPROVED, EXTERNAL VERDICT WAIVED. PRODUCTION CHARGES DISABLED. NO REAL PAYMENT AUTHORISED BY THIS DOCUMENT.**

## Gate record
- Operator approved exact browser SHA-256: `833EF88A38B28DC958AE63CFD307D15D41F092B3370F8D8E28FC0D163FF23E21` on 10 November 2026.
- Project owner explicitly waived the requirement for an external third-party malware verdict on 10 November 2026. **Operator Source Approval: PASSED** for the exact SHA-256 above; an independent analyst verdict was not received and must not be represented as passed. The fingerprint CI audit validates the explicit operator decision in `docs/TEYZA_PAY_OPERATOR_SOURCE_APPROVAL_20261110.json`.
- PR #131 dependency-only change was merged into the PR #130 remediation branch. No user data or production payment records changed.
- Current public `/pay` page has been rolled back to the holding page. Do not expose the replacement to users until the independent verdict and review requirements are completed.

## Phase A: read-only production checks, safe now
1. `GET https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile`: require version `3.25.0`, `sellerPaystackNewCheckoutDisabled=true`, `paystackCheckoutAvailable=false`, `introductoryFirstMonthCents=1000`, `subscriptionMonthlyCents=9900`, and webhook verification capability flags.
2. Verify live Hosting GET of `https://teyza.co.za/pay` returns the disabled holding page; do not activate a payment UI.
3. Verify Cloud Function references the intended Secret Manager version and R99 live Paystack plan code using metadata only. Never print or log secret values.
4. Confirm Paystack account has 2FA, approved merchant status, and verified webhook configuration; do not create a transaction.
5. Confirm Firestore rules and Cloud Functions permit only the authenticated original seller UID to obtain billing details and paid entitlement.

## Phase B: controlled Firebase authentication (after security approval, on restricted preview)
Use two explicit consented real seller QA accounts (one approved with no paid membership, one not approved); never use production passwords in CI.
- Verify Google/Apple/Facebook/existing-email account sign-ins individually only for configured providers; ensure account UID equals mobile app UID. Do not create another identity.
- After login, `seller_billing_overview` must match the signed-in UID; attempt switching accounts during delayed reads and ensure prior seller data never appears.
- The unapproved account must be refused checkout; approved unpaid account must show correct R10 introductory terms and R99 recurring terms.
- Close the browser and reopen: no payment should occur; return marker or reference alone must never grant membership.
- Record signed-off test evidence with redacted UID; verify access to other accounts is denied.
- Do not publish preview as discoverable public endpoint. Use controlled access to staging/preview and retain `TEYZA_SELLER_PAYSTACK_ENABLED=false`.

## Phase C: test-mode transaction and renewal (separate isolated test environment)
1. Use Paystack **test** secret and test-mode plan, a separate Firebase test project and synthetic seller accounts.
2. Simulate 1,000-cent checkout and signed webhook. Confirm single idempotent `teyzaBilling/{sellerUid}` paid entitlement and app refresh; replay webhook to verify no duplicate billing entry.
3. Inspect Paystack subscription response and independently retrieve next payment date: 1st of following calendar month, Johannesburg timezone. Reject mismatches; test month-end, failed billing and cancellation.
4. Verify backend checkout denial with wrong UID, wrong amount, wrong currency, wrong merchant environment, invalid signature and expired references.
5. After all gating approval and separate explicit transaction authorisation, a controlled **live** R10 test can be scheduled; do not flip `TEYZA_SELLER_PAYSTACK_ENABLED` as part of this plan.

## Deployment hold
Operator approval replaces the external-verdict requirement **only for the exact SHA-256 above**; the fingerprint gate must still validate the approved bytes. PR #130 may merge once applicable CI/security scans pass, but merging does not deploy Hosting or enable payments. Do not deploy the replacement or enable public checkout during Stage 1 read-only checks. A controlled live R10 charge requires separate approval after the remaining payment, security and policy gates.
