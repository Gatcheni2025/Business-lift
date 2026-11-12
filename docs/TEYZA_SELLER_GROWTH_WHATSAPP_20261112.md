# Teyza seller growth, categories and WhatsApp implementation — 2026-11-12

Status: draft development branch. No production deployment or public WhatsApp sending is authorised by this file.

## Seller interface
- The bottom Chat tab is removed from seller navigation; the dashboard **Messages** control continues to open the existing in-app customer inbox. The floating **Support** button opens Teyza support separately.
- The shopper **Spaza Shops** carousel renders **only** explicitly categorized spaza listings; retail / local business / wholesale / unknown records must not leak into this row.
- Growth page presents benefits: products/services selling, local customer reach, participating wholesaler discounts, finance review, and moderated community visibility. It does not promise finance approval or paid placement.
- Dashboard and Support offer Upgrade Account; the growth page offers **Upgrade Account** and **Advertise to the community**. Both use consent-confirmed **informational** WhatsApp requests. Neither initiates payment or uses a checkout URL in store builds.

## Trusted phone and consent
- `seller_growth_interest` is a Firebase ID token authenticated action.
- Server reads `teyzaSellerAccounts/{uid}.phone` from the authoritative seller record, then verifies that Firebase Auth matches it with an actual `phone` provider. The client cannot choose or override a recipient.
- Per-purpose opt-in (`upgrade` / `advertise`) is recorded in `teyzaSellerGrowthRequests` and `teyzaWhatsAppGrowthOutbox`, deduplicated by UID, purpose and UTC day. Requests cannot activate selling, advertising or a Paystack transaction.
- Consent is checked again at send time; deletion, phone change, later opt-out, or unknown recipient rejects sending.

## Meta activation (operator-controlled)
The screenshot of the Meta dashboard shows the Teyza app is **Unpublished**. Do not claim WhatsApp templates are live or general seller delivery works yet.

Prerequisites before enabling:
1. Publish and configure the Meta app for relevant WhatsApp Business Platform use case, with an eligible real business sender and granted permissions.
2. Connect the approved WhatsApp Business Account, phone-number ID, access token, Graph API version and language.
3. Submit **two informational templates**, one each for upgrade and advertising **without website links, prices or checkout handoffs**. Obtain Meta approval and confirm template category/quality.
4. Confirm seller opt-in notices and retention/withdrawal handling and inspect actual on-device rendering.
5. Set these backend settings only after security review:
   - `TEYZA_WHATSAPP_NOTIFICATIONS_ENABLED=1`
   - `TEYZA_WHATSAPP_GROWTH_ENABLED=1`
   - `TEYZA_WHATSAPP_GROWTH_TEMPLATE_APPROVED=true`
   - `TEYZA_WHATSAPP_PHONE_NUMBER_ID`, `TEYZA_WHATSAPP_API_VERSION`, `TEYZA_WHATSAPP_TEMPLATE_LANGUAGE`
   - `TEYZA_WHATSAPP_GROWTH_UPGRADE_TEMPLATE`, `TEYZA_WHATSAPP_GROWTH_ADVERTISE_TEMPLATE`
   - Existing **Firebase Secret Manager secret**: `TEYZA_WHATSAPP_ACCESS_TOKEN`. Never store the token in Flutter, GitHub source, or public Hosting.
6. Only then deploy the separately gated `teyzaWhatsAppGrowthCreated` and `teyzaWhatsAppGrowthPending` triggers and test with consented test accounts. Provider acceptance is **not** proof of handset delivery; uncertain provider requests are flagged for review, not blindly resent.

## Store policy separation
**Do not use an in-app button as a payment redirect through a WhatsApp message.** App-triggered messages may only provide information. In particular, do not add `teyza.co.za/pay` or `teyza.co.za/ads` links to those templates: they could constitute indirect steering to purchase externally.

Teyza's independently visited advertiser and membership websites remain separate, and their paid actions use the existing Paystack verification/webhook safeguards. Launch of same-app ads or seller upgrades on iOS/Play still needs store-policy review of the actual digital purchase experience. Neither the new UI nor a sender template can grant store payment-policy exemptions.

## Safety and release gates
- Existing signing material and membership flow are not changed.
- Default production outbound WhatsApp delivery: OFF.
- Run `node --test seller-growth.test.js` plus `npm test` in `services/teyza-mobile-v39`, Flutter analysis, relevant widget tests, unsigned QA build and physical-device checks before merge.
