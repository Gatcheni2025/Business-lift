'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createOrderPaystack}=require('./order-paystack');
const NOW=1800000000000;
class FakeDB{
 constructor(){this.records=new Map();this.queue=Promise.resolve();}
 doc(path){return {id:path.split('/').at(-1),path,get:async()=>({
  exists:this.records.has(path),data:()=>structuredClone(this.records.get(path))}),
  create:async row=>{if(this.records.has(path))throw Error('already exists');this.records.set(path,structuredClone(row));},
  set:async(row,opts)=>this.records.set(path,opts?.merge?{...this.records.get(path),...structuredClone(row)}:structuredClone(row)),
  update:async row=>{if(!this.records.has(path))throw Error('document missing');this.records.set(path,{...this.records.get(path),...structuredClone(row)});}
 };}
 async runTransaction(fn){const run=this.queue.then(async()=>{const writes=[],tx={
  get:ref=>ref.get(),
  create:(ref,v)=>writes.push(()=>ref.create(v)),
  set:(ref,v,opts)=>writes.push(()=>ref.set(v,opts)),
  update:(ref,v)=>writes.push(()=>ref.update(v))};
  const value=await fn(tx);for(const w of writes)await w();return value;
 });this.queue=run.catch(()=>{});return run;
 }
 collection(path){return {where:(field,op,v)=>({
  limit:()=>({get:async()=>({docs:[...this.records].filter(([p,row])=>
    p.startsWith(path+'/')&&p.split('/').length===path.split('/').length+1&&row[field]===v
    ).map(([p,row])=>({id:p.split('/').at(-1),data:()=>row}))})})})};}
}
function fixture({live=true,discount=0,status='confirmed',projectId='teyza-checkout-test'}={}){
 const db=new FakeDB(),key=live?'sk_live_12345':'sk_test_12345',sub='ACCT_seller12345';
 const seller={uid:'seller1',shopName:'Local Food Shop',category:'spaza',
  approvalStatus:'approved',listingPlan:'basic'};
 db.records.set('teyzaSellerAccounts/seller1',seller);
 db.records.set('teyzaPublicShops/seller1',{sellerUid:'seller1',status:'active',sellingEnabled:true});
 db.records.set('teyzaBilling/seller1',{ownerUid:'seller1',status:'paid',paymentProvider:'paystack',
  paymentEnvironment:live?'live':'test',paidUntil:NOW+86400000,
  ...(live?{}:{
    adminComplimentaryStatus:'active',adminComplimentaryUntil:NOW+86400000,
    adminComplimentaryBy:'admin1',
    adminComplimentaryReason:'Verified QA shop, seven day complimentary test access'
  })});
 db.records.set('teyzaShopSettings/seller1',{cardPayments:true});
 db.records.set('teyzaSellerPayouts/seller1',{ownerUid:'seller1',code:sub,enabled:true,
  mode:live?'live':'test',verifiedWithPaystack:true});
 db.records.set('teyzaMobileOrders/order1',{ownerUid:'seller1',shopperUid:'buyer1',
  status,totalCents:2500,cashDiscountCents:discount,paymentMethod:'card_online',
  paymentStatus:'arrange_with_shop'});
 let lastInit,invalidSplit=false,verifyOverride={},initOverride={},initCount=0,initFailure=false,subaccountHook=null;
 const send=async(url,options)=>{
  let data;
  if(url.includes('/subaccount/')){data={subaccount_code:sub,active:true,currency:'ZAR',
    domain:live?'live':'test',is_verified:true,percentage_charge:0,business_name:'Local Food Shop'};
    if(subaccountHook)subaccountHook();}
  else if(url.includes('/transaction/initialize')){
   initCount++;if(initFailure)throw Error('Provider timed out after receiving initialize');
   lastInit=JSON.parse(options.body);
   data={authorization_url:'https://checkout.paystack.com/test-secure',reference:lastInit.reference,...initOverride};
  }else if(url.includes('/transaction/verify/')){
   const ref=decodeURIComponent(url.split('/').at(-1));
   const row=db.records.get('teyzaOrderPayments/'+ref);
   data={id:9001,reference:ref,status:'success',currency:'ZAR',domain:live?'live':'test',amount:row.amountCents,
    customer:{email:row.customerEmail},
    subaccount:{subaccount_code:invalidSplit?'ACCT_other12345':sub},...verifyOverride};
  }else throw Error('Unexpected Paystack path '+url);
  return {ok:true,json:async()=>({status:true,data})};
 };
 const api=createOrderPaystack({db,clock:()=>NOW,getSecret:()=>key,send,rate:async()=>{},getProjectId:()=>projectId});
 const admin={uid:'admin1',email_verified:true,teyzaAdmin:true,auth_time:NOW/1000};
 const buyer={uid:'buyer1',email:'buyer@example.com',email_verified:true};
 return {api,db,admin,buyer,sub,get lastInit(){return lastInit;},
   get initCount(){return initCount;},setVerify:value=>{verifyOverride=value;},setInitialize:value=>{initOverride=value;},
   failInitialization:()=>{initFailure=true;},onSubaccount:fn=>{subaccountHook=fn;},
   invalidateSplit:()=>{invalidSplit=true;}};
}
async function rejects(p,status){await assert.rejects(p,e=>e.status===status);}
test('Only another verified fresh admin can link a current Paystack subaccount',async()=>{
 const f=fixture();
 await rejects(f.api.execute({...f.admin,teyzaAdmin:false},'ops_order_subaccount',
  {sellerUid:'seller1',subaccountCode:f.sub,confirmed:true}),403);
 await rejects(f.api.execute({...f.admin,auth_time:NOW/1000-301},'ops_order_subaccount',
  {sellerUid:'seller1',subaccountCode:f.sub,confirmed:true}),401);
 await rejects(f.api.execute(f.admin,'ops_order_subaccount',
  {sellerUid:'seller1',subaccountCode:f.sub,confirmed:false}),422);
 const result=await f.api.execute(f.admin,'ops_order_subaccount',
  {sellerUid:'seller1',subaccountCode:f.sub,confirmed:true});
 assert.equal(result.linked,true);
 assert.equal(f.db.records.get('teyzaSellerPayouts/seller1').code,f.sub);
 assert([...f.db.records.keys()].some(p=>p.startsWith('teyzaOperationsAudit/')));
});
test('Concurrent admin links cannot assign one settlement account to two sellers',async()=>{
 const f=fixture();f.db.records.delete('teyzaSellerPayouts/seller1');
 f.db.records.set('teyzaSellerAccounts/seller2',{...f.db.records.get('teyzaSellerAccounts/seller1'),uid:'seller2'});
 const results=await Promise.allSettled(['seller1','seller2'].map(sellerUid=>
  f.api.execute(f.admin,'ops_order_subaccount',{sellerUid,subaccountCode:f.sub,confirmed:true})));
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal([...f.db.records.keys()].filter(path=>path.startsWith('teyzaSellerPayouts/')).length,1);
 assert.equal([...f.db.records.keys()].filter(path=>path.startsWith('teyzaPaystackSubaccounts/')).length,1);
});
test('A confirmed physical order initializes an exact-value Paystack seller split',async()=>{
 const f=fixture();
 const p=await f.api.execute(f.buyer,'order_paystack_checkout',{orderId:'order1'});
 assert.equal(p.amountCents,2500);assert.equal(p.paymentEnvironment,'live');
 assert.equal(f.lastInit.amount,2500);
 assert.equal(f.lastInit.subaccount,f.sub);
 assert.equal(f.lastInit.email,'buyer@example.com');
 assert.equal(f.lastInit.callback_url,'https://teyza.co.za/order-payment-return.html');
 assert.equal(f.db.records.get('teyzaMobileOrders/order1').paymentStatus,'checkout_pending');
 const retry=await f.api.execute(f.buyer,'order_paystack_checkout',{orderId:'order1'});
 assert.equal(retry.reference,p.reference);assert.equal(retry.alreadyStarted,true);
 await rejects(f.api.execute({...f.buyer,uid:'other'},'order_paystack_verify',
  {reference:p.reference}),403);
 const result=await f.api.execute(f.buyer,'order_paystack_verify',{reference:p.reference});
 assert.equal(result.status,'paid');assert.equal(result.verified,true);
 assert.equal(f.db.records.get('teyzaMobileOrders/order1').paymentStatus,'paid');
 assert.equal(f.db.records.get('teyzaOrderPayments/'+p.reference).amountCents,2500);
 assert.equal((await f.api.execute(f.buyer,'order_paystack_verify',{reference:p.reference})).alreadyConfirmed,true);
});
test('A Paystack sandbox purchase is not reported as a real settled payment',async()=>{
 const f=fixture({live:false});
 const p=await f.api.execute({...f.buyer,teyzaAdmin:true},'order_paystack_checkout',{orderId:'order1'});
 const verified=await f.api.execute(f.buyer,'order_paystack_verify',{reference:p.reference});
 assert.equal(verified.verified,false);assert.equal(verified.status,'test_paid');
 assert.equal(f.db.records.get('teyzaMobileOrders/order1').paymentStatus,'test_paid');
});

