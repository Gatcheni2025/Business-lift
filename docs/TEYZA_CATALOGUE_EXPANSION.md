# Expanded seller catalogue — 1.0.21 (31)

The catalogue now has **378 distinct pack-size choices**, up from 184, with **96 illustrative product photo types** across 14 categories. Existing template IDs, product names, categories, pack sizes and photos are retained. The 194 additional choices include the requested baby care, snacks, dairy, meat, pantry, household, drinks and stationery products, plus pet care and other daily essentials.

All 36 requested search terms are covered, including baby powder milk (stage-specific formula powder), baby nappies, fresh milk, dishwashing sponges, Vaseline and Aromat. Useful extras include mayonnaise, vinegar, salt, instant noodles, tomato paste, condensed milk, bleach, refuse bags, deodorant, baby shampoo, cotton wool, pantyliners, dishcloths, muffins, dog food and cat food. Existing milk, sweets, yogurt and nappy listings remain available alongside the new choices. Formula stages and pack sizes must match the actual product stocked; templates do not provide feeding advice or health claims.

## How sellers add the products

Open **Products → Choose products**, search by product name or select a category, choose the appropriate pack sizes, then enter the shop's actual price per pack and number of packs. Up to 30 choices can be added in a batch. The existing 200-product shop limit is retained. New global choices do not create stock in any shop automatically, do not change existing prices or quantities, and do not approve or publish pending sellers. Approved shops publish only products the owner selects. Existing custom products and reviewed owner photos remain supported.

Search understands words in a different order, common aliases and unit spacing, for example `baby powder milk`, `milk 1L fresh` and `yoghurt`. The app uses an exact template-to-photo lookup, so a branded template such as `vaseline-50-ml` receives the petroleum jelly reference photo. The larger catalogue uses lazy lists on narrow screens.

## Deploy and build

This release includes the seller approval and address autocomplete updates. Download the latest `teyza-mobile-r315-deploy-kit` artifact from the checks run on **feature/teyza-catalogue-expansion**, extract it once into a fresh folder, then run in PowerShell with Node 22 and the existing authorised Firebase CLI login:

```powershell
Unblock-File -LiteralPath '.\DEPLOY-MOBILE.ps1'
.\DEPLOY-MOBILE.ps1
```

The deployment keeps the existing verification encryption key and Google Places server secret, and updates only the `teyza-mobile` Functions codebase. It does not replace Hosting or Firestore rules. It checks that the deployed catalogue revision, product count and photo count match the included JSON, as well as approval/location/address capabilities. Expected health is `catalogueRevision: 2`, `catalogueProducts: 378`, `cataloguePhotos: 96`, `approvalRequired: true`, `shopLocations: true` and `addressAutocomplete: true`.

After deployment succeeds:

```powershell
gh workflow run teyza-mobile-release.yml `
  --repo Gatcheni2025/Business-lift `
  --ref feature/teyza-catalogue-expansion `
  -f signed_release=true `
  -f platforms=all
```

Version is **1.0.21 (31)**. The signed build gate requires the expanded backend first. Install the new app to obtain the expanded offline picker; the server must also have the matching template IDs and images. A successful build saves store files to GitHub. Apple upload still uses `upload_existing_ios_run=<successful signed run ID>` on this branch.

## Data and image maintenance

`services/teyza-mobile-v39/catalogue.json` is mirrored byte-for-byte in `apps/teyza_shopper/assets/catalogue/product-catalogue.json`. `scripts/expand_teyza_catalogue.py` adds the definitions and generates the app's exact photo/atlas metadata. It is idempotent and refuses to rename an existing ID's product identity. `scripts/verify_teyza_catalogue.py` checks IDs, labels, image paths, image bounds, all four atlas copies and the generated mappings. Templates carry no price, stock, owner or approval.

Two new project assets were created with the built-in image generation tool: `apps/teyza_shopper/assets/catalogue/food-drinks-expanded.png` and `care-household-expanded.png`. Identical copies are in `services/teyza-mobile-v39/catalogue-images/`. Existing atlases are unchanged. The new photos are illustrative product-type references with generic packaging, including the reference images used for named-brand templates; they are not official manufacturer pack photography. The picker and accessibility labels identify them as illustrative. Sellers can continue to submit actual product photos for review. Full prompts and asset paths are recorded in [Image provenance](TEYZA_CATALOGUE_IMAGES.md).

The Aromat Original 75 g/200 g and Vaseline Blue Seal Original 50 ml/100 ml/250 ml/450 ml pack sizes were checked against the manufacturers' South African pages:

- https://www.whatsfordinner.co.za/aromat/products/seasoning.html
- https://www.vaseline.com/za/en/p/vaseline-jelly-original.html/00000060014399

## Verification

Catalogue checks cover all requested search terms, exact photo lookup for differently named template IDs, valid local image crops, shared app/server data and existing price/stock isolation. All reference images are rendered through the same public JPEG renderer used by the service. App tests capture the new baby care and food picker states. Tests use synthetic shops; no real seller inventory, price or approval is changed. After installing, add a new product with a real seller's chosen price/stock and check it from a shopper account, including an out-of-stock item and a pending shop.
