'use strict';
const ROOT = 'https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaPlaces';
const FIELD_MASK = ['places.id', 'places.displayName', 'places.formattedAddress',
  'places.location', 'places.googleMapsUri', 'places.primaryType', 'places.types',
  'places.photos', 'places.businessStatus', 'places.rating', 'places.userRatingCount',
  'places.currentOpeningHours', 'nextPageToken'].join(',');
const QUERIES = {
  spaza: ['spaza shop', 'tuck shop', 'mini market', 'general dealer',
    'convenience store', 'grocery supermarket'],
  variety: ['China Mall', 'shopping centre', 'wholesale cash and carry',
    'variety store', 'retail shopping mall', 'supermarket']
};
const clamp = (n, a, b) => Math.min(b, Math.max(a, n));
function num(value, low, high) {
  if (value == null || String(value).trim() === '' || Array.isArray(value)) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= low && n <= high ? n : null;
}
const category = value => ['variety', 'retail', 'other', 'other retail', 'other-retail']
  .includes(String(value).toLowerCase()) ? 'variety' : 'spaza';
function distance(a, b, c, d) {
  const rad = Math.PI / 180, delta = (c - a) * rad, lon = (d - b) * rad;
  const f = Math.sin(delta / 2) ** 2 + Math.cos(a * rad) * Math.cos(c * rad) * Math.sin(lon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(clamp(f, 0, 1)));
}
function photoResource(value) {
  if (typeof value !== 'string') return null;
  const name = value.replace(/\/media$/, '');
  return /^places\/[A-Za-z0-9_-]{4,256}\/photos\/[A-Za-z0-9_-]{4,4096}$/.test(name) ? name : null;
}
function kindMatch(place, kind) {
  const name = String(place.displayName?.text || '').toLowerCase();
  const types = new Set([place.primaryType, ...(place.types || [])]);
  if (kind === 'spaza') return /spaza|tuck.?shop|mini.?market|convenience|grocer|general dealer|corner shop|supermarket|superette|food store/.test(name) ||
    ['convenience_store', 'grocery_store', 'supermarket', 'food_store'].some(t => types.has(t));
  if (/spaza|tuck.?shop|tyres?|restaurant|takeaway|auto spares|motor spares|printing|salon/.test(name)) return false;
  return /china.?mall|mall|shopping|wholesale|cash.?(&|and).?carry|retail|supermarket|variety|bazaar|clothing|fashion|furniture|homeware|department/.test(name) ||
    ['shopping_mall', 'department_store', 'supermarket', 'clothing_store', 'home_goods_store', 'wholesaler'].some(t => types.has(t));
}
function mapResult(place, kind, lat, lon) {
  const la = num(place.location?.latitude, -90, 90), lo = num(place.location?.longitude, -180, 180);
  if (!place.id || la === null || lo === null || place.businessStatus === 'CLOSED_PERMANENTLY') return null;
  const photo = (place.photos || []).find(p => photoResource(p.name));
  const ref = photo ? photoResource(photo.name) : null;
  return {
    id: 'google-' + place.id, placeId: place.id,
    name: place.displayName?.text || 'Local shop', area: 'Nearby',
    address: place.formattedAddress || '', latitude: la, longitude: lo,
    distanceKm: +distance(lat, lon, la, lo).toFixed(2),
    origin: 'google_places', shopCategory: kind, categorizationVerified: true,
    primaryType: place.primaryType || '', types: place.types || [],
    rating: num(place.rating, 0, 5),
    ratingCount: num(place.userRatingCount, 0, Number.MAX_SAFE_INTEGER),
    openNow: typeof place.currentOpeningHours?.openNow === 'boolean' ? place.currentOpeningHours.openNow : null,
    sourceUrl: place.googleMapsUri || 'https://www.google.com/maps/search/?api=1&query=' +
      encodeURIComponent(place.displayName?.text || 'shop') + '&query_place_id=' + encodeURIComponent(place.id),
    claimUrl: 'https://teyza.co.za/?auth=register',
    photoRef: ref,
    photoUrl: ref ? ROOT + '/shopper-place-photo.php?ref=' + encodeURIComponent(ref) + '&w=720' : null,
    photoAttributions: (photo?.authorAttributions || []).map(a => ({
      name: a.displayName || 'Google Maps contributor', url: a.uri || ''})),
    attributions: [{name: 'Google Maps', url: 'https://maps.google.com/'}],
    isTeyzaMerchant: false
  };
}
async function searchPage({key, text, lat, lon, radius, pageToken, fetchImpl}) {
  const response = await fetchImpl('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': FIELD_MASK},
    body: JSON.stringify({textQuery: text, pageSize: 20, languageCode: 'en', regionCode: 'ZA',
      locationBias: {circle: {center: {latitude: lat, longitude: lon}, radius}},
      ...(pageToken ? {pageToken} : {})}),
    signal: AbortSignal.timeout(8500)
  });
  if (!response.ok) throw new Error('Places search HTTP ' + response.status);
  const data = await response.json();
  return {places: Array.isArray(data.places) ? data.places : [], nextPageToken: data.nextPageToken};
}
async function discover({key, lat, lon, radius, kind, fetchImpl = fetch}) {
  const texts = QUERIES[kind];
  const first = await Promise.allSettled(texts.map(text => searchPage({key, text, lat, lon, radius, fetchImpl})));
  const unique = new Map();
  function merge(places) {
    for (const p of places) {
      if (!kindMatch(p, kind)) continue;
      const entry = mapResult(p, kind, lat, lon);
      if (!entry || entry.distanceKm > radius / 1000) continue;
      if (!unique.has(entry.id) || (!unique.get(entry.id).photoRef && entry.photoRef)) unique.set(entry.id, entry);
    }
  }
  for (const result of first) if (result.status === 'fulfilled') merge(result.value.places);
  if (first.every(result => result.status === 'rejected')) throw new Error('Places search unavailable');
  // At most two extra pages when the first pages overlap heavily or are sparse.
  // Pagination retains the exact parameters of the original request.
  let partial = first.some(result => result.status === 'rejected');
  if (unique.size < 30) {
    const pages = first.flatMap((result, index) => result.status === 'fulfilled' && result.value.nextPageToken ?
      [{text: texts[index], pageToken: result.value.nextPageToken}] : []).slice(0, 2);
    const extra = await Promise.allSettled(pages.map(page => searchPage({key, lat, lon, radius, fetchImpl, ...page})));
    for (const result of extra) {
      if (result.status === 'fulfilled') merge(result.value.places);
      else partial = true;
    }
  }
  const entries = [...unique.values()].sort((a, b) => a.distanceKm - b.distanceKm ||
    Number(Boolean(b.photoRef)) - Number(Boolean(a.photoRef))).slice(0, 100);
  return {ok: true, version: '3.6', provider: 'google_places', category: kind, entries,
    returned: entries.length, photoCount: entries.filter(p => p.photoRef).length,
    searchRadiusKm: radius / 1000,
    attributions: [{name: 'Google Maps', url: 'https://maps.google.com/'}],
    warning: partial ? 'Partial Google Places results' : null};
}
function trustedPhotoUri(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      (url.hostname === 'googleusercontent.com' || url.hostname.endsWith('.googleusercontent.com') ||
       url.hostname === 'ggpht.com' || url.hostname.endsWith('.ggpht.com')) ? url : null;
  } catch (_) { return null; }
}
async function fetchPhoto({key, ref, width = 720, fetchImpl = fetch}) {
  const resource = photoResource(ref);
  if (!resource) throw new Error('Invalid photo resource');
  const info = await fetchImpl('https://places.googleapis.com/v1/' + resource +
    '/media?maxWidthPx=' + width + '&skipHttpRedirect=true', {
    headers: {'X-Goog-Api-Key': key}, signal: AbortSignal.timeout(8500)
  });
  if (!info.ok) { const error = new Error('Photo unavailable'); error.status = info.status; throw error; }
  const uri = trustedPhotoUri((await info.json()).photoUri);
  if (!uri) throw new Error('Invalid image host');
  // Return image bytes through Firebase so web and native clients share a photo
  // endpoint. Never forward the server API key to the image host.
  const image = await fetchImpl(uri.toString(), {redirect: 'error', signal: AbortSignal.timeout(8500)});
  if (!image.ok || !/^image\/(jpeg|png|webp|avif)(;|$)/i.test(image.headers.get('content-type') || '')) throw new Error('Invalid image response');
  if (Number(image.headers.get('content-length')) > 8 * 1024 * 1024) throw new Error('Photo too large');
  const bytes = Buffer.from(await image.arrayBuffer());
  if (bytes.length > 8 * 1024 * 1024) throw new Error('Photo too large');
  return {bytes, contentType: image.headers.get('content-type')};
}
module.exports = {ROOT, FIELD_MASK, num, category, photoResource, kindMatch, mapResult, discover, trustedPhotoUri, fetchPhoto};
