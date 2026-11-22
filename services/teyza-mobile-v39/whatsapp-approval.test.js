'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createWhatsAppApproval}=require('./whatsapp-approval');
function fixture(){
 const uid='seller1',phone='+27712345678',submissionId='submission1';
 const records=new Map(Object.entries({
  'teyzaWhatsAppApprovalOutbox/submission1':{sellerUid:uid,submissionId,status:'queued',createdAt:1000},
  'teyzaSellerAccounts/seller1':{uid,phone,approvalStatus:'approved'},
  'teyzaWhatsAppPreferences/seller1':{ownerUid:uid,phone,optedIn:true},
  'teyzaMobileVerification/seller1':{ownerUid:uid,status:'approved',submissionId}
 }));
 let queue=Promise.resolve();
 const db={doc:path=>({path,get:async()=>({exists:records.has(path),data:()=>records.get(path)}),
  update:async value=>records.set(path,{...records.get(path),...value}),
  set:async value=>records.set(path,value)}),
  runTransaction:fn=>{const result=queue.then(async()=>{const writes=[];const tx={get:ref=>ref.get(),update:(ref,value)=>writes.push(()=>ref.update(value))};
   const result=await fn(tx);for(const write of writes)await write();return result;});queue=result.catch(()=>{});return result;}};
 let config={phoneNumberId:'123456',apiVersion:'v24.0',template:'teyza_seller_approved',language:'en'};
 let token='TEST_ACCESS_TOKEN_12345',calls=[],auth={phoneNumber:phone,providerData:[{providerId:'phone',phoneNumber:phone}]},networkError=false;
 let pilotUid='seller1',pilotStartAt=500,mode='pilot',generalStartedAt=500;
 const api=createWhatsAppApproval({db,getAuthUser:async()=>auth,getToken:()=>token,getConfig:()=>config,
  getPilotUid:()=>pilotUid,getPilotStartAt:()=>pilotStartAt,getRolloutMode:()=>mode,
  getRolloutStartedAt:()=>generalStartedAt,clock:()=>1000,
  send:async(url,options)=>{calls.push({url,options});if(networkError)throw Error('connection lost');return {ok:true,status:200,json:async()=>({messages:[{id:'wamid.test'}]})};}});
 return {api,db,records,calls,setMode:v=>{mode=v;},setGeneralStartedAt:v=>{generalStartedAt=v;},disableConfig:()=>{token='';},enableConfig:()=>{token='TEST_ACCESS_TOKEN_12345';},setPilotUid:v=>{pilotUid=v;},setPilotStartAt:v=>{pilotStartAt=v;},breakNetwork:()=>{networkError=true;},setAuth:value=>{auth=value;}};
}
test('An opted-in, currently approved seller with a verified phone gets one templated message',async()=>{
 const f=fixture();await Promise.all([f.api.deliver('submission1'),f.api.deliver('submission1')]);
 assert.equal(f.calls.length,1);const payload=JSON.parse(f.calls[0].options.body);
 assert.equal(payload.to,'27712345678');assert.deepEqual(payload.template,{name:'teyza_seller_approved',language:{code:'en'}});
 assert.equal(f.records.get('teyzaWhatsAppApprovalOutbox/submission1').status,'accepted');
 await f.api.deliver('submission1');assert.equal(f.calls.length,1);
});
test('No WhatsApp is sent after consent, approval, phone or current submission changes',async()=>{
 for(const change of [
  r=>r.set('teyzaWhatsAppPreferences/seller1',{ownerUid:'seller1',optedIn:false}),
  r=>r.set('teyzaSellerAccounts/seller1',{uid:'seller1',approvalStatus:'pending',phone:'+27712345678'}),
  r=>r.set('teyzaWhatsAppPreferences/seller1',{ownerUid:'seller1',optedIn:true,phone:'+27820000000'}),
  r=>r.set('teyzaMobileVerification/seller1',{status:'approved',submissionId:'newer'})]){
  const f=fixture();change(f.records);await f.api.deliver('submission1');
  assert.equal(f.calls.length,0);assert.equal(f.records.get('teyzaWhatsAppApprovalOutbox/submission1').status,'skipped');
 }
 const f=fixture();f.setAuth({phoneNumber:'+27712345678',providerData:[]});await f.api.deliver('submission1');
 assert.equal(f.calls.length,0);assert.equal(f.records.get('teyzaWhatsAppApprovalOutbox/submission1').reason,'phone_not_verified');
});
test('Missing provider configuration waits; an uncertain provider request is never repeated automatically',async()=>{
 const f=fixture();f.disableConfig();await f.api.deliver('submission1');
 assert.equal(f.records.get('teyzaWhatsAppApprovalOutbox/submission1').status,'configuration_required');assert.equal(f.calls.length,0);
 f.enableConfig();f.breakNetwork();await f.api.deliver('submission1');
 assert.equal(f.records.get('teyzaWhatsAppApprovalOutbox/submission1').status,'needs_review');
 await f.api.deliver('submission1');assert.equal(f.calls.length,1);
});

