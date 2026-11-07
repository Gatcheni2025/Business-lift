# Teyza — Store billing and manual Netcash mandates (7 November 2026)

**Status: implementation guidance and release blocker, not an assertion of App Store or Google Play approval.**
This document distinguishes the debit-order **collection provider process** from the
**distribution platform's digital-goods billing rules**.

## The product classification

Teyza shoppers buying groceries, other physical products, collection or delivery can
continue using seller-enabled Paystack payments outside Apple/Google IAP. Those items
are consumed outside the app.

A R99/month seller membership that unlocks **posting products, in-app selling tools,
enhanced visibility, advertising or other digital functions** is different. It is
generally a digital feature/subscription. Calling this a bank mandate does not change
the product's character.

Do not combine these two billing systems in one payment path.

## Manual Netcash debit-order process — no Netcash API required

1. The **approved, verified** seller signs the R99 recurring mandate request on
   `seller-subscriptions.html` or a **direct-distribution Android** build.
2. Saved shop address, phone and verified identity evidence are reused; the seller
   must select a real bank, enter the account number, review the first date and
   recurring day, and give clear affirmative consent.
3. The encrypted request appears in `admin.html > Debit orders & mandates`.
   Authorised admins review it and export an **audited, confidential PDF**.
4. An administrator manually uploads/submits the paperwork through an **approved
   secure Netcash channel**. Netcash may require its **own prescribed mandate
   format** or separate bank authentication (including DebiCheck where applicable).
   A Teyza-generated PDF is a preparatory consent record, not proof of bank approval.
5. The administrator records Netcash's **portal submission/reference number**.
   Status becomes `submitted_to_netcash` and `submitted_unverified`. This is
   **not** a debit, bank authentication, successful collection or paid membership.
6. Netcash must accept/authenticate any applicable mandate, collect according to
   the agreed terms, and supply reliable collection/return confirmations. Teyza
   must maintain records, disputed/returned-debit handling, customer support,
   withdrawal/cancellation and data retention. A verified **payment**, not mere
   consent or the admin review, is required before paid seller entitlement.
7. Bank account details and ID material are encrypted server-side. Do not send
   exported PDFs by ordinary email, attach them to tickets, or expose bank numbers
   in Firestore public documents. Delete local copies according to a retention
   procedure. Provider portal credentials are never collected in the app.

**An API to Netcash is optional** for manual uploads/collections *if* Netcash accepts
that workflow. This does not remove separate platform reporting/API requirements.

**Netcash itself explicitly warns that a website tick box is not a valid debit-order
authorisation.** Treat the Teyza form/PDF as an *initial consent request* rather than
a signed paper/eMandate. Netcash's portal can accept manual Masterfile entries and
uploads of signed mandates; use Netcash's prescribed mandate wording, abbreviated
bank-approved name, cancellation/assignment clauses and official eMandate or bank
authentication where applicable. Do not debit solely from the Teyza PDF.

Provider documentation:
- https://help.netcash.co.za/docs/quick-start-guides/debit-orders/debit-order-service-guide/
- https://help.netcash.co.za/docs/account-profile/debit-orders/manage-debit-orders/
- https://help.netcash.co.za/docs/quick-start-guides/debit-orders/debit-order-mandate/


## Google Play (South Africa)

- South Africa is eligible for the **user choice billing pilot** for non-gaming
  mobile/tablet apps from registered businesses.
- **Enrolment in Play Console is required**, along with approval/onboarding;
  availability alone is not enrolment.
- To offer a Netcash alternative **inside a Play-distributed app**, the pilot
  requires that **Google Play Billing also be offered**, the prescribed billing
  choice flow, the Alternative Billing APIs, compliance and support/disputes,
  and **reporting of authorised alternative transactions to Google Play within
  24 hours** (and applicable fees).
- **Alternative, without Google billing choice APIs:** Google explicitly permits
  **consumption-only apps** (no digital purchase occurs inside the Play app),
  including use of access acquired elsewhere. Keep Teyza's Play binary
  status-only, with no Netcash form, external payment link, purchase CTA or
  misleading in-app checkout. Sellers may complete a separate manual Netcash
  process through independent out-of-app business communication. This is the
  low-integration Google Play route, **not** the in-app user choice pilot.
  The app must not route users to Netcash or a checkout from within it.
