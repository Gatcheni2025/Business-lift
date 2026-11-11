'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const SKUs=require('./shopper-ads-store-products');
const providers=require('./shopper-ads-store-providers');
const {createStoreBilling}=require('./shopper-ads-store');
const NOW=Date.parse('2026-11-11T10:00:00Z'),uid='approvedSpaza01';
class DB{
 constructor(seed={}){this.rows=new Map(Object.entries(seed));}
 doc(path){const me=this;return {path,
  get:async()=>({exists:me.rows.has(path),data:()=>structuredClone(me.rows.get(path))}),
  create:async data=>{if(me.rows.has(path))throw Error('duplicate');me.rows.set(path,structuredClone(data));},
  update:async data=>{const old=me.rows.get(path);if(!old)throw Error('absent');me.rows.set(path,{...old,...structuredClone(data)});},
  set:async(data,options)=>me.rows.set(path,options?.merge?
   {...me.rows.get(path),...data}:structuredClone(data))};
 }
 async runTransaction(fn){
  const writes=[],tx={
   get:ref=>ref.get(),
   create:(ref,v)=>writes.push(()=>ref.create(v)),
   update:(ref,v)=>writes.push(()=>ref.update(v)),
   set:(ref,v,o)=>writes.push(()=>ref.set(v,o))
  };
  const v=await fn(tx);
  for(const w of writes)await w();
  return v;
 }
}
const denied=(promise,code)=>assert.rejects(promise,e=>e.status===code);
function fixture(platform='android',radius=15){
 const adId='ad1',ad={ownerUid:uid,status:'approved_unpaid',
  paymentStatus:'unpaid',radiusKm:radius,amountCents:SKUs.PRICE_CENTS(radius)};
 const db=new DB({'teyzaShopperAds/'+adId:ad});
 let valid=true,now=NOW,claimedProof='play-token-original-1234567890',consumed=0;
 const trusted={
  platform,productId:SKUs.productId(radius),accountToken:providers.tokenForUid(uid),
  purchaseId:claimedProof,purchasedAt:NOW+5000,environment:'production'
 };
 const verify=async()=>({...trusted});
 const verifier={google:verify,apple:verify,googleConsume:async()=>{consumed++;return true;}};
 const store=createStoreBilling({
  db,read:async path=>db.rows.get(path)||null,clock:()=>now,
  quote:radiusKm=>({amountCents:SKUs.PRICE_CENTS(radiusKm)}),
  requireSeller:async sellerUid=>{if(sellerUid!==uid||!valid)throw Object.assign(Error('owner denied'),{status:403});},
  ownAd:(sellerUid,a)=>{if(sellerUid!==a?.ownerUid)throw Object.assign(Error('ad denied'),{status:404});return a;},
  verifier
 });
 const auth={uid},create=()=>store.execute(auth,'ads_store_prepare',{advertisementId:adId,platform}),
  paid=(id,proof=claimedProof)=>store.execute(auth,'ads_store_verify',{
   intentId:id,platform,productId:SKUs.productId(radius),proof});
 return {db,store,auth,create,paid,adId,platform,uid,verifier,
  get consumed(){return consumed;},
  get trusted(){return trusted;},
  setValid:v=>valid=v,setNow:v=>now=v};
}
test('Forty-one immutable consumables support exact R29 base and R2 per extra km',()=>{
 assert.equal(SKUs.products.length,41);
 for(let r=1;r<=50;r++){
  const sku=SKUs.productId(r),cents=SKUs.PRICE_CENTS(r);
  assert.equal(cents,2900+Math.max(0,r-10)*200);
  assert.equal(SKUs.radiusFromProductId(sku),Math.max(10,r));
  assert(SKUs.products.some(p=>p.productId===sku&&p.amountZarCents===cents&&p.days===7));
 }
 assert.equal(new Set(SKUs.products.map(p=>p.productId)).size,41);
 for(const r of [-1,0,51,1.2,'50'])assert.throws(()=>SKUs.productId(r));
 for(const p of ['teyza_ad7d_r09','teyza_ad7d_r51','teyza_ad7d_r10_extra','teyza_monthly'])
  assert.equal(SKUs.radiusFromProductId(p),null);
});
test('Store preparation is disabled by default; no client receipt may bypass the gate',async()=>{
 const f=fixture();
 await denied(f.create(),503);
 assert.equal(f.db.rows.size,1);
});
test('Approved seller prepares one bounded store intent, then trusted Google purchase activates exactly once',async()=>{
 const old=process.env.TEYZA_ADS_STORE_BILLING_ENABLED,oldSandbox=process.env.TEYZA_ADS_STORE_SANDBOX_ALLOWED;
 process.env.TEYZA_ADS_STORE_BILLING_ENABLED='true';delete process.env.TEYZA_ADS_STORE_SANDBOX_ALLOWED;
 try{
  const f=fixture(),first=await f.create(),again=await f.create();
  assert.equal(first.productId,'teyza_ad7d_r15');assert.equal(first.amountCents,3900);
  assert.equal(first.intentId,again.intentId);
  assert.equal(first.accountToken,providers.tokenForUid(uid));
  await denied(f.store.execute({uid:'anotherSeller'},'ads_store_verify',{
   intentId:first.intentId,platform:'android',productId:first.productId,proof:'play-token-original-1234567890'}),404);
  const confirmed=await f.paid(first.intentId);
  assert.equal(confirmed.verified,true);
  assert.equal(f.db.rows.get('teyzaShopperAds/ad1').status,'active');
  assert.equal(f.db.rows.get('teyzaShopperAds/ad1').endsAt-NOW,7*86400000);
  assert.equal(f.consumed,1);
  const againPaid=await f.paid(first.intentId);
  assert.equal(againPaid.alreadyConfirmed,true);
  assert.equal(f.consumed,2,'Retrying an independently verified receipt may reconcile consumption only');
  assert.equal(f.db.rows.size,3);
 }finally{
  if(old===undefined)delete process.env.TEYZA_ADS_STORE_BILLING_ENABLED;
  else process.env.TEYZA_ADS_STORE_BILLING_ENABLED=old;
  if(oldSandbox===undefined)delete process.env.TEYZA_ADS_STORE_SANDBOX_ALLOWED;
  else process.env.TEYZA_ADS_STORE_SANDBOX_ALLOWED=oldSandbox;
 }
});
test('Server rejects wrong SKU, wrong owner token, replaced approved creative and stolen receipt',async()=>{
 const old=process.env.TEYZA_ADS_STORE_BILLING_ENABLED;process.env.TEYZA_ADS_STORE_BILLING_ENABLED='true';
 try{
  const f=fixture('ios'),prepared=await f.create();
  await denied(f.store.execute(f.auth,'ads_store_verify',{
   intentId:prepared.intentId,platform:'ios',productId:'teyza_ad7d_r50',proof:'apple-JWS'}),403);
  f.trusted.accountToken=providers.tokenForUid('otherSeller');
  await denied(f.paid(prepared.intentId),409);
  f.trusted.accountToken=providers.tokenForUid(uid);
  f.db.rows.get('teyzaShopperAds/ad1').status='paused';
  const outcome=await f.paid(prepared.intentId);
  assert.equal(outcome.refundReviewRequired,true);
  assert.notEqual(f.db.rows.get('teyzaShopperAds/ad1').status,'active');
 }finally{if(old===undefined)delete process.env.TEYZA_ADS_STORE_BILLING_ENABLED;
 else process.env.TEYZA_ADS_STORE_BILLING_ENABLED=old;}
});
test('Sandbox purchases never advertise publicly or pretend to collect money',async()=>{
 const env=process.env;
 const old=env.TEYZA_ADS_STORE_BILLING_ENABLED,oldSandbox=env.TEYZA_ADS_STORE_SANDBOX_ALLOWED;
 env.TEYZA_ADS_STORE_BILLING_ENABLED='true';env.TEYZA_ADS_STORE_SANDBOX_ALLOWED='true';
 try{
  const f=fixture('ios'),prepared=await f.create();
  f.trusted.environment='sandbox';
  const result=await f.paid(prepared.intentId);
  assert.equal(result.status,'test_paid');
  assert.equal(f.db.rows.get('teyzaShopperAds/ad1').status,'store_test');
  assert.equal(f.db.rows.get('teyzaShopperAds/ad1').paymentStatus,'test_paid');
 }finally{
  if(old===undefined)delete env.TEYZA_ADS_STORE_BILLING_ENABLED;else env.TEYZA_ADS_STORE_BILLING_ENABLED=old;
  if(oldSandbox===undefined)delete env.TEYZA_ADS_STORE_SANDBOX_ALLOWED;else env.TEYZA_ADS_STORE_SANDBOX_ALLOWED=oldSandbox;
 }
});
test('Store account token derives an opaque UUID, not email or Firebase ID',()=>{
 const token=providers.tokenForUid(uid);
 assert.match(token,/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
 assert.equal(token,providers.tokenForUid(uid));assert.notEqual(token,providers.tokenForUid('anotherSeller'));
});
