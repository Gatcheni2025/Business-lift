'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createShopAddress,addressDetails,DAY}=require('./shop-address');
const full={id:'address-123',formattedAddress:'12 Main Road, KwaMashu, Durban, South Africa',types:['street_address'],
 location:{latitude:-29.7402,longitude:30.992},addressComponents:[
  {longText:'12',types:['street_number']},{longText:'Main Road',types:['route']},
  {longText:'KwaMashu',types:['sublocality_level_1']},{longText:'Durban',types:['locality']},
  {longText:'South Africa',shortText:'ZA',types:['country']}]};
const token='11111111-1111-4111-8111-111111111111';
function fixture({place=full,fail=false}={}){
 let now=1000000;const requests=[];
 const api=createShopAddress({getPlacesKey:()=> 'private-server-key',getSigningKey:()=> 'private-signing-key',clock:()=>now,rate:async()=>{},
  fetchImpl:async(url,options)=>{requests.push({url,options});if(fail)throw new Error('private-server-key');
   return {ok:true,json:async()=>url.includes('places:autocomplete')?{suggestions:[{placePrediction:{placeId:full.id,text:{text:full.formattedAddress}}}]}:place};}});
 return {api,requests,advance:ms=>{now+=ms;}};
}
async function pick(api,uid='owner'){
 const results=await api.execute(uid,'seller_address_suggest',{query:'12 Main Road Durban',sessionToken:token});
 return api.execute(uid,'seller_address_select',{predictionToken:results.suggestions[0].predictionToken});
}
test('Autocomplete is South Africa only, uses a session through details and returns a signed full address',async()=>{
 const {api,requests}=fixture(),result=await pick(api);
 const body=JSON.parse(requests[0].options.body);assert.deepEqual(body.includedRegionCodes,['za']);assert.equal(body.sessionToken,token);
 assert.deepEqual(body.includedPrimaryTypes,['street_address','premise','subpremise']);
 assert(requests[1].url.includes('sessionToken='+token));assert.equal(requests[1].options.headers['X-Goog-FieldMask'],'id,formattedAddress,addressComponents,location,types');
 const saved=api.location('owner',{addressSelection:result.selection.addressSelection,unit:'Shop 4',latitude:0,city:'Cape Town'});
 assert.equal(saved.address,'Shop 4, '+full.formattedAddress);assert.equal(saved.latitude,-29.7402);assert.equal(saved.city,'Durban');
 assert.equal(saved.ownerUid,'owner');assert.equal(saved.countryCode,'ZA');assert.equal(saved.coordinatesExpireAt-saved.resolvedAt,30*DAY);
 assert(!JSON.stringify(result).includes('private-server-key'));assert(!JSON.stringify(result).includes('private-signing-key'));
});
test('Typed strings, altered receipts, another account and expired selections cannot become shop locations',async()=>{
 const f=fixture(),result=await pick(f.api),receipt=result.selection.addressSelection;
 for(const data of [{address:full.formattedAddress,latitude:-29.7402,longitude:30.992},{addressSelection:receipt+'x'}])
  assert.throws(()=>f.api.location('owner',data),e=>e.status===422);
 assert.throws(()=>f.api.location('other',{addressSelection:receipt}),e=>e.status===422);
 f.advance(31*60000);assert.throws(()=>f.api.location('owner',{addressSelection:receipt}),e=>e.status===422);
});
test('A prediction is bound to its account and cannot be submitted as a completed address',async()=>{
 const {api}=fixture(),suggested=await api.execute('owner','seller_address_suggest',{query:'12 Main Road',sessionToken:token});
 const predictionToken=suggested.suggestions[0].predictionToken;
 await assert.rejects(api.execute('other','seller_address_select',{predictionToken}),e=>e.status===422);
 assert.throws(()=>api.location('owner',{addressSelection:predictionToken}),e=>e.status===422);
});
test('Street-only, area-only, foreign and coordinate-free results cannot pass as full addresses',()=>{
 const variants=[{...full,types:['route'],addressComponents:full.addressComponents.filter(c=>!c.types.includes('street_number'))},
  {...full,types:['locality'],addressComponents:full.addressComponents.filter(c=>!c.types.includes('street_number')&&!c.types.includes('route'))},
  {...full,location:null},{...full,location:{latitude:0,longitude:0}},
  {...full,addressComponents:full.addressComponents.map(c=>c.types.includes('country')?{...c,shortText:'US'}:c)}];
 for(const place of variants)assert.throws(()=>addressDetails(place),e=>e.status===422);
});
test('Short queries do not call Google, invalid sessions are rejected and outages expose no credentials',async()=>{
 const {api,requests}=fixture();assert.deepEqual(await api.execute('owner','seller_address_suggest',{query:'12',sessionToken:token}),{suggestions:[]});
 assert.equal(requests.length,0);
 await assert.rejects(api.execute('owner','seller_address_suggest',{query:'12 Main',sessionToken:'reuse'}),e=>e.status===422);
 const unavailable=fixture({fail:true});await assert.rejects(pick(unavailable.api),e=>e.status===503&&!e.message.includes('private-server-key'));
});
