# Teyza Shopper — Google Places Discovery (0.6.0)

Teyza can show **real public spaza listings near a shopper** with Google Places API (New) Text Search. Google Maps business listings are NOT Teyza merchants. Only separately approved Teyza shop owners publish actual prices, stock and checkout.

## Required Google Cloud setup (not automatic)

1. Open [Google Cloud Console](https://console.cloud.google.com/apis/library), choose a project and **enable Places API (New)**.
2. Enable a billing account for the project. Set a small quota and billing budget alerts.
3. Create a **server-side API key** restricted to **Places API (New)**; also restrict to the public outbound IP address of the Teyza hosting server when feasible. Do **not** put this key in the Flutter APK, JS, GitHub or publicly readable folders.
4. Configure on your Teyza PHP host using ONE method:
    - Set environment variable `TEYZA_GOOGLE_PLACES_API_KEY` to your key (recommended if LiteSpeed/PHP exposes environment to worker), OR
    - Create a file **outside public_html** at `private_html/teyza-config/google-places-key.php`, with contents like `<?php return 'REPLACE_WITH_YOUR_KEY';`. Set that file to owner-only `0600` or appropriate restricted mode; PHP must be able to read it. Do not upload it from this repository.
5. Upload **both** `api/shopper-discover.php` and `api/shopper-google-places-provider.php` into the live `public_html/api` directory. Public PHP file mode 0644, folders 0755. Do not replace your existing merchant products or private records.
6. Test with a public coordinate for KwaMashu (this is a **test coordinate**, not a request for your home): `https://teyza.co.za/api/shopper-discover.php?lat=-29.74&lon=30.99&area=KwaMashu`. If working, `provider` becomes `google_places` and results show `origin: google_places`; without key/if Google fails, it falls back to curated directories/OpenStreetMap.
7. Install the newly built 0.6 Android test APK; allow location to auto-search or manually select an area.

## Privacy, cost and compliance

- Android asks permission once, never silently circumvents Android controls. App sends approx. coordinates, **rounded to 2 decimals**, to Teyza's server. The server forwards them to Google Places for local discovery.
- Two targeted Google Text Searches per user request at most: `spaza shop`, `tuck shop` (second omitted when first already has 18+ results). Hard radius filtering to 11 km; short timeouts.
- The key stays server-side. An approximate rate guard limits search refreshes to 18 per IP/hour, on top of **Google Cloud hard quotas and cost alerts**.
- Google Places data is **not cached or persisted** by our provider. Place IDs alone can be stored long-term if needed in a future claimed-shop workflow. Response sets no-store.
- FieldMask requests only name, place ID, address, coordinates, map URL, basic classification and attributions. Opening hours, star ratings, photos and reviews have higher cost and/or display attribution obligations and are not included in this phase.
- Displayed listings include visible **Google Maps** attribution and deep links to Google Maps. Third-party attributions returned by Google are shown on shop detail screen.
- Your app Terms of Use and Privacy Policy must incorporate Google's requirements, including clear explanation of Places data and user location. Review [Google Places policies](https://developers.google.com/maps/documentation/places/web-service/policies).
- Google Maps listing does not mean a registered shop or available inventory. **Only approved and opted-in Teyza merchants** show published products and prices.
- Never use a non-Google map to display Google Places content.
- The app currently routes genuine order enquiries only to approved Teyza merchants with verified shopper email.

## Automated checks

The GitHub Actions `Teyza Shopper APK` workflow performs PHP syntax checks and Flutter analysis/tests, then creates debug and ARM64 APK artifacts. **No live Google Places API call is executed in CI** because the secret does not belong in CI/test builds.
