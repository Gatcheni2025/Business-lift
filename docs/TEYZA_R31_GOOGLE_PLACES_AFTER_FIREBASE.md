# TEYZA R3.1: Restore Google-discovered shops and photos after Firebase migration

## Why the mobile app lost shops and images
The seller website now runs on Firebase Hosting at `teyza.co.za`. Firebase Hosting serves static files but does **not** execute the old `/api/shopper-discover.php` or `/api/shopper-place-photo.php` endpoints. The Flutter app was calling these old URLs. Separately, the new Firestore `teyzaPublicShops` directory intentionally only includes activated Teyza merchant accounts, and may correctly contain zero entries before approval and payment integration.

Google Maps public listings are NOT Teyza merchants: no stock, checkout, or approval claims.

## Correct architecture
* `https://teyza.co.za` — Firebase-hosted Teyza seller website.
* `https://discover.teyza.co.za` — separate PHP-capable HTTPS subdomain, hosted on x10hosting (not on Firebase). Contains only the public discovery and photo-proxy endpoints.
* `teyzaPublicShops` — separately controlled Firestore directory of approved/activated Teyza merchants.
* Flutter shopper app uses BOTH discovery routes, but never treats external Google map results as registered Teyza shops.

## 1. DNS and PHP host (admin action)
In DirectAdmin, create a subdomain `discover.teyza.co.za` and enable valid HTTPS. In GoDaddy DNS, create an A record with name `discover` pointing to the **actual IPv4 of the x10hosting PHP server**, taken from DirectAdmin. DO NOT point this subdomain to Firebase `199.36.158.100`, and do not alter working apex `@`, `www`, or MX records.

Place the 3 PHP files from the GitHub Actions `teyza-google-places-php-service` ZIP into the subdomain's **document root** at `public_html/api/`:
* `shopper-discover.php`
* `shopper-google-places-provider.php`
* `shopper-place-photo.php`

PHP must have the curl and mbstring extensions enabled. Configure a restricted server-side Places API (New) key in the host's **environment** as `TEYZA_GOOGLE_PLACES_API_KEY`, or in the `teyza-config/google-places-key.php` file **outside** public_html at the path the provider looks for (relative to your subdomain's `api` folder). Do not store that file in the GitHub repository, Firebase Hosting directory or downloaded APK. Never share the API key in chat.

In Google Cloud, enable **Places API (New)** and billing; restrict API access and apply conservative server-side quotas and billing budget alerts. Check photo quotas separately. Ensure Google Maps attribution and photograph author credits are displayed according to Google's usage policies.

## 2. Smoke tests
After creating the subdomain, open:
```
https://discover.teyza.co.za/api/shopper-discover.php?lat=-29.74&lon=30.99&category=spaza
```
The JSON should contain `ok: true` and `entries`. When Google Places succeeds, `provider` should say `google_places`, and result entries have `origin: google_places` and possibly `photoRef`. Not every Google listing has a photograph. Copy a returned `photoRef` into the test photo endpoint, URL-encoding it:
```
https://discover.teyza.co.za/api/shopper-place-photo.php?ref=<encodedPhotoRef>
```
Verify a real image appears, and an expired/missing reference does not expose the secret. The backend must return `no-store` for Places content.

If the search JSON lists `public_directory` or `openstreetmap` rather than `google_places`, Google is not connected yet. Check the server-side key, Google Cloud project billing, Places API (New), rate limits, PHP curl/mbstring, and PHP error logs. These are NOT issues with Firestore approval rules.

## 3. Android update
The Flutter app has been updated to use `https://discover.teyza.co.za` for the Places discovery and photo APIs. For a different secure PHP hostname, build with:
```
flutter build apk --release --dart-define=TEYZA_PLACES_BACKEND_URL=https://discover.teyza.co.za
```
The backend URL is not secret; the Google Places API key MUST remain on the server.

If the PHP host is temporarily offline and the user has selected an SA location, the app makes a small rate-limited on-device OpenStreetMap Overpass lookup to show **public map** listings. These have no Google images and are clearly marked as OpenStreetMap, never as Google or Teyza merchants. Network and rate limits may also affect fallback results. A dedicated backend is required for scale.

## 4. Mobile QA checklist
1. Sign in (optional for discovery), grant approximate location or select KwaMashu.
2. Open Spaza Shops, inspect public Google results, make sure Google Maps attribution and Google photo credits render.
3. Open photo with valid returned `photoRef`; a listing with no photo should show a fallback graphic.
4. Switch to Variety & Wholesale; results must remain category-specific.
5. Check registered Teyza Shops separately. Pending merchant accounts remain hidden.
6. Disable PHP backend temporarily and confirm OSM-only fallback is labelled correctly; do not claim those are Google results.
7. Confirm chat/orders never initiate against unclaimed public Google businesses.
8. Check Google billing quotas and logs after test.

## Status
This branch changes the app's code and includes CI tests. **It does not create the DNS subdomain, install private Google API key, enable Google billing or deploy PHP to hosting.** An APK built from the patch alone will not magically have Google Places access until those steps are completed.
