'use strict';
const crypto=require('node:crypto'),D=require('./domain');
const catalog=require('./shopper-ads-store-products');
const provider=require('./shopper-ads-store-providers');
const DAY_MS=86400000;
const actions=new Set(['ads_store_prepare','ads_store_verify']);
const validIntent=id=>typeof id==='string'&&/^ASI-[a-f0-9]{32}$/.test(id);
function createStoreBilling({db,read,clock=Date.now,quote,requireSeller,ownAd,
  verifier=provider.createProviderVerifier(),rate=async()=>{}}){
 const doc=path=>db.doc(path);
 async function prepare(auth,data={}){
  provider.requireServerReady();
  const uid=D.id(auth.uid),id=D.id(data.advertisementId),
   platform=data.platform;
  if(!['android','ios'].includes(platform))D.fail(422,'Choose an Android or iOS store purchase.');
  await requireSeller(uid);await rate(uid,'shopper-ads-store-prep',8,3600000);
  const ad=ownAd(uid,await read('teyzaShopperAds/'+id));
  if(ad.status!=='approved_unpaid'||ad.paymentStatus==='paid')
   D.fail(409,'Your advertisement must first be approved by Teyza.');
  if(ad.paymentReference)D.fail(409,'A Paystack transaction already exists. Contact support to reconcile it.');
  const sku=catalog.productId(ad.radiusKm);
  if(quote(ad.radiusKm).amountCents!==ad.amountCents)
   D.fail(409,'Your advertisement pricing changed. Request a new review.');
  return db.runTransaction(async tx=>{
   const adRef=doc('teyzaShopperAds/'+id),s=await tx.get(adRef);
   if(!s.exists||s.data().ownerUid!==uid||s.data().status!=='approved_unpaid')
    D.fail(409,'Advertisement changed. Refresh before paying.');
   const existing=s.data().storeIntentId;
   if(existing){
    const i=await tx.get(doc('teyzaAdStoreIntents/'+existing));
    if(i.exists&&i.data().ownerUid===uid&&i.data().advertisementId===id&&
       i.data().productId===sku&&i.data().platform===platform&&
       i.data().status==='prepared')
     return {intentId:existing,productId:sku,
       accountToken:provider.tokenForUid(uid),radiusKm:ad.radiusKm,days:7,
       amountCents:ad.amountCents,currency:'ZAR',alreadyPrepared:true};
    D.fail(409,'Your previous store payment requires reconciliation. Do not purchase twice.');
   }
   const intentId='ASI-'+crypto.randomBytes(16).toString('hex'),now=clock();
   tx.create(doc('teyzaAdStoreIntents/'+intentId),{
    ownerUid:uid,advertisementId:id,platform,productId:sku,
    amountCents:ad.amountCents,currency:'ZAR',createdAt:now,status:'prepared'});
   tx.update(adRef,{storeIntentId:intentId,storePaymentStatus:'prepared',updatedAt:now});
   return {intentId,productId:sku,accountToken:provider.tokenForUid(uid),
    radiusKm:ad.radiusKm,amountCents:ad.amountCents,days:7,
    currency:'ZAR',recurring:false};
  });
 }
 async function verify(auth,data={}){
  provider.requireServerReady();
  const uid=D.id(auth.uid),intentId=data.intentId;
  if(!validIntent(intentId))D.fail(422,'Your Teyza store payment reference is invalid.');
  const intent=await read('teyzaAdStoreIntents/'+intentId);
  if(!intent||intent.ownerUid!==uid)D.fail(404,'Store payment intent not found for this account.');
  if(intent.status!=='prepared'&&intent.status!=='used')
   D.fail(409,'Store payment intent needs support reconciliation.');
  if(data.platform!==intent.platform||data.productId!==intent.productId)
   D.fail(403,'This receipt does not match your selected advertising radius or store.');
  if(intent.platform==='android'&&(!data.proof||typeof data.proof!=='string'||data.proof.length>5000))
   D.fail(422,'Google Play purchase token missing.');
  if(intent.platform==='ios'&&(!data.proof||typeof data.proof!=='string'||data.proof.length>25000))
   D.fail(422,'StoreKit signed transaction missing.');
  await requireSeller(uid);await rate(uid,'shopper-ads-store-verify',20,3600000);
  // Verified ONLY by the provider's HTTPS API and signing root, never by a
  // client success flag, unverified receipt content or user-entered amount.
  const trusted=intent.platform==='android'?
    await verifier.google({productId:intent.productId,proof:data.proof}):
    await verifier.apple({productId:intent.productId,proof:data.proof});
  if(trusted.platform!==intent.platform||trusted.productId!==intent.productId||
     trusted.accountToken!==provider.tokenForUid(uid)||
     !Number.isFinite(trusted.purchasedAt)||
     trusted.purchasedAt<intent.createdAt-300000||
     trusted.purchasedAt>clock()+300000||trusted.purchasedAt>intent.createdAt+48*3600000)
   D.fail(409,'Store transaction identity or purchase time does not match this account.');
  if(!['production','sandbox'].includes(trusted.environment))
   D.fail(409,'Unverified store payment environment.');
  if(trusted.environment==='sandbox'&&process.env.TEYZA_ADS_STORE_SANDBOX_ALLOWED!=='true')
   D.fail(409,'App Store or Play test purchases are not enabled for this environment.');
  const ledgerKey=provider.keyForPurchase(intent.platform,trusted.purchaseId);
  const result=await db.runTransaction(async tx=>{
   const intentRef=doc('teyzaAdStoreIntents/'+intentId),
    adRef=doc('teyzaShopperAds/'+intent.advertisementId),
    ledger=doc('teyzaAdStorePurchases/'+ledgerKey);
   const [i,a,l]=await Promise.all([tx.get(intentRef),tx.get(adRef),tx.get(ledger)]);
   if(!i.exists||i.data().ownerUid!==uid||i.data().productId!==intent.productId)
    D.fail(403,'The original store purchase request changed.');
   if(l.exists){
    const old=l.data();
    if(old.ownerUid===uid&&old.intentId===intentId&&old.advertisementId===intent.advertisementId)
     return {verified:true,alreadyConfirmed:true,environment:old.environment,
       status:old.environment==='sandbox'?'test_paid':'paid',advertisementId:intent.advertisementId,
       purchaseKey:ledgerKey};
    D.fail(409,'This purchase was already used to pay another advertising campaign.');
   }
   if(!a.exists||a.data().ownerUid!==uid||a.data().storeIntentId!==intentId||
      a.data().status!=='approved_unpaid'||a.data().paymentReference||
      quote(a.data().radiusKm).amountCents!==intent.amountCents||
      a.data().amountCents!==intent.amountCents){
    // Refund/refund-request support handling must take place before any new purchase.
    tx.create(ledger,{ownerUid:uid,intentId,advertisementId:intent.advertisementId,
      platform:intent.platform,productId:intent.productId,environment:trusted.environment,
      status:'refund_review',createdAt:clock(),purchaseIdHash:ledgerKey});
    tx.update(intentRef,{status:'refund_review',verifiedAt:clock()});
    return {verified:false,refundReviewRequired:true,advertisementId:intent.advertisementId};
   }
   const now=clock(),sandbox=trusted.environment==='sandbox';
   tx.create(ledger,{ownerUid:uid,intentId,advertisementId:intent.advertisementId,
    platform:intent.platform,productId:intent.productId,
    environment:trusted.environment,purchaseIdHash:ledgerKey,status:sandbox?'test_paid':'paid',
    amountCents:intent.amountCents,currency:'ZAR',verifiedAt:now});
   tx.update(adRef,{status:sandbox?'store_test':'active',
    paymentStatus:sandbox?'test_paid':'paid',paymentProvider:intent.platform==='android'?'google_play':'apple_app_store',
    storeEnvironment:trusted.environment,storeProductId:intent.productId,
    storePurchaseKey:ledgerKey,startsAt:now,endsAt:now+7*DAY_MS,updatedAt:now});
   tx.update(intentRef,{status:'used',verifiedAt:now,purchaseKey:ledgerKey});
   return {verified:true,environment:trusted.environment,
    status:sandbox?'test_paid':'paid',advertisementId:intent.advertisementId,
    startsAt:now,endsAt:now+7*DAY_MS,purchaseKey:ledgerKey};
  });
  // On Google Play this server-side consume both acknowledges the consumable
  // and makes a later purchase possible. The purchase remains recorded even
  // if the provider API momentarily fails; don't create a second entitlement.
  if(result.verified&&intent.platform==='android'&&!trusted.alreadyConsumed){
   try{
    await verifier.googleConsume({productId:intent.productId,purchaseId:trusted.purchaseId});
    await doc('teyzaAdStorePurchases/'+ledgerKey).set({consumedAt:clock(),consumptionPending:false},{merge:true});
   }catch(_){
    await doc('teyzaAdStorePurchases/'+ledgerKey).set({consumptionPending:true},{merge:true});
   }
  }
  delete result.purchaseKey;
  return result;
 }
 return {execute:async(auth,action,data)=>{
  if(action==='ads_store_prepare')return prepare(auth,data);
  if(action==='ads_store_verify')return verify(auth,data);
  D.fail(404,'Unknown store advertising payment action.');
 },prepare,verify};
}
module.exports={actions,createStoreBilling};
