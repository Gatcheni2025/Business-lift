# Teyza WhatsApp welcome and interactive service menu — operator draft (2026-11-12)

## Goal

Replicate the interactive service-menu *experience* of a South African corporate WhatsApp support account. This is NOT a verified badge request and does not impersonate the example brand.

The first welcome may be sent **only after Teyza has approved the seller**, and only if the merchant has explicitly opted in to WhatsApp and verified the same number in Firebase Auth. The backend claims `teyzaWhatsAppWelcomeOnce/{sellerUid}` before calling Meta. A second seller review, provider error or uncertain network response does NOT send another welcome automatically.

The welcome has three WhatsApp **Quick reply** buttons. Each reply arrives through a signature-verified Meta webhook, opens the 24-hour customer service window, and returns interactive service information. No link to paid checkout is present.

## Create one Meta WhatsApp message template

In WhatsApp Manager → Message templates → Create:
- Name: `teyza_seller_welcome_menu` (must match backend `TEYZA_WHATSAPP_TEMPLATE_NAME`)
- Language: English (`en`)
- Category: **Marketing**, given the promotional seller growth / advertising choices; Meta assigns the final category
- Header: Optional **text**, `Teyza Business` (no media required)
- Body:

  ```
  Welcome to Teyza! 🌱

  Congratulations! Your business has been approved on Teyza.

  We are here to help you grow, reach more local customers, connect with participating wholesalers and explore opportunities for your business.

  What would you like to explore today? Choose an option below.
  ```

- Footer: `Reply STOP to stop WhatsApp updates.`
- Three **Quick Reply** buttons, **in exactly this order**:
  1. `Start selling` → backend payload `TEYZA_WELCOME_SELL`
  2. `Advertise` → backend payload `TEYZA_WELCOME_ADS`
  3. `Get support` → backend payload `TEYZA_WELCOME_SUPPORT`
- Do NOT create URL, phone-payment, deep link, copy-code, or checkout buttons.
- Submit for Meta approval. Do not mark approved locally until Meta's actual template status is **Approved**.

The backend sends button payloads as Meta template **components**, so the visible button labels are configured in WhatsApp Manager; payload identifiers are in source code.

## After the customer taps a service

The inbound button reply opens a normal 24-hour WhatsApp customer support window. Within the window, Teyza sends an **interactive list**:

- **Start selling** → `How to start`, `Selling benefits`, `All services`
- **Advertise** → `How to advertise`, `Advertising benefits`, `All services`
- **Get support** → `Account approval`, `Orders & messages`, `All services`

Choosing a topic returns an informational message with the three original service buttons for navigation. The bot does not purchase, upgrade, activate an ad, promise finance approval or collect payment. Ads and paid membership websites remain independently accessed by the user (no app-triggered indirect payment link).

Users may reply **STOP** to withdraw WhatsApp communication permission. Webhook messages are HMAC-verified, restricted to the configured phone-number ID, deduplicated, associated with a **single** verified and approved account with explicit consent, and only answered within 24 hours. Ambiguous shared business numbers and unapproved or deleted accounts are excluded.

## Meta and Firebase configuration

**Nothing is activated simply by merging this code.** The Meta app may still be unpublished, and the associated sender must be configured. In Meta Business Manager, complete the WhatsApp Business Account (WABA), verify the sender, and obtain the **Phone Number ID**.

Configure these Firebase function runtime environment variables after verifying every related provider setting:

- `TEYZA_WHATSAPP_NOTIFICATIONS_ENABLED=1`
- `TEYZA_WHATSAPP_WELCOME_MENU_ENABLED=1`
- `TEYZA_WHATSAPP_WELCOME_TEMPLATE_APPROVED=true` (only after confirmed Meta approval)
- `TEYZA_WHATSAPP_PHONE_NUMBER_ID` (numeric, from WhatsApp Business API setup)
- `TEYZA_WHATSAPP_API_VERSION` (e.g. `v24.0`, use the current compatible Meta API version)
- `TEYZA_WHATSAPP_TEMPLATE_NAME=teyza_seller_welcome_menu`
- `TEYZA_WHATSAPP_TEMPLATE_LANGUAGE=en`

Store the following separately in **Firebase Secret Manager**, never in the mobile app or source:
- `TEYZA_WHATSAPP_ACCESS_TOKEN` — valid, appropriately scoped WhatsApp Cloud API sender token
- `TEYZA_META_APP_SECRET` — Meta App Secret used to verify `X-Hub-Signature-256`
- `TEYZA_WHATSAPP_WEBHOOK_VERIFY_TOKEN` — strong random token you create, shared only between Firebase and the Meta Webhook setup

The new webhook **does not exist in production unless its gated Firebase function has been deployed**. When activated, the callback URL will be:

`https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaWhatsAppWelcomeWebhook`

In Meta → WhatsApp Configuration → Webhooks, use this deployed callback, set the matching verify token, confirm GET verification succeeds, and subscribe to the `messages` webhook field. Only a valid Meta-signed POST is processed.

Deploy/review the optional functions `teyzaWhatsAppApprovalCreated`, `teyzaWhatsAppApprovalPending`, `teyzaWhatsAppWelcomeWebhook` and `teyzaWhatsAppWelcomeReplyCreated` with their required secrets. `TEYZA_ADMIN_DEPLOY_ONLY=1` must NOT be used for these optional functions.

### Test and release gate

1. Run `npm test` in `services/teyza-mobile-v39`; test HMAC, replay dedupe, opt-out, frozen sender and one-time welcome.
2. Have a real consenting *test seller* complete identity and phone verification and receive actual admin approval.
3. With the real Meta-approved template, confirm the handset receives one welcome with exactly three visible buttons.
4. Tap all choices; confirm list, details and back-to-menu behavior. Re-approve the same UID: no second welcome.
5. Check provider acceptance, webhook receipt, handset delivery, opt-outs and error states. Meta's accepted API status is **not** proof of handset delivery.
6. Review policy and messaging charges; use only approval-triggered informational navigation, not purchase steering through WhatsApp. User-initiated purchases at independent websites are a separate policy/compliance analysis.

**Not included:** acquiring a blue WhatsApp verified badge, live agent handoff, public release, or store-payment exemption.
