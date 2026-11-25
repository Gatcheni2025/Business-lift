'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createPilotRouter,extractActions}=require('./whatsapp-pilot-routing');
function message(id,type,detail,from='27712345678'){
 return {id,from,type,...detail};
}
function payload(messages=[],statuses=[],numberId='1466599163197469'){
 return {object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{
  metadata:{phone_number_id:numberId},messages,statuses}}]}]};
}
function fake(options={}){
 const data=new Map([
  ['teyzaSellerAccounts/seller1',{uid:'seller1',phone:'+27712345678',approvalStatus:'approved'}],
  ['teyzaWhatsAppPreferences/seller1',{ownerUid:'seller1',phone:'+27712345678',optedIn:true}],
  ['teyzaWhatsAppApprovalOutbox/sub1',{sellerUid:'seller1',status:'accepted',providerMessageId:'wamid.sent1'}]
 ]);
 const doc=path=>({path,id:path.split('/').at(-1),get:async()=>({exists:data.has(path),data:()=>data.get(path)}),
  create:async value=>{if(data.has(path))throw Error('already exists');data.set(path,structuredClone(value));},
  set:async value=>data.set(path,structuredClone(value)),
  update:async value=>data.set(path,{...data.get(path),...structuredClone(value)})});
 let transactionQueue=Promise.resolve();
 const db={doc,collection:name=>({where:(field,op,val)=>({
  limit:()=>({get:async()=>({docs:[...data].filter(([key,v])=>
   key.startsWith(name+'/')&&v?.[field]===val).map(([key,v])=>({
    id:key.split('/').at(-1),data:()=>v,ref:doc(key)}))})})
 })}),runTransaction:fn=>{
  const operation=transactionQueue.then(async()=>{
  const tx={get:ref=>ref.get(),create:(ref,value)=>{if(data.has(ref.path))throw Error('duplicate');data.set(ref.path,structuredClone(value));},
   set:(ref,value)=>data.set(ref.path,structuredClone(value)),
   update:(ref,value)=>{if(!data.has(ref.path))throw Error('not found');data.set(ref.path,{...data.get(ref.path),...structuredClone(value)});}};
  return fn(tx);
  });
  transactionQueue=operation.catch(()=>{});return operation;
 }};
 let uid='seller1';
 return {data,router:createPilotRouter({db,getPilotUid:()=>uid,
  getPhoneNumberId:()=> '1466599163197469',getRolloutMode:()=>options.mode||'pilot',clock:()=>777,
  getAccessToken:()=>options.token||'',send:options.send||fetch}),
  setPilotUid:v=>{uid=v;}};
}
test('Signed quick replies are mapped to the three pilot intents, not arbitrary text',()=>{
 const p=payload([
  message('wamid.one','button',{button:{text:'Start selling on Teyza'}}),
  message('wamid.two','interactive',{interactive:{type:'button_reply',button_reply:{title:'Advertise on Teyza'}}}),
  message('wamid.three','button',{button:{text:'Talk to consultant'}}),
  message('wamid.four','text',{text:{body:'STOP'}}),
  message('wamid.five','text',{text:{body:'Start selling on Teyza'}})
 ]);
 assert.deepEqual(extractActions(p,'1466599163197469').map(x=>x.action),
  ['start_selling','advertise','consultant','stop']);
});
test('One approved and opted-in seller gets deduped, private, route-specific actions',async()=>{
 const f=fake();const p=payload([
  message('wamid.one','button',{button:{text:'Start selling on Teyza'}}),
  message('wamid.two','button',{button:{text:'Advertise on Teyza'}}),
  message('wamid.three','button',{button:{text:'Talk to consultant'}})
 ]);
 await f.router.route(p);await f.router.route(p);
 const records=[...f.data].filter(([path])=>path.startsWith('teyzaWhatsAppPilotActions/'));
 assert.equal(records.length,3);
 assert.deepEqual(records.map(x=>x[1].action).sort(),['advertise','consultant','start_selling']);
 for(const [,v] of records){
  assert(!JSON.stringify(v).includes('27712345678'));
  assert(!JSON.stringify(v).includes('wamid.'));
  assert.equal(v.sellerUid,'seller1');
 }
});
test('STOP records revocation and disables future routing',async()=>{
 const f=fake();await f.router.route(payload([
  message('wamid.stop','text',{text:{body:' STOP '}})]));
 const pref=f.data.get('teyzaWhatsAppPreferences/seller1');
 assert.equal(pref.optedIn,false);assert.equal(pref.phone,'');
 await f.router.route(payload([message('wamid.later','button',{button:{text:'Advertise on Teyza'}})]));
 assert.equal([...f.data].filter(([k])=>k.startsWith('teyzaWhatsAppPilotActions/')).length,1);
});
test('Missing pilot UID, wrong sender, unapproved owner or wrong number all fail closed',async()=>{
 const f=fake();f.setPilotUid('');
 await f.router.route(payload([message('wamid.one','button',{button:{text:'Talk to consultant'}})]));
 f.setPilotUid('seller1');
 await f.router.route(payload([message('wamid.two','button',{button:{text:'Talk to consultant'}},'27799999999')]));
 f.data.get('teyzaSellerAccounts/seller1').approvalStatus='pending';
 await f.router.route(payload([message('wamid.three','button',{button:{text:'Talk to consultant'}})]));
 await f.router.route(payload([message('wamid.four','button',{button:{text:'Talk to consultant'}})],[],'999'));
 assert.equal([...f.data].filter(([k])=>k.startsWith('teyzaWhatsAppPilotActions/')).length,0);
});
test('Only signed status data for the pilot outbox updates delivery receipt',async()=>{
 const f=fake();const receipt=payload([], [{id:'wamid.sent1',status:'delivered'}]);
 await f.router.route(receipt);
 assert.equal(f.data.get('teyzaWhatsAppApprovalOutbox/sub1').deliveryStatus,'delivered');
 await f.router.route(payload([],[{id:'wamid.sent1',status:'sent'}]));
 assert.equal(f.data.get('teyzaWhatsAppApprovalOutbox/sub1').deliveryStatus,'delivered');
});

