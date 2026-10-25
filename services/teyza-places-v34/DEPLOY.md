# Teyza Places R3.6 — deploy the photo and nearby-search update

The live service checked on 23 October 2026 still reported version 3.3. Its
Durban Spaza response returned 13 places with no photo references or photo URLs.
An APK update cannot fill in photo metadata that the service does not return.

R3.6 requests actual Google Places photo resources, preserves contributor
credits, and serves the image bytes through the existing Firebase endpoint.
It searches six terms per category and, when first-page results overlap or are
sparse, follows at most two additional page tokens. Results are deduplicated,
filtered by store type and radius, and sorted by distance. The app can request
a wider radius explicitly. Ratings and opening state are shown only when Google
supplies them; merchant affiliation, stock and prices are never invented.

## Deploy from the extracted folder or repository root

Use your Firebase CLI session for **business-lift-3c19c**. This isolated config
contains only the existing `teyza-places` Functions codebase. It does not deploy
Hosting or Firestore rules.

```powershell
npm install --prefix services/teyza-places-v34
npm test --prefix services/teyza-places-v34
firebase deploy --only functions:teyza-places --config firebase.teyza-places-v34.json --project business-lift-3c19c
.\VERIFY-PLACES.ps1
```

Keep the existing `TEYZA_GOOGLE_PLACES_KEY` secret. The key must be permitted to
use Places API (New). No key belongs in the APK or repository. The selected
field mask includes photos, ratings and current opening hours; API requests
use the project's configured Google Maps billing.

If the CLI proposes deleting unrelated functions, decline and check the target
project and codebase. The source directory retains its historical `v34` name
so the existing configuration and workflow remain compatible; the health
response after this update must report **3.6**.

## Check the result

`VERIFY-PLACES.ps1` checks the service version, Spaza and Other Retail responses,
photo counts, and an actual photo response when a reference is available. A
passing APK build alone is not proof that this backend has been deployed.

Install the version **1.0.4 (14)** test APK and verify your current area, a wider
shop search, shop photographs with credits, all five bottom destinations and
both account choices. Shop Owner opens the merchant workspace; Shopper returns
to Home. Google map listings remain separate from approved Teyza catalogues.

A place with no published photo receives an illustrated shop placeholder.
Online order tracking remains unavailable; order enquiries still use the
existing participating-merchant flow.

References:
- https://developers.google.com/maps/documentation/places/web-service/place-photos
- https://developers.google.com/maps/documentation/places/web-service/text-search

This package is prepared source, not evidence of a completed live deployment.
