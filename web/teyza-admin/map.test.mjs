import test from 'node:test';
import assert from 'node:assert/strict';
import {groupGooglePlaces,mapCentreCoordinates} from './public/js/teyza-admin-map.mjs';

test('Google-only nearby shops are not duplicated when the Google place ID is claimed by Teyza',()=>{
 const registered=[{googlePlaceId:'google12345',name:'Linked shop'},{name:'Unlinked'}];
 const places=[
  {placeId:'google12345',latitude:-29.9,longitude:31.0,name:'Same Google listing'},
  {placeId:'google99999',latitude:-29.8,longitude:31.1,name:'Google only'},
  {placeId:'google99999',latitude:-29.8,longitude:31.1,name:'Duplicate page'},
  {placeId:'invalid',latitude:null,longitude:31.2,name:'Missing pin'}
 ];
 assert.deepEqual(groupGooglePlaces(places,registered).map(p=>p.placeId),['google99999']);
});

test('Admin Google Maps browser loader reports actionable credential errors without exposing keys',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('./public/js/teyza-admin-map.mjs',import.meta.url),'utf8');
 assert(source.includes('window.gm_authFailure'));
 assert(source.includes('Maps JavaScript API'));
 assert(source.includes('https://teyza.co.za/*'));
 assert(source.includes('AIza[A-Za-z0-9_-]{30,80}'));
 assert(source.includes('window.gm_authFailure=previousFailure'));
 assert(!source.includes('TEYZA_GOOGLE_PLACES_KEY'));
});

test('Google Maps centre is safely validated before a local Places search',()=>{
 assert.deepEqual(mapCentreCoordinates({getCenter:()=>({lat:()=>-29.85,lng:()=>31.02})}),{lat:-29.85,lon:31.02});
 assert.deepEqual(mapCentreCoordinates({getCenter:()=>({lat:-26.2,lng:28.05})}),{lat:-26.2,lon:28.05});
 assert.equal(mapCentreCoordinates({getCenter:()=>undefined}),null);
 assert.equal(mapCentreCoordinates({getCenter:()=>({lat:()=>undefined,lng:()=>31})}),null);
 assert.equal(mapCentreCoordinates({getCenter:()=>({lat:()=>40,lng:()=>31})}),null);
 assert.equal(mapCentreCoordinates(null),null);
});
test('Map persistence is opt-in and supports local removal of the restricted browser key',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('./public/js/teyza-admin-map.mjs',import.meta.url),'utf8');
 assert(source.includes('remember.checked'));
 assert(source.includes('localStorage.setItem(KEY_STORAGE,value)'));
 assert(source.includes('localStorage.removeItem(KEY_STORAGE)'));
 assert(source.includes('mapCentreCoordinates(map)'));
 assert(!source.includes('localStorage.setItem(KEY_STORAGE,key.value)'));
});

test('Premium national map uses Teyza-hosted geography, never volunteer OSM tiles, and ignores credential autofill',async()=>{
 const {readFileSync}=await import('node:fs');
 const {createRequire}=await import('node:module');
 const premium=readFileSync(new URL('./public/js/teyza-premium-coverage.mjs',import.meta.url),'utf8');
 assert(premium.includes("'/assets/teyza-southern-africa-land.geojson'"));
 assert(premium.includes('leaflet.geoJSON(boundaries'));
 assert(!premium.includes('tile.openstreetmap.org'));
 assert(!premium.includes('leaflet.tileLayer('));
 assert(premium.includes("raw.includes('@')"));
 assert(premium.includes("term.value.includes('@')"));
 const land=JSON.parse(readFileSync(new URL('./public/assets/teyza-southern-africa-land.geojson',import.meta.url),'utf8'));
 assert.equal(land.type,'FeatureCollection');
 assert(land.features.some(f=>f.properties.name==='South Africa'));
 assert(land.features.every(f=>['Polygon','MultiPolygon'].includes(f.geometry.type)));
});

