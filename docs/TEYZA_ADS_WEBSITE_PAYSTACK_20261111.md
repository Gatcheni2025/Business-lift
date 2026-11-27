# Teyza Ads — advertiser website Paystack (draft; NOT deployed)
Date: 2026-11-11. Branch: `feat/teyza-ads-web-paystack-20261111`.
Based on Ads moderation PR #145; independent of draft Store Billing PR #148.

## Scope
- Advertiser portal: `https://teyza.co.za/ads/` (available only **after hosting deployment**). Firebase web sign-in using the *same* original UID, no account duplication. Existing email login and Google, Apple, Facebook popup auth supported subject to configured provider origins.
- Eligible, approved spaza/retail sellers submit ads from the Teyza seller workspace. Another admin reviews creative first. Approved-unpaid campaigns appear on the standalone advertiser website for selection.
- **Only** the advertiser website calls `ads_checkout` with `checkoutChannel: 'website'` and exact authenticated `confirmedSellerUid`. Server recalculates fixed radius pricing from stored ad and sends directly to hosted Paystack (R29 up to 10 km; R2/km for 11–50 km). No ad auto-renewal. `/pay` and R99 memberships, including historical R10 entitlements, are untouched.
- The return URL is `/ads/?payment=return`, which is *not* confirmation. Signed webhook and/or authenticated `ads_confirm` independently verify Paystack ref, exact ZAR amount, UID, creative ID, transaction environment and email before starting seven days. Pending ambiguous transactions require reconciliation; do not start a duplicate charge.
- Store app builds have **no ad payment button or website checkout link**. Ads management/status and Sponsored feed remain visible as applicable. Direct Android native ad checkout removed from this branch.
- Backend enable switch: `TEYZA_ADS_WEB_PAYSTACK_ENABLED=true`. **Default OFF**. Kept independent from the `TEYZA_SELLER_PAYSTACK_ENABLED` membership pilot flag.

## Store-policy blocker / product choice
Apple Guideline 3.1.3(g) says buying ads shown within the same app must use IAP. A seller-facing standalone website is *not* the sole-purpose advertising-management app exemption for the main Teyza mobile app. Apple restricts in-app links or calls to action to outside digital purchase methods outside eligible storefronts/entitlements. Google Play Payments policy similarly restricts steering, but explicitly allows consumption-only apps and independent web purchases in some conditions. **Do not insert a redirect/button, WebView, or checkout advertisement into Play/App Store mobile builds.** Independently obtain storefront-specific policy clearance before enabling all-store web-funded same-app advertising. A direct-distributed Android build is not a Google Play build.

This branch permits developing a standalone web portal but **does not certify Apple/Google approval** or approve the public advertising payment rollout. Keep the existing StoreKit/Play Billing draft PR #148 unmerged or close only after a deliberate channel decision.

## Pre-production checklist
1. Reconcile all prior seller R10 transactions and outstanding ad payment attempts, if any. No existing subscription migration.
2. Run `node --test services/teyza-mobile-v39/shopper-ads.test.js` and `node --test tools/app-first-release/ads-web-billing.test.cjs`; run all existing regression, payment security, and Flutter tests.
3. Re-review the exact JS/HTML source hash and website release allowlist. Do not reuse historical membership `/pay` fingerprint approval for `/ads`.
4. Review Firebase Auth authorised domains, sign-in providers and return handling from physical browsers.
5. Deploy backend *with flag OFF* to a non-production Firebase project using test Paystack keys. Validate exact UID, reviewed/unpaid eligibility, payment mode, webhook, failure/retry, refund and receipt handling. Only then consider a scoped live pilot and set the new flag independently.
6. Confirm the real Paystack webhook path, privacy/consent, support escalation, and the 80-row geo-query cap before nationwide release.
7. Keep the mobile store ad checkout hidden. Any iOS/Google Play release needs separate policy review and independent sign/release QA; successful unsigned preview CI is not signed delivery.

## Status
Source changes only, on a draft feature branch. No live Paystack calls, Firebase deployments, hosting publishing, store releases or payments have been performed.
