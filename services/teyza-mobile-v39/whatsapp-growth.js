'use strict';
// Informational WhatsApp messages only. Never include a payment or website
// checkout link in a template triggered by an app button.
const crypto=require('node:crypto');
const {checkedPhone}=require('./onboarding');

function createWhatsAppGrowth({db,getAuthUser,getToken=()=>'',getConfig=()=>({}),send=fetch,clock=Date.now}){
 const doc=p=>db.doc(p);
 async function deliver(reference){
  if(!/^[a-f0-9]{32}$/.test(String(reference)))return;
  const ref=doc('teyzaWhatsAppGrowthOutbox/'+reference);
  const initial=await ref.get();
  if(!initial.exists||!['queued','configuration_required'].includes(initial.data().status))return;
  const entry=initial.data(),purpose=entry.purpose;
  if(!['upgrade','advertise'].includes(purpose))return;
  let user;try{user=await getAuthUser(entry.sellerUid);}catch(_){return;}
  const config=getConfig(),token=getToken();
  const template=purpose==='upgrade'?config.upgradeTemplate:config.advertiseTemplate;
  const configured=typeof token==='string'&&token.length>10&&
   /^\d+$/.test(config.phoneNumberId||'')&&/^v\d+\.\d+$/.test(config.apiVersion||'')&&
   /^[a-z0-9_]{1,512}$/.test(template||'')&&
   /^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(config.language||'')&&config.operatorApproved===true;
  const claimed=await db.runTransaction(async tx=>{
   const [outbox,original,account,pref]=await Promise.all([
    tx.get(ref),tx.get(doc('teyzaSellerGrowthRequests/'+reference)),
    tx.get(doc('teyzaSellerAccounts/'+entry.sellerUid)),
    tx.get(doc('teyzaWhatsAppPreferences/'+entry.sellerUid))]);
   if(!outbox.exists||!['queued','configuration_required'].includes(outbox.data().status))return null;
   const row=outbox.data(),request=original.exists?original.data():null;
   const a=account.exists?account.data():null,p=pref.exists?pref.data():null;
   if(!request||request.ownerUid!==entry.sellerUid||request.purpose!==purpose||
      row.sellerUid!==entry.sellerUid||row.requestId!==reference||
      request.origin!=='teyza_store_app'||request.consentVersion!=='seller-growth-info-v1'||
      !Number.isFinite(request.consentAt)||request.consentAt!==row.consentAt||
      !a||a.uid!==entry.sellerUid||!['spaza','retail','wholesale'].includes(a.category)||
      a.deletionPending===true||
      (p?.optedIn===false&&p.consentAt>=request.consentAt)){
    tx.update(ref,{status:'skipped',reason:'account_or_consent_changed',updatedAt:clock()});return null;
   }
   let phone;try{phone=checkedPhone(user,a.phone);}catch(_){
    tx.update(ref,{status:'skipped',reason:'phone_not_verified',updatedAt:clock()});return null;
   }
   const fingerprint=crypto.createHash('sha256').update(phone).digest('hex');
   if(request.phoneFingerprint!==fingerprint||row.phoneFingerprint!==fingerprint){
    tx.update(ref,{status:'skipped',reason:'phone_changed',updatedAt:clock()});return null;
   }
   if(!configured){tx.update(ref,{status:'configuration_required',updatedAt:clock()});return null;}
   tx.update(ref,{status:'sending',attemptedAt:clock()});
   return {phone:phone.slice(1)};
  });
  if(!claimed)return;
  try{
   const response=await send('https://graph.facebook.com/'+config.apiVersion+'/'+config.phoneNumberId+'/messages',{
    method:'POST',
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',
      to:claimed.phone,type:'template',
      template:{name:template,language:{code:config.language}}}),
    signal:AbortSignal.timeout(15000)});
   const json=await response.json().catch(()=>null),messageId=json?.messages?.[0]?.id;
   if(!response.ok||typeof messageId!=='string'||!messageId){
    await ref.update({status:'needs_review',reason:'provider_response',
      httpStatus:response.status||0,updatedAt:clock()});return;
   }
   // Accepted by Meta is not proof of message delivery.
   await ref.update({status:'accepted',providerMessageId:messageId,acceptedAt:clock()});
  }catch(_){await ref.update({status:'needs_review',reason:'delivery_uncertain',updatedAt:clock()});}
 }
 return {deliver};
}
module.exports={createWhatsAppGrowth};
