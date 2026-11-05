# Teyza store website update — 5 November 2026

The public website links to Teyza on Google Play and the App Store without saying that both listings are awaiting review. Store availability can depend on the customer's region, device and account. The website does not label a test build as a public release.

Business registration remains free. The seller-plan information describes the R49 introductory first month and R99 monthly price thereafter, subject to eligibility, shop approval and supported checkout availability. This website release does not enable or collect payments.

The footer includes Teyza's address, support contacts and a Vacancy link. The public field-team page no longer promises the old onboarding commission. The field work portal and its backend are not updated by this package; some portal screens can still show previous terms until the separate field-team release is deployed.

## Publish the reviewed pages

Download the **TEYZA-STORE-WEBSITE** artifact from the successful website workflow. Extract `TEYZA_STORE_WEBSITE_20261105.zip` to a new folder. With Node.js 22 or newer and an authorised Firebase CLI account for `business-lift-3c19c`, run PowerShell from that folder:

```powershell
firebase login
.\DEPLOY-TEYZA-PREMIUM.ps1
```

The helper clones the current live Hosting version and replaces eight reviewed public HTML pages only. It checks that unrelated files remain unchanged, preserves the existing Hosting configuration, and stops if another live version appears during the update. The eight target pages are replaced with the reviewed copies from this kit. Admin, work-portal pages, payment services, Firebase Functions and app binaries are not replaced.

Do not run `firebase deploy --only hosting` from this partial kit. After the helper reports success, check the home page, download page, business pages and Vacancy link on desktop and mobile. Google Play visibility should also be checked using a customer account and a South African device.

Keep the generated `teyza-premium-website-backup.json`. To roll back only while this update remains the current live release:

```powershell
node .\tools\app-first-release\premium-site-patch.cjs rollback
```

This update does not publish a new mobile app version, change App Store descriptions, enable store billing or change the Paystack key.
