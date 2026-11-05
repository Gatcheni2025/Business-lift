# Teyza app store links — scoped website update

The Teyza homepage and `/download.html` now show Google Play and Apple App Store links.

- Google Play: https://play.google.com/store/apps/details?id=com.asiyedriver.asiye
- Apple App Store: https://apps.apple.com/za/app/id6827037733
- Approved Android testers can still use https://play.google.com/apps/testing/com.asiyedriver.asiye

The App Store app ID comes from the Teyza App Store Connect application. The Android package is the existing Play-compatible Teyza identifier in the mobile build. Public listings may not resolve until the stores finish review/rollout. Keep the website copy honest about availability.

## Publish only the three website files

From the latest R320 GitHub branch ZIP extracted on your trusted Windows computer, open PowerShell at the **inner** project root (the folder containing `DEPLOY-APP-STORES.ps1`). Use Node.js 22+, your already authenticated Firebase CLI account, and the correct Firebase project permissions:

```powershell
firebase login
.\DEPLOY-APP-STORES.ps1
```

The helper uses the pinned `tools/app-first-release` Firebase adapter and clones the current live Firebase Hosting version. It updates **only** `/index.html`, `/download.html`, and `/assets/app-first.css`; it checks that all other live hashes stay unchanged and does **not** change Hosting rewrites, headers, the admin portal, account pages, APIs, website scripts or unrelated functions. It refuses to publish over a concurrent newer live release. No `firebase deploy --only hosting` command should be used for this partial site change.

The helper saves rollback metadata in a local `teyza-store-links-backup.json`. To undo **only if** this is still the active live release, run:

```powershell
node .\tools\app-first-release\store-links-patch.cjs rollback
```

Check both https://teyza.co.za/ and https://teyza.co.za/download.html after publishing; hard-refresh if browser caching hides the buttons. Do not claim the public Google Play or App Store listing is available until confirmed in the region.
