# TEYZA 1.1 — Growing-Y brand update

## Approved brand direction
Use the TEYZA wordmark where the **Y is a sprouting flower**, with one green living leaf and one warm golden-orange petal. The T, E, Z and A remain deep teal. This is the logo direction selected for the marketplace, not the former blue/purple/pink T monogram.

**Brand colours**
- Deep teal: `#003F4A` (navigation, backgrounds, text)
- Fresh green: `#079B65` (primary actions)
- Living leaf: `#ADE929` (growth accent)
- Warm golden flower: `#FFB31C` (highlights)
- Soft mint: `#F3FAF6` (page background)

## Website release contents
The hosted website remains PHP/Firebase-backed. The update includes:
- `assets/teyza-logo.svg` — scalable sprout-Y logo on light backgrounds
- `assets/teyza-icon.svg` — square app-style favicon
- `assets/teyza-sprout-wordmark.svg` — dark-teal wordmark on white backgrounds
- `assets/teyza-sprout-wordmark-light.svg` — white + coloured flower on dark backgrounds
- Updated landing, seller dashboards, subscription plan page and the global stylesheets.
- The existing category signup, Google login, PHP workspace, admin and subscriptions are unchanged in behaviour.

**Deployment**
1. In [GitHub Actions](https://github.com/Gatcheni2025/Business-lift/actions), open the latest successful `Teyza Shopper APK` run on the branded branch and download `teyza-1-1-sprout-brand-website`.
2. Back up `domains/teyza.co.za/public_html` **and** the existing private workspace data before extracting the ZIP in that public_html directory.
3. Overwrite public assets, HTML, JavaScript and PHP files in place; **do not delete private seller records, Google API keys, Firebase config, payment credentials or merchant uploads**.
4. Open an incognito tab and hard refresh. Verify the logo in the header, footer, register/login modal, seller dashboard, retail dashboard and subscription page. Verify neither mobile layout nor images are cropped.
5. Register/spaza vs retailer sign-ins must still route correctly; pay-to-list subscription requests remain uncharged until verified payment.

## Android Shopper
Version: **1.0.1 (build 11)**, updated from 1.0.0+10.

The compiled app:
- Displays the matching sprout-Y logo in its top bar and preloader.
- Installs a growing-Y launcher icon in all Android mipmap densities, including adaptive mask.
- Uses the teal/green/gold brand palette across shopping categories, service cards and delivery views.
- Retains nearest shop and GPS/manual location, Spaza Shops / Other Retail, services, delivery, chat, basket and shopper login.

**Important**: build passing does not prove real-device UI, Google login or correct data. Before any Play Store rollout, install the APK on Android and test splash timing, icon crops, light/dark visibility, login, GPS permission/denial, products, basket, chat, and category transitions.

No paid checkout or new delivery tracking integration is claimed as part of this branding update.

## Release workflow
The same CI produces (a) a complete hosting ZIP with SVGs/styles and (b) ARM64 test and debug APKs. Do not publish until the latest head commit's PHP, JS, SVG and Flutter checks all pass.
