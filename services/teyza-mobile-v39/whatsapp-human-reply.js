'use strict';
// Send replies written by authorised Teyza administrators in the existing
// seller/admin support inbox to the *same* WhatsApp conversation.
// No broad broadcast, historical replay, or blind network retries.
function createHumanReply({db,getToken=()=>'',getPhoneNumberId=()=>'',getApiVersion=()=> 'v26.0',send=fetch,clock=Date.now}){
  async function process(ticketId,messageId){
    if(!/^seller_[A-Za-z0-9_-]{6,128}$/.test(ticketId)||
       !/^[A-Za-z0-9_-]{1,128}$/.test(messageId))return;
    const uid=ticketId.slice(7),ticketRef=db.doc('teyzaSupportTickets/'+ticketId);
    const messageRef=db.doc('teyzaSupportTickets/'+ticketId+'/messages/'+messageId);
    const [ticketSnap,messageSnap,accountSnap,prefSnap]=await Promise.all([
      ticketRef.get(),messageRef.get(),db.doc('teyzaSellerAccounts/'+uid).get(),
      db.doc('teyzaWhatsAppPreferences/'+uid).get()
    ]);
    if(!ticketSnap.exists||!messageSnap.exists||!accountSnap.exists||!prefSnap.exists)return;
    const ticket=ticketSnap.data(),message=messageSnap.data(),account=accountSnap.data(),pref=prefSnap.data();
    if(ticket.ownerUid!==uid||ticket.source!=='seller_admin_chat'||ticket.whatsAppActive!==true||
       !Number.isSafeInteger(ticket.whatsAppHandoffAt)||!Number.isSafeInteger(message.createdAt)||
       message.createdAt<ticket.whatsAppHandoffAt||
       message.sender!=='admin'||typeof message.senderUid!=='string'||
       typeof message.text!=='string'||message.text.trim().length<2||message.text.length>1000 ||
       account.uid!==uid||account.approvalStatus!=='approved'||account.deletionPending===true||
       pref.ownerUid!==uid||pref.optedIn!==true||pref.phone!==account.phone||
       !/^\+[1-9]\d{7,14}$/.test(account.phone||''))return;
    const since=ticket.whatsAppLastInboundAt;
    if(!Number.isSafeInteger(since)||clock()-since>=24*60*60*1000||since>clock()+60000){
      await messageRef.update({whatsAppReplyStatus:'window_expired',whatsAppReplyUpdatedAt:clock()});
      return;
    }
    const token=getToken(),phoneId=getPhoneNumberId(),version=getApiVersion();
    if(typeof token!=='string'||token.length<20||!/^\d{5,25}$/.test(phoneId||'')||!/^v\d+\.\d+$/.test(version)){
      await messageRef.update({whatsAppReplyStatus:'configuration_required',whatsAppReplyUpdatedAt:clock()});
      return;
    }
    const claimed=await db.runTransaction(async tx=>{
      const [current,latestTicket,latestPref,latestAccount]=await Promise.all([
        tx.get(messageRef),tx.get(ticketRef),tx.get(db.doc('teyzaWhatsAppPreferences/'+uid)),
        tx.get(db.doc('teyzaSellerAccounts/'+uid))
      ]);
      if(!current.exists||current.data().whatsAppReplyStatus||
         current.data().sender!=='admin'||!latestTicket.exists||!latestPref.exists||
         !latestAccount.exists||latestTicket.data().whatsAppActive!==true||
         latestTicket.data().whatsAppLastInboundAt!==since||
         latestTicket.data().whatsAppHandoffAt!==ticket.whatsAppHandoffAt||
         latestAccount.data().phone!==account.phone||
         latestAccount.data().approvalStatus!=='approved'||latestPref.data().optedIn!==true||
         latestPref.data().phone!==account.phone)return false;
      tx.update(messageRef,{whatsAppReplyStatus:'sending',whatsAppReplyAttemptedAt:clock()});
      return true;
    });
    if(!claimed)return;
    try{
      const response=await send('https://graph.facebook.com/'+version+'/'+phoneId+'/messages',{
        method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
        body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',
          to:account.phone.slice(1),type:'text',
          text:{preview_url:false,body:'Teyza Support: '+message.text.trim()}}),
        signal:AbortSignal.timeout(15000)
      });
      const payload=await response.json().catch(()=>null);
      const providerId=payload?.messages?.[0]?.id;
      if(!response.ok||typeof providerId!=='string'||!/^wamid\./.test(providerId)){
        await messageRef.update({whatsAppReplyStatus:'needs_review',whatsAppReplyReason:'provider_rejected',
          whatsAppReplyHttpStatus:response.status||0,whatsAppReplyUpdatedAt:clock()});
        return;
      }
      // Provider acceptance is not proof of delivery to the recipient.
      await messageRef.update({whatsAppReplyStatus:'accepted',whatsAppProviderMessageId:providerId,
        whatsAppReplyUpdatedAt:clock()});
    }catch(_){
      // A network timeout may happen after Meta accepted the send.
      // NEVER blindly retry; a human must inspect the delivery state.
      await messageRef.update({whatsAppReplyStatus:'needs_review',
        whatsAppReplyReason:'delivery_uncertain',whatsAppReplyUpdatedAt:clock()});
    }
  }
  return {process};
}
module.exports={createHumanReply};
