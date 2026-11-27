# Teyza.co.za styling repair — 20 October 2026

## What happened
The original Teyza 0.9 website deployment ZIP included updated \`index.html\` and \`dashboard.html\`, but it omitted the landing and dashboard CSS/assets referenced by those files. If the previously published \`assets/\` directory is absent, outdated or was accidentally overwritten, the browser renders HTML as unstyled text with blue links, just as shown in the screenshot.

The recovery package restores:
- \`index.html\` and \`dashboard.html\` with fresh CSS cache-buster query strings;
- \`assets/shop-first.css\` — main landing page layout;
- \`assets/auth.css\` and \`assets/landing-popup.css\` — login/register popup layout;
- \`assets/workspace.css\` — dashboard layout;
- \`assets/teyza-icon.svg\` and \`assets/teyza-shopper-preview.svg\` — website images.

**This is a presentation-only repair.** It doesn't touch \`api/\`, merchant account data, subscriptions, authentication settings, Google Places API keys or backend PHP files.

## Deploy to 10hosting DirectAdmin
1. Open **File Manager → domains → teyza.co.za → public_html**.
2. **Back up** the current \`index.html\`, \`dashboard.html\` and \`assets\` directory.
3. Upload \`TEYZA_0.9_STYLE_RECOVERY.zip\` **inside \`public_html\`** and select **Extract**.
4. Confirm the resulting files are directly at:
   - \`domains/teyza.co.za/public_html/index.html\`
   - \`domains/teyza.co.za/public_html/dashboard.html\`
   - \`domains/teyza.co.za/public_html/assets/shop-first.css\`
   - \`domains/teyza.co.za/public_html/assets/auth.css\`
   - \`domains/teyza.co.za/public_html/assets/landing-popup.css\`
   - \`domains/teyza.co.za/public_html/assets/workspace.css\`
5. IMPORTANT: Do not extract so that files end up under \`public_html/public_html/assets\` or \`public_html/TEYZA_0.9_STYLE_RECOVERY/assets\`. There should be **one** \`assets\` directory immediately inside the live \`public_html\`.
6. Set file permissions **644** for HTML/CSS/SVG; folder permissions **755** for \`assets\` (and \`public_html\`).
7. Test \`https://teyza.co.za/assets/shop-first.css?v=20261020repair1\`. You should see CSS text beginning with \`*{box-sizing:border-box}\`, not a 403 or 404 message and not HTML.
8. Test \`https://teyza.co.za/\` and \`https://teyza.co.za/dashboard.html\` in a private browsing window, or hard-reload with **Ctrl+Shift+R**.
9. If the direct CSS URL is still 403 or 404, check the DirectAdmin website document root and whether the website files were uploaded to the correct \`public_html\`. If the CSS URL loads but the page is still unstyled, inspect the browser Network tab for a blocked stylesheet, check its Content-Type, and temporarily clear LiteSpeed/hosting cache.
10. Recheck login/register popup and dashboard navigation.

**Do not change HTML file permissions to 755**, and do not put API keys in \`public_html\`. No \`.htaccess\` change is necessary to solve missing CSS; if your host has special rewrite rules, check them only after validating the direct CSS URL.
