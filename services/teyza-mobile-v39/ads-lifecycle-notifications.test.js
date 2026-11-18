'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {adEvent,sellingEvent,eventId,createLifecycleNotifications,createWhatsAppLifecycleSender}=
 require('./ads-lifecycle-notifications');
const seller='seller123',adId='11cc22dd-3333-4444-5555-666677778888',when=10000;
function fixture(){
 const data=new Map(Object.entries({
  ['teyzaSellerAccounts/'+seller]:{uid:seller,phone:'+27712345678',approvalStatus:'approved'},
  ['teyzaWhatsAppPreferences/'+seller]:{ownerUid:seller,phone:'+27712345678',optedIn:true},
  ['teyzaMobileVerification/'+seller]:{ownerUid:seller,status:'approved'},
  ['teyzaPublicShops/'+seller]:{sellerUid:seller,status:'active',sellingEnabled:true},
  ['teyzaShopperAds/'+adId]:{ownerUid:seller,status:'approved_unpaid',paymentStatus:'unpaid',reviewedBy:'admin99'}
 }));
 const ref=path=>({path,get:async()=>({exists:data.has(path),data:()=>data.get(path)}),
  update:async patch=>data.set(path,{...data.get(path),...patch})});
 const db={doc:ref,runTransaction:async cb=>{
  const work=[];const tx={get:r=>r.get(),
   create:(r,val)=>work.push(()=>{if(data.has(r.path))throw Error('ALREADY_EXISTS');data.set(r.path,val);}),
   update:(r,val)=>work.push(()=>data.set(r.path,{...data.get(r.path),...val}))};
  const result=await cb(tx);for(const fn of work)fn();return result;
 }};
 const notices=[],notifications={queue:async(event,value)=>notices.push({event,value})};
 return {data,db,notices,notifications};
}
test('Only real status transitions cause lifecycle events',()=>{
 const pending={ownerUid:seller,status:'pending_review',paymentStatus:'unpaid'};
 const approved={...pending,status:'approved_unpaid',reviewedBy:'admin99'};
 assert.equal(adEvent(null,pending,adId)?.kind,'ad_submitted');
 assert.equal(adEvent(pending,approved,adId)?.kind,'ad_approved');
 assert.equal(adEvent(approved,approved,adId),null);
 assert.equal(adEvent(pending,{...approved,reviewedBy:seller},adId),null);
 assert.equal(adEvent(pending,{...approved,paymentStatus:'paid'},adId),null);
 assert.equal(adEvent(pending,{...pending,status:'active'},adId),null);
 assert.equal(adEvent(approved,{...approved,status:'active',paymentStatus:'paid'},adId)?.kind,'ad_active');
 assert.equal(sellingEvent({sellingEnabled:false},{sellerUid:seller,status:'active',approvalStatus:'approved',
  identityVerified:true,sellingEnabled:true},seller)?.kind,'selling_ready');
 assert.equal(sellingEvent({sellingEnabled:true},{sellerUid:seller,status:'active',approvalStatus:'approved',
  identityVerified:true,sellingEnabled:true},seller),null);
 assert.equal(sellingEvent(null,{sellerUid:seller,status:'active',approvalStatus:'approved',
  identityVerified:true,sellingEnabled:false},seller),null);
});
test('Submitted ad enters admin support queue idempotently with an authenticated review path',async()=>{
 const f=fixture(),svc=createLifecycleNotifications({db:f.db,notifications:f.notifications,clock:()=>when});
 const pending={ownerUid:seller,status:'pending_review',paymentStatus:'unpaid'};
 await svc.onAdWrite('evt-submitted',adId,null,pending);
 await svc.onAdWrite('evt-submitted',adId,null,pending);
 const tickets=[...f.data.entries()].filter(([key])=>key.startsWith('teyzaSupportTickets/'));
 assert.equal(tickets.length,1);
 assert.equal(tickets[0][1].status,'open');
 assert.match(tickets[0][1].message,/ops_ads_review/);
 assert.equal(f.notices.length,0,'Seller cannot pay or receive approval from submission alone');
});
test('Admin ticket resolves only after independent review, never just after submission',async()=>{
 const f=fixture(),svc=createLifecycleNotifications({db:f.db,notifications:f.notifications,clock:()=>when});
 const pending={ownerUid:seller,status:'pending_review',paymentStatus:'unpaid'};
 await svc.onAdWrite('submitted',adId,null,pending);
 const ticketId='teyzaSupportTickets/ads_'+eventId('admin',adId);
 assert.equal(f.data.get(ticketId).status,'open');
 await svc.onAdWrite('approved',adId,pending,
  {...pending,status:'approved_unpaid',reviewedBy:'admin99'});
 assert.equal(f.data.get(ticketId).status,'resolved');
 assert.equal(f.data.get(ticketId).reviewOutcome,'ad_approved');
 await svc.onAdWrite('approved',adId,pending,
  {...pending,status:'approved_unpaid',reviewedBy:'admin99'});
 assert.equal(f.data.get(ticketId).revision,1);
});
test('Independent admin approval creates seller notification and a single WhatsApp outbox entry',async()=>{
 const f=fixture(),svc=createLifecycleNotifications({db:f.db,notifications:f.notifications,clock:()=>when});
 const pending={ownerUid:seller,status:'pending_review',paymentStatus:'unpaid'};
 const approved={...pending,status:'approved_unpaid',reviewedBy:'admin99'};
 await svc.onAdWrite('evt-approved',adId,pending,approved);
 await svc.onAdWrite('evt-approved',adId,pending,approved);
 const entries=[...f.data].filter(([path])=>path.startsWith('teyzaWhatsAppEventOutbox/'));
 assert.equal(entries.length,1);
 assert.equal(entries[0][1].status,'queued');
 assert.equal(f.notices[0].value.title,'Advertisement approved — payment available');
 assert.match(f.notices[0].value.body,/pay once/);
 assert.equal(f.data.get('teyzaShopperAds/'+adId).status,'approved_unpaid');
});
test('A seller without WhatsApp consent still gets an in-app update, but no outbound WhatsApp event',async()=>{
 const f=fixture(),svc=createLifecycleNotifications({db:f.db,notifications:f.notifications,clock:()=>when});
 f.data.get('teyzaWhatsAppPreferences/'+seller).optedIn=false;
 const pending={ownerUid:seller,status:'pending_review',paymentStatus:'unpaid'};
 await svc.onAdWrite('evt-approved-no-consent',adId,pending,
  {...pending,status:'approved_unpaid',reviewedBy:'admin99'});
 assert.equal(f.notices.length,1);
 assert.equal([...f.data.keys()].filter(k=>k.startsWith('teyzaWhatsAppEventOutbox/')).length,0);
});
test('Seller selling-ready requires verified approved active selling entitlement',async()=>{
 const f=fixture(),svc=createLifecycleNotifications({db:f.db,notifications:f.notifications,clock:()=>when});
 await svc.onSellingWrite('evt-ready',seller,{sellingEnabled:false},{sellerUid:seller,
  status:'active',approvalStatus:'approved',identityVerified:true,sellingEnabled:true});
 assert.equal(f.notices.length,1);
 assert.match(f.notices[0].value.title,/start selling/);
 const row=f.data.get('teyzaWhatsAppEventOutbox/'+eventId('selling_ready',seller));
 assert.equal(row.kind,'selling_ready');
});
test('WhatsApp sends only an approved zero-parameter template to verified opted-in owner and never twice',async()=>{
 const f=fixture(),key=eventId('ad_approved',adId),path='teyzaWhatsAppEventOutbox/'+key;
 f.data.set(path,{sellerUid:seller,kind:'ad_approved',advertisementId:adId,status:'queued'});
 const sends=[];
 const sender=createWhatsAppLifecycleSender({db:f.db,clock:()=>when,
  getAuthUser:async()=>({phoneNumber:'+27712345678',providerData:[{providerId:'phone',phoneNumber:'+27712345678'}]}),
  getToken:()=> 'TEST_VALID_ACCESS_TOKEN_12345',
  getConfig:()=>({phoneNumberId:'123456789',apiVersion:'v26.0',language:'en',
   adApprovedTemplate:'teyza_ad_approved',sellingReadyTemplate:'teyza_selling_ready'}),
  send:async(url,opts)=>{sends.push(JSON.parse(opts.body));return {ok:true,status:200,json:async()=>({messages:[{id:'wamid.success'}]})};}});
 await sender.deliver(key);await sender.deliver(key);
 assert.equal(sends.length,1);
 assert.equal(sends[0].template.name,'teyza_ad_approved');
 assert.equal(sends[0].template.components,undefined);
 assert.equal(f.data.get(path).status,'accepted');
});
test('WhatsApp respects opt-out, seller/payment status and configured template gate',async()=>{
 for(const change of [
  f=>{f.data.get('teyzaWhatsAppPreferences/'+seller).optedIn=false;},
  f=>{f.data.get('teyzaShopperAds/'+adId).status='active';},
  f=>{f.data.get('teyzaSellerAccounts/'+seller).approvalStatus='pending';}
 ]){
  const f=fixture(),key=eventId('ad_approved',adId),path='teyzaWhatsAppEventOutbox/'+key;
  f.data.set(path,{sellerUid:seller,kind:'ad_approved',advertisementId:adId,status:'queued'});
  change(f);let sent=0;
  const sender=createWhatsAppLifecycleSender({db:f.db,
   getAuthUser:async()=>({phoneNumber:'+27712345678',providerData:[{providerId:'phone',phoneNumber:'+27712345678'}]}),
   getToken:()=> 'TEST_VALID_ACCESS_TOKEN_12345',
   getConfig:()=>({phoneNumberId:'123456789',apiVersion:'v26.0',language:'en',
    adApprovedTemplate:'teyza_ad_approved'}),
   send:async()=>{sent++;throw Error('NOT_EXPECTED');}});
  await sender.deliver(key);
  assert.equal(sent,0);assert.equal(f.data.get(path).status,'skipped');
 }
 const f=fixture(),key=eventId('ad_approved',adId),path='teyzaWhatsAppEventOutbox/'+key;
 f.data.set(path,{sellerUid:seller,kind:'ad_approved',advertisementId:adId,status:'queued'});
 const sender=createWhatsAppLifecycleSender({db:f.db,getAuthUser:async()=>null,getToken:()=> '',
  getConfig:()=>({}),send:async()=>{throw Error('NEVER_CALL');}});
 await sender.deliver(key);
 assert.equal(f.data.get(path).status,'configuration_required');
});