- The previous manual reporting grace period ended **13 March 2024** for apps
  enrolled in user choice billing and offering the alternative **within the app**.
- The choice SDK and secure billing reporting must be fully implemented and
  tested before enabling the mandate in a Play build; merely recording a
  Netcash portal reference is insufficient.
- Until then, the Play APK/AAB must compile with
  `--dart-define=TEYZA_PAYMENT_CHANNEL=store`, without a Netcash/website
  checkout or off-app purchase CTA. A seller may still view their status.
- The separately signed direct-distribution Android QA APK, built only through
  an explicit manual flag, may use `TEYZA_PAYMENT_CHANNEL=direct`; **never
  submit this APK to Google Play.** It uses existing production Firebase, so
  use dedicated test accounts.

Official sources:
- https://support.google.com/googleplay/android-developer/answer/12570971
- https://support.google.com/googleplay/android-developer/answer/13821247
- https://support.google.com/googleplay/android-developer/answer/10281818

## Apple App Store (South Africa)

- **3.1.1:** in-app unlocking of digital features or subscriptions generally
  requires **StoreKit In-App Purchase**.
- **3.1.3(b):** multiplatform digital entitlements acquired on a website generally
  must also be offered by IAP in the iOS app.
- **3.1.3(e):** physical products/delivery are outside IAP; this does **not**
  automatically exempt digital selling tools or paid listing priority.
- **3.1.3(f):** free stand-alone companion apps have narrow conditions (examples
  include email, VoIP, cloud storage, web hosting), not an automatic exemption
  for a retail marketplace.
- No verified South African entitlement currently authorises the Netcash
  digital-membership purchase/steering inside Teyza iOS. **Do not put a
  debit mandate, R99 alternative-purchase CTA, or link to it inside iOS.**
- To sell seller digital membership **within iOS**, register a real auto-renewable
  product in App Store Connect, implement StoreKit 2 / a verified Flutter bridge
  and server-side App Store transaction verification, handle renewal, refunds
  and restore purchases, and test the App Review sandbox. Do not trust a
  client-only `paid: true` flag.
- Alternatively, change the product model: make digital product listing and
  other digital tools free for verified sellers, and charge R99 *only* for
  independently delivered physical/offline B2B services such as wholesale
  stock distribution and delivery. Review all benefits and gating before
  relying on 3.1.3(e).
- An iOS **status-only** screen with no purchase CTA is safer than payment
  steering, but **is not proof of full Apple compliance** if web-bought
  digital membership still unlocks iOS functionality. Seek an App Review
  determination or implement IAP before public release.

Official source: https://developer.apple.com/app-store/review/guidelines/#business

## Release gates (blocking)

- [ ] Confirm the business decision: **IAP/Play choice for paid digital seller
      tools**, or **free digital seller access with R99 for genuine offline services**.
- [ ] Play Console user choice billing enrolment confirmed if Netcash is to be
      offered in the Play app; integrate Play Billing and alternative billing
      APIs, secure 24-hour reporting, refunds and renewals.
- [ ] App Store Connect product/StoreKit server verification implemented if the
      R99 membership unlocks iOS digital features (or explicit exception granted).
- [ ] Use backend verified entitlements; never activate on an admin submission
      mark, a saved mandate PDF, a browser redirect or a mere consent checkbox.
- [ ] Netcash manual submission and customer-service process tested; bank
      validation and first collection evidence reviewed.
- [ ] Verify Play build and App Store build contain no external seller payment
      prompt; verify Play only uses store-safe signing artifacts.
- [ ] Review POPIA handling of exported ID/banking data and provider retention.
- [ ] Test on physical devices, submit full App Review notes and demo accounts.

**Current implementation:** the manual mandate and admin receipt/export functions
do not themselves activate billing, and neither Google user choice billing nor
Apple StoreKit IAP has been activated. Treat both app stores as release-blocked
for paid seller digital membership until the selected compliant route is built.
