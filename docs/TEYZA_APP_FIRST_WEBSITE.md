# Teyza app-first website — 27 October 2026

The public homepage now displays the actual Android screenshots supplied by the owner. Website seller registration has been replaced by app instructions, and old registration routes redirect to `/download.html#sellers`. Existing login/workspace/admin files are preserved for existing authorised users. This does not disable server-side authentication or delete accounts.

## Availability

Public Google Play (`za.co.teyza.shopper`) and Apple (`6827037733`) listing requests returned 404 on 27 October 2026. The Android testing URL redirects to Google account sign-in. It is labelled early access for approved testers; this does not assert that all visitors can install. iPhone is labelled coming soon, without an active store badge. Support contact is support@teyza.co.za.

Once public store listings are available, replace the testing CTA and availability copy in index.html and download.html (and their web/app-first/public copies), update the FAQ and remove test-access instructions. Add an Apple download CTA only after confirming the correct public listing. Never link a private IPA or expiring GitHub artifact to visitors.

## Changes

Responsive, accessible static homepage, app gallery, download gateway, app-only seller/plan pages and public support page. Canonicals use https://teyza.co.za; Open Graph and Twitter previews use a 1200x630 card made from actual app screens. Organization, WebSite and WebPage JSON-LD contain no invented reviews, ratings or location. Optimised WebP screenshots retain full original UI and attribution. No font CDN, analytics script, location collection or new form is added.

robots.txt advertises sitemap.xml. The sitemap lists the public marketing/support/legal pages. No private screens are listed. robots.txt is not access control. Existing server-side security remains authoritative.

## Publication

The downloadable kit contains only the fifteen reviewed marketing files and a scoped Firebase Hosting helper. Use Node.js 22+, an existing Firebase CLI account with access to business-lift-3c19c, then run `firebase login` followed by `./DEPLOY-WEBSITE.ps1` from the extracted kit. The helper clones the current live version, overlays the reviewed files, retains unrelated files and API/admin configuration, checks hashes and a concurrent-release guard, then publishes. It saves version metadata for `./ROLLBACK-WEBSITE.ps1`. Never run a plain `firebase deploy` with the kit's partial public directory.

No Firebase session is available in the editing environment. Source preparation is not a live deployment. Use the supplied deployment kit, then verify the homepage, registration redirects, privacy/support links and sitemap on both www and apex domains. Existing DNS settings and custom domains are not changed.

## Search follow-through

Verify ownership of teyza.co.za in Google Search Console and Bing Webmaster Tools using the provider's verification method, submit https://teyza.co.za/sitemap.xml to each, and request indexing of the homepage and download page. Use each platform's tools to validate indexing, mobile performance and social-card previews. Confirm the preferred domain redirects/canonical behaviour after publication. Add verified public social profile links when available; no profile links have been fabricated. No technique guarantees ranking or visibility on every platform.

## Checks

The legacy full-site package now includes nested image assets, validates root-relative asset URLs and installs its missing favicon dependencies in CI. The existing public Firebase client config remains included, while its server authentication helper remains excluded.

`node --test tools/app-first-release/hosting.test.cjs` covers file preservation, route/config preservation, publication ordering, rollback, upload failure, wrong domain and concurrent-release rejection. `python3 scripts/check_app_first_website.py` checks local links/assets, metadata, JSON-LD, sitemap and app-only registration.
