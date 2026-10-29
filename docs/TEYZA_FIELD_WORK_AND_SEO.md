# Teyza Work and search readiness — 29 October 2026

This update extends the existing Business-lift Firebase project and current mobile service. It does not change app version 1.0.22 (32), seller approval requirements or the expanded 378-choice catalogue.

## Activate

Download `teyza-field-work-and-seo-kit` from the newest passing run on `feature/teyza-field-work-and-search`. Extract once into a fresh folder. Install Node 22 and use the authorised Firebase CLI account for `business-lift-3c19c`. In PowerShell in that folder:

```powershell
Unblock-File -LiteralPath '.\DEPLOY-FIELD-WORK.ps1'
Unblock-File -LiteralPath '.\DEPLOY-MOBILE.ps1'
Unblock-File -LiteralPath '.\DEPLOY-WEBSITE.ps1'
.\DEPLOY-FIELD-WORK.ps1
```

The combined script deploys only the existing mobile Functions codebase first, checks `fieldAgentWorkspace`, then clones and overlays the existing Hosting release. It verifies unrelated files are preserved and refuses to publish over a concurrent release. It does not replace Firestore/Storage rules, grant admin roles or change DNS. Existing Google Places and verification encryption secrets are reused. Do not deploy the partial public folder with plain `firebase deploy`. Keep the Hosting backup files; the supplied rollback script restores the previous website only while this update is still live.

After activation:

- `/agents.html`: public programme explanation and application entry.
- `/work.html`: agent application, sign-in, guided visits and administrator work review.
- `/owner-confirm.html#<one-time-link-token>`: the owner's private confirmation and mandate journey. Tokens expire after seven days; generating a new link replaces the old link.
- `/how-it-works.html` and `/for-shop-owners.html`: clear public shopper/seller guides.
- `/work-privacy.html`: evidence use, access, consent and retention notice.

Use your existing authorised Teyza administrator account on `/work.html`, select **Review team**, review agent applications and approve them before assigning visits. Seller verification remains in `/admin`. Agent and owner sign-in supports email/password, Google, Apple and South African phone/SMS (subject to the existing Firebase provider/domain configuration). Each new agent uses their own account, verifies email or phone, supplies their working area and consents to evidence handling. Employment/contractor status, applicable wage protection and expense terms must be agreed separately before work starts; agent approval is not an employment contract.

## Guided visit

The agent creates a shop visit with the owner's permission, records a fresh device location (accuracy at most 100 m), takes a shop-front photo and an in-shop selfie through the live camera, and shares the owner confirmation link. A fresh capture session expires after three minutes. Coordinates must be fresh within 60 seconds when submitted. A new location resets photo completion so old photos cannot silently represent a later visit.

The owner signs in using the same account used to register their shop in the app. Confirmation is bound to that account and to one agent visit, with self-referral and duplicate attribution blocked. Owners complete their own verification and R99 mandate. Existing current ID evidence is reused only with owner consent. Agents never see the owner's bank-account or identity details. An owner without a current verified ID is directed to complete it in the app before signing.

The agent submits after the two current photos, location, owner confirmation and mandate consent are recorded. Work remains pending. A separate recent administrator must open both current photos, inspect the location and owner evidence and confirm review before approving. Work approval does not approve the seller, publish a shop or collect a payment.

Camera images, timestamps and device GPS can be spoofed; the portal does not claim facial recognition, automatic liveness, geofenced attendance proof or guaranteed physical presence. Capture sessions, duplicate-image detection, owner confirmation and manual review provide layered checks. Review the reported position against the owner's saved shop pin and request changes when evidence is inconsistent.

## Privacy and records

Evidence is encrypted with the existing server verification key before private storage; no public photo URL or download token is returned. Work images are registered for retention before upload and removed after 90 days by an hourly agent-evidence cleanup function. A failed submission may retain an unlinked encrypted image until cleanup. Expired camera sessions and owner-link tokens are also removed in bounded hourly batches. Private pages use no-store, noindex and no-referrer; all API reads/writes require verified Firebase identity and ownership or a current trusted admin session. Production rules must retain default denial of unknown private collections; never add client-write permissions for agent approval, evidence, attribution, audit or commission collections. Existing repository rules deny these collections.

Agent visit responses expose progress and photo metadata, not storage paths, bank accounts, owner ID numbers or other agents' records. Private evidence views are tied to reviewer, visit revision and image and expire after five minutes for approval. Audit records are separate from public shop data. Visit, attribution and accounting records remain for relationship administration and disputes; privacy requests go to support@teyza.co.za.

## R99 commission and debit orders

A new shop's once-off R99 onboarding commission becomes eligible only after approved work, seller approval, current mandate consent and the first fully paid R99 subscription invoice. Existing invoices created before the visit and later renewals do not create another commission. Duplicate payouts and reused payout references are blocked; reversed payments or withdrawn consent block unpaid eligibility. A paid commission whose underlying eligibility changes is flagged for manual review, without an automatic clawback.

**This release records mandate consent and verified payment/payout receipts. It does not initiate debit-order collections or agent bank transfers.** The existing mandate state remains `signed_pending_activation`, and `collectionActive` remains false. A payment-provider integration, merchant activation and any bank authentication are still needed before automated debit orders can run. Never treat a signed mandate as a successful collection. Do not record a receipt until independently verified in the bank or provider account.

## Search audit and repair

Observed live on 29 October: both `https://teyza.co.za/` and `https://www.teyza.co.za/` returned HTTP 200 with `X-Robots-Tag: noindex,nofollow`, despite index/follow HTML metadata. robots.txt and sitemap.xml also returned that blocking header. A public `site:` search produced no results in the tools used; this alone does not prove the site's Google indexing status. Search Console was not available in this session.

The overlay removes inherited robot header directives while retaining other headers, explicitly permits indexing for the reviewed public pages and restores noindex for non-public existing HTML files, private route prefixes, work/owner pages and admin. Public pages have canonical URLs, descriptive titles, summaries, social metadata and truthful WebPage/Organization structure. The home page explains the business in plain language and links to shopper, seller and field-agent guides. There are no invented review scores, fake local branches or guaranteed finance/order claims. The sitemap includes public information pages, not authenticated work pages. Private pages are crawlable so engines can read noindex; login and server authorization protect their data.

After deployment, `check-live-seo.cjs` checks public headers and private noindex. Also inspect both domain variants. Verify `teyza.co.za` in Google Search Console and Bing Webmaster Tools, submit `https://teyza.co.za/sitemap.xml`, and inspect/request indexing of the home page and new guides. Search engines decide whether/when to index and rank the site. No ranking or indexing guarantee is made.

References: https://developers.google.com/search/docs/crawling-indexing/block-indexing and https://developers.google.com/search/docs/fundamentals/seo-starter-guide

## Verification and limits

Automated tests use synthetic accounts, image bytes, locations, mandates and invoices. They do not apply for real agent accounts, contact shops, collect money, publish a pending shop or send recruitment messages. Test physical Android/iPhone camera permission, GPS accuracy, owner confirmation on a separate device and your payment-provider/bank process after deployment. No native app rebuild is required for these web portal pages; owners use their existing compatible app for shop registration and identity verification.