test('Fresh checkout uses independent online opt-in and never infers it from in-person cards',async()=>{
 const f=fixture(),order=f.db.records.get('teyzaMobileOrders/order1');order.commerceVersion=2;
 await rejects(f.api.execute(f.buyer,'order_paystack_checkout',{orderId:'order1'}),409);
 f.db.records.set('teyzaShopSettings/seller1',{cardPayments:false,onlinePaymentsEnabled:true,onlineOrdersEnabled:false});
 // Pausing new order requests must not strand an already confirmed order.
 const p=await f.api.execute(f.buyer,'order_paystack_checkout',{orderId:'order1'});
 assert.equal(p.amountCents,2500);assert.equal(f.initCount,1);
 f.db.records.get('teyzaShopSettings/seller1').onlinePaymentsEnabled=false;
 await rejects(f.api.execute(f.buyer,'order_paystack_checkout',{orderId:'order1'}),409);
 assert.equal((await f.api.execute(f.buyer,'order_paystack_verify',{reference:p.reference})).verified,true);
});
test('Pending and failed provider statuses remain unpaid and reuse the same checkout reference',async()=>{
 const f=fixture(),p=await f.api.execute(f.buyer,'order_paystack_checkout',{orderId:'order1'});
 for(const providerStatus of ['pending','ongoing','failed','abandoned']){
  f.setVerify({status:providerStatus});
  const checked=await f.api.execute(f.buyer,'order_paystack_verify',{reference:p.reference,status:'paid'});
  assert.equal(checked.verified,false);assert.equal(checked.providerStatus,providerStatus);
  assert.notEqual(f.db.records.get('teyzaMobileOrders/order1').paymentStatus,'paid');
  assert.equal((await f.api.execute(f.buyer,'order_paystack_checkout',{orderId:'order1'})).reference,p.reference);
 }
 assert.equal(f.initCount,1);
 f.setVerify({status:'success'});
 assert.equal((await f.api.execute(f.buyer,'order_paystack_verify',{reference:p.reference})).verified,true);
});
test('Network uncertainty locks the original reference instead of creating a duplicate charge',async()=>{
 const f=fixture();f.failInitialization();
 await rejects(f.api.execute(f.buyer,'order_paystack_checkout',{orderId:'order1'}),503);
 const order=f.db.records.get('teyzaMobileOrders/order1');assert.match(order.paymentReference,/^TZO-/);
 assert.equal(order.paymentCheckoutReady,false);
 await rejects(f.api.execute(f.buyer,'order_paystack_checkout',{orderId:'order1'}),409);
 assert.equal(f.initCount,1);
 assert.equal(f.db.records.get('teyzaOrderPayments/'+order.paymentReference).initializationUncertain,true);
 assert.equal((await f.api.execute(f.buyer,'order_paystack_verify',{reference:order.paymentReference})).verified,true);
});
test('Concurrent payment clicks initialize at most one provider checkout',async()=>{
 const f=fixture();
 const attempts=await Promise.allSettled([1,2].map(()=>f.api.execute(f.buyer,'order_paystack_checkout',{orderId:'order1'})));
 assert.equal(f.initCount,1);assert(attempts.some(r=>r.status==='fulfilled'));
 assert.equal([...f.db.records.keys()].filter(p=>p.startsWith('teyzaOrderPayments/')).length,1);
});
test('Order, seller and payout changes during provider lookup are rechecked atomically',async()=>{
 const mutations=[
  f=>{f.db.records.get('teyzaMobileOrders/order1').status='cancelled';},
  f=>{f.db.records.get('teyzaMobileOrders/order1').paymentMethod='cash';},
  f=>{f.db.records.get('teyzaMobileOrders/order1').cashDiscountCents=50;},
  f=>{f.db.records.get('teyzaMobileOrders/order1').totalCents=3500;},
  f=>{f.db.records.get('teyzaSellerAccounts/seller1').approvalStatus='rejected';},
  f=>{f.db.records.get('teyzaSellerPayouts/seller1').enabled=false;},
  f=>{f.db.records.get('teyzaSellerPayouts/seller1').code='ACCT_changed1234';},
  f=>{f.db.records.get('teyzaShopSettings/seller1').onlinePaymentsEnabled=false;}
 ];
 for(const change of mutations){const f=fixture();f.onSubaccount(()=>change(f));
  await rejects(f.api.execute(f.buyer,'order_paystack_checkout',{orderId:'order1'}),409);
  assert.equal(f.initCount,0);assert.equal(f.db.records.get('teyzaMobileOrders/order1').paymentReference,undefined);
 }
});
test('A mismatched amount, currency, environment, email or reference never confirms payment',async()=>{
 for(const wrong of [{amount:1},{currency:'USD'},{domain:'test'},
  {customer:{email:'other@example.com'}},{reference:'TZO-'+('f'.repeat(26))}]){
  const f=fixture(),p=await f.api.execute(f.buyer,'order_paystack_checkout',{orderId:'order1'});f.setVerify(wrong);
  await rejects(f.api.execute(f.buyer,'order_paystack_verify',{reference:p.reference}),409);
  assert.equal(f.db.records.get('teyzaMobileOrders/order1').paymentStatus,'checkout_pending');
 }
});
test('Sandbox payments are blocked for shoppers and all production-project checkouts',async()=>{
 const shopper=fixture({live:false});
 await rejects(shopper.api.execute(shopper.buyer,'order_paystack_checkout',{orderId:'order1'}),409);
 for(const projectId of ['', 'business-lift-3c19c']){
  const f=fixture({live:false,projectId});
  await rejects(f.api.execute({...f.buyer,teyzaAdmin:true},'order_paystack_checkout',{orderId:'order1'}),409);
  assert.equal(f.initCount,0);
 }
});
test('A provider redirect outside Paystack or for a different reference is never opened',async()=>{
 for(const wrong of [{authorization_url:'https://example.com/pay'}, {reference:'other-reference'},
  {authorization_url:'https://checkout.paystack.com:9999/pay'}, {authorization_url:'https://user:password@checkout.paystack.com/pay'}]){
  const f=fixture();f.setInitialize(wrong);
  await rejects(f.api.execute(f.buyer,'order_paystack_checkout',{orderId:'order1'}),503);
  assert.equal(f.db.records.get('teyzaMobileOrders/order1').paymentCheckoutReady,false);
 }
});
test('A reversed transaction is held for review and cannot be offered as another payment',async()=>{
 const f=fixture(),p=await f.api.execute(f.buyer,'order_paystack_checkout',{orderId:'order1'});
 f.setVerify({status:'reversed'});
 const checked=await f.api.execute(f.buyer,'order_paystack_verify',{reference:p.reference});
 assert.equal(checked.status,'refund_review');assert.equal(checked.verified,false);assert.equal(checked.canResume,false);
 await rejects(f.api.execute(f.buyer,'order_paystack_checkout',{orderId:'order1'}),409);
 assert.equal(f.initCount,1);
});
test('Wrong seller settlement reference is not marked paid',async()=>{
 const f=fixture();
 const p=await f.api.execute(f.buyer,'order_paystack_checkout',{orderId:'order1'});
 f.invalidateSplit();
 await rejects(f.api.execute(f.buyer,'order_paystack_verify',{reference:p.reference}),409);
 assert.notEqual(f.db.records.get('teyzaMobileOrders/order1').paymentStatus,'paid');
});
test('No payment before confirmation, after cancellation, with cash discount or without seller payout',async()=>{
 for(const opts of [{status:'requested'},{status:'cancelled'},{discount:200}]){
  const f=fixture(opts);
  await rejects(f.api.execute(f.buyer,'order_paystack_checkout',{orderId:'order1'}),409);
 }
 const f=fixture();
 f.db.records.delete('teyzaSellerPayouts/seller1');
 await rejects(f.api.execute(f.buyer,'order_paystack_checkout',{orderId:'order1'}),409);
});
test('A cancellation after Paystack initialization requests refund review rather than claiming fulfillment',async()=>{
 const f=fixture();
 const p=await f.api.execute(f.buyer,'order_paystack_checkout',{orderId:'order1'});
 f.db.records.get('teyzaMobileOrders/order1').status='cancelled';
 const v=await f.api.execute(f.buyer,'order_paystack_verify',{reference:p.reference});
 assert.equal(v.status,'refund_review');assert.equal(v.verified,false);
 assert.equal(f.db.records.get('teyzaMobileOrders/order1').paymentStatus,'refund_review');
});
test('Webhook must use Paystack signed raw payload',async()=>{
 const f=fixture();
 const p=await f.api.execute(f.buyer,'order_paystack_checkout',{orderId:'order1'});
 const payload=Buffer.from(JSON.stringify({event:'charge.success',data:{reference:p.reference}}));
 await rejects(f.api.webhook(payload,'forged',{event:'charge.success',data:{reference:p.reference}}),401);
 const signature=crypto.createHmac('sha512','sk_live_12345').update(payload).digest('hex');
 const r=await f.api.webhook(payload,signature,{event:'charge.success',data:{reference:p.reference}});
 assert.equal(r.status,'paid');
});
test('Online card checkout requires shopper selection and an enabled seller card setting',async()=>{
 const cash=fixture();
 cash.db.records.get('teyzaMobileOrders/order1').paymentMethod='cash';
 await rejects(cash.api.execute(cash.buyer,'order_paystack_checkout',{orderId:'order1'}),409);
 const noCards=fixture();
 noCards.db.records.get('teyzaShopSettings/seller1').cardPayments=false;
 await rejects(noCards.api.execute(noCards.buyer,'order_paystack_checkout',{orderId:'order1'}),409);
 const wholesale=fixture();
 wholesale.db.records.get('teyzaMobileOrders/order1').orderType='wholesale_stock';
 await rejects(wholesale.api.execute(wholesale.buyer,'order_paystack_checkout',{orderId:'order1'}),409);
});


test('Shopper order webhooks accept modern signatures and cannot fall back to legacy if modern is forged',async()=>{
 const f=fixture();
 const secret='whsec_order_test_secret',body=Buffer.from('{"event":"ping","data":{}}');
 const timestamp=String(Math.floor(NOW/1000));
 const signature='t='+timestamp+',v1=whk_order123:'+
   crypto.createHmac('sha512',secret).update(timestamp+'.').update(body).digest('hex');
 const api=createOrderPaystack({db:f.db,clock:()=>NOW,getSecret:()=> 'sk_live_12345',
   getSigningSecret:()=>secret,send:async()=>{throw Error('Ping must not call Paystack API');},
   rate:async()=>{}});
 assert.deepEqual(await api.webhook(body,'',{event:'ping'},signature),{accepted:true});
 const legacy=crypto.createHmac('sha512','sk_live_12345').update(body).digest('hex');
 await rejects(api.webhook(body,legacy,{event:'ping'},'t='+timestamp+',v1=whk_order123:'+('f'.repeat(128))),401);
 assert.equal(f.db.records.size>0,true,'Signed ping does not wipe seller/order records');
});
