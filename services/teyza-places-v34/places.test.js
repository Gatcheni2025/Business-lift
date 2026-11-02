'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {num,mapResult,discover,fetchPhoto,fetchContact,trustedPhotoUri,kindMatch} = require('./places');
const lat=-29.8587,lon=31.0218;
const place=(id,extra={})=>({id,displayName:{text:'Village Corner '+id},primaryType:'grocery_store',
  types:['grocery_store'],location:{latitude:lat,longitude:lon},...extra});
const json=data=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
test('missing coordinates stay invalid and generic grocery names are retained by type',()=>{
  assert.equal(num('',-90,90),null);assert.equal(num(undefined,-90,90),null);
  assert.equal(mapResult(place('one',{location:{longitude:lon}}),'spaza',lat,lon),null);
  assert.ok(kindMatch(place('one'),'spaza'));
  assert.ok(!kindMatch(place('one',{displayName:{text:'Tyre Shop'},primaryType:'car_repair',types:[]}),'spaza'));
});
test('preserve real ratings, opening state, photos and credits without inventing values',()=>{
  const photo={name:'places/ChIJ1234/photos/Photo_1234',authorAttributions:[{displayName:'Photographer',uri:'https://maps.google.com/contrib/123'}]};
  const mapped=mapResult(place('one',{photos:[photo],rating:4.7,userRatingCount:12,currentOpeningHours:{openNow:false}}),'spaza',lat,lon);
  assert.equal(mapped.rating,4.7);assert.equal(mapped.openNow,false);
  assert.match(mapped.photoUrl,/ref=places%2FChIJ1234%2Fphotos%2FPhoto_1234/);
  assert.equal(mapped.photoAttributions[0].name,'Photographer');
  const missing=mapResult(place('two'),'spaza',lat,lon);
  assert.equal(missing.photoRef,null);assert.equal(missing.openNow,null);assert.equal(missing.rating,null);
});
test('sparse searches paginate with identical parameters and prefer duplicate entries with photos',async()=>{
  const calls=[];
  const result=await discover({key:'test',lat,lon,radius:22000,kind:'spaza',fetchImpl:async(_,options)=>{
    const body=JSON.parse(options.body);calls.push(body);
    assert.match(options.headers['X-Goog-FieldMask'],/places.photos/);
    assert.match(options.headers['X-Goog-FieldMask'],/nextPageToken/);
    if(body.pageToken)return json({places:[place('one',{photos:[{name:'places/ChIJ1234/photos/Photo_1234'}]}),place('two')]});
    return json({places:[place('one')],nextPageToken:body.textQuery+'-next'});
  }});
  assert.equal(calls.length,8);
  for(const call of calls.filter(p=>p.pageToken)){
    const first=calls.find(p=>p.textQuery===call.textQuery&&!p.pageToken);
    const {pageToken,...rest}=call;
    assert.equal(pageToken,call.textQuery+'-next');assert.deepEqual(rest,first);
  }
  assert.equal(result.entries.length,2);assert.equal(result.photoCount,1);
});
test('enough unique first-page shops avoid extra pagination requests',async()=>{
  let calls=0;
  const result=await discover({key:'test',lat,lon,radius:22000,kind:'spaza',fetchImpl:async()=>{
    const batch=calls++;
    return json({places:Array.from({length:6},(_,i)=>place('batch-'+batch+'-'+i)),nextPageToken:'next'});
  }});
  assert.equal(calls,6);assert.equal(result.entries.length,36);
});
test('closed, distant and unrelated listings do not crowd out local shops',async()=>{
  const result=await discover({key:'test',lat,lon,radius:22000,kind:'spaza',fetchImpl:async()=>json({places:[
    place('near'),place('far',{location:{latitude:-26.2,longitude:28}}),place('closed',{businessStatus:'CLOSED_PERMANENTLY'}),
    place('car',{displayName:{text:'Auto Tyres'},types:['car_repair'],primaryType:'car_repair'})]})});
  assert.deepEqual(result.entries.map(p=>p.id),['google-near']);
});
test('one failed search leaves useful partial results available',async()=>{
  let i=0;const result=await discover({key:'test',lat,lon,radius:22000,kind:'spaza',
    fetchImpl:async()=>i++===0?new Response('',{status:503}):json({places:[place('near')]})});
  assert.equal(result.entries.length,1);assert.ok(result.warning);
});
test('photo proxy returns image bytes without sending the API key to image hosts',async()=>{
  const calls=[];
  const image=await fetchPhoto({key:'server-key',ref:'places/ChIJ1234/photos/Photo_1234',fetchImpl:async(url,options)=>{
    calls.push({url,options});
    if(calls.length===1)return json({photoUri:'https://lh3.googleusercontent.com/place-photo'});
    return new Response(Buffer.from([255,216,255,217]),{headers:{'content-type':'image/jpeg'}});
  }});
  assert.equal(calls[0].options.headers['X-Goog-Api-Key'],'server-key');
  assert.equal(calls[1].options.headers,undefined);assert.equal(calls[1].options.redirect,'error');
  assert.equal(image.contentType,'image/jpeg');assert.equal(image.bytes.length,4);
});
test('photo host validation rejects unexpected targets',async()=>{
  for(const uri of ['http://lh3.googleusercontent.com/p','https://googleusercontent.com.evil.example/p',
    'https://user:password@lh3.googleusercontent.com/p','https://127.0.0.1/p'])assert.equal(trustedPhotoUri(uri),null);
  await assert.rejects(fetchPhoto({key:'key',ref:'places/ChIJ1234/photos/Photo_1234',
    fetchImpl:async()=>json({photoUri:'https://untrusted.example/image'})}),/Invalid image host/);
});

