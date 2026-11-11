'use strict';
// Shopper-facing, location-scoped Teyza ads. Kept separate from private wholesaler offers.
// Payment rail is OFF by default and only available to separately approved direct APKs.
const crypto=require('node:crypto');
const D=require('./domain');
const P=require('./publication');
const {recentAdmin}=require('./seller-experience');
const {saveUpload}=require('./upload-storage');
const signature=require('./webhook-signature');

const DAYS=7,DAY_MS=86400000,BASE_CENTS=2900,LOCAL_KM=10,EXTRA_CENTS_PER_KM=200,MAX_KM=50;
const ENDPOINT='https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile';
const actions=new Set(['ads_quote','ads_submit','ads_mine','ads_feed','ads_pause',
  'ads_checkout','ads_confirm','ops_ads_queue','ops_ads_preview','ops_ads_review']);

function quote(radiusKm){
 if(!Number.isInteger(radiusKm)||radiusKm<1||radiusKm>MAX_KM)
  D.fail(422,'Choose a whole advertising radius from 1 to 50 km.');
 return {radiusKm,days:DAYS,localRadiusKm:LOCAL_KM,amountCents:BASE_CENTS+
   Math.max(0,radiusKm-LOCAL_KM)*EXTRA_CENTS_PER_KM,currency:'ZAR',
   recurring:false};
}
function distanceKm(lat1,lon1,lat2,lon2){
 const toRad=Math.PI/180,a=(lat2-lat1)*toRad,b=(lon2-lon1)*toRad;
 const h=Math.sin(a/2)**2+Math.cos(lat1*toRad)*Math.cos(lat2*toRad)*Math.sin(b/2)**2;
 return 6371*2*Math.asin(Math.min(1,Math.sqrt(h)));
}
function isDisplayed(c,now){
 return c&&c.status==='active'&&c.paymentStatus==='paid'&&
  Number.isFinite(c.startsAt)&&Number.isFinite(c.endsAt)&&c.startsAt<=now&&now<c.endsAt&&
  P.coordinates(c.latitude,c.longitude)&&quote(c.radiusKm).amountCents===c.amountCents;
}
function publicRow(id,c){
 return {id,shopId:c.ownerUid,shopName:c.shopName,title:c.title,
  message:c.message,radiusKm:c.radiusKm,endsAt:c.endsAt,
  imageUrl:ENDPOINT+'?shopperAdPhoto='+encodeURIComponent(id),sponsored:true};
}
function createShopperAds({db,bucket,sanitizeImage,clock=Date.now,rate=async()=>{},
  getSecret=()=>'',getSigningSecret=()=>'',getProjectId=()=>process.env.GCLOUD_PROJECT||process.env.GCP_PROJECT||'',
  send=fetch}){
 const doc=p=>db.doc(p);
 const read=async p=>{const r=await doc(p).get();return r.exists?r.data():null;};
 const paymentEnvironment=()=>getSecret().startsWith('sk_live_')?'live':'test';
 async function verifiedSeller(uid){
  const [account,setup,verification,shop,billing,location]=await Promise.all(
   ['teyzaSellerAccounts/','teyzaSellerOnboarding/','teyzaMobileVerification/',
    'teyzaPublicShops/','teyzaBilling/','teyzaShopLocations/'].map(p=>read(p+uid)));
  if(account?.uid!==uid||!['spaza','retail'].includes(account.category)||account.deletionPending===true)
   D.fail(403,'Shopper ads are available to approved spaza shops and local businesses.');
  const state=P.state(uid,account,setup||{},verification,shop,billing,clock());
  if(!state.live||shop?.status!=='active'||shop?.sellerUid!==uid)
   D.fail(403,'Complete your shop verification and approval before advertising.');
  const pin=P.locationFor(uid,account,location,shop,clock());
  if(!pin)D.fail(409,'Save an accurate approved shop location to select your ad radius.');
  return {account,shop,pin};
 }
 function ownAd(uid,c){
  if(!c||c.ownerUid!==uid)D.fail(404,'Advertisement not found for this seller.');
  return c;
 }
 function safeRow(id,c){
  return {id,title:c.title,message:c.message,status:c.status,reviewNote:c.reviewNote||'',
    radiusKm:c.radiusKm,days:DAYS,amountCents:c.amountCents,currency:'ZAR',
    shopName:c.shopName,submittedAt:c.submittedAt,startsAt:c.startsAt||null,
    endsAt:c.endsAt||null,paymentStatus:c.paymentStatus||'unpaid',
    paymentReference:c.paymentReference||null,category:c.category};
 }
 async function paystack(path,method='GET',payload){
  const secret=getSecret();
  if(!/^sk_(test|live)_/.test(secret))D.fail(503,'Advertising payment gateway is not configured.');
  if(secret.startsWith('sk_test_')&&(!getProjectId()||getProjectId()==='business-lift-3c19c'))
   D.fail(503,'Sandbox advertising payments require an isolated Firebase project.');
  const response=await send('https://api.paystack.co'+path,{
   method,headers:{Authorization:'Bearer '+secret,'Content-Type':'application/json'},
   ...(payload?{body:JSON.stringify(payload)}:{})});
  const reply=await response.json().catch(()=>({}));
  if(!response.ok||reply.status!==true||!reply.data)
   D.fail(503,'Paystack could not verify the advertising payment.');
  return reply.data;
 }
 async function confirm(reference,ownerUid){
  if(!/^TZA-[a-f0-9]{26}$/.test(reference))D.fail(422,'Invalid Teyza advertising reference.');
  const payment=await read('teyzaAdPayments/'+reference);
  if(!payment||ownerUid&&payment.ownerUid!==ownerUid)
   D.fail(404,'Advertising payment reference not found.');
  if(payment.status==='paid')return {paid:true,alreadyConfirmed:true,advertisementId:payment.advertisementId};
  if(payment.status==='refund_review')return {paid:false,refundReviewRequired:true};
  if(!['pending','initializing','needs_attention'].includes(payment.status))
   D.fail(409,'This advertising payment cannot be confirmed.');
  const verified=await paystack('/transaction/verify/'+encodeURIComponent(reference));
  if(verified.status!=='success'||verified.reference!==reference||
     verified.domain!==payment.environment||verified.currency!=='ZAR'||
     verified.amount!==payment.amountCents||
     verified.metadata?.teyzaUid!==payment.ownerUid||
     verified.metadata?.teyzaAdId!==payment.advertisementId||
     typeof verified.id!=='number'||
     verified.customer?.email?.toLowerCase()!==payment.customerEmail)
   D.fail(409,'Paystack has not verified this exact advertising charge.');
  return db.runTransaction(async tx=>{
   const pRef=doc('teyzaAdPayments/'+reference),adRef=doc('teyzaShopperAds/'+payment.advertisementId);
   const [p,a]=await Promise.all([tx.get(pRef),tx.get(adRef)]);
   if(!p.exists||p.data().ownerUid!==payment.ownerUid||
      p.data().advertisementId!==payment.advertisementId)
    D.fail(409,'Advertising payment ownership changed.');
   if(p.data().status==='paid')return {paid:true,alreadyConfirmed:true,advertisementId:payment.advertisementId};
   if(a.exists&&a.data().ownerUid===payment.ownerUid&&
      a.data().status==='approved_unpaid'&&a.data().paymentReference===reference&&
      a.data().amountCents===verified.amount){
    const now=clock();
    tx.update(adRef,{status:'active',paymentStatus:'paid',startsAt:now,
      endsAt:now+DAYS*DAY_MS,updatedAt:now});
    tx.update(pRef,{status:'paid',verifiedAt:now,transactionId:String(verified.id)});
    return {paid:true,advertisementId:payment.advertisementId,startsAt:now,endsAt:now+DAYS*DAY_MS};
   }
   tx.update(pRef,{status:'refund_review',verifiedAt:clock(),
     transactionId:String(verified.id),reviewReason:'campaign_no_longer_approved'});
   return {paid:false,refundReviewRequired:true};
  });
 }
 async function checkout(auth,data){
  if(process.env.TEYZA_ADS_DIRECT_PAYSTACK_ENABLED!=='true')
   D.fail(503,'Advertising payments are not activated. Your approved ad is saved.');
  // Store-distributed app purchases must use the respective store billing rail.
  if(data.checkoutChannel!=='direct')
   D.fail(422,'This Paystack route is restricted to an approved direct-distribution Android build.');
  if(auth.email_verified!==true||typeof auth.email!=='string'||!auth.email.includes('@'))
   D.fail(403,'Verify the email on your Firebase seller account before payment.');
  const uid=D.id(auth.uid),id=D.id(data.advertisementId);
  await verifiedSeller(uid);await rate(uid,'shopper-ads-payment',5,86400000);
  const ad=ownAd(uid,await read('teyzaShopperAds/'+id));
  if(ad.status!=='approved_unpaid'||ad.paymentStatus==='paid')
   D.fail(409,'The campaign must be approved and awaiting payment.');
  const reference='TZA-'+crypto.randomBytes(13).toString('hex'),now=clock(),mode=paymentEnvironment();
  const prepared=await db.runTransaction(async tx=>{
   const ref=doc('teyzaShopperAds/'+id),snap=await tx.get(ref);
   if(!snap.exists||snap.data().ownerUid!==uid||snap.data().status!=='approved_unpaid')
    D.fail(409,'The campaign status changed. Refresh first.');
   if(snap.data().paymentReference){
    const old=await tx.get(doc('teyzaAdPayments/'+snap.data().paymentReference));
    if(old.exists&&old.data().ownerUid===uid&&old.data().status==='pending'&&
      /^https:\/\/checkout\.paystack\.com\/[A-Za-z0-9_-]+/.test(old.data().checkoutUrl||''))
     return {existing:true,reference:old.id,url:old.data().checkoutUrl};
    D.fail(409,'Payment is already being prepared. Contact support to reconcile this reference.');
   }
   const amount=quote(snap.data().radiusKm).amountCents;
   if(amount!==snap.data().amountCents)D.fail(409,'Campaign price changed. Submit a fresh campaign.');
   tx.update(ref,{paymentReference:reference,paymentStatus:'initializing',updatedAt:now});
   tx.create(doc('teyzaAdPayments/'+reference),{ownerUid:uid,advertisementId:id,
     amountCents:amount,currency:'ZAR',customerEmail:auth.email.toLowerCase(),
     environment:mode,status:'initializing',createdAt:now});
   return {existing:false,amount};
  });
  if(prepared.existing)return {reference:prepared.reference,checkoutUrl:prepared.url,amountCents:ad.amountCents,alreadyStarted:true};
  let url;
  try{
   const result=await paystack('/transaction/initialize','POST',{
    email:auth.email.toLowerCase(),amount:prepared.amount,currency:'ZAR',reference,
    callback_url:'https://teyza.co.za/',
    metadata:{teyzaUid:uid,teyzaKind:'shopper_ad',teyzaAdId:id,radiusKm:ad.radiusKm,days:DAYS}});
   url=result.authorization_url;
   if(typeof url!=='string'||!/^https:\/\/checkout\.paystack\.com\/[A-Za-z0-9_-]+(?:\?.*)?$/.test(url))
    D.fail(503,'Invalid Paystack checkout address.');
   await db.runTransaction(async tx=>{
    const ref=doc('teyzaAdPayments/'+reference),p=await tx.get(ref);
    if(!p.exists||p.data().ownerUid!==uid||p.data().status!=='initializing')
     D.fail(409,'The payment changed while opening checkout.');
    tx.update(ref,{status:'pending',checkoutUrl:url});
    tx.update(doc('teyzaShopperAds/'+id),{paymentStatus:'pending'});
   });
  }catch(error){
   // An ambiguous Paystack initialize response must NEVER start a second charge.
   await doc('teyzaAdPayments/'+reference).set({status:'needs_attention',updatedAt:clock()},{merge:true});
   throw error;
  }
  return {reference,checkoutUrl:url,amountCents:prepared.amount,days:DAYS,requiresVerification:true};
 }
 async function feed(latitude,longitude){
  if(!P.coordinates(latitude,longitude))D.fail(422,'Choose a valid nearby shopping location.');
  const rows=await db.collection('teyzaShopperAds').where('status','==','active').limit(80).get();
  const matches=[];
  for(const snap of rows.docs){
   const c=snap.data();
   if(!isDisplayed(c,clock())||distanceKm(latitude,longitude,c.latitude,c.longitude)>c.radiusKm)continue;
   // Never expose a paid campaign after owner approval or shop publication is revoked.
   try{await verifiedSeller(c.ownerUid);}catch(_){continue;}
   matches.push(publicRow(snap.id,c));
   if(matches.length>=8)break;
  }
  return {ads:matches,limited:rows.docs.length===80};
 }
 async function publicPhoto(adId){
  const id=D.id(adId),c=await read('teyzaShopperAds/'+id);
  if(!isDisplayed(c,clock())||c.objectPath!=='teyza/shopper-ads/'+c.ownerUid+'/'+id+'.jpg')
   D.fail(404,'This advertisement image is not published.');
  await verifiedSeller(c.ownerUid);
  const [bytes]=await bucket.file(c.objectPath).download();
  return bytes;
 }
 async function execute(auth,action,data={}){
  const uid=D.id(auth.uid);
  if(action==='ads_quote'){
   await verifiedSeller(uid);return quote(data.radiusKm);
  }
  if(action==='ads_submit'){
   const seller=await verifiedSeller(uid);
   await rate(uid,'shopper-ad-submit',3,86400000);
   if(data.publicDisplayConsent!==true)D.fail(422,'Confirm you own the image and agree to show it as a sponsored advertisement.');
   const radius=quote(data.radiusKm),title=D.text(data.title,'advert headline',80),
    message=D.text(data.message,'advert description',240);
   if(title.length<5||message.length<12)D.fail(422,'Add a headline and a clear description.');
   const raw=D.imageBytes(data.imageBase64);
   let jpeg;
   try{jpeg=await sanitizeImage(raw);}catch(_){D.fail(422,'Choose a valid JPEG or PNG ad image.');}
   const id=crypto.randomUUID(),now=clock(),
    objectPath='teyza/shopper-ads/'+uid+'/'+id+'.jpg';
   await saveUpload(bucket,objectPath,jpeg,{contentType:'image/jpeg',resumable:false,
     metadata:{cacheControl:'private,no-store'}});
   try{
    await doc('teyzaShopperAds/'+id).create({ownerUid:uid,category:seller.account.category,
      shopName:seller.account.shopName||seller.shop.name||'Local business',
      title,message,objectPath,radiusKm:radius.radiusKm,amountCents:radius.amountCents,
      latitude:seller.pin.latitude,longitude:seller.pin.longitude,locationAddress:seller.account.address,
      durationDays:DAYS,status:'pending_review',paymentStatus:'unpaid',
      publicDisplayConsentAt:now,submittedAt:now,createdAt:now,updatedAt:now});
   }catch(error){try{await bucket.file(objectPath).delete({ignoreNotFound:true});}catch(_){ }throw error;}
   return {advertisementId:id,status:'pending_review',...radius};
  }
  if(action==='ads_mine'){
   await verifiedSeller(uid);
   const rows=await db.collection('teyzaShopperAds').where('ownerUid','==',uid).limit(40).get();
   return {ads:rows.docs.map(s=>safeRow(s.id,s.data())).sort((a,b)=>b.submittedAt-a.submittedAt)};
  }
  if(action==='ads_pause'){
   await verifiedSeller(uid);const id=D.id(data.advertisementId);
   await db.runTransaction(async tx=>{
    const ref=doc('teyzaShopperAds/'+id),snap=await tx.get(ref),c=ownAd(uid,snap.exists?snap.data():null);
    if(!['active','pending_review','approved_unpaid'].includes(c.status))
     D.fail(409,'This campaign cannot be paused.');
    tx.update(ref,{status:'paused',pausedAt:clock(),updatedAt:clock()});
   });
   return {paused:true};
  }
  if(action==='ads_checkout')return checkout(auth,data);
  if(action==='ads_confirm')return confirm(D.text(data.reference,'payment reference',80),uid);
  if(action==='ops_ads_queue'){
   recentAdmin(auth,clock);await rate(uid,'shopper-ads-review',20,60000);
   const rows=await db.collection('teyzaShopperAds').where('status','==','pending_review').limit(40).get();
   return {ads:rows.docs.map(s=>safeRow(s.id,s.data())),limited:rows.docs.length===40};
  }
  if(action==='ops_ads_preview'){
   recentAdmin(auth,clock);const id=D.id(data.advertisementId),ad=await read('teyzaShopperAds/'+id);
   if(!ad||!['pending_review','approved_unpaid','active','rejected'].includes(ad.status))
    D.fail(404,'Advertisement not found.');
   if(ad.objectPath!=='teyza/shopper-ads/'+ad.ownerUid+'/'+id+'.jpg')
    D.fail(409,'Advertisement image storage does not match its owner.');
   const [bytes]=await bucket.file(ad.objectPath).download();
   return {imageBase64:bytes.toString('base64'),contentType:'image/jpeg'};
  }
  if(action==='ops_ads_review'){
   recentAdmin(auth,clock);if(data.confirmed!==true||!['approved','rejected'].includes(data.decision))
    D.fail(422,'Confirm approval or rejection of the ad creative.');
   const id=D.id(data.advertisementId),reason=D.text(data.reason||'','review reason',300,false);
   if(data.decision==='rejected'&&reason.length<12)D.fail(422,'Give a reason for rejection.');
   const snap=await doc('teyzaShopperAds/'+id).get();
   if(!snap.exists||snap.data().status!=='pending_review')D.fail(409,'Campaign changed. Refresh the review queue.');
   const old=snap.data();if(old.ownerUid===uid)D.fail(403,'Another administrator must review this ad.');
   if(data.decision==='approved'){
    const seller=await verifiedSeller(old.ownerUid);
    if(seller.account.category!==old.category||seller.account.address!==old.locationAddress||
       seller.pin.latitude!==old.latitude||seller.pin.longitude!==old.longitude)
     D.fail(409,'Business or location changed. Request a new advertisement.');
   }
   await db.runTransaction(async tx=>{
    const ref=doc('teyzaShopperAds/'+id),now=await tx.get(ref);
    if(!now.exists||now.data().status!=='pending_review')
     D.fail(409,'Campaign was reviewed already.');
    tx.update(ref,{status:data.decision==='approved'?'approved_unpaid':'rejected',
      reviewedAt:clock(),reviewedBy:uid,reviewNote:reason,updatedAt:clock()});
    tx.create(doc('teyzaShopperAdAudit/'+crypto.randomUUID()),{
      actorUid:uid,ownerUid:old.ownerUid,advertisementId:id,
      decision:data.decision,reason,createdAt:clock()});
   });
   return {reviewed:true,status:data.decision==='approved'?'approved_unpaid':'rejected'};
  }
  D.fail(404,'Unknown shopper ads action.');
 }
 async function webhook(raw,legacy,payload,modern){
  if(!signature.verifyWebhook({raw,legacy,modern,secretKey:getSecret(),
      signingSecret:getSigningSecret(),now:clock()}))
   D.fail(401,'Invalid Paystack advertising webhook signature.');
  if(payload?.event==='charge.success'&&/^TZA-[a-f0-9]{26}$/.test(payload?.data?.reference||''))
   await confirm(payload.data.reference);
  return {accepted:true};
 }
 return {execute,feed,publicPhoto,webhook};
}
module.exports={actions,quote,distanceKm,isDisplayed,createShopperAds,
  BASE_CENTS,LOCAL_KM,MAX_KM,DAYS};