test('National coverage details are sourced from real Teyza shop fields, without guessing WhatsApp or agent status',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('./public/js/teyza-premium-coverage.mjs',import.meta.url),'utf8');
 assert(source.includes("['WhatsApp opt-in',readable(p.whatsappOptIn)]"));
 assert(source.includes("['Verified',readable(p.verified)]"));
 assert(source.includes("['Registered by agent',agentName(p)||'Not attributed']"));
 assert(source.includes("const readable=(v)=>v===true?'Yes':v===false?'No':'Not provided'"));
 assert(source.includes("counts.set(agentName(p)"));
 assert(source.includes("googleCount.textContent=result.state==='loading'"));
 assert(source.includes("point.bindPopup(shopDetail(p))"));
});

test('Combined Google map filters claimed listings and preserves explicit unknown statuses',async()=>{
 const {unmatchedGoogle}=await import('./public/js/teyza-combined-coverage.mjs');
 const items=[{placeId:'linked',name:'Claimed',latitude:-29.8,longitude:31},
  {placeId:'unclaimed',name:'Unclaimed',latitude:-29.7,longitude:31.1},
  {placeId:'unclaimed',name:'Duplicate',latitude:-29.7,longitude:31.1},
  {placeId:'bad',latitude:0,longitude:0}];
 assert.deepEqual(unmatchedGoogle(items,[{googlePlaceId:'linked'}]).map(p=>p.placeId),['unclaimed']);
 const {readFileSync}=await import('node:fs');
 const code=readFileSync(new URL('./public/js/teyza-combined-coverage.mjs',import.meta.url),'utf8');
 assert(code.includes('Google listing only'));
 assert(code.includes("['WhatsApp opted in',p._googleOnly?'Unknown':human(p.whatsappOptIn)]"));
 assert(code.includes("componentRestrictions:{country:'ZA'}"));
 assert(code.includes("url.searchParams.set('radius','20000')"));
 assert(!code.includes('localStorage.setItem('));
 const premium=readFileSync(new URL('./public/js/teyza-premium-coverage.mjs',import.meta.url),'utf8');
 assert(premium.includes('combined.panel'));
 assert(premium.includes('combined.setShops(filtered)'));
});

test('National map loads automatically and has no visible manual API key field',async()=>{
 const {readFileSync}=await import('node:fs');
 const combined=readFileSync(new URL('./public/js/teyza-combined-coverage.mjs',import.meta.url),'utf8');
 const premium=readFileSync(new URL('./public/js/teyza-premium-coverage.mjs',import.meta.url),'utf8');
 const admin=readFileSync(new URL('./public/js/teyza-admin-map.mjs',import.meta.url),'utf8');
 assert(combined.includes("const CONFIG='/assets/teyza-maps-config.json'"));
 assert(combined.includes("void")===false || combined.includes('startMap'));
 assert(combined.includes('activate:()=>startMap()'));
 assert(!combined.includes("key.type='password'"));
 assert(premium.includes('fallback.open=true'));
 assert(premium.includes('void combined.activate()'));
 assert(admin.includes('panel.append(premium.panel);'));
 assert(!admin.includes('panel.append(premium.panel,advanced)'));
});

test('Google Places onboarding search separates matched Teyza IDs from potential leads and preserves provenance',async()=>{
 const {matchGoogle}=await import('./public/js/teyza-combined-coverage.mjs');
 const found=[{placeId:'linked',latitude:-29.8,longitude:31,name:'Verified shop'},
  {placeId:'prospect',latitude:-29.9,longitude:31.1,name:'Nearby shop'},
  {placeId:'prospect',latitude:-29.9,longitude:31.1,name:'Duplicate'},
  {placeId:'outside',latitude:40,longitude:31,name:'Outside South Africa'}];
 const {linked,potential}=matchGoogle(found,[{googlePlaceId:'linked',verified:true}]);
 assert.deepEqual(linked.map(p=>p.placeId),['linked']);
 assert.deepEqual(potential.map(p=>p.placeId),['prospect']);
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('./public/js/teyza-combined-coverage.mjs',import.meta.url),'utf8');
 assert(source.includes("['spaza','variety','wholesale']"));
 assert(source.includes("Find shops needing Teyza registration"));
 assert(source.includes('No matching published Teyza listing'));
 assert(source.includes('Promise.allSettled(kinds.map'));
 assert(source.includes("url.searchParams.set('category',kind)"));
 assert(source.includes('potential leads'));
 assert(!source.includes('localStorage.setItem('));
});