test('A fresh equal signed receipt confirms legacy delivery provenance without backfill or downgrade',async()=>{
 for(const status of ['delivered','read']){
  const f=fake(),path='teyzaWhatsAppApprovalOutbox/sub1';
  Object.assign(f.data.get(path),{deliveryStatus:status,deliveryStatusAt:123});
  assert.equal(f.data.get(path).deliveryStatusSource,undefined);
  const lower=status==='read'?'delivered':'sent';
  await f.router.route(payload([], [{id:'wamid.sent1',status:lower}]));
  assert.equal(f.data.get(path).deliveryStatus,status);
  assert.equal(f.data.get(path).deliveryStatusSource,undefined);
  await f.router.route(payload([], [{id:'wamid.sent1',status}]));
  assert.equal(f.data.get(path).deliveryStatus,status);
  assert.equal(f.data.get(path).deliveryStatusSource,'meta_whatsapp_signed_webhook');
  assert.equal(f.data.get(path).deliveryStatusAt,123);
  await f.router.route(payload([], [{id:'wamid.sent1',status:'failed',errors:[{code:131026}]}]));
  assert.equal(f.data.get(path).deliveryStatus,status);
  assert.equal(f.data.get(path).deliveryStatusAt,123);
  assert.equal(f.data.get(path).deliveryStatusSource,'meta_whatsapp_signed_webhook');
  assert.equal(f.data.get(path).deliveryErrorCode,undefined);
 }
});

