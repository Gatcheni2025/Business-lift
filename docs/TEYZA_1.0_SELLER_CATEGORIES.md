# TEYZA 1.0 — Category-based seller registration and approval

## Purpose

This update separates new seller accounts into two immutable signup categories:
- **Spaza Shop** — the existing simple dashboard at \`dashboard.html\` with priority administrator review, prefilled business type/industry and fewer free-text business fields.
- **Other Retail / Wholesale** — the separate \`retailer-dashboard.html\` for China Malls / China Marts, general retail and wholesale shops. Retailers choose retail type, legal structure, optional/bulk minimum order and company registration where applicable, then complete normal verification.

Seller category is saved by \`api/workspace.php?action=bootstrap\` during email or Google account registration, and returned for category-aware routing on subsequent sign-ins. A user cannot change an existing category simply by logging in or editing the frontend, and older accounts with no category stay on their existing spaza-style dashboard. The shopper catalogue already uses \`business.shopperCategory\` to place new spazas under Spaza and retail shops under Variety & Wholesale.

**Priority review is not automatic approval.** The admin queue lists pending spazas first, and identifies retail/wholesale applications with extra business details. Both types need a verified phone, approved ID/live selfie, confirmed business location, proof of address and admin address-match check. Retail shops additionally need their retail business details. This change does not bypass identity or statutory compliance checks or make promises about exact approval times.

## Deployment to 10hosting DirectAdmin

1. Back up current HTML, JS and API files in \`domains/teyza.co.za/public_html\`. Back up your private workspace records separately. Do not replace or delete them.
2. Upload \`TEYZA_1.0_CATEGORY_SIGNUP_WEBSITE.zip\` **into** \`domains/teyza.co.za/public_html\` and extract it THERE (not into a second nested \`public_html\`).
3. It includes:
   - \`index.html\` and \`assets/auth.css\` — signup asks Spaza Shop or Other Retail / Wholesale;
   - \`js/landing-auth.js\` — save selected type and route to the correct dashboard;
   - \`retailer-dashboard.html\` and \`js/retailer-dashboard.js\` — separate retail settings and shop dashboard;
   - \`dashboard.html\`, \`js/dashboard-data.js\`, \`js/onboarding-v2.js\` — simple spaza dashboard and faster review lane messages;
   - \`js/guard.js\` — redirect category to appropriate dashboard when logged in;
   - \`admin-sellers.html\`, \`js/admin-sellers.js\` — priority review queue and category-specific checklist;
   - \`api/workspace.php\` — secure storage, company verification checks and category-aware routing.
   - Related existing presentation styles \`assets/shop-first.css\`, \`assets/landing-popup.css\`, \`assets/workspace.css\`, \`assets/teyza-icon.svg\`, \`assets/teyza-shopper-preview.svg\` are included so the home page styling doesn't break.
4. **No private Google Places keys, payment credentials, merchant JSON files, or Firebase secrets are in the ZIP.** Keep directory permissions 0755 and public files 0644. Do not change existing private key permissions.
5. Open \`https://teyza.co.za/\` in a private window. Verify CSS and logo still work, and click Register.
6. Register **one new spaza test account**; verify the category is saved, dashboard stays simple, priority review appears in admin, and real approval remains blocked until required verification.
7. Register **one new retail test account** with a different email; verify it lands in \`retailer-dashboard.html\`, can save retail shop and legal structure, and cannot be approved until retail details and all other required verification are complete.
8. Log both accounts out and in using normal email and Google (if enabled); verify the category-specific dashboard reappears with saved records.
9. Verify the existing spaza account remains unchanged, and shop listings retain correct category after actual admin approval and required listing plan/consent.

## No app APK needed for this change

Seller signup is on the **website**, and the existing Teyza shopper APK already understands the public merchant category \`shopperCategory\` with values \`spaza\` and \`variety\`. The new seller flow persists those fields as the shop is registered. Approval and subscription status must still be valid before an entry is shown to shoppers.

## Important boundaries

- Spaza **priority queue** means staff review them first; approval is not instant, guaranteed, or automatic.
- Retail accounts have extra company verification fields; optional values are shown as optional in the dashboard.
- Do not switch old accounts to a new category automatically; contact admin to review migrations.
- Once an account is approved, legal details are protected from changes through the retail-details endpoint to reduce fraud.
- Basic R99/month vs Plus/Sponsored subscriptions are unchanged. The new approval flow does not mark subscriptions as paid.
