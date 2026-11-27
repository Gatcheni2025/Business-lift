# TEYZA Shopper 1.0.0+10 — Premium Home and Navigation

Inspired by the information hierarchy in supplied retail app screenshots;
the design, logo, palette, and layout elements remain original TEYZA.

## Shopper home
- Native, animated TEYZA launch preloader. While it shows, the app restores a
  saved/GPS shopping area, loads approved shops, searches nearby directory
  results, and warms top-of-screen shop and aisle images.
- Initial load has an 11-second data cap and a 4-second image cap so lost
  mobile connectivity never leaves the customer stuck on a splash screen.
- Image widgets show stable placeholders until network images finish loading,
  without sudden blank/cut-off content. Lazy lower-page images load as scrolled.
- Large SPAZA SHOPS and OTHER RETAIL category tiles with dedicated live results.
- A nearest *known* spaza from coordinates (verified merchant or public
  directory); actual distance is approximate, never an invented delivery ETA.
- A location line directly under the nearest shop: current GPS neighbourhood
  when GPS is allowed, or clearly-labelled manually selected shopping area.
- Clean searchable shops, aisle categories, verified inventory and local tiles.

## Navigation
- Four bottom tabs: Shop, Services, Delivery, Profile.
- Chat and basket remain reachable from the top bar.
- Services tab shows only confirmed pickup, delivery, card, and cashback
  information from participating sellers. Unverified Google/OSM listings do
  not gain claimed services.
- Delivery tab lists only merchants who have opted into delivery.
  It does not claim to offer payment or tracking not yet integrated.

## Test before release
1. On a slow network, launch from a force-stop; splash must not hang and
   hero images/aisle placeholders should not pop onto a blank screen.
2. Grant GPS and deny GPS on separate tests: selected place vs actual location
   must be clearly distinguished; manually choose another area.
3. Check both SPAZA SHOPS and OTHER RETAIL and the nearest shop distance;
   no location should produce a safe fallback.
4. Verify all bottom tabs, shop details, directions, chat and basket,
   including logged-out user profile and email verification flow.
5. Test empty merchant catalogue, Google directory timeout and narrow phones.
6. Confirm versionCode 10/versionName 1.0.0 in Android output.

## Backend considerations
Existing teyza.co.za endpoints are unchanged. Registered merchants use the
public approved listing API, and public directory shops are not treated as
Teyza merchants. This UI does NOT add fulfilment, payments or background push.