test('Concurrent and late callbacks cannot overwrite a confirmed delivery or read',async()=>{
 const f=fake();
 await Promise.all(['read','delivered','failed','sent'].map(status=>f.router.route(payload([], [{id:'wamid.sent1',status}]))));
 const row=f.data.get('teyzaWhatsAppApprovalOutbox/sub1');
 assert.equal(row.deliveryStatus,'read');
 assert.equal(row.deliveryStatusSource,'meta_whatsapp_signed_webhook');
 const at=row.deliveryStatusAt;
 await f.router.route(payload([], [{id:'wamid.sent1',status:'failed',errors:[{code:131026}]}]));
 assert.equal(f.data.get('teyzaWhatsAppApprovalOutbox/sub1').deliveryStatus,'read');
 assert.equal(f.data.get('teyzaWhatsAppApprovalOutbox/sub1').deliveryStatusAt,at);
 assert.equal(f.data.get('teyzaWhatsAppApprovalOutbox/sub1').deliveryErrorCode,null);
});

test('Failure receipts retain only a safe numeric reason and yield to later delivery evidence',async()=>{
 const f=fake();
 const failure={id:'wamid.sent1',status:'failed',timestamp:'1794600000',recipient_id:'27712345678',
  errors:[{code:131026,title:'Private recipient details',error_data:{details:'Do not retain me'}}]};
 await f.router.route(payload([], [failure]));
 let row=f.data.get('teyzaWhatsAppApprovalOutbox/sub1');
 assert.equal(row.deliveryStatus,'failed');
 assert.equal(row.deliveryErrorCode,131026);
 assert.equal(row.deliveryProviderTimestamp,1794600000000);
 const cache=[...f.data].filter(([key])=>key.startsWith('teyzaWhatsAppDeliveryState/receipt_'));
 assert.equal(cache.length,1);
 assert(!JSON.stringify(cache).includes('wamid.sent1'));
 assert(!JSON.stringify(cache).includes('27712345678'));
 assert(!JSON.stringify(cache).includes('Private recipient details'));
 assert(!JSON.stringify(cache).includes('Do not retain me'));
 await f.router.route(payload([], [{id:'wamid.sent1',status:'sent'}]));
 assert.equal(f.data.get('teyzaWhatsAppApprovalOutbox/sub1').deliveryStatus,'failed');
 await f.router.route(payload([], [{id:'wamid.sent1',status:'delivered'}]));
 row=f.data.get('teyzaWhatsAppApprovalOutbox/sub1');
 assert.equal(row.deliveryStatus,'delivered');
 assert.equal(row.deliveryErrorCode,null);
});

test('Receipt reconciliation rechecks the live outbox instead of trusting the query snapshot',async()=>{
 const f=fake();
 f.data.get('teyzaWhatsAppApprovalOutbox/sub1').status='needs_review';
 await f.router.route(payload([], [{id:'wamid.sent1',status:'read'}]));
 assert.equal(f.data.get('teyzaWhatsAppApprovalOutbox/sub1').deliveryStatus,undefined);
 const cache=[...f.data].filter(([key])=>key.startsWith('teyzaWhatsAppDeliveryState/receipt_'));
 assert.equal(cache[0][1].deliveryStatus,'read');
});