test('Approved marketing template supports image header and named personalisation safely',async()=>{
 const {approvedTemplatePayload}=require('./whatsapp-approval');
 const config={template:'teyza_seller_welcome_menu',language:'en',headerImageRequired:true,
   headerImageUrl:'https://teyza.co.za/assets/teyza-whatsapp-welcome.jpg',bodyFields:'ownerFirstName,shopName'};
 const owner={firstName:'Thandi',shopName:"Thandi's Spaza Shop"};
 assert.deepEqual(approvedTemplatePayload(config,owner),{
   name:'teyza_seller_welcome_menu',language:{code:'en'},components:[
     {type:'header',parameters:[{type:'image',image:{link:config.headerImageUrl}}]},
     {type:'body',parameters:[{type:'text',text:'Thandi'},{type:'text',text:"Thandi's Spaza Shop"}]}
   ]
 });
 assert.equal(approvedTemplatePayload({...config,headerImageUrl:'http://malicious.example/pic'},owner),null);
 assert.equal(approvedTemplatePayload({...config,headerImageUrl:''},owner),null);
 assert.equal(approvedTemplatePayload({...config,bodyFields:'password'},owner),null);
 assert.equal(approvedTemplatePayload(config,{shopName:'Shop'},{displayName:'Thandi Smith'}).components[1].parameters[0].text,'Thandi');
 assert.equal(approvedTemplatePayload(config,{shopName:'Shop'}).components[1].parameters[0].text,'Seller');
});

test('Pilot sender refuses missing or unrelated UID without changing the outbox',async()=>{
 for(const uid of ['', 'otherSellerUid']){
  const f=fixture();f.setPilotUid(uid);await f.api.deliver('submission1');
  assert.equal(f.calls.length,0);
  assert.equal(f.records.get('teyzaWhatsAppApprovalOutbox/submission1').status,'queued');
 }
});

test('Pilot never sends approvals created before activation time',async()=>{
 const f=fixture();f.setPilotStartAt(1001);await f.api.deliver('submission1');
 assert.equal(f.calls.length,0);
 assert.equal(f.records.get('teyzaWhatsAppApprovalOutbox/submission1').status,'queued');
});


test('General rollout welcomes each newly approved seller once, without a pilot UID',async()=>{
 const f=fixture();f.setMode('general');f.setPilotUid('');
 await Promise.all([f.api.deliver('submission1'),f.api.deliver('submission1')]);
 const uid='seller2',phone='+27821234567';
 f.records.set('teyzaWhatsAppApprovalOutbox/submission2',{sellerUid:uid,submissionId:'submission2',status:'queued',createdAt:1000});
 f.records.set('teyzaSellerAccounts/'+uid,{uid,phone,approvalStatus:'approved'});
 f.records.set('teyzaWhatsAppPreferences/'+uid,{ownerUid:uid,phone,optedIn:true});
 f.records.set('teyzaMobileVerification/'+uid,{ownerUid:uid,status:'approved',submissionId:'submission2'});
 f.setAuth({phoneNumber:phone,providerData:[{providerId:'phone',phoneNumber:phone}]});
 await Promise.all([f.api.deliver('submission2'),f.api.deliver('submission2')]);
 assert.deepEqual(f.calls.map(c=>JSON.parse(c.options.body).to),['27712345678','27821234567']);
});

test('General rollout excludes old approvals and fails closed on an absent start time or unknown mode',async()=>{
 for(const mode of ['general','off','invalid']){
  const f=fixture();f.setMode(mode);f.setGeneralStartedAt(1001);
  await f.api.deliver('submission1');assert.equal(f.calls.length,0);
  assert.equal(f.records.get('teyzaWhatsAppApprovalOutbox/submission1').status,mode==='general'?'skipped':'queued');
 }
 const f=fixture();f.setMode('general');f.setGeneralStartedAt('');
 await f.api.deliver('submission1');assert.equal(f.calls.length,0);
});

test('General rollout still rejects revoked consent, disabled Auth users and mismatched verification owners',async()=>{
 for(const change of [
  f=>{f.records.get('teyzaWhatsAppPreferences/seller1').optedIn=false;},
  f=>{f.records.get('teyzaMobileVerification/seller1').ownerUid='otherUid';},
  f=>{f.setAuth({disabled:true,phoneNumber:'+27712345678',providerData:[{providerId:'phone',phoneNumber:'+27712345678'}]});}
 ]){
  const f=fixture();f.setMode('general');change(f);
  await f.api.deliver('submission1');assert.equal(f.calls.length,0);
 }
});

test('Pending recovery pages past older configuration failures and wraps its cursor',async()=>{
 const f=fixture();f.setMode('general');f.disableConfig();
 for(let i=0;i<30;i++)f.records.set('teyzaWhatsAppApprovalOutbox/submission'+String(i).padStart(3,'0'),
  {sellerUid:'seller1',submissionId:'submission1',status:'queued',createdAt:1000});
 f.db.collection=name=>{
  let cursor='',limit=25;
  const query={where:()=>query,orderBy:()=>query,startAfter:v=>{cursor=v;return query;},limit:v=>{limit=v;return query;},
   get:async()=>({docs:[...f.records].filter(([p,v])=>p.startsWith(name+'/')&&
    ['queued','configuration_required'].includes(v.status)&&p.split('/').at(-1)>cursor)
    .sort(([a],[b])=>a.localeCompare(b)).slice(0,limit)
    .map(([p])=>({id:p.split('/').at(-1),ref:f.db.doc(p)}))})};
  return query;
 };
 await f.api.retryPending();
 assert.equal([...f.records.values()].filter(v=>v.status==='configuration_required').length,25);
 await f.api.retryPending();
 assert.equal([...f.records.values()].filter(v=>v.status==='configuration_required').length,31);
 assert.equal(f.records.get('teyzaWhatsAppDeliveryState/approval_pending').cursor,'');
 assert.equal(f.calls.length,0);
});
