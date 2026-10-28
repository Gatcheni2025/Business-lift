# Full seller addresses — 1.0.20 (30)

## Deploy and build

Download the `teyza-mobile-r315-deploy-kit` artifact from the checks run on `fix/teyza-seller-address-autocomplete`, extract it once into a fresh folder and open PowerShell there. `DEPLOY-MOBILE.ps1` is at its root. Run `Unblock-File -LiteralPath '.\DEPLOY-MOBILE.ps1'` and then `.\DEPLOY-MOBILE.ps1` with Node 22 and the existing authorised Firebase CLI login. The script deploys only `functions:teyza-mobile` in `business-lift-3c19c`. Hosting and Firestore rules are not replaced.

This release reuses the existing Firebase Secret Manager secret **TEYZA_GOOGLE_PLACES_KEY** used by the discovery service. Keep Places API (New) enabled and that server key restricted to Places API (New); its application restrictions must permit the Cloud Functions server. The deployment checks that the secret exists and binds it to the mobile function and coordinate refresh function. Do not replace the existing verification encryption key or put either key in the app or repository. Autocomplete and Place Details use the Google Cloud project's existing billing and quotas. Health must include `addressAutocomplete: true`, `approvalRequired: true` and `shopLocations: true`. The health flag confirms the deployed capability and key binding; a real signed-in address search is still needed to verify upstream API permissions and quotas.

After successful deployment:

```powershell
gh workflow run teyza-mobile-release.yml `
  --repo Gatcheni2025/Business-lift `
  --ref fix/teyza-seller-address-autocomplete `
  -f signed_release=true `
  -f platforms=all
```

Version is **1.0.20 (30)**. The existing 1.0.19 build can finish independently. New seller registration and address updates through the API require an address selection, so distribute the updated app after deploying. Existing shops and approval decisions are retained. A successful signed build creates store artifacts; Apple upload still uses `upload_existing_ios_run=<successful signed run ID>` on this same branch.

## Seller experience

On **Register your shop**, the seller types a street number, street and town, selects a South African address suggestion, checks the full address/map, optionally adds a shop or unit number and agrees to display the business address and position. The address, suburb, town, province/postal code when supplied, place ID and map position are saved with the pending registration in one transaction. An arbitrary street name, city result, missing position or unsupported country cannot be submitted. Editing the search text clears the previous selection. Selecting an address does not verify ownership or approve the shop; document, selfie, OTP and admin approval still apply.

**Business → Shop location** uses the same picker for existing shops, including legacy records with only a street name. **Shop profile → Change address & map location** opens this page. Saving a name/phone change no longer writes an address, so an older profile form cannot overwrite a newly selected pin. Manual coordinates are not part of this app flow. An address that is absent from Google's full-address results needs correction or support; the app does not silently save an approximate street centre. Shop/unit information is separate from the selected street address.

## Service behaviour

Autocomplete and Place Details run on the authenticated mobile backend. The APK/IPA contain no Google server key. Searches debounce by 450 ms, start after four characters and use a fresh UUID session through the details request. Suggestions are South Africa only and restricted to street addresses and premises. The suggestions show Google Maps attribution. Stale replies, account switches, errors and edited selections do not restore an old address.

The backend signs each prediction and selection, binds it to the actor UID, verifies its expiry and derives stored address/coordinates from that receipt. Client owner, area, approval, coordinates and address strings cannot override it. The direct Firestore registration fallback was removed. Signed selections expire after 30 minutes; if a form is left open longer, select the address again. No prediction lists or search history are persisted. Save requires explicit public business-location consent.

The customer-selected street address is retained as the seller's confirmed business information. Google-derived coordinates carry a 30-day expiry. `teyzaShopLocationRefresh` checks up to 100 due records every six hours and renews coordinates from the stored place ID starting on day 27. It preserves the confirmed address and approval. If renewal fails, it clears the cached coordinates, retains confirmed area details and retries later. Directory projection also refuses expired coordinates. Existing independent GPS pins keep their existing source and are not passed off as Google-derived results.

## Verification

Automated tests use simulated provider responses and synthetic shops. They cover full-address selection, street-only/foreign/missing-coordinate rejection, signed receipt tampering/expiry/UID isolation, explicit consent, atomic registration, forged-coordinate rejection, renewal/failure handling, form edits and stale account/search replies. No production seller's address or approval is changed by tests. On a physical Android/iPhone, select a real shop address and confirm its Google Maps position, save a pending shop, then verify that it appears in the right area only after the existing approval process.

Primary API references:

- https://developers.google.com/maps/documentation/places/web-service/place-autocomplete
- https://developers.google.com/maps/documentation/places/web-service/place-details
- https://developers.google.com/maps/documentation/places/web-service/place-types
- https://developers.google.com/maps/documentation/places/web-service/policies#autocomplete_for_end_user_addresses
- https://cloud.google.com/maps-platform/terms/maps-service-terms
