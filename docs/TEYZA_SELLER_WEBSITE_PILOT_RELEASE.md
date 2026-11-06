# Teyza seller website Paystack pilot — controlled release

**Release candidate only. No production deployment or payment has been performed by this kit.**

Target: `business-lift-3c19c` and `https://teyza.co.za/seller-subscriptions.html`.
Scope: approval-only seller billing; R49 first eligible month, R99 recurring monthly;
product creation/publication only after verification and a legitimate paid entitlement
or separately audited temporary complimentary grant.

## Release blockers to sign off, in this order

- [ ] **Source review:** PRs #109 → #110 → #111 → #113 are stacked and still draft.
      Check their base ancestry (PR #109 is NOT based directly on `main`);
      review the complete changeset and ensure no unrelated changes are carried into
      the release. Do not automatically merge all branches into `main`.
- [ ] **Payments sandbox:** Execute the Paystack TEST-mode harness or an isolated
      Firebase test environment with a consenting tester. No production sandbox
      billing records or test-key customer payments. Check R49 initial charge,
      Paystack's R99 subscription creation, callback/webhook payloads, cancellation,
      duplicate events, failed and abandoned payment. The in-memory harness
      does NOT prove real Firebase authorization and publication.
- [ ] **Merchant + existing orders:** Verify Paystack business activation and
      settlement beneficiary. Reconcile pending physical-goods orders, outstanding
      Paystack seller subscriptions and existing `teyzaBilling` records. The
      Firebase Secret Manager key is **shared** with shopper orders. A staged
      secret version may change the environment on redeployment. Obtain explicit
      operational confirmation before changing which secret version the service uses.
- [ ] **Seller verification:** Use a separate consenting test seller account;
      verify linked SMS OTP, current ID/passport, selfie, approved account and
      onboarding. Confirm it is NOT also the administrator. Verify the account
      email and existing Firebase UID, not a duplicate website account.
- [ ] **Rules:** Back up current Firestore rules, ensure they match the reviewed
      known baseline, review the generated candidate and run the seller-rules
      Firestore emulator tests. Pending, rejected, approved-unpaid and cross-owner
      product writes MUST fail; legitimate paid/complimentary edits must pass.
      Check there are NO overlapping permissive recursive allow rules.
- [ ] **Secrets and plan:** Restore the existing private
      `services/teyza-mobile-v39/.env.business-lift-3c19c` file; do not copy
      secret keys into Git, chat, .env or this ZIP. Verify live plan is
      ZAR 99, interval monthly, unlimited invoice count, same approved Paystack
      merchant as physical-goods settlements. Check the existing key version
      before redeploying any function.
- [ ] **Webhook:** Confirm production Paystack webhook points to
      `https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile/paystack-webhook`.
      Validate signed `charge.success`, `invoice.update`,
      `invoice.payment_failed`, `subscription.not_renew` and
      `subscription.disable`. Confirm no duplicates grant two periods.
- [ ] **Release coordination:** Arrange a brief maintenance window and keep
      access to the current rules snapshot and both Hosting rollback records.
      A Hosting rollback does **not** revert Firebase Functions, Firestore
      rules, Paystack transactions or subscriptions.

## Safe starting commands (Windows PowerShell)

Download the **TEYZA-SELLER-WEBSITE-PILOT** artifact from the GitHub Actions
run on PR #113. Extract it to a fresh folder under Downloads, open PowerShell
there and run:

```powershell
.\CHECK-PILOT.ps1
npm ci --omit=dev --ignore-scripts --no-audit --no-fund --prefix .\tools\admin-release
.\tools\seller-access\PREPARE-CURRENT-RULES.ps1
```

These commands **do not** deploy, take payment or change the live Firebase rules.
The last command refuses to replace an unknown/changed published ruleset.
If it reports the current rules have changed, stop for a new review.

Review the generated files and diff:

```powershell
$dir = Join-Path $PWD 'tools\seller-access'
git diff --no-index -- (Join-Path $dir 'current-firestore.rules') (Join-Path $dir 'firestore.seller-approval.candidate.rules')
```

Git diff exit code 1 means differences exist (expected). Do not blindly copy
rules or press the Publish switch yet.

The emulator and all other regression tests must pass against the **exact
candidate**. After the above sign-offs and written release authorization,
deploy in the reviewed order:

1. Publish the **fresh, approved** Firestore seller-access candidate while
   preserving all unrelated rules (see `tools/seller-access/README-START-HERE.md`).
   Verify it is active; if the live rules differ from your backup, STOP.
2. Deploy mobile API, seller product-sync triggers and both Paystack
   cancellation workers using `DEPLOY-OPERATIONS.ps1` with the verified
   existing private plan configuration. This script also publishes a scoped
   admin Hosting overlay **only if** the backend health gate passes. It is a
   production-changing command; do not run until the explicit sign-offs.
3. Use `CHECK-PILOT.ps1 -RequireUpdatedBackend`: require live
   `teyzaMobile` version **3.25.0** and approval/payment capabilities.
   Confirm that shopper physical-goods Paystack still works on the intended
   environment (in a controlled/non-charging manner where possible).
4. Publish only the scoped website marketing overlay with
   `DEPLOY-WEBSITE.ps1` after checking the extraction contains the reviewed
   `public/seller-subscriptions.html` and
   `public/js/seller-web-billing.mjs`. Hosting clone preserves unrelated
   files and records exact rollback version locally. Do not use
   `firebase deploy --only hosting` on this partial package.
5. Verify live website sign-in with the same seller Firebase UID, UI refusal
   for unapproved/unverified sellers, fixed callback URL, and no store-app
   redirect to an external website checkout. Review current Apple/Google
   platform-payment policies before any store-app promotion.

## Authorized R49 live transaction — separate human confirmation required

**Do not enter a real card or start checkout automatically.**

After the provider, rules, backend and website are verified:

1. With an explicit consenting test seller, open the website independently,
   sign in with the account that holds the approved Teyza shop, and confirm
   the email, OTP, selfie and ID reviews are current.
2. Check Teyza shows an eligible **R49 introductory payment** and the
   **R99/month** renewal disclosure. The seller chooses to proceed, accepts
   the terms and completes the provider-hosted card payment personally.
   Do not post the card number, OTP, checkout link, customer identifiers or
   payment receipt in a public issue/chat.
3. Independently check the Paystack dashboard and the server's
   `teyzaPaystackPayments` entry: exact ZAR 49.00 first charge,
   matching owner/reference/email, `domain=live`, `status=success`;
   verify `teyzaBilling` has `paymentProvider=paystack`,
   `paymentEnvironment=live`, a future `paidUntil` and appropriate
   `renewalSetup`.
4. Check the R99 monthly plan/subscription is scheduled from the end of the
   paid month; no duplicate subscription was created. A later real renewal
   can only be verified when it is actually due.
5. Check the same seller can add a small, harmless test product, edit price
   and stock, and view the correct shop-only product on a separate shopper
   account; unrelated sellers and unapproved shops still cannot add products.
6. Exercise the consented subscription-cancellation workflow and verify
   provider confirmation and continued access only through the paid-through
   period. If a refund is required, verify its processed status using the
   documented full-refund review process rather than marking a refund paid.
7. Check Teyza's separate shopper physical-goods payment flow, admin
   documents, mobile sign-in and approved shop discovery are unaffected.

If any payment, renewal, webhook, refund, backend or rule state is uncertain,
**stop onboarding paying sellers**, preserve provider receipts privately,
and reconcile rather than retrying or forcing a paid flag.

## The critical distinction

Passing GitHub Actions and website browser previews certifies code checks,
**not** live Paystack settlement or payment delivery. Production digital
subscriptions remain unavailable in Apple/Google store apps until a policy
compliant purchase model is approved; Issue #112 tracks native purchase work.

This ZIP deliberately excludes Firebase credentials, customer/identity data,
private Paystack secrets and the current private .env plan file. Do not
generate replacement encryption or merchant secrets during the rollout.
