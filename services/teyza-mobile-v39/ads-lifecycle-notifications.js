'use strict';
// Trusted Firestore transitions, never client-supplied status strings.
// Keep admin review separate from payment, and never infer WhatsApp delivery from API acceptance.
const crypto=require('node:crypto');
const {checkedPhone}=require('./onboarding');
const uidValid=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{6,128}$/.test(v);
function adEvent(before,after,id){
 if(!after||!uidValid(after.ownerUid)||typeof id!=='string'||!/^[A-Za-z0-9_-]{6,128}$/.test(id))return null;
 if(after.status==='pending_review'&&!before&&after.paymentStatus==='unpaid')
  return {kind:'ad_submitted',ownerUid:after.ownerUid,adId:id};
 if(after.status==='approved_unpaid'&&before?.status==='pending_review'&&
    after.reviewedBy&&after.reviewedBy!==after.ownerUid&&after.paymentStatus==='unpaid')
  return {kind:'ad_approved',ownerUid:after.ownerUid,adId:id};
 if(after.status==='rejected'&&before?.status==='pending_review'&&after.reviewedBy!==after.ownerUid)
  return {kind:'ad_rejected',ownerUid:after.ownerUid,adId:id};
 if(after.status==='active'&&before?.status!=='active'&&after.paymentStatus==='paid')
  return {kind:'ad_active',ownerUid:after.ownerUid,adId:id};
 return null;
}
function sellingEvent(before,after,sellerUid){
 if(!uidValid(sellerUid)||after?.sellerUid!==sellerUid||
  after.status!=='active'||after.approvalStatus!=='approved'||
  after.identityVerified!==true||after.sellingEnabled!==true||
  before?.sellingEnabled===true)return null;
 return {kind:'selling_ready',ownerUid:sellerUid};
}
const eventId=(kind,id)=>crypto.createHash('sha256').update(kind+':'+id).digest('hex');
function createLifecycleNotifications({db,notifications,clock=Date.now}){
 async function onAdWrite(eventIdValue,id,before,after){
  const event=adEvent(before,after,id);if(!event)return;
  if(event.kind==='ad_submitted'){
   const ref=db.doc('teyzaSupportTickets/ads_'+eventId('admin',id));
   await db.runTransaction(async tx=>{
    const old=await tx.get(ref);if(old.exists)return;
    tx.create(ref,{ownerUid:event.ownerUid,subject:'Advertising campaign awaiting admin review',
      message:'Campaign '+id+' is pending independent approval. Open the authenticated Ads review queue using ops_ads_queue, preview via ops_ads_preview, then decide via ops_ads_review. Do not request payment before approval.',
      status:'open',priority:'normal',revision:0,createdBy:'system_ads_lifecycle',
      createdAt:clock(),updatedAt:clock(),source:'ads_pending_review',advertisementId:id});
   });
   return;
  }
  const wording={
   ad_approved:['Advertisement approved — payment available',
    'Your advertisement passed independent review. Open teyza.co.za/ads/ and pay once to activate seven days of advertising.'],
   ad_rejected:['Advertisement review update','Your advertisement was not approved. Open Teyza Ads to see the review reason.'],
   ad_active:['Advertisement is live','Your payment was verified and your seven-day sponsored campaign is active.']
  }[event.kind];
  if(wording)await notifications.queue(eventIdValue,{ownerUid:event.ownerUid,category:'reviews',
    target:'verification',reference:id,title:wording[0],body:wording[1]});
  if(event.kind==='ad_approved')await queueWhatsApp(event,'ad_approved');
 }
 async function onSellingWrite(eventIdValue,sellerUid,before,after){
  const e=sellingEvent(before,after,sellerUid);if(!e)return;
  await notifications.queue(eventIdValue,{ownerUid:sellerUid,category:'reviews',target:'products',
    reference:sellerUid,title:'You can now start selling on Teyza',
    body:'Your seller access is active. Open the Teyza seller dashboard to list products or services.'});
  await queueWhatsApp(e,'selling_ready');
 }
 async function queueWhatsApp(event,kind){
  const ref=db.doc('teyzaWhatsAppEventOutbox/'+eventId(kind,kind==='ad_approved'?event.adId:event.ownerUid));
  await db.runTransaction(async tx=>{
   const existing=await tx.get(ref);if(existing.exists)return;
   tx.create(ref,{sellerUid:event.ownerUid,kind,advertisementId:event.adId||'',
     status:'queued',createdAt:clock()});
  });
 }
 return {onAdWrite,onSellingWrite};
}
function createWhatsAppLifecycleSender({db,getAuthUser,getToken,getConfig,send=fetch,clock=Date.now}){
 async function deliver(reference){
  if(typeof reference!=='string'||!/^[a-f0-9]{64}$/.test(reference))return;
  const ref=db.doc('teyzaWhatsAppEventOutbox/'+reference),snap=await ref.get();
  if(!snap.exists||!['queued','configuration_required'].includes(snap.data().status))return;
  const message=snap.data(),uid=message.sellerUid;
  if(!uidValid(uid)||!['ad_approved','selling_ready'].includes(message.kind))return;
  const config=getConfig(),token=getToken(),template=message.kind==='ad_approved'?
   config.adApprovedTemplate:config.sellingReadyTemplate;
  if(typeof token!=='string'||token.length<20||
   !/^\d{5,25}$/.test(config.phoneNumberId||'')||
   !/^v\d+\.\d+$/.test(config.apiVersion||'')||
   !/^[a-z][a-z0-9_]{1,511}$/.test(template||'')||
   !/^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(config.language||'')){
   await ref.update({status:'configuration_required',reason:'approved_meta_template_or_sender_missing',updatedAt:clock()});
   return;
  }
  // No template parameters are guessed: these template names must refer to
  // already-approved Meta zero-parameter templates matching these events.
  let authUser;
  try{authUser=await getAuthUser(uid);}catch(_){return;}
  const claim=await db.runTransaction(async tx=>{
   const items=await Promise.all([
    tx.get(ref),tx.get(db.doc('teyzaSellerAccounts/'+uid)),
    tx.get(db.doc('teyzaWhatsAppPreferences/'+uid)),
    tx.get(db.doc('teyzaMobileVerification/'+uid)),
    tx.get(db.doc('teyzaPublicShops/'+uid)),
    ...(message.kind==='ad_approved'?[tx.get(db.doc('teyzaShopperAds/'+message.advertisementId))]:[])
   ]);
   const [pending,account,pref,verification,shop,ad]=items;
   if(!pending.exists||!['queued','configuration_required'].includes(pending.data().status))return null;
   const a=account.exists?account.data():null,p=pref.exists?pref.data():null,v=verification.exists?verification.data():null;
   let valid=!!(a&&a.uid===uid&&a.approvalStatus==='approved'&&a.deletionPending!==true&&
    p&&p.ownerUid===uid&&p.optedIn===true&&p.phone===a.phone&&v&&v.status==='approved');
   try{checkedPhone(authUser,a?.phone);}catch(_){valid=false;}
   if(message.kind==='ad_approved')valid=valid&&!!ad?.exists&&
    ad.data().ownerUid===uid&&ad.data().status==='approved_unpaid'&&
    ad.data().paymentStatus==='unpaid'&&ad.data().reviewedBy!==uid;
   else valid=valid&&!!shop?.exists&&shop.data().sellerUid===uid&&
    shop.data().status==='active'&&shop.data().sellingEnabled===true;
   if(!valid){
    tx.update(ref,{status:'skipped',reason:'eligibility_consent_or_status_changed',updatedAt:clock()});
    return null;
   }
   tx.update(ref,{status:'sending',attemptedAt:clock()});
   return {to:a.phone.replace(/^\+/,'')};
  });
  if(!claim)return;
  try{
   const result=await send('https://graph.facebook.com/'+config.apiVersion+'/'+config.phoneNumberId+'/messages',{
    method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:claim.to,
     type:'template',template:{name:template,language:{code:config.language}}}),
    signal:AbortSignal.timeout(15000)});
   const payload=await result.json().catch(()=>null),providerId=payload?.messages?.[0]?.id;
   if(!result.ok||typeof providerId!=='string'||!providerId)
    await ref.update({status:'needs_review',reason:'provider_rejected',httpStatus:result.status||0,updatedAt:clock()});
   else await ref.update({status:'accepted',providerMessageId:providerId,acceptedAt:clock()});
  }catch(_){
   // No automatic retries after uncertain provider outcomes: no duplicate WhatsApp.
   await ref.update({status:'needs_review',reason:'provider_outcome_uncertain',updatedAt:clock()});
  }
 }
 return {deliver};
}
module.exports={adEvent,sellingEvent,eventId,createLifecycleNotifications,createWhatsAppLifecycleSender};
