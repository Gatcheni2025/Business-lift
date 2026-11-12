'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createWelcomeWebhook}=require('./whatsapp-welcome-webhook');
function fixture(){
 const now=1794470400000,phone='+27712345678',uid='seller1',secret='meta-app-secret-for-signed-test-123',
  verifyToken='random-verification-token-12345';
 const records=new Map(Object.entries({
  ['teyzaSellerAccounts/'+uid]:{uid,phone,category:'spaza',approvalStatus:'approved'},
  ['teyzaWhatsAppPreferences/'+uid]:{ownerUid:uid,phone,optedIn:true,consentVersion:'seller-approved-welcome-services-v1'},
  ['teyzaMobileVerification/'+uid]:{ownerUid:uid,status:'approved'},
  ['teyzaWhatsAppWelcomeOnce/'+uid]:{sellerUid:uid,status:'attempted'}
 }));
 let auth={phoneNumber:phone,providerData:[{providerId:'phone',phoneNumber:phone}]};
 let calls=[],ready=true,phoneNumberId='1234567',nowValue=now,networkError=false;
 const snap=key=>({exists:records.has(key),data:()=>records.get(key)});
 const doc=path=>({path,get:async()=>snap(path),
  update:async v=>records.set(path,{...records.get(path),...v})});
 const db={doc,collection:name=>({
  where:(field,op,value)=>({limit:()=>({get:async()=>({
   docs:[...records.entries()].filter(([key,v])=>
    key.startsWith(name+'/')&&key.split('/').length===2&&v[field]===value)
    .map(([key,val])=>({id:key.slice(name.length+1),data:()=>val})).slice(0,3)
  })})})
 }),runTransaction:fn=>{
  const writes=[],tx={get:ref=>ref.get(),
   create:(ref,val)=>writes.push(()=>{if(records.has(ref.path))throw Error('duplicate create');records.set(ref.path,val);}),
   set:(ref,val)=>writes.push(()=>records.set(ref.path,{...records.get(ref.path),...val})),
   update:(ref,val)=>writes.push(()=>records.set(ref.path,{...records.get(ref.path),...val}))
  };
  return Promise.resolve().then(()=>fn(tx)).then(value=>{writes.forEach(w=>w());return value;});
 }};
 const bot=createWelcomeWebhook({db,getAuthUser:async()=>auth,
  getAppSecret:()=>secret,getVerifyToken:()=>verifyToken,getAccessToken:()=>ready?'test_whatsapp_access_token_xyz':'',
  getConfig:()=>({phoneNumberId,apiVersion:'v24.0'}),clock:()=>nowValue,
  send:async(url,opts)=>{calls.push({url,opts});if(networkError)throw Error('timeout');
   return {ok:true,status:200,json:async()=>({messages:[{id:'wamid.outbound123'}]})};}});
 function request(choice='TEYZA_WELCOME_SELL',{signature=true,from='27712345678',name='1234567',timestamp=String(now/1000),
   id='wamid.test_menu_12345',type='button'}={}){
  const msg={id,from,timestamp,type,...(type==='button'?{button:{payload:choice}}:
   type==='interactive'?{interactive:{type:'list_reply',list_reply:{id:choice}}}:
   {text:{body:choice}})};
  const body={object:'whatsapp_business_account',entry:[{changes:[{field:'messages',value:{
   metadata:{phone_number_id:name},messages:[msg]}}]}]};
  const rawBody=Buffer.from(JSON.stringify(body));
  const expected='sha256='+crypto.createHmac('sha256',secret).update(rawBody).digest('hex');
  const req={rawBody,get:key=>key==='X-Hub-Signature-256'&&(signature?expected:'sha256=fake')};
  const res={code:200,status(code){this.code=code;return this;},end(){return this;},
   json(data){this.body=data;return this;},send(data){this.body=data;return this;}};
  return {req,res};
 }
 return {bot,records,calls,request,now,
  noWelcome:()=>records.delete('teyzaWhatsAppWelcomeOnce/'+uid),
  optOut:()=>records.set('teyzaWhatsAppPreferences/'+uid,{ownerUid:uid,phone,optedIn:false,consentVersion:'seller-approved-welcome-services-v1'}),
  changeStatus:()=>records.set('teyzaSellerAccounts/'+uid,{uid,phone,approvalStatus:'pending'}),
  setNow:v=>{nowValue=v;},disableToken:()=>{ready=false;},breakNetwork:()=>{networkError=true;},
  testGet(token){const res={code:200,status(c){this.code=c;return this;},end(){return this;},send(x){this.body=x;return this;}};
   bot.verifyGet({query:{'hub.mode':'subscribe','hub.verify_token':token,'hub.challenge':'123456'}},res);
   return res;
  }
 };
}
test('Webhook challenge validates Meta verify token and refuses other callers',()=>{
 const f=fixture();
 assert.equal(f.testGet('random-verification-token-12345').body,'123456');
 assert.equal(f.testGet('invalid').code,403);
});
test('Webhook requires constant-time raw-body HMAC and correct sender phone number id',async()=>{
 const f=fixture(),bad=f.request('TEYZA_WELCOME_SELL',{signature:false});
 await f.bot.receive(bad.req,bad.res);assert.equal(bad.res.code,403);
 const wrong=f.request('TEYZA_WELCOME_SELL',{name:'7654321'});
 await f.bot.receive(wrong.req,wrong.res);assert.equal(wrong.res.code,200);
 assert.equal([...f.records.keys()].filter(x=>x.startsWith('teyzaWhatsAppWelcomeReplies/')).length,0);
});
test('Approved seller tapping a welcome button receives a reply menu exactly once',async()=>{
 const f=fixture(),evt=f.request();await f.bot.receive(evt.req,evt.res);
 assert.equal(evt.res.code,200);
 const key=[...f.records.keys()].find(x=>x.startsWith('teyzaWhatsAppWelcomeReplies/'));
 assert.ok(key);assert.equal(f.records.get(key).choice,'TEYZA_WELCOME_SELL');
 await f.bot.deliver(key.split('/')[1]);assert.equal(f.calls.length,1);
 const msg=JSON.parse(f.calls[0].opts.body);
 assert.equal(msg.to,'27712345678');assert.equal(msg.type,'interactive');
 assert.equal(msg.interactive.type,'list');assert.ok(msg.interactive.action.sections[0].rows.length>1);
 assert.equal(/https?:\/\//.test(f.calls[0].opts.body),false);
 await f.bot.receive(evt.req,evt.res);await f.bot.deliver(key.split('/')[1]);
 assert.equal(f.calls.length,1);
});
test('Interactive list choice sends detailed selling benefits with no checkout link',async()=>{
 const f=fixture(),evt=f.request('TEYZA_SELL_BENEFITS',{type:'interactive'});
 await f.bot.receive(evt.req,evt.res);
 const key=[...f.records.keys()].find(x=>x.startsWith('teyzaWhatsAppWelcomeReplies/'));
 await f.bot.deliver(key.split('/')[1]);
 const payload=JSON.parse(f.calls[0].opts.body);
 assert.equal(payload.interactive.type,'button');
 assert.match(payload.interactive.body.text,/wholesalers/);
 assert.equal(/teyza\.co\.za\/(?:ads|pay)/.test(f.calls[0].opts.body),false);
});
test('Do not send without prior welcome, with revoked consent or after approval removal',async()=>{
 for(const change of [f=>f.noWelcome(),f=>f.optOut(),f=>f.changeStatus()]){
  const f=fixture();change(f);const evt=f.request();
  await f.bot.receive(evt.req,evt.res);
  assert.equal([...f.records.keys()].filter(k=>k.startsWith('teyzaWhatsAppWelcomeReplies/')).length,0);
  assert.equal(f.calls.length,0);
 }
});
test('Customer STOP withdraws WhatsApp consent and cannot queue a marketing response',async()=>{
 const f=fixture(),evt=f.request('STOP',{type:'text'});
 await f.bot.receive(evt.req,evt.res);
 assert.equal(f.records.get('teyzaWhatsAppPreferences/seller1').optedIn,false);
 assert.equal(f.calls.length,0);
});
test('Old message is ignored; uncertain provider delivery must never be repeated automatically',async()=>{
 const f=fixture(),old=f.request('TEYZA_WELCOME_ADS',{timestamp:String(f.now/1000-86450)});
 await f.bot.receive(old.req,old.res);
 assert.equal([...f.records.keys()].filter(k=>k.startsWith('teyzaWhatsAppWelcomeReplies/')).length,0);
 const event=f.request('TEYZA_WELCOME_ADS');
 await f.bot.receive(event.req,event.res);
 const key=[...f.records.keys()].find(k=>k.startsWith('teyzaWhatsAppWelcomeReplies/'));
 f.breakNetwork();await f.bot.deliver(key.split('/')[1]);
 assert.equal(f.records.get(key).status,'needs_review');
 await f.bot.deliver(key.split('/')[1]);assert.equal(f.calls.length,1);
});

test('Talk to consultant creates a UID-bound ticket in the existing admin Support inbox, at most once daily',async()=>{
 const f=fixture(),evt=f.request('TEYZA_WELCOME_SUPPORT');
 await f.bot.receive(evt.req,evt.res);
 assert.equal(evt.res.code,200);
 const ticket=f.records.get('teyzaSupportTickets/seller_seller1');
 assert.ok(ticket);
 assert.equal(ticket.source,'seller_admin_chat');
 assert.equal(ticket.ownerUid,'seller1');
 assert.equal(ticket.adminUnread,1);
 assert.equal(ticket.messageCount,1);
 const req=[...f.records.keys()].find(k=>k.startsWith('teyzaWhatsAppConsultantRequests/'));
 assert.ok(req);
 assert.equal(f.records.get(req).ticketId,'seller_seller1');
 const msg=[...f.records.keys()].find(k=>k.startsWith('teyzaSupportTickets/seller_seller1/messages/'));
 assert.ok(msg);
 assert.match(f.records.get(msg).text,/Teyza consultant/);
 // Same signed WhatsApp event is deduplicated.
 await f.bot.receive(evt.req,evt.res);
 assert.equal(f.records.get('teyzaSupportTickets/seller_seller1').adminUnread,1);
 const next=f.request('TEYZA_WELCOME_SUPPORT',{id:'wamid.different_consultant_request'});
 await f.bot.receive(next.req,next.res);
 assert.equal(f.records.get('teyzaSupportTickets/seller_seller1').messageCount,1);
 const outbox=[...f.records.keys()].find(k=>k.startsWith('teyzaWhatsAppWelcomeReplies/'));
 await f.bot.deliver(outbox.split('/')[1]);
 assert.equal(f.calls.length,1);
 const reply=JSON.parse(f.calls[0].opts.body);
 assert.match(reply.interactive.body.text,/consultant/);
 assert.ok(!JSON.stringify(reply).includes('teyza.co.za/'));
});
