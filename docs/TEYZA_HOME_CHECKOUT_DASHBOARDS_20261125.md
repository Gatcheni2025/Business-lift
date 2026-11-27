# Teyza app update: home, checkout and dashboards

Prepared 25 November 2026 (South Africa). Candidate app version **1.0.49+59**; backend contract **3.26.0**.

## Release state

This is a source candidate for review and a new signed build. It is not a published Android or iOS release. The live API still reports 3.25.0 and does not yet advertise the new online-shopping controls or payment-readiness contract. No real payment, seller payout connection, WhatsApp message or campaign change was made while preparing this update.

The implementation starts at `686c91e32a4e2c2e75824e720d17703bbb02ca49`, the newer shopper-first/category/portion source from PR 222. It includes the registration and WhatsApp changes already deployed from the prior update kit. The registration merge preserves both business subtypes and secure, owner-scoped registration drafts.

## Customer experience

| Area | Result |
| --- | --- |
| Launch | The first Flutter frame is a restrained branded screen; the public home becomes interactive without waiting for authentication, location, directory requests or image caches. |
| Browsing | Guests can explore shops and products and build a basket. Choosing an area is an explicit action. Data errors and retries appear inside the page. |
| Sign-in | Checkout and personal features request authentication when needed. A checkout sign-in returns to the basket and keeps its items. Restoring a seller identity does not redirect a cold launch into the business workspace. |
| Shopper account | A consistent account overview groups orders, delivery details, payment preferences, contact verification and business access. Account changes clear private state belonging to the previous user. |
| Checkout | Collection and delivery are shown with server-calculated prices and the shop's actual payment options. Cash, cards at the shop and online checkout are separate choices. |
| Online payment | The shop confirms stock first. The shopper can then open Paystack from the order. Teyza checks the provider's result before showing an order as paid. |
| Payment return | A dedicated return page directs the shopper to Teyza and My orders. It does not infer success from a URL or expose payment credentials. |
| Business dashboard | Actual registration, publication, product and commerce state determines the next action and readiness checklist. Saved product drafts and published products are counted separately. No revenue or order statistics are invented. |
| Seller choices | Online orders and online payments have independent controls. Collection, delivery and card acceptance at the shop remain distinct preferences. |
| Loading and layout | Native launch backgrounds match the Flutter canvas. The new screens use shared ivory/forest/mint styling, legible contrast, responsive layouts and restrained motion. |

## Payment and seller rules

Online payment availability requires the seller to have an eligible, approved and active shop with active selling access; enabled online orders and online payments; collection or delivery; and a verified live Paystack settlement connection. The shopper also needs a verified account email for online checkout. Same-account Google/Apple verification and the existing email verification route remain available. Cash or an eligible in-person payment method can be used where offered.

The dashboard uses the authoritative public product count for publication readiness. Saved private products do not establish a live catalogue: zero published products leads to a publication action, and an unavailable public count does not imply that the shop is ready. Online orders are limited to the supported physical-goods flow and online payment amounts between R1 and R50,000; those online-payment limits do not prevent an otherwise eligible cash order.

Payment amounts, currency, stock and ownership are checked on the server. New physical-goods order payments use ZAR. The server reserves a payment reference before contacting Paystack, rechecks seller and order state inside transactions, and keeps uncertain attempts locked for reconciliation. Browser redirects never mark orders as paid. Signed callbacks and provider verification must match the expected reference, amount, currency, shopper, settlement account and environment.

An unpaid online order cannot be advanced into preparation or handover. Cancelling an already paid order flags a refund review; it does not silently issue or promise a refund. Test payments are not presented as live payments, and production does not accept shopper checkout using a test key.

The new online-payment preference defaults off unless explicitly enabled. Existing order reconciliation remains available, and old clients cannot silently overwrite a seller's saved online settings. Existing collection/delivery order preferences remain compatible. Online shopper checkout is for eligible physical-goods sellers; wholesale and service-business workflows keep their separate category controls. This work does not change the R99 digital business membership into a shopper-goods payment.

## Registration and welcome-message continuity

The previously deployed registration checklist, saved drafts, approval requirements and WhatsApp receipt processing are included. Business subtypes now survive a saved draft without granting a different account category. Drafts still do not save identity evidence, signed address receipts or consent. The registration action buttons remain usable on narrow screens and at enlarged text sizes.