test('Google listings KPI tracks local live results and failed searches without inventing a national count',async()=>{
 const {readFileSync}=await import('node:fs');
 const combined=readFileSync(new URL('./public/js/teyza-combined-coverage.mjs',import.meta.url),'utf8');
 const premium=readFileSync(new URL('./public/js/teyza-premium-coverage.mjs',import.meta.url),'utf8');
 assert(combined.includes("onDiscovery?.({state:'loading'"));
 assert(combined.includes("onDiscovery?.({state:'error'"));
 assert(combined.includes('searchCompleted=true;searchPending=false;render()'));
 assert(combined.includes('void searchArea(true)'));
 assert(combined.includes("map.setCenter({lat:-29.8587,lng:31.0218})"));
 assert(premium.includes("result.state==='ready'?String(result.potential)"));
 assert(!premium.includes("googleCount.textContent='Search'"));
});

test('Google Places categories show independently counted spaza, business and wholesale markers',async()=>{
 const {categoryCounts,matchGoogle}=await import('./public/js/teyza-combined-coverage.mjs');
 const places=[
  {placeId:'a',latitude:-29.8,longitude:31.0,shopCategory:'spaza'},
  {placeId:'b',latitude:-29.8,longitude:31.1,shopCategory:'variety'},
  {placeId:'c',latitude:-29.8,longitude:31.2,shopCategory:'wholesale'},
  {placeId:'c',latitude:-29.8,longitude:31.2,shopCategory:'wholesale'}
 ];
 const matched=matchGoogle(places,[]);
 assert.deepEqual(categoryCounts(matched.potential),{spaza:1,variety:1,wholesale:1});
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('./public/js/teyza-combined-coverage.mjs',import.meta.url),'utf8');
 assert(source.includes("category.value='all'"),'initial area discovery must include all three types');
 assert(source.includes("['variety','Other businesses']"));
 assert(source.includes("['wholesale','Wholesalers']"));
 assert(source.includes("layers[p.shopCategory]?.checked!==false"));
 assert(source.includes("p.shopCategory==='wholesale'?'#a563d7'"));
 assert(source.includes("p.shopCategory==='variety'?'#ed8b27'"));
});

test('Contact phone status distinguishes unchecked, pending, failed and confirmed missing',async()=>{
 const {contactPhoneState,contactLookupIssue}=await import('./public/js/teyza-combined-coverage.mjs');
 const p={placeId:'SyntheticPlace1234'};
 assert.equal(contactPhoneState(p),'unchecked');
 assert.equal(contactPhoneState(p,{state:'loading'}),'loading');
 assert.equal(contactPhoneState(p,{state:'error'}),'failed');
 assert.equal(contactPhoneState(p,{state:'ready',phone:'  '}),'missing');
 assert.equal(contactPhoneState(p,{state:'ready',phone:'031 555 0100'}),'number');
 assert.equal(contactPhoneState({...p,phone:'031 555 0100'},{state:'error'}),'number');
 assert.equal(contactPhoneState({...p,phone:'031 555 0100'},{state:'ready',phone:''}),'missing');
 assert.match(contactLookupIssue(403),/trial allowance/);
 assert.match(contactLookupIssue(429),/limit reached/);
 assert.match(contactLookupIssue(502),/HTTP 502/);
});
