# Teyza R3.6 artwork and verification

The shopper's promotional image is bundled at
`apps/teyza_shopper/assets/images/grocery-basket.png`. It was generated with the
built-in image generation tool, with transparency preserved. It is generic
promotional artwork, never a substitute photograph for a named merchant.

Generation prompt:

> Use case: product-mockup. Asset type: promotional grocery basket photo cutout
> for the Teyza grocery app's cream-coloured home banner. Primary request:
> premium, photorealistic overflowing woven shopping basket with crisp green
> lettuce, tomatoes on the vine, carrots, yellow peppers, cucumber, a small
> bunch of bananas and fresh oranges, similar to a refined supermarket grocery
> campaign. Single isolated arrangement, three-quarter view, tightly composed
> but fully visible, soft natural studio light, rich fresh colours, realistic
> textures. Completely transparent background. No text, no logos, no labels,
> no people, no phones or app UI. Keep the basket and all produce entirely
> inside the image, little empty margin. This is generic promotional imagery,
> not a photograph of an actual merchant.

PT Sans Regular and Bold are bundled for reliable typography without runtime
font downloads. They are from https://github.com/google/fonts/tree/main/ofl/ptsans.
Their OFL license is included alongside the font files.

The CI UI preview uses explicitly offline fixture data to render Home, Shops
and login choices. Those fixture listings and ratings are test-only and never
seed a production directory. The screenshot check catches layout overflow;
it does not verify a live Google image response or device authentication.
Use `VERIFY-PLACES.ps1` after deployment and perform the APK device checks
listed in the deployment guide.
