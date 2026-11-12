'use strict';
// Only approved sellers who explicitly opted in may receive this message.
// Never retry an uncertain provider request automatically: that could send twice.
const {checkedPhone}=require('./onboarding');
const {welcomeTemplateComponents}=require('./whatsapp-welcome-menu');

function createWhatsAppApproval({db,getAuthUser,getToken=()=>'',getConfig=()=>({}),send=fetch,clock=Date.now}){
 const doc=p=>db.doc(p);
 async function deliver(reference){
  const ref=doc('teyzaWhatsAppApprovalOutbox/'+reference),initial=await ref.get();
  if(!initial.exists||!['queued','configuration_required'].includes(initial.data().status))return;
  const entry=initial.data();
  let authUser;try{authUser=await getAuthUser(entry.sellerUid);}catch(error){
   if(error?.code==='auth/user-not-found')authUser=null;
   else return; // Retry transient Auth errors before any provider request.
  }
  const config=getConfig(),token=getToken();
  const configured=typeof token==='string'&&token.length>10&&/^\d+$/.test(config.phoneNumberId||'')&&
   /^v\d+\.\d+$/.test(config.apiVersion||'')&&/^[a-z0-9_]{1,512}$/.test(config.template||'')&&
   /^[a-z]{2,3}(?:_[A-Z]{2})?$/.test(config.language||'');
  const claimed=await db.runTransaction(async tx=>{
   const onceRef=doc('teyzaWhatsAppWelcomeOnce/'+entry.sellerUid);
   const [outbox,account,pref,verification,priorWelcome]=await Promise.all([tx.get(ref),tx.get(doc('teyzaSellerAccounts/'+entry.sellerUid)),
    tx.get(doc('teyzaWhatsAppPreferences/'+entry.sellerUid)),tx.get(doc('teyzaMobileVerification/'+entry.sellerUid)),tx.get(onceRef)]);
   if(!outbox.exists||!['queued','configuration_required'].includes(outbox.data().status))return null;
   if(priorWelcome.exists){
    tx.update(ref,{status:'skipped',reason:'welcome_already_claimed',updatedAt:clock()});return null;
   }
   const a=account.exists?account.data():null,p=pref.exists?pref.data():null;
   if(!a||a.uid!==entry.sellerUid||a.approvalStatus!=='approved'||a.deletionPending===true||
      !p||p.ownerUid!==entry.sellerUid||p.optedIn!==true||p.phone!==a.phone||
      !verification.exists||verification.data().status!=='approved'||verification.data().submissionId!==entry.submissionId){
    tx.update(ref,{status:'skipped',reason:'approval_or_consent_changed',updatedAt:clock()});return null;
   }
   try{checkedPhone(authUser,a.phone);}catch(_){
    tx.update(ref,{status:'skipped',reason:'phone_not_verified',updatedAt:clock()});return null;
   }
   if(!configured){tx.update(ref,{status:'configuration_required',updatedAt:clock()});return null;}
   // Claim the welcome for this seller before contacting Meta. No second
   // approval or uncertain provider response can produce another welcome.
   tx.create(onceRef,{sellerUid:entry.sellerUid,submissionId:entry.submissionId,
    outboxReference:reference,status:'attempted',createdAt:clock()});
   tx.update(ref,{status:'sending',attemptedAt:clock()});
   return {phone:a.phone.replace(/^\+/,'')};
  });
  if(!claimed)return;
  try{
   const response=await send('https://graph.facebook.com/'+config.apiVersion+'/'+config.phoneNumberId+'/messages',{
    method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
    body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:claimed.phone,type:'template',
      template:{name:config.template,language:{code:config.language},
       ...(config.interactiveWelcome===true?{components:welcomeTemplateComponents()}:{})}}),signal:AbortSignal.timeout(15000)});
   const body=await response.json().catch(()=>null),messageId=body?.messages?.[0]?.id;
   if(!response.ok||typeof messageId!=='string'||!messageId){
    await ref.update({status:'needs_review',reason:'provider_response',httpStatus:response.status||0,updatedAt:clock()});return;
   }
   // HTTP success confirms acceptance by Meta, not delivery to the phone.
   await ref.update({status:'accepted',providerMessageId:messageId,acceptedAt:clock()});
  }catch(_){
   // Network failure may occur after Meta accepted the message. No blind retry.
   await ref.update({status:'needs_review',reason:'delivery_uncertain',updatedAt:clock()});
  }
 }
 return {deliver};
}
module.exports={createWhatsAppApproval};
