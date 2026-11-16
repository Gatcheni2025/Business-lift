'use strict';
// Signed webhook calls this router only AFTER raw-body HMAC validation.
// Do not persist inbound text, phone numbers, profile names or full payloads.
const crypto=require('node:crypto');
const choices=new Map([
 ['Start selling on Teyza','start_selling'],
 ['Advertise on Teyza','advertise'],
 ['Talk to consultant','consultant']
]);
const uidValid=v=>typeof v==='string'&&/^[A-Za-z0-9_-]{6,128}$/.test(v);
function extractActions(payload,numberId){
 const result=[];
 if(payload?.object!=='whatsapp_business_account')return result;
 for(const entry of Array.isArray(payload.entry)?payload.entry.slice(0,50):[])
 for(const change of Array.isArray(entry.changes)?entry.changes.slice(0,50):[]){
  if(change?.field!=='messages'||change.value?.metadata?.phone_number_id!==numberId)continue;
  for(const m of Array.isArray(change.value.messages)?change.value.messages.slice(0,100):[]){
   if(typeof m?.id!=='string'||!/^wamid[.][A-Za-z0-9_.:=+/-]{1,500}$/.test(m.id))continue;
   const from=typeof m.from==='string'?m.from:'';
   if(!/^[1-9][0-9]{7,14}$/.test(from))continue;
   const text=m.type==='text'?m.text?.body:'';
   const response=m.type==='button'?m.button?.text:
     m.type==='interactive'&&m.interactive?.type==='button_reply'?
     (m.interactive.button_reply?.title||m.interactive.button_reply?.id):'';
   const action=typeof text==='string'&&/^\s*STOP\s*$/i.test(text)?'stop':choices.get(response);
   if(action)result.push({action,from:'+'+from,id:m.id});
  }
 }
 return result.slice(0,500);
}
function createPilotRouter({db,getPilotUid,getPhoneNumberId,clock=Date.now}){
 if(!db||typeof getPilotUid!=='function'||typeof getPhoneNumberId!=='function')throw Error('Pilot router dependencies missing');
 async function route(payload){
  const pilotUid=getPilotUid();
  const numberId=getPhoneNumberId();
  if(!uidValid(pilotUid)||!/^\d{5,25}$/.test(numberId||''))return;
  // Reconcile Meta receipts with the one pilot seller's accepted outbox.
  // Delivery is not inferred from a successful API send; only signed status
  // callbacks may write the deliveryStatus field.
  for(const entry of Array.isArray(payload?.entry)?payload.entry.slice(0,50):[])
  for(const change of Array.isArray(entry.changes)?entry.changes.slice(0,50):[]){
   if(change?.field!=='messages'||change.value?.metadata?.phone_number_id!==numberId)continue;
   for(const status of Array.isArray(change.value.statuses)?change.value.statuses.slice(0,100):[]){
    if(!['sent','delivered','read','failed'].includes(status?.status)||
       typeof status.id!=='string'||!/^wamid[.][A-Za-z0-9_.:=+/-]{1,500}$/.test(status.id))continue;
    const results=await db.collection('teyzaWhatsAppApprovalOutbox').where('providerMessageId','==',status.id).limit(3).get();
    for(const doc of results.docs){
     if(doc.data()?.sellerUid!==pilotUid||doc.data()?.status!=='accepted')continue;
     // Never turn a delivered/read receipt backwards to sent.
     const previous=doc.data()?.deliveryStatus;
     const rank={sent:1,delivered:2,read:3,failed:4};
     if(previous&&rank[previous]>=rank[status.status])continue;
     await doc.ref.update({deliveryStatus:status.status,deliveryStatusAt:clock()});
    }
   }
  }
  for(const event of extractActions(payload,numberId)){
   // Scope all pilot interactions to the one authorised seller.
   // Read phone only transiently; never persist it in the interaction audit.
   const results=await db.collection('teyzaWhatsAppPreferences').where('phone','==',event.from).limit(3).get();
   const matching=results.docs.filter(s=>s.id===pilotUid&&s.data()?.ownerUid===pilotUid);
   if(matching.length!==1)continue;
   const account=await db.doc('teyzaSellerAccounts/'+pilotUid).get();
   if(!account.exists||account.data()?.uid!==pilotUid||
      account.data()?.phone!==event.from)continue;
   const pref=matching[0].data();
   if(event.action!=='stop'&&(pref.optedIn!==true||account.data()?.approvalStatus!=='approved'))continue;
   const id=crypto.createHash('sha256').update(JSON.stringify([numberId,event.id,event.action])).digest('hex');
   const ref=db.doc('teyzaWhatsAppPilotActions/'+id);
   const preferenceRef=db.doc('teyzaWhatsAppPreferences/'+pilotUid);
   await db.runTransaction(async tx=>{
    const previous=await tx.get(ref);
    if(previous.exists)return;
    const fresh=await tx.get(preferenceRef);
    if(!fresh.exists||fresh.data()?.ownerUid!==pilotUid||fresh.data()?.phone!==event.from)return;
    if(event.action!=='stop'&&fresh.data()?.optedIn!==true)return;
    const at=clock();
    const destination=event.action==='start_selling'?'/seller-getting-started.html':
      event.action==='advertise'?'/ads/':
      event.action==='consultant'?'seller_support':'none';
    tx.create(ref,{sellerUid:pilotUid,action:event.action,destination,
      state:event.action==='stop'?'completed':'pending',
      source:'signed_meta_whatsapp',createdAt:at});
    if(event.action==='consultant'){
     // Admin's existing support queue lists all teyzaSupportTickets. The
     // generated request carries no chat body or phone; staff respond using
     // their normal authenticated support workflow.
     tx.create(db.doc('teyzaSupportTickets/wa_'+id),{
      ownerUid:pilotUid,subject:'WhatsApp consultant request',
      message:'Approved seller selected Talk to consultant in the welcome menu.',
      status:'open',priority:'normal',revision:0,createdBy:pilotUid,
      createdAt:at,updatedAt:at,source:'whatsapp_pilot',shopName:account.data()?.shopName||'Business'
     });
    }
    if(event.action==='stop'){
     tx.set(preferenceRef,{...fresh.data(),ownerUid:pilotUid,optedIn:false,phone:'',
       optedOutAt:at,updatedAt:at,consentVersion:'seller-approval-v2'});
    }
   });
  }
 }
 return {route};
}
module.exports={extractActions,createPilotRouter,choices};
