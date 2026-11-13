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
