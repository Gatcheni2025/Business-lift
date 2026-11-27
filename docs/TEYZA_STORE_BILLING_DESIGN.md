# Teyza seller subscriptions: Paystack and stores

This draft follows the owner's decision: retain Paystack for the independent
website, and offer Apple/Google billing inside the respective store apps when
required. Registration is free; sellers must be approved and ready before paying
to access product-selling tools. The intended offer is an eligible first month at
R49 followed by R99 monthly. Nothing in this draft enables or initiates a charge.

An SMS requested inside the app that leads to a website payment may still be an
in-app flow directing users outside the store's billing system. Do not implement
that as a workaround. Independent communications outside the app must still meet
the applicable store, consent and messaging rules.

## Provisioning to complete in the store consoles

Proposed product identifier: `teyza_seller_monthly`. Verify it is unused and
compatible before creating it; the stores do not necessarily allow IDs to be
renamed. Do not mark a product available for sale until server verification and
review are ready.

1. In App Store Connect, under the Teyza app (`za.co.teyza.shopper`), create an
   auto-renewable monthly subscription and subscription group. Configure South
   African pricing nearest to R99 and, if supported, an eligible first paid month
   nearest to R49. Check the actual store price points and offer eligibility.
2. In Google Play Console, under `com.asiyedriver.asiye`, create a subscription
   with a monthly base plan and a first-month offer. Check that South African
   prices and eligibility are available before activation.
3. Configure test accounts and server access for the Play Developer API and the
   App Store Server API; register the authenticated notification endpoints only
   when implemented. Never paste keys, purchase tokens or personal details in
   GitHub issues or chat.

The app must fetch and display the store's actual localized product and offer
prices and renewal terms. The store, rather than a hard-coded app price, decides
whether a customer qualifies for its introductory offer.
The provider's introductory eligibility and Teyza's existing Paystack
`introUsed` history are not automatically shared. Work out a supported offer
selection for returning sellers before enabling payment; never promise an offer
that the store does not actually present or conceal the final store price.

## Server implementation still required

- Authenticate the seller using the existing Firebase identity. Verify current
  seller approval, onboarding and moderation before preparing a purchase.
- Create a server-owned, opaque per-account binding and a transactional
  purchase intent. Check both Paystack and store subscriptions and pending
  attempts; reconcile uncertainty before permitting another purchase. Prevent a
  Paystack checkout and a store checkout from racing into two subscriptions.
- Google: verify subscription state with `purchases.subscriptionsv2.get`, check
  the app package, product, seller binding, environment and expiry, and process
  RTDN by re-querying the Play API. Acknowledge eligible purchases as required.
- Apple: use Apple's official server library and pinned Apple root certificates to
  verify signed transactions and notifications. Check bundle, product,
  App Store environment and `appAccountToken`; reconcile subscription status
  using the App Store Server API and authenticated notifications.
- Atomically bind each store subscription or purchase token to one seller;
  prevent replay, account switching and duplicate provider subscriptions. Never
  treat a client success screen, redirect, SMS, or unsigned webhook as proof.
  Preflight must run before launching the store purchase sheet; failed or
  interrupted verification needs a restore/reconciliation path so a customer
  who was charged is not stranded without their paid access.
- Integrate verified live entitlements into both server publication checks and
  Firestore rules without overwriting existing Paystack billing records. Test
  renewal, grace, cancellation through paid-through date, refunds, revocation,
  restoration and account deletion. Prevent sandbox transactions from activating
  live seller accounts.
- Support the existing Paystack website on the same seller account. Explain
  where a subscription is managed and prevent unintended double billing.

Three isolated, **unwired** server-side building blocks have been prepared:

- `store-billing-policy.js` evaluates already-authenticated normalized claims
  and a server-assembled cross-provider snapshot. It does not verify receipts.
- `store-google-verification.js` is a candidate adapter for querying Google's
  subscription API. It needs trusted server credentials and integration.
- `store-apple-verification.js` is a candidate adapter for Apple's server API
  and signature-verifier interfaces. The official library, pinned roots and
  authenticated API client must be configured by trusted server code first.

The tests use fake data and mocked provider interfaces; they do not establish
that Apple signatures, real purchases, notifications or production credentials
work. The adapters return assessment results only: they do not write Firestore,
grant selling access, prevent actual concurrent checkouts, change the app, or
authorize a release. In particular, the cross-provider check needs an atomic
server transaction before it can prevent a race between payment methods.

## Required validation before enabling purchases

The Microsoft security hold and existing release gates remain in effect. After
the missing integrations and console setup are complete, test approved and
unapproved sellers, actual store sandbox purchases, repeat purchases, Paystack
coexistence, lifecycle notifications, restoration and the exact R49/R99 offer
on physical devices. Only then review production deployment and signed releases.
