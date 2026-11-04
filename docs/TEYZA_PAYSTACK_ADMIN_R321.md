# Teyza R321 Paystack admin — product approvals and payments

Status: reviewed development source, not automatically deployed to Firebase.

## What changes
- Product approvals is a new admin navigation area for submitted catalogues.
- Seller detail displays shop verification, published-product eligibility, Paystack payment references and membership expiry.
- Verify with Paystack confirms only a Teyza-issued membership reference owned by the selected seller. The backend checks the successful payment, amount, currency and customer using Paystack; an admin cannot forge a bank receipt.
- Seller identity, selfie and mobile verification remain independent requirements. Admins cannot approve their own catalogues.
- Sellers may save PRIVATE product drafts before paying; products/orders remain gated until approval and valid Paystack membership.
- Mandate, manual invoice and manual receipt forms are removed. Legacy entries are read-only, and manual activation API endpoints return HTTP 410.
- R49 introductory first month, then R99/month, optional R29 for 7 days. This does not add StoreKit or Google Play Billing.
- TEST Paystack transactions never activate public product-selling entitlement. Use approved live credentials and matching live plan before collecting real membership fees.

## Deploy from Google Cloud Shell without downloading Windows ZIPs
1. Open https://console.cloud.google.com/?project=business-lift-3c19c and activate Cloud Shell.
2. Check node --version is 22 or later.
3. In Cloud Shell, clone the exact branch:
   git clone --branch feat/teyza-free-signup-paystack-products-promotion-20261104 --single-branch https://github.com/Gatcheni2025/Business-lift.git
   If the repository is private, use gh auth login (in Cloud Shell, never in this chat), then gh repo clone Gatcheni2025/Business-lift and git switch feat/teyza-free-signup-paystack-products-promotion-20261104.
4. Run cd Business-lift and git branch --show-current. Sign into Firebase CLI with firebase login --no-localhost if needed.
   Before publishing, restore the project-local ignored Paystack plan file
   `services/teyza-mobile-v39/.env.business-lift-3c19c`. Example for the already configured **TEST** plan only:
   `printf 'TEYZA_PAYSTACK_MONTHLY_PLAN_CODE=PLN_6nbe4uqvs4cw8ld\\n' > services/teyza-mobile-v39/.env.business-lift-3c19c`
   This is a plan *identifier*, not the Paystack secret. Confirm this plan is still the correct R99 ZAR monthly plan in Paystack. Do not substitute it for a LIVE plan; do not publish live shopping from TEST payments.
   The script refuses to deploy when the plan file or any existing project Firebase Secret Manager reference is missing.
5. Run bash DEPLOY-PAYSTACK-ADMIN.sh.

The script first runs backend and admin unit tests. It deploys only functions:teyza-mobile:teyzaMobile, checks new health flags, then clones the existing live Hosting version and patches admin HTML/JS/CSS aliases only. The production site, shop records, mobile APK, and unrelated functions are untouched.

DO NOT run firebase deploy --only hosting using this partial repository output. The scoped admin helper is needed to preserve live website files and routes.

## Verify after deployment
- Open https://teyza.co.za/admin.html, sign out, sign in as the existing verified Teyza administrator.
- Product approvals: see pending catalogues, open an account, inspect products. The approval button enables only after shop approval and Paystack membership.
- Paystack billing: inspect payment history, verify an issued membership reference, then refresh account. Never type bank receipt numbers into Paystack verification.
- Paystack TEST mode is not real revenue; public products stay locked. LIVE production payments must use authorised live Paystack credentials.
- Older billing records remain available in the historical statement, with no manual activation actions.

## Rollback
Use the admin Hosting rollback only while this release is still the active live website: node tools/admin-release/run.cjs rollback
Backend rollback requires redeploying the previously reviewed backend commit separately; never roll back the whole website over newer changes.
