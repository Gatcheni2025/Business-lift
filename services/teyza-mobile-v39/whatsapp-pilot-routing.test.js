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
function fake(){
 const data=new Map([
  ['teyzaSellerAccounts/seller1',{uid:'seller1',phone:'+27712345678',approvalStatus:'approved'}],
  ['teyzaWhatsAppPreferences/seller1',{ownerUid:'seller1',phone:'+27712345678',optedIn:true}],
  ['teyzaWhatsAppApprovalOutbox/sub1',{sellerUid:'seller1',status:'accepted',providerMessageId:'wamid.sent1'}]
 ]);
 const doc=path=>({path,id:path.split('/').at(-1),get:async()=>({exists:data.has(path),data:()=>data.get(path)}),
  create:async value=>{if(data.has(path))throw Error('already exists');data.set(path,structuredClone(value));},
  set:async value=>data.set(path,structuredClone(value)),
  update:async value=>data.set(path,{...data.get(path),...structuredClone(value)})});
 const db={doc,collection:name=>({where:(field,op,val)=>({
  limit:()=>({get:async()=>({docs:[...data].filter(([key,v])=>
   key.startsWith(name+'/')&&v?.[field]===val).map(([key,v])=>({
    id:key.split('/').at(-1),data:()=>v,ref:doc(key)}))})})
 })}),runTransaction:async fn=>{
  const tx={get:ref=>ref.get(),create:(ref,value)=>{if(data.has(ref.path))throw Error('duplicate');data.set(ref.path,structuredClone(value));},
   set:(ref,value)=>data.set(ref.path,structuredClone(value))};
  return fn(tx);
 }};
 let uid='seller1';
 return {data,router:createPilotRouter({db,getPilotUid:()=>uid,
  getPhoneNumberId:()=> '1466599163197469',clock:()=>777}),
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
