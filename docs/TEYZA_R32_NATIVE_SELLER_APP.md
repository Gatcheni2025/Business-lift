# TEYZA R3.2 — Native shop owner workspace + nearby discovery

## App behaviour
TEYZA has **Shop, Services, Delivery, Profile and Sell** tabs. Shop owners select Sell and sign in with the **same Firebase email/Google account** used on teyza.co.za. Signed-out sellers are directed to Profile to sign in; signed-in accounts without an existing seller registration are directed to the website registration.

Existing owners see their shop name, physical address, **approvalStatus**, **listingStatus**, and a private mobile product workspace. An owner can add/edit/delete a product's name, category, R price and stock. Every write uses an authenticated Firebase ID token and addresses only:
- `teyzaSellerAccounts/{uid}` for shop status (read only);
- `teyzaDraftProducts/{uid}/items/{itemId}` for products (owner read/write).
There are **no** writes to `teyzaPublicShops`, admin approvals, subscriber mandates, or payment states. A pending seller can draft stock but is not publicly visible and cannot take live customer orders. Seller product **photos**, payouts, live checkout and real orders still need dedicated secure services and are not implied by the interface.

## Firestore requirements
Keep the strict **existing R2.7 draft-product rules** in force; `docs/TEYZA_R32_SELLER_APP_FIRESTORE_RULES_ADD.txt` is a compatibility note, not a new replacement ruleset. Do not paste a broader duplicate match. Keep `teyzaSellerAccounts` owner-read rules and R3.0 public directory restrictions. Test owner read/edit vs other-account denial in Firebase Rules Playground/Emulator. Do not deploy the draft rules alone as a full ruleset.

### Compatibility with existing R2.7 website
Verify the deployed website's draft document path and schema. I inspected the R2.7 seller website ZIP and aligned the mobile product fields to its actual schema: `ownerUid`, `name`, `category`, `description`, `priceCents`, `stockQty`, `status=draft`, `createdAt` and `updatedAt`. Mobile writes use Firestore `documents:commit` server timestamp transforms to satisfy the existing strict website rules. Verify the deployed website still matches this R2.7 package before testing live cross-device edits.

## Nearby shops + Google photographs
R3.1 is stacked under this branch and fixes the app calls to `discover.teyza.co.za` PHP endpoints. This hostname is a **planned backend** and does not become live by merging this branch. Follow `docs/TEYZA_R31_GOOGLE_PLACES_AFTER_FIREBASE.md` to create an HTTPS PHP-capable subdomain on x10hosting, update DNS to its actual server IP, install the 3 PHP endpoints and configure the server-side Places API (New) key. Configure billing and quotas. Google Places photos must include the returned attributions in the Flutter UI. When the backend is unavailable, the app can attempt attributed OpenStreetMap discovery, not fabricate Google photos.

## Launch checklist
1. Firestore rules merged; verify a test seller account can read its status and save/edit/delete products.
2. Confirm a different signed-in user cannot read or write that seller's drafts.
3. Verify no draft or pending shop appears in shopper search; only server-published activated shops appear.
4. Install Android debug test build, sign in as a registered seller, use Sell tab, and verify a product persists after app restart.
5. Set up the Google Places PHP host; confirm discover endpoint returns `provider: google_places`, with `photoRef` for shops that have pictures.
6. Check an actual photo loads on device and Google Maps/photographer attributions display. Check app's nearby shops with GPS and manual area.
7. Only then distribute a release APK/AAB.

This branch does not deploy the PHP host, issue Google API credentials, approve sellers, complete mandates or activate order processing.