An approved WhatsApp welcome still requires its own delivery evidence. This app update does not establish that a particular welcome was delivered or read.

## Validation record

The integrated candidate passed these checks on 25 November 2026:

| Check | Observed result |
| --- | --- |
| Complete Flutter suite, with screenshot capture enabled | **297 passed; 0 failed.** Includes launch/authentication/basket continuity, seller selection and claims, registration, account separation, checkout and responsive layouts. |
| Complete mobile backend Node suite | **403 passed; 0 failed; 0 skipped.** Includes order ownership, amount/currency checks, seller category/readiness, payment references and uncertain provider responses. |
| Flutter analysis | Exit 0; **0 errors and 0 warnings**. There are 93 informational notices, chiefly Flutter 3.50 SDK deprecations. |
| Native preparation and release helper suites | **42 passed** across six Python suites: native preparation (12), signed QA (4), proration gate (10), Gradle download configuration (6), store files (7), Play version floor (3). |
| Catalogue verification | Passed: 378 templates, 96 reference photos and four atlases. |
| Source consistency | Clean whitespace/error check; the complete patch is checked against the recorded base and its resulting Git tree is compared with the reviewed candidate. |

Flutter validation used SDK 3.50.1 with Dart 3.14 and the resolved dependency lockfile. The full app suite ran with `TEYZA_CAPTURE_UI=1 flutter test --no-pub --reporter expanded`; analysis used `flutter analyze --no-pub --no-fatal-infos`. Backend validation used `node --test services/teyza-mobile-v39/*.test.js` with Node 24.22.3. These are source and automated UI checks; they do not substitute for Android/iOS compilation, original-key signing and installation tests.

The review package contains actual Flutter renders for Home, the shopper account, business dashboard, online-shopping settings, checkout, and the preloader. It also includes narrow-screen/enlarged-text examples and offline/error handling. All screenshot data is controlled test data, not a claim about a live merchant's orders, approval or payment readiness.

### Remaining live-release checks

- The last read-only live check, at **17:44 SAST on 25 November 2026**, returned API version **3.25.0**, with the two new commerce capability fields absent. None of the 11 returned directory entries exposed the new commerce-readiness contract. This does not establish whether any particular seller has a verified settlement account.
- The new backend contract, payment-return Hosting page and signed mobile app have **not been deployed or published** during this update.
- No real shopper payment, refund, seller settlement or WhatsApp delivery has been performed or verified in this task.
- Native installation, actual Google/Apple sign-in, payment-browser return and the first controlled live payment remain release checks. The return page was checked structurally; it has not been rendered in a real browser in this environment.
- The basket is retained through sign-in in the current app session. This update does not add basket persistence across a full app restart.
- Windows PowerShell updater commands from the previous registration-only kit do not install this mobile candidate.

## Production release sequence

1. Publish the reviewed source to the intended GitHub review branch after repository publication is authorized. The original signing secrets remain in the existing release workflow.
2. Publish `/order-payment-return.html` to the existing website with the current Hosting manifest and settings preserved.
3. Deploy the affected backend functions together, preserving each function's existing environment and secret versions: `teyzaMobile`, `teyzaCatalogueDraftChanged`, `teyzaCatalogueShopChanged`, `teyzaCatalogueApprovalChanged`, `teyzaSellerBillingChanged`, `teyzaPublicationRepair`, and `teyzaShopLocationRefresh`.
4. Verify health reports version 3.26.0 with `sellerOnlineShoppingControls`, `onlineOrderPaymentReadiness`, `physicalGoodsPaystack` and `sellerPaystackSubaccounts` true. Inspect an authorized shop's actual readiness response; a capability flag alone does not establish a verified seller payout.
5. Run the existing signed Android/iOS workflow for the reviewed source. The production build gate now requires the new commerce contract. Confirm that build code 59 is still unused in the stores before uploading.
6. Install the signed candidate and exercise guest launch, restored shopper and seller sessions, checkout sign-in, a real shop's ordering settings, provider return, and payment reconciliation. A controlled payment check requires a deliberately selected merchant and payer; no such charge has been performed here.
7. Review the signed artifacts and store release before publication. Android keeps `com.asiyedriver.asiye`; iOS keeps `za.co.teyza.shopper`. The current native iOS minimum is 15.0.

The older registration/WhatsApp v3 ZIP does not contain these new app or commerce changes. Re-running it will not install this candidate.
