# Teyza secure web-only membership portal — /pay

Status: **Website payment implementation in review; not deployed.** The Firebase backend was deployed to production on 9 November 2026 with R10 introductory pricing, R99 monthly plan, Paystack webhook verification and `TEYZA_SELLER_PAYSTACK_ENABLED=false`. The live `/pay` page remains the existing static no-payment holding page until the browser security review and scoped Hosting deployment pass.

## Intended URLs
- Main: `https://teyza.co.za/pay` (Firebase Hosting scoped rewrite to `/pay.html`).
- Fallback if Hosting clean URLs are unavailable: `https://teyza.co.za/pay.html` or `/pay/`.
- Paystack callback: `https://teyza.co.za/pay?payment=return`, server-defined only. No owner UID, email, seller address or payment secret is ever placed into the callback URL.
- Seller plans: `/seller-subscriptions.html` links **from the website** to `/pay`, not from the mobile app.

## Ownership and payment verification
1. Seller opens the Teyza website independently and signs in through the Firebase Auth web SDK with the **original** Google, Apple, Facebook (when configured in Firebase) or existing email/password sign-in for the registered shop. No alternative email alone can give access to another account.
2. Website uses Firebase ID token to read `seller_summary` and `seller_billing_overview`; the latter returns only the authenticated UID. The browser checks its current Firebase UID exactly equals the returned seller UID, then visibly displays the shop name, business type, account email and UID. A shopper identity without a registered business cannot start checkout.
3. Seller confirms the displayed shop is **their own** and separately agrees to the current card amount and recurring R99 monthly terms.
4. Checkout requires `checkoutChannel:'web'`, `confirmedSellerUid` equal to the *server-authenticated Firebase UID*, and a recent `auth_time` within 15 minutes. A stale session must sign out/sign in again. The backend checks account approval, current selfie, required-version-2 phone/onboarding, deletion state, subscription status and billing plan. Do not grant Paystack access solely on a shared email.
5. Server creates a Teyza payment reference linked to that UID, records explicit recurring consent and initializes Paystack *server-side* using a validated HTTPS checkout host. No bank or card details are collected in Teyza HTML.
6. The browser stores the per-UID reference in sessionStorage, redirects to Paystack's hosted checkout, and on return calls `billing_confirm` with the current Firebase token if a browser receipt is available. The server **independently** verifies the reference, amount (R10 first-time, R99 thereafter), live/test mode, customer and original UID. URL parameters do not activate access. If a signed webhook completed before the browser returned **or sessionStorage was lost**, the browser recognises an active membership only when BOTH authenticated `seller_summary.listingPaid` and `seller_billing_overview.paymentVerified` corroborate the exact UID; do not present a Paystack redirect as payment proof.
7. Subscription renewals require verified and idempotently processed Paystack webhooks. Historical Netcash mandates, test transactions and admin complimentary access cannot be treated as Paystack payment.
8. Refund and cancellation procedures must be tested, and account statement data must remain on the **website**.

## Mobile app
No external Teyza /pay purchase links, Paystack subscription buttons, due amount labels or subscription billing statements in iOS/Google Play app. The app only shows current business **eligibility**, verified account status and permitted stock/advertising operations based on backend access. `SellerWorkspacePage` refreshes `seller_summary` on return to the foreground and every 25 seconds while live, and gives a one-time in-session confirmation when a previously unpaid shop becomes paid. The server's `teyzaBilling/{uid}` entitlement—not a deep-link, browser receipt, client-side flag, or typed UID—unlocks Start selling. Product drafts require the owner to explicitly request publication; never auto-publish unselected stock. Physical-goods order payments are separate.

## Deployment
1. Approve/merge the appropriate parent Paystack and billing PRs first; run full backend tests, shop-matching tests, browser/mobile tests and external source-file security review. Do **not** bless an altered file by changing a stored security hash without a fresh review.
2. Run `node --test tools/app-first-release/pay-site-patch.test.cjs tools/app-first-release/seller-web-billing.test.cjs` and `node --test services/teyza-mobile-v39/billing-paystack.test.js services/teyza-mobile-v39/operations.test.js`.
3. Configure official Google, Apple and email Firebase sign-in for `teyza.co.za`, ensure Firebase authorised domains include the website, and confirm the assigned identity matches the app UID (not merely the email).
4. Check that live merchant settings and Paystack verified monthly plan of ZAR R99, delayed renewal schedule on first day, webhook HMAC, checkout return URL and billing access rules are correct. Enable `TEYZA_SELLER_PAYSTACK_ENABLED=true` **only after** production authorisation, signed release gates and provider/store-policy clearance.
5. Deploy the reviewed Firebase backend first, then the scoped website, never with a plain partial `firebase deploy --only hosting`:
   `node tools/app-first-release/pay-site-patch.cjs deploy`.
   This requires a locally authenticated Firebase CLI, `firebase-tools` package in `tools/app-first-release` and Hosting rights to `business-lift-3c19c`. It clones current live Hosting and updates only four web files plus exact `/pay` rewrites/security headers while preserving other route behavior and admin assets.
6. Confirm `https://teyza.co.za/pay` resolves without login loops, displays no personal details when signed out, and honours both `/pay?payment=return` and sign-in/switch-account. Confirm Google, Apple, Facebook (where configured), and email sign-in return the **same Firebase UID** as the already registered seller, not just a matching email. On webhook-first confirmation or lost browser sessionStorage, the site must report active membership using verified server state without initiating a second payment.
7. Test first-time R10, returning R99, a fully approved spaza, approved wholesaler, unapproved account, shared-contact-email but different UID, selfie mismatches, missing OTP, expired sign-in, payment cancellation and repeated webhooks.
8. Rollback only if your deployment is still the currently live Hosting release:
   `node tools/app-first-release/pay-site-patch.cjs rollback`. Keep `teyza-pay-website-backup.json` secure.

## Limits
The store rules depend on what the subscription unlocks, where it is consumed and the applicable storefront. Website-only checkout and removal of app links reduce steering issues but do **not** automatically establish Apple/Google compliance. Confirm a legitimate exception or approved payment mechanism before enabling a live digital-function subscription.

User-visible activation is **not** evidence of a successful charge until server reconciliation confirms Paystack live payment. Never change seller approval fields manually as a checkout shortcut.
