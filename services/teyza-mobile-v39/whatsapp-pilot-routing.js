'use strict';
// Signed webhook calls this router only AFTER raw-body HMAC validation.
// Do not persist inbound text, phone numbers, profile names or full payloads.
const crypto=require('node:crypto');
const choices=new Map([
 ['Start selling on Teyza','start_selling'],
 ['Start selling','start_selling'],
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
   const action=typeof text==='string'&&/^\s*STOP\s*$/i.test(text)?'stop':
     typeof text==='string'&&/^\s*(?:MAIN\s*MENU|MENU|HI|HELLO|START)\s*$/i.test(text)?'main_menu':
     choices.get(response)||({teyza_start_selling:'start_selling',teyza_advertise:'advertise',teyza_consultant:'consultant'}[response]);
   if(action)result.push({action,from:'+'+from,id:m.id});
  }
 }
 return result.slice(0,500);
}
function createPilotRouter({db,getPilotUid,getPhoneNumberId,getAccessToken=()=>'',getApiVersion=()=> 'v26.0',send=fetch,clock=Date.now}){
 if(!db||typeof getPilotUid!=='function'||typeof getPhoneNumberId!=='function')throw Error('Pilot router dependencies missing');
 async function route(payload){
  const pilotUid=getPilotUid();
  const numberId=getPhoneNumberId();
  if(!/^\d{5,25}$/.test(numberId||''))return;
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
     if(!uidValid(pilotUid)||doc.data()?.sellerUid!==pilotUid||doc.data()?.status!=='accepted')continue;
     // Never turn a delivered/read receipt backwards to sent.
     const previous=doc.data()?.deliveryStatus;
     const rank={sent:1,delivered:2,read:3,failed:4};
     if(previous&&rank[previous]>=rank[status.status])continue;
     await doc.ref.update({deliveryStatus:status.status,deliveryStatusAt:clock()});
    }
    // A reviewed Ads approval may be sent to ANY opted-in seller, not just
    // the one welcome-menu pilot UID. The enclosing webhook validated
    // Meta's HMAC signature before this route is invoked.
    const lifecycle=await db.collection('teyzaWhatsAppEventOutbox')
      .where('providerMessageId','==',status.id).limit(3).get();
    for(const item of lifecycle.docs){
     const entry=item.data();
     if(entry?.status!=='accepted'||!uidValid(entry.sellerUid)||
        !['ad_approved','selling_ready'].includes(entry.kind))continue;
     const rank={sent:1,delivered:2,read:3,failed:4};
     if(entry.deliveryStatus&&rank[entry.deliveryStatus]>=rank[status.status])continue;
     await item.ref.update({deliveryStatus:status.status,deliveryStatusAt:clock()});
    }
   }
  }
  if(!uidValid(pilotUid))return;
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
   const created=await db.runTransaction(async tx=>{
    const previous=await tx.get(ref);
    if(previous.exists)return false;
    const fresh=await tx.get(preferenceRef);
    if(!fresh.exists||fresh.data()?.ownerUid!==pilotUid||fresh.data()?.phone!==event.from)return false;
    if(event.action!=='stop'&&fresh.data()?.optedIn!==true)return false;
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
    return true;
   });
   if(!created||event.action==='stop')continue;
   // A quick reply is an inbound message, not a browser redirect. Send
   // a single WhatsApp service response with the next actionable URL.
   // The transaction-created action is the durable idempotency barrier:
   // webhook redelivery must NEVER generate a second response.
   const token=getAccessToken(),version=getApiVersion();
   if(typeof token!=='string'||token.length<20||!/^v\d+\.\d+$/.test(version)){
    await ref.update({state:'needs_review',replyStatus:'sender_configuration_missing',updatedAt:clock()});
    continue;
   }
   const text=event.action==='main_menu'?null:event.action==='start_selling'?
    'Your approved Teyza business can activate selling for R99 per full calendar month (initial charge prorated when eligible). Read the benefits: https://teyza.co.za/seller-getting-started.html\n\nReply MENU for more options.':
    event.action==='advertise'?
    'Create your advertisement at https://teyza.co.za/ads/ using your approved seller account. Teyza admin reviews it first; only approved campaigns can then be paid for securely on the same page.\n\nReply MENU anytime to see the choices again.':
    'Your request to speak to a Teyza consultant has been recorded. Our support team will follow up.\n\nReply MENU anytime to see the choices again.';
   try{
    const outbound=event.action==='main_menu'?
     {messaging_product:'whatsapp',recipient_type:'individual',to:event.from.slice(1),
      type:'interactive',interactive:{type:'button',
       body:{text:'Welcome to Teyza! Choose an option below. You can type MENU again whenever you need to return here.'},
       action:{buttons:[
        {type:'reply',reply:{id:'teyza_start_selling',title:'Start selling'}},
        {type:'reply',reply:{id:'teyza_advertise',title:'Advertise on Teyza'}},
        {type:'reply',reply:{id:'teyza_consultant',title:'Talk to consultant'}}
       ]}}}:
     {messaging_product:'whatsapp',recipient_type:'individual',to:event.from.slice(1),
      type:'text',text:{preview_url:true,body:text}};
    const response=await send('https://graph.facebook.com/'+version+'/'+numberId+'/messages',{
     method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
     body:JSON.stringify(outbound),signal:AbortSignal.timeout(10000)
    });
    const body=await response.json().catch(()=>null),messageId=body?.messages?.[0]?.id;
    if(!response.ok||typeof messageId!=='string'||!messageId){
     await ref.update({state:'needs_review',replyStatus:'provider_rejected',httpStatus:response.status||0,updatedAt:clock()});
    }else{
     await ref.update({state:'completed',replyStatus:'accepted',replyMessageId:messageId,updatedAt:clock()});
    }
   }catch(_){
    // Unknown network outcome: never retry automatically (duplicate risk).
    await ref.update({state:'needs_review',replyStatus:'delivery_uncertain',updatedAt:clock()});
   }
  }
 }
 return {route};
}
module.exports={extractActions,createPilotRouter,choices};
