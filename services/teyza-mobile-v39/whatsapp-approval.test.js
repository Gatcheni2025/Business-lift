'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createWhatsAppApproval}=require('./whatsapp-approval');
function fixture(){
 const uid='seller1',phone='+27712345678',submissionId='submission1';
 const records=new Map(Object.entries({
  'teyzaWhatsAppApprovalOutbox/submission1':{sellerUid:uid,submissionId,status:'queued'},
  'teyzaSellerAccounts/seller1':{uid,phone,approvalStatus:'approved'},
  'teyzaWhatsAppPreferences/seller1':{ownerUid:uid,phone,optedIn:true},
  'teyzaMobileVerification/seller1':{ownerUid:uid,status:'approved',submissionId}
 }));
 let queue=Promise.resolve();
 const db={doc:path=>({path,get:async()=>({exists:records.has(path),data:()=>records.get(path)}),
  update:async value=>records.set(path,{...records.get(path),...value})}),
  runTransaction:fn=>{const result=queue.then(async()=>{const writes=[];const tx={get:ref=>ref.get(),update:(ref,value)=>writes.push(()=>ref.update(value))};
   const result=await fn(tx);for(const write of writes)await write();return result;});queue=result.catch(()=>{});return result;}};
 let config={phoneNumberId:'123456',apiVersion:'v24.0',template:'teyza_seller_approved',language:'en'};
 let token='TEST_ACCESS_TOKEN_12345',calls=[],auth={phoneNumber:phone,providerData:[{providerId:'phone',phoneNumber:phone}]},networkError=false;
 const api=createWhatsAppApproval({db,getAuthUser:async()=>auth,getToken:()=>token,getConfig:()=>config,clock:()=>1000,
  send:async(url,options)=>{calls.push({url,options});if(networkError)throw Error('connection lost');return {ok:true,status:200,json:async()=>({messages:[{id:'wamid.test'}]})};}});
 return {api,records,calls,disableConfig:()=>{token='';},enableConfig:()=>{token='TEST_ACCESS_TOKEN_12345';},breakNetwork:()=>{networkError=true;},setAuth:value=>{auth=value;}};
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
