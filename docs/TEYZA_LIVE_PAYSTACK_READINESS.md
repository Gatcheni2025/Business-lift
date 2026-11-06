# Paystack live-readiness for Teyza seller subscriptions

Status: **review candidate, not deployed, not verified with a live payment**.
Seller registration is free. An approved seller may choose product access:
R49 for the first eligible month, then R99 per month. A returning seller who
already used the introductory offer pays R99. No agent commission is added.

The business owner supplied live plan code `PLN_ud5m0sza4kmr31f`. It has not
yet been independently verified. From the release kit, run
`./tools/paystack/CHECK-LIVE-PLAN.ps1` to check the plan using a hidden live
key prompt. The check performs a read-only Paystack API request; it does not
write to Firebase, create a subscription or collect money. Only the result,
never the key, should be shared with support.

## Distribution and current payment availability

The Android and iPhone store builds still set `TEYZA_PAYMENT_CHANNEL=store`.
They do not contain a completed Play Billing or StoreKit subscription flow.
Do not change these store builds to `direct`, add a Paystack redirect to
their subscription screens, or represent in-app subscription checkout as
available. Apple and Google rules for digital features apply; obtain store
review of the final business model. The Paystack seller checkout currently
exists only for independently distributed Android builds configured for
direct payments. The shopper checkout for physical goods is separate and has
its own seller-subaccount and settlement prerequisites.

## What this candidate changes

- An approved seller has at most one pending checkout per purchase type. A
  retry returns the same Paystack checkout. An ambiguous initialization is
  held for support instead of creating another payable reference.
- The R49 or R99 first charge is a separate card transaction. After Paystack
  confirms its amount, customer, reference, currency and environment, the
  backend schedules the R99 monthly plan from the end of the paid period.
  Missing reusable authorisation or uncertain subscription creation is marked
  `action_required`; it is not silently retried. A late-confirmed payment
  never schedules a renewal in the past.
- Before a direct-distribution seller checkout, the app discloses the first
  payment, R99 renewal and cancellation. The server requires affirmative
  consent to the current terms and records the version with the transaction.
- A signed `invoice.update` plus an independently verified Paystack
  transaction and matching subscription credit a recurring payment once.
  Cancelling or a failed payment does not erase an already paid period.
- Account deletion remains available. It queues Paystack cancellation and
  waits for provider confirmation; uncertain cases require operations review.
  An open checkout remains in billing review, and a payment received after
  closure is flagged for refund review. Admin can verify a **full processed**
  Paystack refund by entering its numeric refund ID in Subscriptions.
- A restart is blocked while an existing subscription might still renew.
  Do not manually start a second plan to work around this; inspect Paystack.

## Before using real money

1. Verify the Paystack business is live-approved and the settlement bank
   account belongs to Teyza. Complete the provider's business verification.
2. In an **isolated Firebase project**, configure a Paystack **test** key and a
   test ZAR 99.00 monthly plan with no fixed invoice limit. Set up its own
   Paystack webhook and run actual sandbox transactions. The production
   project refuses test membership checkout. Sandbox payments also do **not**
   activate product entitlement in this code, even in the isolated project:
   validate the billing record and renewal separately; a complimentary grant
   can exercise product screens but does not prove payment works end-to-end.
3. Test the introductory card charge and scheduled renewal, callback,
   duplicate webhooks, abandoned/failed checkout, cancellation, account
   deletion, a payment arriving after deletion, refunds, and provider outages.
   Check provider dashboard amounts, invoice events, settlement, cancellation
   status and Teyza records. Automatic subscription creation or cancellation
   with `needs_attention` must be reconciled by support; never retry blindly.
4. Review the **current production** Firestore rules with an emulator. No
   customer may write seller approval, billing, payments, renewal leases,
   checkout locks, cancellation requests, account-deletion requests or audit
   records; private checkout URLs must not be publicly readable. Check
   overlapping wildcard rules. Do not publish the bundled old full ruleset.
5. Review all existing pending test/live checkouts and subscriptions before
   switching keys. This integration uses the **same** Firebase Paystack secret
   for seller subscriptions and physical-goods orders. Changing it changes
   the environment for both, and outstanding test events cannot be verified
   with the live secret. Do not mix test and live plans or subaccounts.
6. Only after those checks, create/verify a **live** monthly plan in Paystack:
   amount 9900 cents, ZAR, interval monthly, no fixed invoice limit. Record
   its `PLN_...` code. Preserve the other values in the existing private
   `services/teyza-mobile-v39/.env.business-lift-3c19c` file and set
   `TEYZA_PAYSTACK_MONTHLY_PLAN_CODE` to that live plan. The deployment
   helper verifies the plan's live domain, amount, currency and interval.
7. Set the **live** secret with the protected Firebase CLI prompt:

   ```powershell
   firebase functions:secrets:set TEYZA_PAYSTACK_SECRET_KEY --project business-lift-3c19c
   ```

   Enter the key at the prompt. Do not put it in chat, Git, the public website,
   a command argument or a screenshot. Rotate and redeploy any affected
   Firebase Functions according to Firebase's secret management procedure.
8. Configure the live Paystack webhook at:
   `https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile/paystack-webhook`
   and enable `charge.success`, `invoice.update`, `invoice.payment_failed`,
   `subscription.not_renew` and `subscription.disable`. Verify the provider
   signatures and delivery in the dashboard.
9. Deploy the reviewed backend, admin overlay and Firestore changes together.
   The scoped operations helper in this candidate includes
   `teyzaPaystackCancellationCreated` and `teyzaPaystackCancellationRetry`.
   Confirm both workers were deployed. Configure the previously requested
   WhatsApp workers separately. Do not deploy a partial public Hosting folder.
10. Before inviting paying sellers, perform a controlled, authorised live
    transaction and a cancellation with a consenting tester; verify the
    actual amounts, settlement, renewal date, Paystack receipts and Teyza
    access. Handle refunds and disputes promptly. The current implementation
    requires human review for uncertain provider calls and does not claim
    automatic dispute or general-refund reconciliation.

## Operator notes

The admin Subscriptions workspace shows account closures needing payment
review. `pending` means cancellation is being checked; `needs_attention`
requires an operator to inspect Paystack and the private cancellation record.
`completed` means the provider was checked and the subscription is no longer
renewing, or no subscription was created. Do not tell a customer that
cancellation succeeded while the result is pending or uncertain.

For a `refund_review` payment, initiate a full refund in the Paystack
dashboard and wait until it is **processed**. Then open the seller in admin,
choose **Verify processed refund**, and supply the numeric Paystack refund ID.
The server checks the provider, original transaction, full amount, currency,
environment and processed status. A partial refund cannot clear this review.
Account deletion cannot be marked complete while a checkout/refund review or
cancellation remains unresolved.

Changing the production secret, plan, webhook, or application deployment can
affect real customers. Nothing in this document has changed those settings.
