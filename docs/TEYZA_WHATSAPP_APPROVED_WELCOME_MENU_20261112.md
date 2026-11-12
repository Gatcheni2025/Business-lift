# Teyza WhatsApp welcome and interactive service menu — operator draft (2026-11-12)

## Goal

Replicate the interactive service-menu *experience* of a South African corporate WhatsApp support account. This is NOT a verified badge request and does not impersonate the example brand.

The first welcome may be sent **only after Teyza has approved the seller**, and only if the merchant has explicitly opted in to WhatsApp and verified the same number in Firebase Auth. The backend claims `teyzaWhatsAppWelcomeOnce/{sellerUid}` before calling Meta. A second seller review, provider error or uncertain network response does NOT send another welcome automatically.

The welcome has three WhatsApp **Quick reply** buttons. Each reply arrives through a signature-verified Meta webhook, opens the 24-hour customer service window, and returns interactive service information. No link to paid checkout is present.

## Create one personalized image-header Meta WhatsApp template

IMPORTANT: In WhatsApp Manager, select the **real Teyza WhatsApp Business Account**, not the “Test Messaging Account” shown in the operator's screenshot.

Template settings (must match backend exactly):
- Name: `teyza_seller_welcome_menu`.
- Language: English (United States), API code `en_US`.
- Category: **Marketing**, subject to Meta classification.
- Header: **Image**, upload the same Teyza spaza shop welcome artwork used as a sample. There is no separate text header when an image header is selected.
- Body (paste exactly, including sequential variables):

  ```text
  *Welcome to Teyza! 🌱*

  Congratulations *{{1}}*! Your business *{{2}}* has been approved on Teyza.

  We're excited to welcome you to a community-focused platform helping local businesses grow.

  With Teyza, you can explore selling opportunities, connect with participating wholesalers, reach nearby customers, advertise your business and learn about available business support.

  *What would you like to do today?*

  Please select one of the services below.
  ```

- Body variable sample values: `{{1}} = Thandi Ndlovu`, `{{2}} = Thandi Spaza Shop`. These are non-real examples for Meta review; runtime values come from Firebase.
- Footer: `Teyza Business · Reply STOP to opt out.`
- Three **Quick Reply** buttons, in exactly this order (no URL or phone-payment CTA):
  1. `Start selling on Teyza` → `TEYZA_WELCOME_SELL`
  2. `Advertise on Teyza` → `TEYZA_WELCOME_ADS`
  3. `Talk to consultant` → `TEYZA_WELCOME_SUPPORT`

The template button labels are configured in Meta; backend reply payloads are set when sending. Subsequent **interactive** button labels are limited to 20 characters, so the follow-up menu can use a shorter “Start selling”.

### Firebase database mapping (UID-bound, never from the caller)

- Recipient WhatsApp number: `teyzaSellerAccounts/{uid}.phone`, verified against Firebase Auth provider `phone`; consent in `teyzaWhatsAppPreferences/{uid}`.
- `{{1}}` seller name: `teyzaShopperProfiles/{uid}.displayName` only if `ownerUid === uid`, otherwise the Firebase Auth user's `displayName`. A missing name blocks send rather than inventing one.
- `{{2}}` approved business name: `teyzaSellerAccounts/{uid}.shopName`. Missing or invalid names block send.
- Approval: account `approvalStatus === 'approved'`, current `teyzaMobileVerification/{uid}` approved submission, and consent version `seller-approved-welcome-services-v1`.
- Exactly-once record: `teyzaWhatsAppWelcomeOnce/{uid}` created transactionally **before** the Meta API request. A second admin approval, repeated function invocation or ambiguous provider timeout must not resend the welcome.
- Audit outbox: `teyzaWhatsAppApprovalOutbox/{submissionId}` records queued, configuration-required, accepted or needs-review. Meta acceptance is NOT handset delivery.
- Upon the seller's Quick Reply, signed webhook writes `teyzaWhatsAppWelcomeReplies/{hash(messageId)}` and sends service information inside the WhatsApp 24-hour window.
- The **Talk to consultant** selection additionally creates a deduplicated `teyzaWhatsAppConsultantRequests/{uid}_{UTCday}` record and opens/updates the existing `teyzaSupportTickets/seller_{uid}` admin support inbox with a conversation entry. It is a support request, not a claim that a human is already online or replying in WhatsApp.

### Dynamic header image provisioning

A sample image uploaded in Meta's template editor is **not** automatically a permanent media identifier to send in every Cloud API message. Upload the image to the real WhatsApp sender's Cloud API media endpoint, or follow the current Media API provisioning process, and record the resulting numeric media ID as `TEYZA_WHATSAPP_WELCOME_MEDIA_ID`. This ID must correspond to the same approved image content. If it is missing, the sending function remains configuration-required and sends **nothing**. Do not store the access token in the app, public website or Git repository.

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
- `TEYZA_WHATSAPP_WELCOME_MEDIA_ID` — numeric ID for the approved welcome image uploaded via Meta's real WhatsApp sender
- `TEYZA_WHATSAPP_TEMPLATE_LANGUAGE=en_US`

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
