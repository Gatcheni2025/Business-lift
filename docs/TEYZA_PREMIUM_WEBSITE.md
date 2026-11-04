# Teyza premium public website — November 2026

A comprehensive Teyza-colour redesign of the public marketing experience, loosely informed by the confident hierarchy of leading South African digital-service websites, with its own original visual language.

## What's replaced
- Home: dramatic photographic hero, local commerce platform cards, shopper journey, wholesale flow, real interactive app preview, membership teaser, FAQ and official store badges.
- Download: polished Google Play/App Store links, test-track guidance, real Teyza app screenshots.
- How it works: shopper and wholesale paths.
- For business: spaza, wholesaler and other business journeys, validation, order and stock features.
- Seller plans: free registration, R49 introductory first month, R99/month thereafter, R29 seven-day promotion with appropriate eligibility/review caveats.
- Support: contact options, security guidance and common account questions.
- Register: clear in-app registration instructions.
- Shared stylesheet and public sitemap. All 7 pages use a consistent navigation/footer, responsive CSS, local photos and accessible HTML.

Public navigation and sitemap no longer promote Field Team. Existing /agents.html, /work.html and associated private operations routes are **not deleted**. Administrator tools, APIs, Firestore data, Firebase functions, existing legal-policy files and unrelated Hosting assets are unchanged.

## Publish only the premium public pages

Use the successful GitHub Actions artifact **TEYZA-PREMIUM-WEBSITE**. It contains a ZIP named **TEYZA_PREMIUM_WEBSITE_20261104.zip**.

1. Extract both ZIP layers into a new folder (do not run commands from a compressed archive).
2. Open PowerShell inside the folder that contains DEPLOY-TEYZA-PREMIUM.ps1.
3. Ensure Node.js 22+ and the Firebase CLI are installed, and authenticate with a Firebase user authorized for business-lift-3c19c.
4. Run:

```powershell
firebase login
.\DEPLOY-TEYZA-PREMIUM.ps1
```

The helper clones the live Firebase Hosting version, overlays only 9 approved paths, checks byte hashes of all preserved live files, retains redirects, rewrites and headers untouched, and prevents publication if the live version changed during preparation.

**Do not run `firebase deploy --only hosting` or the older DEPLOY-WEBSITE.ps1** from a partial ZIP. Those workflows have a larger scope.

When the helper reports publication, inspect https://teyza.co.za/, https://teyza.co.za/download.html and other navigation links on desktop and mobile. The app-store links can remain temporarily unavailable during store review.

A local `teyza-premium-website-backup.json` records the prior live version. Roll back only if this release is still the active live website:

```powershell
node .\tools\app-first-release\premium-site-patch.cjs rollback
```

## QA

- `python3 scripts/check_app_first_website.py`
- `node --test tools/app-first-release/hosting.test.cjs tools/app-first-release/premium-site.test.cjs`
- PowerShell parser check for DEPLOY-TEYZA-PREMIUM.ps1
- CI ZIP file-by-file hash verification

This is a public website design update. It does not change Play/App Store review status, implement in-app payment channels, or redeploy backend services.
