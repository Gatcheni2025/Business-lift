# Teyza WhatsApp seller welcome: benefits update (Meta approval required)

## Channel separation
- Seller onboarding sender: **+27 79 826 1972**, Meta WhatsApp Business Platform. Use only for approved, consented seller welcomes and its signed interactive replies.
- Keep the existing human support WhatsApp number separate; never advertise the automated sender as an instant human support line.
- For a Facebook ad that requests chats, select **Facebook Messenger only** as its destination; do not use the onboarding number as the ad CTA. For registration conversions, use a direct sign-up website destination.

## New Meta WhatsApp template proposal
- **Name:** `teyza_seller_welcome_benefits_v2` (new version; do not replace the working production template before Meta approval)
- **Category:** Marketing (Meta may decide the final classification)
- **Language:** English (`en`), matching production.
- **Header:** Image (keep the existing Teyza-branded JPEG hosted on `teyza.co.za`; do not alter the existing media URL or image asset without review).
- **Body placeholders:** exactly `{{1}}` = seller first name and `{{2}}` = approved shop/business name.

### Body to submit
🎉 *Welcome to Teyza, {{1}}!*

✅ *{{2}} is approved.*

Your *FREE business profile* helps people in your area discover your shop.

*Grow with Teyza:*
📍 Reach more potential local customers.
🛒 Unlock selling tools for *R99/month* when ready.
📦 Explore supplier deals and possible delivery savings.
📣 Advertise locally from *R29 for 7 days*.
💼 Explore partner finance, subject to eligibility.

Tap an option below to get started, or reply *MENU* anytime.

### Footer
Teyza Business · Reply STOP to opt out

### Existing quick replies (must retain routing compatibility)
1. Start selling
2. Advertise on Teyza
3. Talk to consultant

**Important:** do not promise additional customers, discounts, financing, instant human chat or approved sales; these are potential opportunities, not guarantees.

## Safe cutover after Meta approves the new template
1. Confirm the new template is **APPROVED** in the same WABA and has the same image header, exactly two body variables and the same three quick replies.
2. Confirm the sender ID stays `1466599163197469`, Graph API version `v26.0`, and language stays `en`.
3. Update the production `TEYZA_WHATSAPP_TEMPLATE_NAME` to `teyza_seller_welcome_benefits_v2` **only after approval**; the existing general deployment script pins `teyza_seller_welcome_menu` and must be deliberately updated in a separate reviewed change when switching.
4. Keep the current first-approval-only deduplication, verified-phone checks, consent, STOP handling and webhook signatures. Do not resend welcome messages to historic sellers.
5. Test with one newly approved consenting seller first; verify provider acceptance **and a signed delivered/read receipt**, then all three quick replies.
6. Roll back the template configuration to the approved previous version if the new version fails, without repeating prior deliveries.

## Updated signed WhatsApp MENU responses
The main-menu service response is clearer and describes local discovery, wholesale opportunities, FREE registration, and R99/month selling. It does not change the Meta-approved welcome text itself. The approval flow and all payment routes remain unchanged.
