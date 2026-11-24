'use strict';
// Signed webhook calls this router only AFTER raw-body HMAC validation.
// Only explicit, approved support conversations retain short text in the existing private seller/admin inbox.
// General diagnostics never persist phone numbers or raw webhook payloads.
const crypto=require('node:crypto');
const {createWelcomeRollout}=require('./whatsapp-rollout');
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
     typeof text==='string'&&/^\s*(?:AGENT|HUMAN|SUPPORT|TALK TO (?:A )?CONSULTANT|CHAT WITH (?:AN? )?AGENT)\s*$/i.test(text)?'consultant':
     choices.get(response)||({teyza_start_selling:'start_selling',teyza_advertise:'advertise',teyza_consultant:'consultant'}[response]);
   if(action)result.push({action,from:'+'+from,id:m.id});
  }
 }
 return result.slice(0,500);
}
// Only authenticated support conversations can retain freeform text.
// All webhook payloads must have passed raw-body HMAC validation first.
function extractSupportTexts(payload,numberId){
 const result=[];
 if(payload?.object!=='whatsapp_business_account')return result;
 for(const entry of Array.isArray(payload.entry)?payload.entry.slice(0,50):[])
 for(const change of Array.isArray(entry.changes)?entry.changes.slice(0,50):[]){
  if(change?.field!=='messages'||change.value?.metadata?.phone_number_id!==numberId)continue;
  for(const m of Array.isArray(change.value.messages)?change.value.messages.slice(0,100):[]){
   if(m.type!=='text'||typeof m.text?.body!=='string'||m.text.body.trim().length<2 ||
     m.text.body.length>1000||!/^wamid[.][A-Za-z0-9_.:=+/-]{1,500}$/.test(m.id||'') ||
     !/^[1-9][0-9]{7,14}$/.test(m.from||''))continue;
   const body=m.text.body.trim();
   if(/^(?:STOP|MENU|MAIN MENU|HI|HELLO|START|AGENT|HUMAN|SUPPORT|TALK TO (?:A )?CONSULTANT|CHAT WITH (?:AN? )?AGENT)$/i.test(body))continue;
   result.push({from:'+'+m.from,id:m.id,text:body});
  }
 }
 return result.slice(0,500);
}
function createPilotRouter({db,getPilotUid,getPhoneNumberId,getAccessToken=()=>'',getApiVersion=()=> 'v26.0',getRolloutMode=()=> 'pilot',send=fetch,clock=Date.now}){
 if(!db||typeof getPilotUid!=='function'||typeof getPhoneNumberId!=='function')throw Error('Pilot router dependencies missing');
 const rollout=createWelcomeRollout({getMode:getRolloutMode,getPilotUid});
 async function route(payload){
  const pilotUid=getPilotUid();
  const numberId=getPhoneNumberId();
  if(!['pilot','general','all'].includes(getRolloutMode())||
     getRolloutMode()==='pilot'&&!uidValid(pilotUid)||!/^\d{5,25}$/.test(numberId||''))return;
  // Reconcile signed Meta receipts with an eligible seller's accepted outbox.
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
     if(!rollout.allowsSeller(doc.data()?.sellerUid)||doc.data()?.status!=='accepted')continue;
     // Never turn a delivered/read receipt backwards to sent.
     const previous=doc.data()?.deliveryStatus;
     const rank={sent:1,delivered:2,read:3,failed:4};
     if(previous&&rank[previous]>=rank[status.status])continue;
     await doc.ref.update({deliveryStatus:status.status,deliveryStatusAt:clock()});
    }
   }
  }
  for(const event of extractActions(payload,numberId)){
   // Match consent and the approved account before responding.
   // Read phone only transiently; never persist it in the interaction audit.
   const results=await db.collection('teyzaWhatsAppPreferences').where('phone','==',event.from).limit(20).get();
   const matching=results.docs.filter(s=>rollout.allowsSeller(s.id)&&s.data()?.ownerUid===s.id);
   // STOP revokes every matching consent, even where two records have the same
   // number. Other actions require one unambiguous authenticated seller record.
   if(event.action!=='stop'&&matching.length!==1)continue;
   for(const match of matching){
   const sellerUid=match.id;
   const accountRef=db.doc('teyzaSellerAccounts/'+sellerUid);
   const account=await accountRef.get();
   if(!account.exists||account.data()?.uid!==sellerUid||
      account.data()?.phone!==event.from)continue;
   const pref=match.data();
   if(event.action!=='stop'&&(pref.optedIn!==true||account.data()?.approvalStatus!=='approved'||account.data()?.deletionPending===true))continue;
   const id=crypto.createHash('sha256').update(JSON.stringify([numberId,event.id,event.action])).digest('hex');
   const actionId=event.action==='stop'?id+'_'+sellerUid:id;
   const ref=db.doc('teyzaWhatsAppPilotActions/'+actionId);
   const preferenceRef=db.doc('teyzaWhatsAppPreferences/'+sellerUid);
   const created=await db.runTransaction(async tx=>{
    const previous=await tx.get(ref);
    if(previous.exists)return false;
    const [fresh,currentAccount]=await Promise.all([tx.get(preferenceRef),tx.get(accountRef)]);
    if(!fresh.exists||fresh.data()?.ownerUid!==sellerUid||fresh.data()?.phone!==event.from)return false;
    if(!currentAccount.exists||currentAccount.data()?.uid!==sellerUid||currentAccount.data()?.phone!==event.from)return false;
    if(event.action!=='stop'&&(fresh.data()?.optedIn!==true||currentAccount.data()?.approvalStatus!=='approved'||currentAccount.data()?.deletionPending===true))return false;
    const at=clock();
    const supportRef=db.doc('teyzaSupportTickets/seller_'+sellerUid);
    // Read support state BEFORE any writes in this transaction.
    const supportSnap=['consultant','stop'].includes(event.action)?await tx.get(supportRef):null;
    if(event.action==='consultant'&&supportSnap?.exists&&
       (supportSnap.data().ownerUid!==sellerUid||supportSnap.data().source!=='seller_admin_chat'))return false;
    const destination=event.action==='start_selling'?'/seller-getting-started.html':
      event.action==='advertise'?'/ads/':
      event.action==='consultant'?'seller_support':'none';
    tx.create(ref,{sellerUid,action:event.action,destination,
      state:event.action==='stop'?'completed':'pending',
      source:'signed_meta_whatsapp',createdAt:at});
    if(event.action==='consultant'){
     // Reuse the actual admin/seller threaded inbox. Do not create an
     // orphan "wa_" ticket that staff cannot reply to on WhatsApp.
     if(!supportSnap.exists)tx.create(supportRef,{
      ownerUid:sellerUid,subject:'Seller and business support',
      message:'',status:'open',priority:'normal',revision:0,
      createdBy:sellerUid,createdAt:at,updatedAt:at,source:'seller_admin_chat',
      shopName:currentAccount.data().shopName||'Business',
      lastMessage:'WhatsApp agent requested',lastMessageAt:at,messageCount:0,
      sellerUnread:0,adminUnread:1,whatsAppActive:true,whatsAppHandoffAt:at,whatsAppLastInboundAt:at});
     else tx.update(supportRef,{whatsAppActive:true,whatsAppHandoffAt:at,whatsAppLastInboundAt:at,
      status:'open',updatedAt:at,adminUnread:(supportSnap.data().adminUnread||0)+1});
    }
    if(event.action==='stop'){
     tx.set(preferenceRef,{...fresh.data(),ownerUid:sellerUid,optedIn:false,phone:'',
       optedOutAt:at,updatedAt:at,consentVersion:'seller-approval-v2'});
     if(supportSnap?.exists&&supportSnap.data().ownerUid===sellerUid&&supportSnap.data().source==='seller_admin_chat')
       tx.update(supportRef,{whatsAppActive:false,updatedAt:at});
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
    '🎉 Your Teyza business has been approved! Your business listing is FREE.\n\nReady to sell products or services online? Activate eligible selling tools for R99 per full calendar month. Your first payment may be prorated where enabled.\n\nSee benefits and start here: https://teyza.co.za/seller-getting-started.html\n\nReply MENU for more options.':
    event.action==='advertise'?
    '📣 Want more local exposure? Teyza local ads start at R29 for 7 days, with an additional charge for wider reach.\n\nCreate your advertisement at https://teyza.co.za/ads/ using your approved seller account. Teyza admin reviews it first; after approval, you can pay securely on the same page.\n\nReply MENU anytime for your choices.':
    '✅ Teyza Support is ready to receive your question. Send your message here in WhatsApp and a Teyza consultant can reply in this same chat when available.\n\nPlease do not send passwords, OTP codes or bank details. Reply MENU for other options, or STOP to opt out.';
   try{
    const outbound=event.action==='main_menu'?
     {messaging_product:'whatsapp',recipient_type:'individual',to:event.from.slice(1),
      type:'interactive',interactive:{type:'button',
       body:{text:'🌱 Welcome to Teyza! Your approved business can be discovered by more people nearby, explore deals from participating wholesalers and unlock selling tools for R99/month. Registration is FREE. Choose what you want to do below. Reply MENU to come back here.'},
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
  // After a seller explicitly requests an agent, bridge their follow-up text
  // into the authenticated admin/seller support conversation; idempotent on
  // Meta's message id, and private to that approved, consenting seller.
  for(const event of extractSupportTexts(payload,numberId)){
   const matches=await db.collection('teyzaWhatsAppPreferences').where('phone','==',event.from).limit(20).get();
   const eligible=matches.docs.filter(m=>rollout.allowsSeller(m.id)&&m.data()?.ownerUid===m.id&&m.data()?.optedIn===true);
   if(eligible.length!==1)continue;
   const uid=eligible[0].id;
   const account=await db.doc('teyzaSellerAccounts/'+uid).get();
   if(!account.exists||account.data().uid!==uid||account.data().approvalStatus!=='approved'||
      account.data().deletionPending===true||account.data().phone!==event.from)continue;
   const ticketRef=db.doc('teyzaSupportTickets/seller_'+uid);
   const messageId='wa_'+crypto.createHash('sha256').update(numberId+'|'+event.id).digest('hex');
   const messageRef=db.doc('teyzaSupportTickets/seller_'+uid+'/messages/'+messageId);
   await db.runTransaction(async tx=>{
    const [ticket,existing,pref]=await Promise.all([
      tx.get(ticketRef),tx.get(messageRef),tx.get(db.doc('teyzaWhatsAppPreferences/'+uid))
    ]);
    if(existing.exists||!ticket.exists||ticket.data().whatsAppActive!==true||
       ticket.data().source!=='seller_admin_chat'||ticket.data().ownerUid!==uid||
       !pref.exists||pref.data().optedIn!==true||pref.data().phone!==event.from)return;
    const at=clock(),count=ticket.data().messageCount||0;
    tx.create(messageRef,{sender:'seller',senderUid:uid,source:'meta_whatsapp_support',
      text:event.text,sequence:count+1,createdAt:at});
    tx.update(ticketRef,{lastMessage:event.text.slice(0,180),lastMessageAt:at,
      whatsAppLastInboundAt:at,messageCount:count+1,adminUnread:(ticket.data().adminUnread||0)+1,
      status:'open',revision:(ticket.data().revision||0)+1,updatedAt:at});
   });
  }
 }
 return {route};
}
module.exports={extractActions,extractSupportTexts,createPilotRouter,choices};
