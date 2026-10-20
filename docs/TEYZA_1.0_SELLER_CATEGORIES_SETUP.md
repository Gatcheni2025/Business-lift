# TEYZA 1.0 — Seller Categories and Faster Spaza Review

## Deploy safely on 10hosting (DirectAdmin)

**Back up** the live \`index.html\`, \`dashboard.html\`, \`business-profile.html\`, \`api/workspace.php\`, \`api/shopper-catalog.php\`, \`assets/auth.css\` and the current \`js\` files before overwriting them.

Extract the provided ZIP **directly into** \`domains/teyza.co.za/public_html\` (not into an extra nested directory). The files should resolve as:

- \`https://teyza.co.za/index.html\`
- \`https://teyza.co.za/dashboard.html\`
- \`https://teyza.co.za/retail-dashboard.html\`
- \`https://teyza.co.za/assets/auth.css\`
- \`https://teyza.co.za/js/landing-auth.js\`
- \`https://teyza.co.za/js/retail-dashboard.js\`
- \`https://teyza.co.za/api/workspace.php\`

Set files to 644 and directories to 755. **Do not** replace private merchant databases, Firebase credential files, Google Places keys, hosting config, or \`private_html\` data. Hard refresh with Ctrl+Shift+R or use a private browser window.

## What changes

### At registration
- Pick **Spaza Shop** or **Other Retail / Wholesale**.
- The latter optionally picks subtype: China Mall/China Mart, wholesale, supermarket, fashion, hardware, electronics, general retail, other.
- Works for email/password registration and Google sign-up via the existing popup (other social providers share the same account flow).
- Category is saved into the **authenticated server-side workspace** as \`business.shopperCategory\`. \`spaza\` or \`variety\` are the API codes.
- Category cannot be changed casually by logging in again. Admin can reclassify an existing seller and the approval resets to pending.

### Different dashboards
- **Spaza** → existing simpler \`dashboard.html\`.
- **Other Retail / Wholesale** → new \`retail-dashboard.html\` with sales/stock overview, advanced retail type, optional CIPC/registration and VAT number, trading name and fulfilment model.
- The original dashboard remains available via a link to \`dashboard.html?classic=1\` for advanced users.
- Existing seller accounts with no category remain in their original **Spaza** dashboard until an admin explicitly changes their category. Existing data are never overwritten on deployment.

### Approvals
- Spaza accounts have a lean profile-readiness check (business name, phone, country, address, with automatic Retail and groceries defaults). They enter **Priority Spaza Review** in the admin queue.
- Other Retail / Wholesale uses the fuller business profile and standard review.
- **Both still require verified phone, ID/selfie, confirmed map location, uploaded address proof, admin-reviewed address match and final admin approval.** Fast-track means the queue and profile are simpler, not that verification is bypassed.
- On reclassification by an admin, approval is reset to pending and a new review is necessary. Teyza does not promise an exact approval duration.

### Shopper app
- \`api/shopper-catalog.php\` maps persisted category to \`shopCategory=spaza\` or \`shopCategory=variety\`.
- Shopper APK 0.9 already supports **Spaza Shops** and **Variety & Wholesale**. No new APK is needed for this **server-side** category routing, as long as the shopper app version already uses the current catalog API.
- Listings appear only after required approval, explicit opt-in and applicable subscription activation. No false prices or fictitious stock.

## Testing
1. Open \`https://teyza.co.za/?auth=register\` in a private window. Verify the two choices and conditional retail type drop-down.
2. Register a **test** Spaza account → the simple dashboard. Complete the existing verification checklist and verify *Priority review* in admin.
3. Register a **test** Other Retail account → the advanced dashboard and save retail subtype/details. Complete identity, phone, map and proof of address as usual.
4. In admin sellers, check category badges and priority ordering. Change the category of a **test** account; status must reset to pending.
5. On Google or email sign-in to an existing account, category must remain unchanged. Public merchant catalogue must show the correct \`shopCategory\` after approval and consent.

**Verification caveat:** GitHub PHP lint, JavaScript parse checks and static assertions do not substitute for live Firebase/signup/payment/phone OTP testing. Use a separate test account before rollout.
