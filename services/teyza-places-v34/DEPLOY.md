# Teyza Google Places R3.4 (live Cloud Function upgrade)

This source is an isolated **Firebase Functions v2** codebase. It is proposed
as a replacement for the existing `teyzaPlaces` function **after** reviewing
the existing R33.1 Cloud Functions code on your PC.

It fixes the observed live R33 response with non-existent `photoRef` values by
requesting `places.photos` in the Places (New) field mask. It also searches
China Mall / shopping centres / wholesalers for Other Retail, returns real
place coordinates sorted by distance, keeps Google's photo-credit attribution,
and never invents prices, stock, delivery or affiliation.

## Deploy (only after preview tests and confirming project)
From the repository root:
```powershell
npm install --prefix services/teyza-places-v34
firebase deploy --only functions:teyza-places --config firebase.teyza-places-v34.json --project business-lift-3c19c
```

The Firebase secret `TEYZA_GOOGLE_PLACES_KEY` is already configured in the
project according to the 22 October PowerShell log. DO NOT put it in the app.
If your Firebase CLI offers to delete unrelated functions, **answer no** and
verify your current deployed function list before proceeding.

Test:
```powershell
curl.exe "https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaPlaces/health"
curl.exe "https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaPlaces/shopper-discover.php?lat=-29.74&lon=30.99&category=spaza"
curl.exe "https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaPlaces/shopper-discover.php?lat=-29.74&lon=30.99&category=variety"
```

Photos are shown only when Google Places includes a photo for the shop.
Where a shop has no photo, the app displays a premium bundled illustration,
not a misleading photo of a different shop. Photo credits remain visible.

Google requires Places API (New), Places Photos, billing and permissions.
Location permission remains optional; users can pick an area in the shopper app.

This is code prepared for review, not evidence of a live deployment.
