# Teyza Shopper — Spaza discovery, app logo and account login (0.4.0)

## Customer app
Shoppers choose their area, browse Teyza-approved shops with published actual stock, and explore other shops **found in online public directories**. These two types are explicitly separate:
- **Registered Teyza sellers**: approved and opted in, actual catalogue and published prices.
- **Found online**: publicly indexed shop name and address only, links to source and to merchant registration. No invented stock, hours, affiliation or active selling.
- **DEMO examples**: fictional sample spaza shops with illustrative grocery prices; baskets are not real transactions.

The UI uses a Teyza green adaptive launcher icon, nearby list, quick shops, grocery category shelf, basket and account.

## Login
Native shopper account supports email/password sign-up and sign-in using the current Teyza Firebase Identity Toolkit project, password-reset email, persistent encrypted session, refresh on app launch, and sign-out. Browsing does not require an account. Google/Apple native sign-in is **not** configured yet and is not presented as working.

## Location
Optional GPS (permission requested by user), Android geocoding for suburb when available, saved manual selection, and map-distance sort for shops with coordinates. The online directory search sends rounded (~1 km) coordinates to Teyza and on to OpenStreetMap's Overpass service on demand; do not present it as strictly local-only device processing. No GPS is needed to search by manually selected area. Denied permissions still allow manual selection.

## Sources
- Merchant API: `https://teyza.co.za/api/shopper-catalog.php`
- Online discovery API: `https://teyza.co.za/api/shopper-discover.php` with a curated set of public listings plus cached OpenStreetMap convenience shops.
- OSM attribution © OpenStreetMap contributors (ODbL). Online listings are unclaimed and may be outdated.
- Source URLs are provided inside the directory entries. Curated names are from public business listings; not claimed as endorsements or partners.

## Deployment
1. Deploy PHP endpoint `api/shopper-discover.php` into live hosting public_html/api (permissions 0644, folders 0755).
2. Ensure existing `api/shopper-catalog.php` and merchant publishing settings are live.
3. Build app from `apps/teyza_shopper`, or download debug / ARM64 test APK from the CI artifacts.
4. Verify GPS permission, manual area, online directory search, account create/login/reset, logo, shop prices and demo gating on Android.
5. Never show online-directory shops as selectable checkout merchants until they register and publish real stock.

A debug test build or ARM64 build signed with CI test keys is NOT Play Store ready. Production requires final release keystore, merchant syncing, real-device tests, account/privacy disclosures, abuse throttling and a compliant map-data source/service agreement.