test('Quick reply receives one URL or support confirmation and never repeats after Meta webhook redelivery',async()=>{
 const sent=[];
 const f=fake({token:'token-test-only-not-real-credential',
  send:async(url,request)=>{
   sent.push({url,body:JSON.parse(request.body)});
   return {ok:true,status:200,json:async()=>({messages:[{id:'wamid.reply'+sent.length}]})};
  }});
 const p=payload([
  message('wamid.sell','button',{button:{text:'Start selling on Teyza'}}),
  message('wamid.ad','button',{button:{text:'Advertise on Teyza'}}),
  message('wamid.consult','button',{button:{text:'Talk to consultant'}})
 ]);
 await f.router.route(p);
 await f.router.route(p);
 assert.equal(sent.length,3);
 assert(sent[0].body.text.body.includes('https://teyza.co.za/seller-getting-started.html'));
 assert(!sent[0].body.text.body.includes('https://teyza.co.za/pay/'),'WhatsApp must link only to the seller guide');
 assert(!sent[0].body.text.body.includes('/download.html'));
 assert(sent[1].body.text.body.includes('https://teyza.co.za/ads/'));
 assert(sent[1].body.text.body.includes('Create your advertisement at'), 'WhatsApp must direct seller to web campaign creation');
 assert(sent[1].body.text.body.includes('reviews it first'), 'WhatsApp must explain review before payment');
 assert(sent[2].body.text.body.includes('consultant'));
 assert(sent.every(x=>x.url.endsWith('/1466599163197469/messages')));
 const actions=[...f.data].filter(([k])=>k.startsWith('teyzaWhatsAppPilotActions/'));
 assert(actions.every(([,v])=>v.state==='completed'&&v.replyStatus==='accepted'&&v.replyMessageId));
 assert.equal([...f.data].filter(([k])=>k.startsWith('teyzaSupportTickets/')).length,1);
 assert.equal(f.data.get('teyzaSupportTickets/seller_seller1').whatsAppActive,true);
 assert.equal(f.data.get('teyzaSupportTickets/seller_seller1').source,'seller_admin_chat');
});
test('Unknown provider outcome is recorded without retry or duplicate response',async()=>{
 let count=0;const f=fake({token:'token-test-only-not-real-credential',
  send:async()=>{count++;throw Error('uncertain network outcome');}});
 const p=payload([message('wamid.uncertain','button',{button:{text:'Advertise on Teyza'}})]);
 await f.router.route(p);await f.router.route(p);
 assert.equal(count,1);
 const action=[...f.data].find(([k])=>k.startsWith('teyzaWhatsAppPilotActions/'))[1];
 assert.equal(action.state,'needs_review');
 assert.equal(action.replyStatus,'delivery_uncertain');
});

test('MENU and MAIN MENU create reusable WhatsApp button menus for the allowlisted seller only',async()=>{
 const sent=[];
 const f=fake({token:'test-only-not-a-real-credential-long',
  send:async(url,request)=>{
   const body=JSON.parse(request.body);sent.push(body);
   return {ok:true,status:200,json:async()=>({messages:[{id:'wamid.menu'+sent.length}]})};
  }});
 await f.router.route(payload([message('wamid.menu1','text',{text:{body:'MENU'}})]));
 await f.router.route(payload([message('wamid.menu1','text',{text:{body:'MENU'}})]));
 await f.router.route(payload([message('wamid.menu2','text',{text:{body:'Main Menu'}})]));
 assert.equal(sent.length,2,'Meta replay must not resend, new MENU command must work');
 assert(sent.every(x=>x.type==='interactive'&&x.interactive.type==='button'));
 const titles=sent[0].interactive.action.buttons.map(x=>x.reply.title);
 assert.deepEqual(titles,['Start selling','Advertise on Teyza','Talk to consultant']);
 const menuText=sent[0].interactive.body.text;
 assert(menuText.includes('Registration is FREE'));
 assert(menuText.includes('R99/month'));
 assert(menuText.includes('wholesalers'));
 assert(menuText.includes('nearby'));

 assert(titles.every(t=>t.length<=20),'Meta interactive buttons permit at most 20 characters');
 await f.router.route(payload([message('wamid.frommenu','interactive',{interactive:{type:'button_reply',
  button_reply:{id:'teyza_start_selling',title:'Start selling'}}})]));
 assert.equal(sent.length,3);
 assert(sent[2].text.body.includes('/seller-getting-started.html'));
 assert(sent[2].text.body.includes('R99 per full calendar month'));
 assert(sent[2].text.body.includes('business listing is FREE'));

 assert(sent[2].text.body.includes('Reply MENU'));
});
test('MENU respects STOP opt-out and never responds to an unapproved owner',async()=>{
 let count=0;
 const f=fake({token:'test-only-not-a-real-credential-long',
  send:async()=>{count++;return {ok:true,status:200,json:async()=>({messages:[{id:'wamid.ok'}]})};}});
 await f.router.route(payload([message('wamid.stop-first','text',{text:{body:'STOP'}})]));
 await f.router.route(payload([message('wamid.menu-after-stop','text',{text:{body:'MENU'}})]));
 assert.equal(count,0);
 const v=f.data.get('teyzaWhatsAppPreferences/seller1');
 assert.equal(v.optedIn,false);
});