test('Google-linked wholesalers are separated from ordinary retail and spaza categories',async()=>{
 const wholesale=place('bulk',{displayName:{text:'Durban Wholesale Cash and Carry'},
   primaryType:'wholesaler',types:['wholesaler']});
 const retail=place('mall',{displayName:{text:'Durban Shopping Mall'},
   primaryType:'shopping_mall',types:['shopping_mall']});
 assert.equal(kindMatch(wholesale,'wholesale'),true);
 assert.equal(kindMatch(wholesale,'spaza'),false);
 assert.equal(kindMatch(wholesale,'variety'),false);
 assert.equal(kindMatch(retail,'wholesale'),false);
 const result=await discover({key:'test',lat,lon,radius:22000,kind:'wholesale',
   fetchImpl:async()=>json({places:[wholesale,retail]})});
 assert.deepEqual(result.entries.map(e=>e.id),['google-bulk']);
 assert.equal(result.entries[0].isTeyzaMerchant,false);
 assert.equal(result.entries[0].shopCategory,'wholesale');
 assert.equal(result.entries[0].priceCents,undefined);
});

test('Other Businesses searches salons, furniture, upholsterers and plumbers separately',async()=>{
 const salons=place('salon',{displayName:{text:'Durban Hair Salon'},types:['beauty_salon'],primaryType:'beauty_salon'});
 const plumber=place('plumb',{displayName:{text:'Plumber on Call'},types:['plumber'],primaryType:'plumber'});
 const store=place('furniture',{displayName:{text:'Furniture and Upholstery'},types:['furniture_store'],primaryType:'furniture_store'});
 const wholesaler=place('wholesale',{displayName:{text:'Wholesale Cash and Carry'},types:['wholesaler'],primaryType:'wholesaler'});
 for(const result of [salons,plumber,store])assert.equal(kindMatch(result,'variety'),true);
 assert.equal(kindMatch(wholesaler,'variety'),false);
 const result=await discover({key:'test',lat,lon,radius:30000,kind:'variety',fetchImpl:async()=>json({places:[salons,plumber,store,wholesaler]})});
 assert.deepEqual(result.entries.map(x=>x.id).sort(),['google-furniture','google-plumb','google-salon']);
});
test('Business contact is fetched on demand and not with every Google Text Search',async()=>{
 let calls=0;
 const data=await discover({key:'test',lat,lon,radius:20000,kind:'wholesale',fetchImpl:async(_,opts)=>{
   calls++;
   assert(!opts.headers['X-Goog-FieldMask'].includes('nationalPhoneNumber'));
   return json({places:[place('supplier',{displayName:{text:'Wholesale Supplier Depot'}})]});
 }});
 assert(data.entries.length>0);assert(calls>0);
 const response=await fetchContact({key:'test',placeId:'ChIJwholesale123456',fetchImpl:async(url,opts)=>{
   assert(url.endsWith('/ChIJwholesale123456'));
   assert.equal(opts.headers['X-Goog-FieldMask'],'id,nationalPhoneNumber,websiteUri');
   return json({id:'ChIJwholesale123456',nationalPhoneNumber:'031 000 1234',websiteUri:'https://example.org'});
 }});
 assert.equal(response.phone,'031 000 1234');
 assert.equal(response.websiteUrl,'https://example.org');
});
