import test from 'node:test';
import assert from 'node:assert/strict';
import {groupGooglePlaces} from './public/js/teyza-admin-map.mjs';

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
