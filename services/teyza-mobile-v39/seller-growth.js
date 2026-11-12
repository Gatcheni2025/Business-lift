'use strict';
const crypto=require('node:crypto');
const D=require('./domain');
const {checkedPhone}=require('./onboarding');
const actions=new Set(['seller_growth_interest']);

function createSellerGrowth({db,getAuthUser,clock=Date.now}){
 const doc=path=>db.doc(path);
 async function execute(auth,action,data={}){
  if(action!=='seller_growth_interest')D.fail(404,'Unknown growth request.');
  if(!['upgrade','advertise'].includes(data.purpose))D.fail(422,'Choose Upgrade or Advertise.');
  if(data.whatsappConsent!==true)D.fail(422,'WhatsApp information requires your explicit consent.');
  const uid=D.id(auth.uid),purpose=data.purpose;
  const accountSnap=await doc('teyzaSellerAccounts/'+uid).get();
  const account=accountSnap.exists?accountSnap.data():null;
  if(!account||account.uid!==uid||!['spaza','retail','wholesale'].includes(account.category)||
     account.deletionPending===true)D.fail(403,'Register your own Teyza business account first.');
  // Use the authoritative registered phone only. No recipient, URL or price
  // supplied by the client can be trusted.
  const authUser=await getAuthUser(uid);
  const phone=checkedPhone(authUser,account.phone);
  const now=clock(),day=Math.floor(now/86400000);
  const reference=crypto.createHash('sha256').update(uid+':'+purpose+':'+day).digest('hex').slice(0,32);
  const fingerprint=crypto.createHash('sha256').update(phone).digest('hex');
  const requestRef=doc('teyzaSellerGrowthRequests/'+reference);
  const outboxRef=doc('teyzaWhatsAppGrowthOutbox/'+reference);
  return db.runTransaction(async tx=>{
   const old=await tx.get(requestRef);
   if(old.exists){
    if(old.data().ownerUid!==uid||old.data().purpose!==purpose)
      D.fail(409,'The information request reference is already used.');
    return {requested:true,alreadyRequested:true,whatsappStatus:'pending_configuration',reference};
   }
   tx.create(requestRef,{ownerUid:uid,purpose,status:'requested',
     origin:'teyza_store_app',contact:'whatsapp',consentVersion:'seller-growth-info-v1',
     consentAt:now,phoneFingerprint:fingerprint,createdAt:now});
   tx.create(outboxRef,{sellerUid:uid,purpose,requestId:reference,status:'queued',
     origin:'teyza_store_app',consentVersion:'seller-growth-info-v1',
     consentAt:now,phoneFingerprint:fingerprint,createdAt:now});
   return {requested:true,alreadyRequested:false,whatsappStatus:'pending_configuration',reference};
  });
 }
 return {execute};
}
module.exports={actions,createSellerGrowth};
