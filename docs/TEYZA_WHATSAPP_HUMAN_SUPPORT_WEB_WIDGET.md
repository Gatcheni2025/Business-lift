# Teyza WhatsApp human support and public contact popup — deployment and acceptance

## Current verified implementation
- Approved opted-in sellers contact WhatsApp Business sender **+27 79 826 1972**, using the Meta-approved welcome menu or by sending **AGENT**. This does **not** open a browser chat inside the website: WhatsApp is opened on the seller's device.
- The WhatsApp webhook still verifies Meta's raw-body HMAC before action routing. STOP revokes seller opt-in and closes the WhatsApp support handoff.
- Selecting **Talk to consultant**, or texting **AGENT**, now activates the existing `teyzaSupportTickets/seller_<uid>` authenticated seller/admin conversation rather than generating a separate unreplyable `wa_<hash>` request.
- Subsequent free-text inbound WhatsApp replies are stored in that seller/admin support thread after approval, verified-phone, explicit consent and active handoff checks. Each incoming Meta message ID is hashed to deduplicate retries; webhook diagnostics remain free of PII and chat text.
- Teyza admins use their existing authenticated support chat (`ops_support_list`, `ops_support_thread`, `ops_support_reply`). Only authenticated admin-authored new messages in an active WhatsApp support conversation trigger `teyzaWhatsAppHumanReply`, an isolated Cloud Function using the existing secure Meta token.
- The outbound worker verifies approval, consent, recipient phone, active handoff, and a 24-hour window based on the seller's latest inbound WhatsApp message. It logs **accepted** only for Meta acceptance; timeouts/rejections go to `needs_review` and are NOT automatically retried. Messages outside 24 hours are not sent as free-form messages.
- Website popup appears on eight public information pages and their Firebase Hosting mirrors. Approved sellers can explicitly choose WhatsApp; new visitors are directed to email support. **Do not advertise general public WhatsApp agent chat as operational until a separate guest-support route exists.**
- Existing Meta approved WhatsApp template is not modified. Payments, ads, authenticated app routes and subscriptions are not modified.

## Scoped deployment after PR merge (operator only)
Do **not** publish until backend and website CI are green.
1. Pull a clean reviewed release branch on the authenticated Windows machine. Keep local untracked backups safe.
2. Run `npm test --prefix services/teyza-mobile-v39` and `npm test --prefix tools/app-first-release`. Ensure the actual WhatsApp sender ID is still `1466599163197469`, verified Meta token configured, and rollout mode still correctly scoped (`all`/general for all new approvals, or pilot while testing).
3. Deploy the webhook and the isolated WhatsApp reply function only; do NOT redeploy `teyzaMobile` or subscription workers:
   ```powershell
   $fb = ".\tools\admin-release\node_modules\firebase-tools\lib\bin\firebase.js"
   node $fb deploy --project business-lift-3c19c --config firebase.teyza-mobile-v39.json --only "functions:teyza-mobile:teyzaWhatsAppWebhook,functions:teyza-mobile:teyzaWhatsAppHumanReply" --non-interactive
   ```
4. Publish the **10 public HTML/asset files only** with the new scoped publisher, which clones the live version and verifies all unrelated hosting hashes and configuration before finalizing:
   ```powershell
   node .\tools\app-first-release\publish-help-widget-only.cjs check
   node .\tools\app-first-release\publish-help-widget-only.cjs deploy
   ```
   It writes a local rollback checkpoint. If this exact scoped version is still live, use `node .\tools\app-first-release\publish-help-widget-only.cjs rollback`. Do not run a broad Firebase Hosting deploy: the homepage pricing publisher intentionally does not include these assets.
5. Test a real newly approved **consenting** seller's handset: send AGENT -> Meta button reply acknowledgement -> send a private question -> confirm it appears in the authenticated admin support conversation -> admin writes reply -> confirm seller receives it **in the same WhatsApp conversation**, then verify provider accepted and signed delivered/read receipt if available.
6. Test duplicate webhook event, STOP, wrong phone, unapproved seller, outside-24-hour response, Meta timeout, and an anonymous website visitor (email fallback). Disable the new sender function if delivery or consent checks fail. Never manually replay ambiguous outbound sends.

## Data handling / privacy
Support text is now intentionally held in the private seller-admin support inbox once the seller requests a human agent. Review POPIA messaging retention, support access and data-deletion procedures before live rollout. Do not paste credentials, identity documents, payment data, cards, or verification OTPs into WhatsApp. The website popup does not collect or track message content.
