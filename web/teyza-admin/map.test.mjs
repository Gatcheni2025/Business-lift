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
 assert(source.includes("googleCount.textContent='Search'"));
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
