'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHumanReply}=require('./whatsapp-human-reply');
function fixture(overrides={}){
 const at=1000000,uid='seller1',ticketId='seller_'+uid,messageId='reply1';
 const data=new Map([
 ['teyzaSupportTickets/'+ticketId,{ownerUid:uid,source:'seller_admin_chat',
   whatsAppActive:true,whatsAppLastInboundAt:at-100}],
 ['teyzaSupportTickets/'+ticketId+'/messages/'+messageId,
   {sender:'admin',senderUid:'adminUser',text:'Hello, how can we help?'}],
 ['teyzaSellerAccounts/'+uid,{uid,approvalStatus:'approved',phone:'+27712345678'}],
 ['teyzaWhatsAppPreferences/'+uid,{ownerUid:uid,optedIn:true,phone:'+27712345678'}]
 ]);
 const doc=path=>({path,get:async()=>({exists:data.has(path),data:()=>data.get(path)}),
 update:async changes=>{data.set(path,{...data.get(path),...structuredClone(changes)})}});
 const db={doc,runTransaction:async fn=>fn({
  get:ref=>ref.get(),update:(ref,changes)=>data.set(ref.path,{...data.get(ref.path),...structuredClone(changes)})
 })};
 const calls=[];
 let networkError=false,providerError=false;
 const worker=createHumanReply({db,getToken:()=>overrides.token??'test-token-for-sender-123456',
 getPhoneNumberId:()=> '1466599163197469',getApiVersion:()=> 'v26.0',clock:()=>at,
 send:async(_url,req)=>{
   calls.push(JSON.parse(req.body));
   if(networkError)throw Error('uncertain');
   return providerError?{ok:false,status:403,json:async()=>({})}:
    {ok:true,status:200,json:async()=>({messages:[{id:'wamid.test-'+calls.length}]})};
 }});
 return {data,calls,worker,ticketId,messageId,at,
  setNetworkError:()=>{networkError=true;},setProviderError:()=>{providerError=true;}};
}
test('Approved admin support reply is sent to verified opted-in seller and claimed once',async()=>{
 const f=fixture();await f.worker.process(f.ticketId,f.messageId);
 assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].to,'27712345678');
 assert.equal(f.calls[0].text.body,'Teyza Support: Hello, how can we help?');
 const doc=f.data.get('teyzaSupportTickets/'+f.ticketId+'/messages/'+f.messageId);
 assert.equal(doc.whatsAppReplyStatus,'accepted');
 await f.worker.process(f.ticketId,f.messageId);
 assert.equal(f.calls.length,1);
});
test('Not sent without active WhatsApp handoff, approved seller or consent',async()=>{
 for(const patch of [
  f=>{f.data.get('teyzaSupportTickets/'+f.ticketId).whatsAppActive=false;},
  f=>{f.data.get('teyzaSellerAccounts/seller1').approvalStatus='pending';},
  f=>{f.data.get('teyzaWhatsAppPreferences/seller1').optedIn=false;},
  f=>{f.data.get('teyzaWhatsAppPreferences/seller1').phone='+27820000000';},
  f=>{f.data.get('teyzaSupportTickets/'+f.ticketId+'/messages/reply1').sender='seller';}
 ]){
  const f=fixture();patch(f);await f.worker.process(f.ticketId,f.messageId);
  assert.equal(f.calls.length,0);
 }
});
test('More than 24 hours after last inbound blocks free-text WhatsApp sends',async()=>{
 const f=fixture();f.data.get('teyzaSupportTickets/'+f.ticketId).whatsAppLastInboundAt=f.at-24*60*60*1000;
 await f.worker.process(f.ticketId,f.messageId);
 assert.equal(f.calls.length,0);
 assert.equal(f.data.get('teyzaSupportTickets/'+f.ticketId+'/messages/reply1').whatsAppReplyStatus,'window_expired');
});
test('Missing token fails closed without sending',async()=>{
 const f=fixture({token:''});await f.worker.process(f.ticketId,f.messageId);
 assert.equal(f.calls.length,0);
 assert.equal(f.data.get('teyzaSupportTickets/'+f.ticketId+'/messages/reply1').whatsAppReplyStatus,'configuration_required');
});
test('Uncertain Meta outcome is marked for review and never auto-retried',async()=>{
 const f=fixture();f.setNetworkError();await f.worker.process(f.ticketId,f.messageId);
 await f.worker.process(f.ticketId,f.messageId);
 assert.equal(f.calls.length,1);
 assert.equal(f.data.get('teyzaSupportTickets/'+f.ticketId+'/messages/reply1').whatsAppReplyStatus,'needs_review');
});
test('Meta rejection is marked for review, not reported as delivered',async()=>{
 const f=fixture();f.setProviderError();await f.worker.process(f.ticketId,f.messageId);
 assert.equal(f.calls.length,1);
 assert.equal(f.data.get('teyzaSupportTickets/'+f.ticketId+'/messages/reply1').whatsAppReplyStatus,'needs_review');
});
