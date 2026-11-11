'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {quote,distanceKm,isDisplayed,createShopperAds}=require('./shopper-ads');
const NOW=Date.parse('2026-11-11T10:00:00Z');
const rejects=(p,status)=>assert.rejects(p,e=>e.status===status);
class FakeDB{
 constructor(seed){this.items=new Map(Object.entries(structuredClone(seed)));}
 doc(path){const db=this;return {path,id:path.split('/').pop(),
  get:async()=>db.snapshot(path),
  create:async x=>{assert(!db.items.has(path));db.items.set(path,structuredClone(x));},
  update:async x=>{assert(db.items.has(path));db.items.set(path,{...db.items.get(path),...structuredClone(x)});},
  set:async(x,opts)=>db.items.set(path,opts?.merge?{...db.items.get(path),...structuredClone(x)}:structuredClone(x))};}
 snapshot(path){return {exists:this.items.has(path),id:path.split('/').pop(),
  data:()=>structuredClone(this.items.get(path)),ref:this.doc(path)};}
 collection(path){const db=this,filters=[];let maximum=Infinity;const q={
  where:(...args)=>{filters.push(args);return q;},limit:n=>{maximum=n;return q;},
  get:async()=>({docs:[...db.items.keys()].filter(k=>k.startsWith(path+'/')&&
    !k.slice(path.length+1).includes('/')&&filters.every(([key,op,val])=>op==='=='&&db.items.get(k)[key]===val))
    .slice(0,maximum).map(k=>db.snapshot(k))})};return q;}
 async runTransaction(fn){
  const writes=[],tx={get:r=>r.get(),create:(r,d)=>writes.push(()=>r.create(d)),
   set:(r,d,o)=>writes.push(()=>r.set(d,o)),update:(r,d)=>writes.push(()=>r.update(d))};
  const result=await fn(tx);for(const w of writes)await w();return result;
 }
}
function fixture(){
 const db=new FakeDB({
  'teyzaSellerAccounts/seller1':{uid:'seller1',category:'spaza',shopName:'Local Spaza',address:'12 Example Road',approvalStatus:'approved'},
  'teyzaPublicShops/seller1':{sellerUid:'seller1',shopCategory:'spaza',status:'active',name:'Local Spaza',
    address:'12 Example Road',latitude:-29.86,longitude:31.02},
  'teyzaSellerAccounts/business1':{uid:'business1',category:'retail',shopName:'Local Salon',address:'20 Example Road',approvalStatus:'approved'},
  'teyzaPublicShops/business1':{sellerUid:'business1',shopCategory:'retail',status:'active',name:'Local Salon',
    address:'20 Example Road',latitude:-29.87,longitude:31.03}
 });
 let now=NOW;
 const files=new Map(),calls=[];
 const bucket={file:path=>({save:async b=>files.set(path,b),
  download:async()=>[files.get(path)],delete:async()=>files.delete(path)})};
 const send=async(url,opts)=>{
  calls.push({url,opts});let result;
  if(url.endsWith('/transaction/initialize'))result={authorization_url:'https://checkout.paystack.com/valid'};
  else if(url.includes('/transaction/verify/')){
   const reference=decodeURIComponent(url.split('/').at(-1)),payment=db.items.get('teyzaAdPayments/'+reference);
   result={status:'success',reference,amount:payment.amountCents,currency:'ZAR',domain:'test',
    metadata:{teyzaUid:payment.ownerUid,teyzaAdId:payment.advertisementId},
    id:122222,customer:{email:payment.customerEmail}};
  }else throw Error('Unexpected Paystack endpoint');
  return {ok:true,json:async()=>({status:true,data:result})};
 };
 const svc=createShopperAds({db,bucket,sanitizeImage:async raw=>raw,clock:()=>now,
  getSecret:()=> 'sk_test_EXAMPLE',getProjectId:()=> 'teyza-separate-sandbox',send});
 const owner={uid:'seller1',email_verified:true,email:'owner@example.test'};
 const admin={uid:'reviewer1',teyzaAdmin:true,email_verified:true,auth_time:NOW/1000};
 return {db,files,calls,svc,owner,admin,setTime:n=>now=n,
  call:(actor,action,data={})=>svc.execute(actor,action,data)};
}
const image=Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(110,5)]).toString('base64');
const campaign={title:'Family grocery specials',message:'Browse our offers at the spaza shop this week.',
 radiusKm:15,imageBase64:image,publicDisplayConsent:true};