test('HI, HELLO, START and mixed-case Menu reopen the interactive menu for the approved pilot seller',async()=>{
 const sent=[];
 const f=fake({token:'test-only-not-a-real-credential-long',
  send:async(_url,request)=>{
   sent.push(JSON.parse(request.body));
   return {ok:true,status:200,json:async()=>({messages:[{id:'wamid.greeting'+sent.length}]})};
  }});
 const p=payload([
  message('wamid.hi','text',{text:{body:'Hi'}}),
  message('wamid.hello','text',{text:{body:' HELLO '}}),
  message('wamid.start','text',{text:{body:'start'}}),
  message('wamid.menu3','text',{text:{body:'mEnU'}})
 ]);
 await f.router.route(p);
 await f.router.route(p);
 assert.equal(sent.length,4,'Each distinct inbound greeting gets one reply, redelivery gets none');
 assert(sent.every(x=>x.type==='interactive'&&x.interactive.type==='button'));
 assert(sent.every(x=>x.interactive.action.buttons.length===3));
 const actions=[...f.data].filter(([key])=>key.startsWith('teyzaWhatsAppPilotActions/'));
 assert.equal(actions.length,4);
 assert(actions.every(([,v])=>v.action==='main_menu'));
});
test('HI does not bypass approval or consent restrictions',async()=>{
 let count=0;
 const f=fake({token:'test-only-not-a-real-credential-long',
  send:async()=>{count++;return {ok:true,status:200,json:async()=>({messages:[{id:'wamid.never'}]})};}});
 f.data.get('teyzaWhatsAppPreferences/seller1').optedIn=false;
 await f.router.route(payload([message('wamid.nooptin','text',{text:{body:'Hi'}})]));
 f.data.get('teyzaWhatsAppPreferences/seller1').optedIn=true;
 f.data.get('teyzaSellerAccounts/seller1').approvalStatus='pending';
 await f.router.route(payload([message('wamid.unapproved','text',{text:{body:'Hello'}})]));
 assert.equal(count,0);
});


test('General replies and delivery receipts work for any approved consenting seller',async()=>{
 const sent=[];
 const f=fake({mode:'general',token:'test-sender-token-for-general-sellers',send:async(url,request)=>{
  sent.push(JSON.parse(request.body));return {ok:true,status:200,json:async()=>({messages:[{id:'wamid.generalreply'}]})};
 }});
 f.setPilotUid('');
 f.data.set('teyzaSellerAccounts/seller2',{uid:'seller2',phone:'+27821234567',approvalStatus:'approved'});
 f.data.set('teyzaWhatsAppPreferences/seller2',{ownerUid:'seller2',phone:'+27821234567',optedIn:true});
 f.data.set('teyzaWhatsAppApprovalOutbox/sub2',{sellerUid:'seller2',status:'accepted',providerMessageId:'wamid.sent2'});
 const p=payload([message('wamid.menu2','text',{text:{body:'MENU'}},'27821234567')],
  [{id:'wamid.sent2',status:'delivered'}]);
 await f.router.route(p);await f.router.route(p);
 assert.equal(sent.length,1);assert.equal(sent[0].to,'27821234567');
 assert.equal(f.data.get('teyzaWhatsAppApprovalOutbox/sub2').deliveryStatus,'delivered');
 assert.equal([...f.data].filter(([p])=>p.startsWith('teyzaWhatsAppPilotActions/'))[0][1].sellerUid,'seller2');
 f.data.get('teyzaWhatsAppPreferences/seller2').optedIn=false;
 await f.router.route(payload([message('wamid.noConsent','text',{text:{body:'MENU'}},'27821234567')]));
 assert.equal(sent.length,1);
});

