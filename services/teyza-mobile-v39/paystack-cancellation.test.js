'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createPaystackCancellation}=require('./paystack-cancellation');
const NOW=Date.parse('2026-11-06T10:00:00Z');
function fixture({providerStatus='active',domain='live',customer='CUS_TEST',timeoutAfterDisable=false,lease}={}){
 const records=new Map(Object.entries({
  'teyzaPaystackCancellations/shop1':{ownerUid:'shop1',status:'pending',environment:'live',customerCode:'CUS_TEST'},
  'teyzaAccountDeletionRequests/shop1':{uid:'shop1',needsPaystackCancellation:true},
  'teyzaSellerAccounts/shop1':{uid:'shop1',deletionPending:true},
  'teyzaBilling/shop1':{ownerUid:'shop1',paymentProvider:'paystack',paymentEnvironment:'live',
   paystackCustomerCode:'CUS_TEST',paystackSubscriptionCode:'SUB_TEST',renewalSetup:'active'},
  ...(lease?{'teyzaPaystackRenewal/shop1':lease}:{})
 }));
 const db={doc:path=>({path,get:async()=>({exists:records.has(path),data:()=>records.get(path)}),
  update:async value=>{assert(records.has(path));records.set(path,{...records.get(path),...value});}}),
  runTransaction:async fn=>{const writes=[],tx={get:ref=>ref.get(),update:(ref,value)=>writes.push(()=>ref.update(value))};
   const result=await fn(tx);for(const write of writes)await write();return result;}};
 let state=providerStatus;const calls=[];
 const send=async(url,options)=>{
  calls.push({url,options});
  if(url.endsWith('/subscription/disable')){
   state='non-renewing';
   if(timeoutAfterDisable)throw Error('response lost');
   return {ok:true,json:async()=>({status:true,message:'Subscription disabled'})};
  }
  return {ok:true,json:async()=>({status:true,data:{subscription_code:'SUB_TEST',domain,status:state,
   customer:{customer_code:customer},email_token:'SYNTHETIC_TOKEN'}})};
 };
 return {records,calls,api:createPaystackCancellation({db,getSecret:()=> 'sk_live_SYNTHETIC',send,clock:()=>NOW})};
}
test('Account closure confirms cancellation with Paystack without storing its token',async()=>{
 const f=fixture();await f.api.process('shop1');
 assert.equal(f.records.get('teyzaPaystackCancellations/shop1').status,'completed');
 const posts=f.calls.filter(x=>x.options.method==='POST');assert.equal(posts.length,1);
 assert.deepEqual(JSON.parse(posts[0].options.body),{code:'SUB_TEST',token:'SYNTHETIC_TOKEN'});
 assert(!JSON.stringify([...f.records]).includes('SYNTHETIC_TOKEN'));
 await f.api.process('shop1');assert.equal(f.calls.filter(x=>x.options.method==='POST').length,1);
});
test('An already non-renewing subscription is confirmed without another provider change',async()=>{
 const f=fixture({providerStatus:'non-renewing'});await f.api.process('shop1');
 assert.equal(f.records.get('teyzaPaystackCancellations/shop1').status,'completed');
 assert.equal(f.calls.filter(x=>x.options.method==='POST').length,0);
});
test('A lost cancellation response is verified before retrying',async()=>{
 const f=fixture({timeoutAfterDisable:true});await f.api.process('shop1');
 assert.equal(f.records.get('teyzaPaystackCancellations/shop1').status,'pending');
 await f.api.process('shop1');
 assert.equal(f.records.get('teyzaPaystackCancellations/shop1').status,'completed');
 assert.equal(f.calls.filter(x=>x.options.method==='POST').length,1);
});
test('Different provider environment or customer cannot cancel a subscription',async()=>{
 for(const options of [{domain:'test'},{customer:'CUS_OTHER'}]){
  const f=fixture(options);await f.api.process('shop1');
  assert.equal(f.records.get('teyzaPaystackCancellations/shop1').status,'needs_attention');
  assert.equal(f.calls.filter(x=>x.options.method==='POST').length,0);
 }
});
test('Deletion waits for in-flight renewal creation before cancelling',async()=>{
 const f=fixture({lease:{status:'processing',attemptedAt:NOW-1000}});await f.api.process('shop1');
 assert.equal(f.records.get('teyzaPaystackCancellations/shop1').status,'pending');assert.equal(f.calls.length,0);
 f.records.set('teyzaPaystackRenewal/shop1',{status:'created',subscriptionCode:'SUB_TEST'});
 await f.api.process('shop1');assert.equal(f.records.get('teyzaPaystackCancellations/shop1').status,'completed');
});
test('An uncertain renewal creation is sent for review without a blind cancellation',async()=>{
 const f=fixture({lease:{status:'needs_attention'}});await f.api.process('shop1');
 assert.equal(f.records.get('teyzaPaystackCancellations/shop1').status,'needs_attention');assert.equal(f.calls.length,0);
});