test('Radius prices are immutable 7-day ZAR amounts and not monthly subscriptions',()=>{
 assert.equal(quote(1).amountCents,2900);
 assert.equal(quote(10).amountCents,2900);
 assert.equal(quote(11).amountCents,3100);
 assert.equal(quote(15).amountCents,3900);
 assert.equal(quote(20).amountCents,4900);
 assert.equal(quote(30).amountCents,6900);
 assert.equal(quote(50).amountCents,10900);
 assert.equal(quote(30).recurring,false);
 for(const r of [0,51,10.1,null,'20',NaN,-10]){
  assert.throws(()=>quote(r),e=>e.status===422);
 }
});
test('Great-circle distance enforces 10 km, 20 km and shop-centred reach',()=>{
 assert(distanceKm(-29.86,31.02,-29.86,31.02)<0.01);
 assert(distanceKm(-29.86,31.02,-29.86,31.21)>17);
 assert(distanceKm(-29.86,31.02,-29.86,31.21)<20);
});
test('Ad image stays private until independently approved AND paid; owner and reviewer permissions hold',async()=>{
 const f=fixture();
 await rejects(f.call(f.owner,'ads_submit',{...campaign,radiusKm:5.1}),422);
 await rejects(f.call(f.owner,'ads_submit',{...campaign,publicDisplayConsent:false}),422);
 const made=await f.call(f.owner,'ads_submit',campaign);
 assert.equal(made.amountCents,3900);
 const id=made.advertisementId;
 assert.equal((await f.svc.feed(-29.86,31.02)).ads.length,0);
 await rejects(f.svc.publicPhoto(id),404);
 assert.equal((await f.call(f.admin,'ops_ads_queue')).ads.length,1);
 const preview=await f.call(f.admin,'ops_ads_preview',{advertisementId:id});
 assert.equal(preview.imageBase64,image);
 await rejects(f.call(f.owner,'ops_ads_review',{advertisementId:id,decision:'approved',confirmed:true}),403);
 await f.call(f.admin,'ops_ads_review',{advertisementId:id,decision:'approved',confirmed:true});
 assert.equal((await f.svc.feed(-29.86,31.02)).ads.length,0,'approval alone cannot publish unpaid ad');
 assert.equal((await f.call(f.owner,'ads_mine')).ads[0].status,'approved_unpaid');
});
test('Ads checkout stays disabled by default and cannot take unreviewed price or identity',async()=>{
 const f=fixture(),made=await f.call(f.owner,'ads_submit',campaign);
 await f.call(f.admin,'ops_ads_review',{advertisementId:made.advertisementId,decision:'approved',confirmed:true});
 await rejects(f.call(f.owner,'ads_checkout',{advertisementId:made.advertisementId,checkoutChannel:'direct',amountCents:1}),503);
 assert.equal(f.calls.length,0);
});
test('Approved direct-mode Paystack transaction is independently verified, then displayed only within radius and seven days',async()=>{
 const f=fixture(),made=await f.call(f.owner,'ads_submit',campaign);
 await f.call(f.admin,'ops_ads_review',{advertisementId:made.advertisementId,decision:'approved',confirmed:true});
 const old=process.env.TEYZA_ADS_DIRECT_PAYSTACK_ENABLED,global=process.env.TEYZA_SELLER_PAYSTACK_ENABLED;
 process.env.TEYZA_ADS_DIRECT_PAYSTACK_ENABLED='true';process.env.TEYZA_SELLER_PAYSTACK_ENABLED='true';
 try{
  await rejects(f.call(f.owner,'ads_checkout',{advertisementId:made.advertisementId,checkoutChannel:'store'}),422);
  const checkout=await f.call(f.owner,'ads_checkout',{advertisementId:made.advertisementId,checkoutChannel:'direct',amountCents:1});
  assert.equal(checkout.amountCents,3900);
  assert.match(checkout.reference,/^TZA-[a-f0-9]{26}$/);
  const init=f.calls.find(c=>c.url.endsWith('/transaction/initialize'));
  assert.equal(JSON.parse(init.opts.body).amount,3900);
  assert.equal((await f.svc.feed(-29.86,31.02)).ads.length,0);
  const confirmation=await f.call(f.owner,'ads_confirm',{reference:checkout.reference});
  assert.equal(confirmation.paid,true);
  const displayed=await f.svc.feed(-29.86,31.02);
  assert.equal(displayed.ads.length,1);assert.equal(displayed.ads[0].sponsored,true);
  assert.equal((await f.svc.feed(-29.86,31.5)).ads.length,0);
  assert.equal((await f.svc.publicPhoto(made.advertisementId)).length,113);
  assert.equal((await f.call(f.owner,'ads_confirm',{reference:checkout.reference})).alreadyConfirmed,true);
  f.setTime(NOW+7*86400000);
  assert.equal((await f.svc.feed(-29.86,31.02)).ads.length,0);
  await rejects(f.svc.publicPhoto(made.advertisementId),404);
 }finally{
  if(old===undefined)delete process.env.TEYZA_ADS_DIRECT_PAYSTACK_ENABLED;else process.env.TEYZA_ADS_DIRECT_PAYSTACK_ENABLED=old;
  if(global===undefined)delete process.env.TEYZA_SELLER_PAYSTACK_ENABLED;else process.env.TEYZA_SELLER_PAYSTACK_ENABLED=global;
 }
});
test('Paid ads cannot become visible after their seller is suspended',async()=>{
 const f=fixture();
 f.db.items.set('teyzaShopperAds/campaign1',{ownerUid:'seller1',shopName:'Local Spaza',status:'active',
  paymentStatus:'paid',startsAt:NOW-100,endsAt:NOW+100000,radiusKm:10,
  amountCents:2900,latitude:-29.86,longitude:31.02,locationAddress:'12 Example Road'});
 assert.equal((await f.svc.feed(-29.86,31.02)).ads.length,1);
 f.db.items.set('teyzaPublicShops/seller1',{...f.db.items.get('teyzaPublicShops/seller1'),status:'suspended'});
 assert.equal((await f.svc.feed(-29.86,31.02)).ads.length,0);
});
