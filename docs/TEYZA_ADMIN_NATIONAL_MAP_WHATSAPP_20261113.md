# Teyza national map and WhatsApp Meta activation — 13 November 2026

## National coverage map
Admin > National shop map is a private viewport explorer, not an exhaustive census. Authenticated recent admins page through published Teyza shops; maps only display active, approved, verified, geographically valid shop pins. Categories: Teyza only, claimed Google + Teyza, and Google only in current local 20 km search.
Google-only search uses existing Teyza Places service, fetches fresh nearby results and overlays them only on Google Maps with proper attribution. Google-derived coordinates obey existing expiry checks. Do not bulk cache, scrape, export, or claim national Google-only totals. A Google listing is not a Teyza verified merchant.
Requires a separate browser-restricted Google Maps JavaScript API key supplied for the admin session. Restrict to teyza.co.za and www.teyza.co.za referrers and Maps JavaScript API. Never use the existing server-side TEYZA_GOOGLE_PLACES_KEY in the browser. Google Maps and Places must be provisioned with billing and quotas.

## Meta WhatsApp status from screenshots
Meta shows Phone Number Registered, Business Verification Complete and template teyza_seller_welcome_menu in Marketing / Active - Quality pending. This confirms template availability but NOT that the Firebase runtime holds a valid Meta token, correct sender phone-number ID or webhook credentials. The approved marketing template is NOT an Authentication/OTP template.
The pictured welcome template includes an image and personalised approval text. The previous backend sent only name and language. New code supports configured IMAGE header and ownerFirstName/shopName body parameters, but these must match the actual approved template placeholders in Meta. Never guess the parameter order.

## Safe configuration sequence (not executed)
1. Verify the exact approved template header and number/order of body placeholders in Meta WhatsApp Manager. Verify exact Meta Phone Number ID, distinct from WABA ID, App ID, and template ID.
2. Publish an approved public image on https://teyza.co.za for the IMAGE header, and confirm Meta can fetch it. Avoid private images and redirects.
3. Set these non-secret Firebase function env values in services/teyza-mobile-v39/.env.business-lift-3c19c (change placeholder values after independent confirmation):
    TEYZA_WHATSAPP_NOTIFICATIONS_ENABLED=1
    TEYZA_WHATSAPP_PHONE_NUMBER_ID=<real Phone Number ID>
    TEYZA_WHATSAPP_API_VERSION=<supported vNN.0>
    TEYZA_WHATSAPP_TEMPLATE_NAME=teyza_seller_welcome_menu
    TEYZA_WHATSAPP_TEMPLATE_LANGUAGE=en
    TEYZA_WHATSAPP_TEMPLATE_HEADER_IMAGE=true
    TEYZA_WHATSAPP_TEMPLATE_HEADER_IMAGE_URL=https://teyza.co.za/<approved-image-path>
    TEYZA_WHATSAPP_TEMPLATE_BODY_FIELDS=ownerFirstName,shopName
4. Set long-lived Meta system-user access token (appropriate whatsapp_business_messaging permissions on the correct WABA) in Firebase Secret Manager using the CLI prompt: firebase functions:secrets:set TEYZA_WHATSAPP_ACCESS_TOKEN --project business-lift-3c19c. Never paste the token into chat, source, logs or env.
5. After source review, tests, approved rollout, secure token and image validation, deploy only optional worker targets with firebase.teyza-mobile-v39.json: functions:teyza-mobile:teyzaWhatsAppApprovalCreated,functions:teyza-mobile:teyzaWhatsAppApprovalPending. The isolated core backend deploy script does NOT deploy these workers.
6. Admin > WhatsApp delivery shows sampled outbox counts and config presence, not actual token validity. Test with one opted-in, verified seller and check provider acceptance, handset receipt and no duplicate messages. 'accepted' confirms Meta API acceptance only, not delivery. Do not retry 'needs_review' blindly.
7. Two-way customer messaging and WhatsApp OTP authentication require separate webhook/authentication implementations and approvals; not included in this PR.

## Deployment status
Staged draft only. No Meta credential access, production backend deployment, map credential provisioning or admin Hosting publication was performed. Do not claim WhatsApp is live merely because a template was approved.
