# Approved shops and nearby discovery — 1.0.19 (29)

For version **1.0.20 (30)** and later, follow [Address autocomplete](TEYZA_ADDRESS_AUTOCOMPLETE.md) for deployment and address entry. Full address selection now replaces the manual street/suburb/coordinate inputs described in this historical guide. The approval requirements below remain in effect.

## Deploy first

Extract the GitHub deployment artifact once. `DEPLOY-MOBILE.ps1` is now at its root; there is no inner ZIP to open. Run it in PowerShell with the existing Firebase login and Node 22. Keep the existing verification encryption key. The script deploys only the `teyza-mobile` codebase and checks `approvalRequired: true` and `shopLocations: true` in the live health response. No hosting or Firestore rules replacement is included.

Then build signed Android/iOS from `fix/teyza-shop-publication` with `teyza-mobile-release.yml`, `signed_release=true`, `platforms=all`. Version is **1.0.19 (29)**. The signed-build gate requires this backend first. The iOS IPA still needs the workflow's explicit `upload_existing_ios_run=<signed run ID>` step before Apple processes it for TestFlight.

## Approval is required to publish

Completing document, selfie and OTP setup saves a registration for review; it no longer authorizes selling. Pending registrations return `pending_approval` / `pending_review`, remain outside the shopper directory and cannot accept new orders, open/send new shop conversations or serve a public shop-front photo. Admin approval publishes a completed registration in the same transaction, including products, services, hours, storefront photo and saved location. Approval before setup completion stays private until setup is completed. A missing public listing is rebuilt from the completed private registration at approval.

The seller dashboard shows Awaiting approval, Shop setup needed, Listing is paused or Shop is live. The live label requires approval and publication. Photo/document replacements pause publication for a new review. Phone changes invalidate the previous phone proof. An unrelated administrator hold is preserved. Existing confirmed orders and reserved stock are retained; approved replacement product photos survive a pause and reapproval. This does not grant a paid subscription or collect any money.

The public directory is now a read-only server projection that checks the current seller account and review/setup state. It exposes only public business fields and approved listings. It does not fall back to an unfiltered Firestore query. Consumer pagination continues even if a page contains only historical, now-ineligible records.

## Shop location

In the seller app open **Business → Shop location**, or use the location prompt on the dashboard or registration checklist. At the shop, select **Use my shop’s current location**, check the map, enter/confirm the street address, suburb and town/city, and explicitly agree to show the business location. Manual coordinates are also supported. Saving a pin never approves or publishes a pending seller.

The delivery-planning screen **Areas around me** does not set the public shop pin. Nearby results use the saved pin and the selected search radius. Where no usable pin exists, structured suburb/city/address matching is used; a shop's name alone does not establish its location. Zero/zero is treated as an unset pin. Changing the registered street address invalidates an old saved pin until it is confirmed again. Approved shops without a pin can still be found in the all-Teyza directory; local visibility depends on matching area information.

## Existing records

Owner refresh and the existing catalogue/account triggers reconcile publication state. A bounded one-time scheduled repair also covers inactive owners: `teyzaPublicationRepair` checks at most 100 seller accounts per invocation, resumes from a private cursor and records completion. It runs every ten minutes until the pass is complete; afterward it reads only its completion checkpoint. It never grants approval and does not lift unrelated administrative holds. Public directory, order and chat eligibility checks reject stale active-but-unapproved records immediately after backend deployment, independently of repair progress.

The earlier deployment guides included in the kit describe historical releases. This guide supersedes their statements that setup alone enables selling. Device OAuth, native location permissions and push delivery still require real-device checks. No production shop location or approval is fabricated by the automated tests.
