# Teyza R3.11 — selectable products and each shop's live range

Flutter version **1.0.9 (19)**. Sellers can select from **184 products, 13 categories and 48 product-reference photographs**, search by name/pack size, filter categories and add up to 30 items at once. They enter each price and stock quantity themselves. Existing selections are marked Added, so a retry never resets reserved stock. The shop limit is 200 products. Sellers retain a separate custom-product flow.

The catalogue includes fruit/vegetables, bakery, dairy/eggs, meat, pantry staples, drinks, tea/coffee, snacks, household cleaning, personal care, baby care, general goods and stationery. Names include pack sizes. Photos illustrate generic product types; they do not claim a particular brand or the merchant's actual packaging. Sellers can upload replacement photography for review.

## Shopper behaviour

Only products selected for that seller appear in its public range. Approved, active shops synchronize curated selections immediately; pending shops retain private drafts. Basic listings show names/photos and availability, with Ask this shop. Public priced stock and Add-to-cart remain tied to the existing trusted pricing-plan flag. Home shelves show the selling shop alongside each item and keep seller identity when two shops select the same template. Shop pages support search, product grids and sold-out labels. They refresh on pull-to-refresh, returning from the owner workspace, resuming the app and every 30 seconds in the foreground.

## Implementation and deployment

`services/teyza-mobile-v39/catalogue.json` is the source, mirrored byte-for-byte in `apps/teyza_shopper/assets/catalogue/product-catalogue.json`. Templates contain no price, stock or owner. The authenticated `catalogue_add` API resolves names/photos itself, stores drafts and synchronizes only the actor's already approved active shop in a Firestore transaction. IDs are deterministic per template inside the owner's draft path. Public prices require `catalogueEnabled: true`; basic highlights contain no prices/quantities. Invalid/modified template drafts cannot publish a made-up item.

Draft edits/removals and shop activation/approval/plan changes are synchronized by three scoped Firestore triggers. They read current records, so delayed/retried events do not restore old quantities. Creation is atomic; duplicate adds preserve existing quantities. Native manual draft edits carry a document update-time precondition so a stale stock form cannot overwrite a newer order reservation. Custom products and uploaded replacement photos continue through administrator review; reviewed replacement images persist across stock changes.

Deploy **TEYZA_MOBILE_R311_DEPLOY_KIT.zip** with the existing `SETUP-VERIFICATION-KEY.ps1` and `DEPLOY-MOBILE.ps1`. Existing keys are preserved. The helper deploys only the named `teyza-mobile` codebase in project `business-lift-3c19c`, including the three new catalogue triggers. Health must report version **3.11.0**, `catalogueProducts: 184`. A native APK alone does not activate server synchronization. Read the included [deployment guide](../services/teyza-mobile-v39/DEPLOY.md). Keep existing private seller rules; use the R3.10 access repair when needed.

## Reference photo assets and generation prompts

Generated with the built-in imagegen tool in two calls. Final project assets are `apps/teyza_shopper/assets/catalogue/fresh-pantry.png` and `pantry-household.png`, mirrored in `services/teyza-mobile-v39/catalogue-images/`. Each is one 4-column × 6-row photographic atlas with square cells. The app crops only at render time and the public photo endpoint renders the same allowed cell to JPEG. The original eight essentials photographs remain bundled.

Shared prompt: Use case product-mockup; one Flutter retail product-photography atlas, exact 4 columns × 6 rows, 24 independent square cells, seamless white background, 2:3 canvas, fully contained products with white margins. Photorealistic studio grocery photography, real textures, soft contact shadows, consistent front three-quarter camera angle. Simple unbranded packaging. No icons, vector art, grid lines, captions, letters, prices, logos or watermarks. No overlap between cells.

First atlas rows, left to right:

1. Ripe red tomatoes; golden potatoes; brown onions; yellow bananas.
2. Red apples; whole oranges; green cabbage; carrots.
3. Spinach leaves; brown eggs in an open carton; milk jug with green cap; plain yogurt tub and spoonful.
4. Sliced white loaf; sliced brown wholemeal loaf; six bread rolls; raw chicken pieces on a white tray.
5. Raw stewing-beef cubes; coiled South African boerewors; white rice in a clear bag with loose rice; white maize meal in a cream bag with scoop.
6. Wheat flour in paper bag; white sugar in clear bag; rolled oats in clear bag; dry penne in clear bag.

Second atlas rows, left to right:

1. Baked beans in open tin; peanut-butter jar; sunflower oil bottle; tea bags and plain box.
2. Instant-coffee jar; still-water bottle; orange soft-drink bottle; crisps and plain yellow bag.
3. Bath soap and plain wrapper; washing powder and scoop; green dishwashing-liquid bottle; four toilet rolls.
4. Plain biscuits and clear packet; colourful wrapped sweets; pilchards in tomato sauce in open tin; plain tomato-sauce squeeze bottle.
5. Body-lotion pump; toothpaste tube and curl; shampoo bottle; folded disposable nappies.
6. Sanitary pads and plain wrapper; two AA batteries; green exercise notebook; blue/black ballpoint pens.

## Acceptance checks

Test as separate Spaza owner, retail owner and shopper: choose different ranges, set actual prices/stock, confirm each shop shows only its own selection and the same SKU retains different prices by seller. Check basic-plan price hiding, pending-shop privacy, duplicate-add retries, edit/delete/sold-out updates, uploaded-photo review, reservation preservation and stale stock-form rejection. Live deployment, real account/device tests and native OAuth/signing setup remain distinct from CI checks. No production inventory is seeded by this release.
