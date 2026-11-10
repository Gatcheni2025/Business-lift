# Teyza Business Account — unified registration, verification and membership

## One account, five distinct states (NOT five admin approvals)
1. **Registered** — seller chooses Spaza/Tuck shop, Business Owner or Wholesaler; account is free.
2. **Verification in progress** — the app checks Firebase email verification, phone OTP and upload completeness for ID/passport, selfie, shop-front photo and shop location. Missing items are shown in **one checklist**.
3. **Business approved, free listing live** — a genuine identity/business verification decision is recorded once in the authoritative seller account, and the validated shop is published to community discovery automatically. No subscription or bank mandate is needed to display an approved shop.
4. **Free account, selling locked** — the shop remains visible but products cannot be purchased until verified selling entitlement is active. The app shows membership benefits and Teyza Support. Avoid in-app external-payment steering.
5. **Premium account** — Teyza's server independently verifies the original Firebase UID's live Paystack membership; the app recognises that entitlement and product publishing occurs automatically without another admin product approval. Wholesalers use Premium advertising and spaza connections, not public retailer-product listings.

## What is actually automatic now
- Firebase email and phone statuses are read automatically from Auth.
- Onboarding evidence completeness and current shop pin are calculated server-side.
- Business profile status and missing requirements are shown in one admin account view.
- Once the authoritative business decision is approved, public directory and verified Paystack selling entitlement are projected automatically by existing publication logic; no admin product approval is required.

## What still needs genuine identity verification
**An ID scan and selfie upload do not prove document authenticity, identity ownership or a face match.** This project does not yet have a connected, verified eKYC/document-face-check provider. Therefore the code **does not automatically approve the identity or business merely because files were submitted**. The current final business review remains one administrator decision and can be replaced with provider-attested verification after an independently validated provider is integrated, with fraud/duplicate/business-claim safeguards and an auditable backend-only callback.

## Simplified admin
- Sidebar: **Business accounts**, **Finance & payments**, **Support**, and operational workspaces. The original verification queue remains accessible **inside Business accounts** and via the Overview when the seller directory is unavailable.
- Open a business → **Overview / Verification / Shop & selling / Finance / Support**.
- Verification shows one checklist and one authoritative business status. “Pending” means the business itself is not yet approved, **not** that someone needs to approve products or process an archived mandate.
- Finance shows the verified Paystack subscription, payouts, refunds, statements, and historical Netcash mandates **collapsed by default**.
- Support conversations are tied to the original seller UID and cannot alter payment entitlements.
- A historical manual `status:paid` string never produces a Premium badge without live Paystack verification.

## Safety and deployment
- No changes to checkout enablement, owner UIDs or live billing records.
- No automatic approval of previously rejected/suspended businesses.
- Do not treat a completed registration as official identity verification.
- Draft PR #134 targets the current support-chat feature branch and must pass backend/admin browser tests prior to deploying the backend first and scoped admin Hosting second.
