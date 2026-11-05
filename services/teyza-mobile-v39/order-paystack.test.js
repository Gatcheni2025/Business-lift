'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createOrderPaystack}=require('./order-paystack');
const NOW=1800000000000;
class FakeDB{
 constructor(){this.records=new Map();}
 doc(path){return {id:path.split('/').at(-1),path,get:async()=>({
  exists:this.records.has(path),data:()=>structuredClone(this.records.get(path))}),
  create:async row=>{if(this.records.has(path))throw Error('already exists');this.records.set(path,structuredClone(row));},
  set:async(row,opts)=>this.records.set(path,opts?.merge?{...this.records.get(path),...structuredClone(row)}:structuredClone(row)),
  update:async row=>{if(!this.records.has(path))throw Error('document missing');this.records.set(path,{...this.records.get(path),...structuredClone(row)});}
 };}
 async runTransaction(fn){const writes=[],tx={
  get:ref=>ref.get(),
  create:(ref,v)=>writes.push(()=>ref.create(v)),
  set:(ref,v,opts)=>writes.push(()=>ref.set(v,opts)),
  update:(ref,v)=>writes.push(()=>ref.update(v))};
  const value=await fn(tx);for(const w of writes)await w();return value;
 }
 collection(path){return {where:(field,op,v)=>({
  limit:()=>({get:async()=>({docs:[...this.records].filter(([p,row])=>
    p.startsWith(path+'/')&&p.split('/').length===path.split('/').length+1&&row[field]===v
    ).map(([p,row])=>({id:p.split('/').at(-1),data:()=>row}))})})})};}
}
function fixture({live=true,discount=0,status='confirmed'}={}){
 const db=new FakeDB(),key=live?'sk_live_12345':'sk_test_12345',sub='ACCT_seller12345';
 const seller={uid:'seller1',shopName:'Local Food Shop',category:'spaza',
  approvalStatus:'approved',listingPlan:'basic'};
 db.records.set('teyzaSellerAccounts/seller1',seller);
 db.records.set('teyzaPublicShops/seller1',{sellerUid:'seller1',status:'active',sellingEnabled:true});
 db.records.set('teyzaBilling/seller1',{ownerUid:'seller1',status:'paid',
  paymentEnvironment:live?'live':'test',paidUntil:NOW+86400000,
  ...(live?{}:{
    adminComplimentaryStatus:'active',adminComplimentaryUntil:NOW+86400000,
    adminComplimentaryBy:'admin1',
    adminComplimentaryReason:'Verified QA shop, seven day complimentary test access'
  })});
 db.records.set('teyzaSellerPayouts/seller1',{ownerUid:'seller1',code:sub,enabled:true,
  mode:live?'live':'test',verifiedWithPaystack:true});
 db.records.set('teyzaMobileOrders/order1',{ownerUid:'seller1',shopperUid:'buyer1',
  status,totalCents:2500,cashDiscountCents:discount,paymentMethod:'arrange_with_shop',
  paymentStatus:'arrange_with_shop'});
 let lastInit,invalidSplit=false;
 const send=async(url,options)=>{
  let data;
  if(url.includes('/subaccount/'))data={subaccount_code:sub,active:true,currency:'ZAR',
    domain:live?'live':'test',is_verified:true,percentage_charge:0,business_name:'Local Food Shop'};
  else if(url.includes('/transaction/initialize')){
   lastInit=JSON.parse(options.body);
   data={authorization_url:'https://checkout.paystack.com/test-secure'};
  }else if(url.includes('/transaction/verify/')){
   const ref=decodeURIComponent(url.split('/').at(-1));
   const row=db.records.get('teyzaOrderPayments/'+ref);
   data={id:9001,reference:ref,status:'success',currency:'ZAR',domain:live?'live':'test',amount:row.amountCents,
    customer:{email:row.customerEmail},
    subaccount:{subaccount_code:invalidSplit?'ACCT_other12345':sub}};
  }else throw Error('Unexpected Paystack path '+url);
  return {ok:true,json:async()=>({status:true,data})};
 };
 const api=createOrderPaystack({db,clock:()=>NOW,getSecret:()=>key,send,rate:async()=>{}});
 const admin={uid:'admin1',email_verified:true,teyzaAdmin:true,auth_time:NOW/1000};
 const buyer={uid:'buyer1',email:'buyer@example.com',email_verified:true};
 return {api,db,admin,buyer,sub,get lastInit(){return lastInit;},
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
test('A confirmed physical order initializes an exact-value Paystack seller split',async()=>{
 const f=fixture();
 const p=await f.api.execute(f.buyer,'order_paystack_checkout',{orderId:'order1'});
 assert.equal(p.amountCents,2500);assert.equal(p.paymentEnvironment,'live');
 assert.equal(f.lastInit.amount,2500);
 assert.equal(f.lastInit.subaccount,f.sub);
 assert.equal(f.lastInit.email,'buyer@example.com');
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
 const p=await f.api.execute(f.buyer,'order_paystack_checkout',{orderId:'order1'});
 const verified=await f.api.execute(f.buyer,'order_paystack_verify',{reference:p.reference});
 assert.equal(verified.verified,false);assert.equal(verified.status,'test_paid');
 assert.equal(f.db.records.get('teyzaMobileOrders/order1').paymentStatus,'test_paid');
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
