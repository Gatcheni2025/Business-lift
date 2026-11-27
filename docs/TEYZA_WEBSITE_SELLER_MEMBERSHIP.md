# Teyza seller membership on the website (review candidate)

**Status: prepared in source, NOT deployed, NO live payments tested.** Checkout is offered from
`https://teyza.co.za/seller-subscriptions.html` only after a Teyza seller independently visits
the website and signs in with their existing approved seller identity. The public website is
not embedded as a store-app checkout, and the mobile apps must not direct South African
storefront users to pay on the website without a documented, approved policy exception.

## Business model and fees

Registration and owner verification remain free. New eligible sellers pay R49 for the first
paid month, followed by R99/month. Returning sellers are not eligible for another R49
introductory period. Seller subscription revenue belongs to Teyza; Paystack's local-card
processing rate and settlement timing still apply. As of 6 November 2026 the Paystack SA
public rate is 2.9% + R1 excluding VAT, with local settlements generally in two working
days. This is not a fee-free method. Card authentication and recurring-payment authorization
must be verified.

## How the new website checkout works

1. Seller independently visits /seller-subscriptions.html, signs in via email/password,
   Google, or Apple using the **same Firebase UID** as their registered Teyza business.
   For phone-only accounts, link a verified email or supported federated login to the
   existing seller UID through the app before using the web pilot. Do not create duplicate
   seller accounts.
2. The browser checks the server health response. Purchases are **disabled** until
   version 3.25+ reports `sellerApprovalBeforeCheckout`, the exact R49/R99 fees,
   `paystackCheckoutAvailable` and `billingMode=paystack_checkout`.
   In particular, the currently observed v3.20.0 production service does not qualify.
3. The backend returns `seller_summary` and is the authority on whether the shop
   is approved, onboarding is complete, an email has been verified, and a subscription
   or complimentary exception is already active. The app never trusts a public UI status.
4. The seller explicitly accepts recurring R99/month terms and clicks Pay.
   Backend `billing_checkout` verifies the account, plan, environment, approval, current
   provider status and intended initial amount. A checkout lock avoids duplicate
   payments. The browser receives only a Paystack-hosted HTTPS checkout URL and a
   Teyza-issued payment reference. No Paystack secret or customer card information
   passes through public website JavaScript.
5. Paystack returns a **website** checkout to
   `https://teyza.co.za/seller-subscriptions.html?payment=return`.
   The same signed-in seller can confirm the saved reference via `billing_confirm`.
   This verifies Paystack's transaction, amount, currency, environment and customer
   server-side before granting a membership. The signed Paystack webhook remains
   the source for asynchronous reconciliation; a changed browser or lost session must
   not lose paid value.
6. The app and website read the same server-managed seller membership. A settled
   payment does not override an expired ID, approval hold, deleted account or shop
   suspension. The backend assigns the paid period and sets up one subsequent R99
   monthly renewal from the end of the initial month.
7. A member may request a Paystack subscription-management link to cancel. Only
   Paystack determines cancellation and renewal status.

## Release gates — must pass before any real charges

- [ ] Review PRs #109, #110, #111 and this website checkout PR as one coordinated deployment.
- [ ] Reconcile old Firestore billing records and pending Paystack payments, run the
  Firestore rules emulator and publish the **reviewed** seller-access rules. Never
  replace unrelated production rules with an old bundled complete ruleset.
- [ ] Deploy backend, cancellation workers, approved admin overlay and website
  using scoped deployment helpers, preserving all existing Hosting files.
- [ ] Verify live Paystack secret, R99 plan, callbacks and signed webhook events with
  account owner. The same secret is also used for physical-goods payments; inspect
  outstanding transactions before switching key versions or publishing.
- [ ] Test unapproved, incomplete OTP, unverified email and suspended sellers cannot
  initiate payment. Test approved seller, duplicate clicks, wrong browser callback,
  lost session, abandoned checkout, repeat webhook, and refund-review states.
- [ ] Complete *authorised* real R49 purchase with a test seller, verify Paystack
  dashboard payment and the one scheduled R99 recurring subscription.
- [ ] Confirm Teyza's backend marks the paid membership active and products become
  available in the seller dashboard and location-matched shopper view.
- [ ] Test renewal and cancellation reconciliation. A future monthly renewal must
  be tested when it happens; do not claim it has been verified prematurely.
- [ ] Test Google/Apple/email website seller sign-ins on supported phones and
  verify Firebase Auth authorized domains for `teyza.co.za`.
- [ ] Review current Apple and Google digital purchase policies. Independent website
  sales and outside-app marketing are different from inserting checkout links,
  prompts or payment webviews into distributed mobile apps. Maintain Issue #112
  for compliant native in-app purchases until a policy-compliant alternative
  has been formally determined.

Never record live secrets, OAuth tokens, private ID/selfie evidence, card details,
Paystack customer identifiers or real seller information in the repository.