test('General STOP revokes all matching consents while ambiguous menu requests send nothing',async()=>{
 let calls=0;const f=fake({mode:'general',token:'test-sender-token-for-general-sellers',send:async()=>{calls++;}});
 f.data.set('teyzaSellerAccounts/seller2',{uid:'seller2',phone:'+27712345678',approvalStatus:'approved'});
 f.data.set('teyzaWhatsAppPreferences/seller2',{ownerUid:'seller2',phone:'+27712345678',optedIn:true});
 await f.router.route(payload([message('wamid.ambiguous','text',{text:{body:'MENU'}})]));
 assert.equal(calls,0);
 await f.router.route(payload([message('wamid.sharedStop','text',{text:{body:'STOP'}})]));
 for(const uid of ['seller1','seller2'])assert.equal(f.data.get('teyzaWhatsAppPreferences/'+uid).optedIn,false);
 assert.equal(calls,0);
});

test('General replies reject deletion-pending and unapproved businesses',async()=>{
 let calls=0;const f=fake({mode:'general',token:'test-sender-token-for-general-sellers',send:async()=>{calls++;}});
 f.data.get('teyzaSellerAccounts/seller1').deletionPending=true;
 await f.router.route(payload([message('wamid.pendingDelete','text',{text:{body:'MENU'}})]));
 f.data.get('teyzaSellerAccounts/seller1').deletionPending=false;
 f.data.get('teyzaSellerAccounts/seller1').approvalStatus='pending';
 await f.router.route(payload([message('wamid.notApproved','text',{text:{body:'MENU'}})]));
 assert.equal(calls,0);
});


test('Build 55 all mode continues approved seller menu replies',async()=>{
 let calls=0;const f=fake({mode:'all',token:'test-sender-token-for-general-sellers',send:async()=>{
  calls++;return {ok:true,status:200,json:async()=>({messages:[{id:'wamid.compatible'}]})};
 }});f.setPilotUid('');
 await f.router.route(payload([message('wamid.allMenu','text',{text:{body:'MENU'}})]));
 assert.equal(calls,1);
});

test('Approved opted-in seller follow-up text enters the authenticated support thread once',async()=>{
 const f=fake({token:'test-only-not-a-real-credential-long',
  send:async()=>({ok:true,status:200,json:async()=>({messages:[{id:'wamid.test'}]})})});
 const open=payload([message('wamid.agent','text',{text:{body:'AGENT'}})]);
 await f.router.route(open);
 const inbound=payload([message('wamid.question','text',{text:{body:'I need help listing my shop.'}})]);
 await f.router.route(inbound);await f.router.route(inbound);
 const ticket=f.data.get('teyzaSupportTickets/seller_seller1');
 assert.equal(ticket.whatsAppActive,true);
 assert.equal(ticket.messageCount,1);
 const messages=[...f.data].filter(([key])=>key.startsWith('teyzaSupportTickets/seller_seller1/messages/'));
 assert.equal(messages.length,1);
 assert.equal(messages[0][1].sender,'seller');
 assert.equal(messages[0][1].text,'I need help listing my shop.');
 assert(!JSON.stringify(ticket).includes('27712345678'));
});
test('STOP deactivates WhatsApp handoff and prevents later messages',async()=>{
 const f=fake({token:'test-only-not-a-real-credential-long',
  send:async()=>({ok:true,status:200,json:async()=>({messages:[{id:'wamid.test'}]})})});
 await f.router.route(payload([message('wamid.agent','text',{text:{body:'AGENT'}})]));
 await f.router.route(payload([message('wamid.stop','text',{text:{body:'STOP'}})]));
 assert.equal(f.data.get('teyzaSupportTickets/seller_seller1').whatsAppActive,false);
 await f.router.route(payload([message('wamid.afterstop','text',{text:{body:'Please call me now'}})]));
 assert.equal([...f.data].filter(([key])=>key.includes('/messages/')).length,0);
});
test('Anonymous, unapproved and unrequested chat text never enters private seller support',async()=>{
 const f=fake();
 await f.router.route(payload([message('wamid.unsolicited','text',{text:{body:'My private question'}})]));
 assert.equal([...f.data].filter(([key])=>key.startsWith('teyzaSupportTickets/')).length,0);
 const f2=fake();
 await f2.router.route(payload([message('wamid.ag','text',{text:{body:'AGENT'}},'27799999999')]));
 assert.equal([...f2.data].filter(([key])=>key.startsWith('teyzaSupportTickets/')).length,0);
});
