'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createBilling,verifySignature,validCheckoutUrl,nextMonth,INTRO_CENTS,MONTHLY_CENTS,PROMO_CENTS}=require('./billing-paystack');
const NOW=Date.parse('2026-11-04T07:00:00+02:00');
function fixture(seed={},options={}) {
 const records=new Map(Object.entries({'teyzaSellerAccounts/shop1':{
  uid:'shop1',ownerEmail:'owner@example.test',category:'spaza',listingPlan:'free',approvalStatus:'approved'},...seed}));
 const db={
  doc:path=>({path,get:async()=>({exists:records.has(path),data:()=>records.get(path)}),
    create:async v=>{if(records.has(path))throw Error('duplicate reference');records.set(path,v);},
    set:async(v,o)=>records.set(path,o?.merge?{...records.get(path),...v}:v),
    update:async v=>{assert(records.has(path));records.set(path,{...records.get(path),...v});}}),
  collection:path=>{
   let field,wanted,max=Infinity;
   const q={where:(key,op,value)=>{assert.equal(op,'==');field=key;wanted=value;return q;},
    limit:n=>{max=n;return q;},get:async()=>({docs:[...records].filter(([key,value])=>
      key.startsWith(path+'/')&&!key.slice(path.length+1).includes('/')&&value[field]===wanted)
      .slice(0,max).map(([key,value])=>({id:key.split('/').at(-1),data:()=>value,ref:db.doc(key)}))})};
   return q;
  },
  runTransaction:async fn=>{
    const writes=[],tx={
      get:ref=>ref.get(),set:(ref,v,o)=>writes.push(()=>ref.set(v,o)),
      update:(ref,v)=>writes.push(()=>ref.update(v)),
      create:(ref,v)=>writes.push(()=>ref.create(v))
    };
    const result=await fn(tx);
    for(const write of writes)await write();
    return result;
  }
 };
 const requests=[];
 const send=async(url,options)=>{
  requests.push({url,options});
  let data;
  if(url.includes('/plan/'))data={plan_code:'PLN_TEST99',amount:9900,interval:'monthly',currency:'ZAR'};
  else if(url.includes('/transaction/initialize'))data={
   authorization_url:'https://checkout.paystack.com/test-payment'};
  else if(url.includes('/transaction/verify/')){
    const reference=decodeURIComponent(url.split('/').at(-1));
    const pending=records.get('teyzaPaystackPayments/'+reference);
    if(!pending)throw Error('Reference is not Teyza-issued');
    data={reference,status:'success',currency:'ZAR',amount:pending.amountCents,
      id:12345,customer:{email:'owner@example.test',customer_code:'CUS_TEST'},
      authorization:{reusable:false}};
  }else throw Error('Unexpected Paystack request '+url);
  return {ok:true,json:async()=>({status:true,data})};
 };
 const api=createBilling({db,clock:()=>NOW,getSecret:()=> 'sk_test_FAKE',
  getPlanCode:()=> 'PLN_TEST99',getProjectId:()=> 'teyza-isolated-test',send,...options});
 const auth={uid:'shop1',email:'owner@example.test',email_verified:true};
 return {api,auth,records,requests};
}
test('R49 introductory checkout is server-priced and only occurs when requested',async()=>{
 const {api,auth,records,requests}=fixture();
 assert.equal(records.size,1);
 const result=await api.execute(auth,'billing_checkout',{amount:1});
 assert.equal(result.amountCents,INTRO_CENTS);
 assert.equal(result.monthlyCents,MONTHLY_CENTS);
 assert.equal(result.introductory,true);
 assert.match(result.reference,/^TZM-[a-f0-9]{26}$/,'Reference must use Paystack-supported characters');
 assert(validCheckoutUrl(result.checkoutUrl));
 assert.equal(records.get('teyzaPaystackPayments/'+result.reference).status,'pending');
 const payload=JSON.parse(requests.find(x=>x.url.endsWith('/transaction/initialize')).options.body);
 assert.equal(payload.amount,4900);assert.equal(payload.currency,'ZAR');
 assert.equal(payload.plan,undefined,'First month must not bill R99 accidentally');
 assert.equal(records.has('teyzaBilling/shop1'),false,'Checkout is not payment verification');
});
test('Pending and rejected sellers cannot start either membership or promotion checkout',async()=>{
 for(const status of ['pending','rejected']){
  const {api,auth,records,requests}=fixture();
  records.set('teyzaSellerAccounts/shop1',{...records.get('teyzaSellerAccounts/shop1'),approvalStatus:status});
  for(const action of ['billing_checkout','promote_checkout'])
   await assert.rejects(api.execute(auth,action),e=>e.status===403&&/approved/.test(e.message));
  assert.equal(requests.length,0);
 }
});
test('A modern approved seller with incomplete verification or a hold cannot be charged',async()=>{
 const {api,auth,records,requests}=fixture({'teyzaSellerOnboarding/shop1':{requiredVersion:2,sellingStatus:'not_started'}});
 await assert.rejects(api.execute(auth,'billing_checkout'),e=>e.status===409);
 assert.equal(requests.length,0);assert.equal(records.has('teyzaBilling/shop1'),false);
});
test('Only current paid member may purchase R29 seven-day promotion',async()=>{
 const {api,auth,records,requests}=fixture();
 await assert.rejects(api.execute(auth,'promote_checkout'),e=>e.status===403);
 records.set('teyzaSellerAccounts/shop1',{...records.get('teyzaSellerAccounts/shop1'),listingPlan:'basic'});
 records.set('teyzaBilling/shop1',{ownerUid:'shop1',status:'paid',
  monthlyCents:4900,paidUntil:nextMonth(NOW),introUsed:true});
 const response=await api.execute(auth,'promote_checkout',{amount:1});
 assert.equal(response.amountCents,PROMO_CENTS);
 const init=JSON.parse(requests.find(x=>x.url.endsWith('/transaction/initialize')).options.body);
 assert.equal(init.amount,2900);assert.equal(init.plan,undefined);
});
test('Webhook must authenticate exact raw payload by SHA512',()=>{
 const raw=Buffer.from('{"event":"charge.success"}'),secret='sk_test_FAKE';
 const header=crypto.createHmac('sha512',secret).update(raw).digest('hex');
 assert.equal(verifySignature(secret,raw,header),true);
 assert.equal(verifySignature(secret,raw,header.slice(2)+'aa'),false);
 assert.equal(verifySignature(secret,Buffer.from('tampered'),header),false);
 assert.equal(validCheckoutUrl('https://checkout.paystack.com.evil.test/a'),false);
});
test('Expired, wrong-owner and unverified payment cannot unlock checkout',async()=>{
 const {api,auth,records}=fixture();
 await assert.rejects(api.execute({...auth,email_verified:false},'billing_checkout'),e=>e.status===403);
 await assert.rejects(api.execute(auth,'promote_checkout'),e=>e.status===403);
 assert.equal(INTRO_CENTS,4900);assert.equal(MONTHLY_CENTS,9900);
});

test('Only a fresh administrator can verify a Teyza-issued transaction for its original seller',async()=>{
 const {api,auth,records}=fixture();
 const checkout=await api.execute(auth,'billing_checkout');
 const data={sellerUid:'shop1',reference:checkout.reference};
 const admin={uid:'admin1',email_verified:true,teyzaAdmin:true,auth_time:NOW/1000};
 await assert.rejects(api.execute({...admin,teyzaAdmin:false},'ops_paystack_confirm',data),e=>e.status===403);
 await assert.rejects(api.execute({...admin,auth_time:NOW/1000-301},'ops_paystack_confirm',data),e=>e.status===401);
 await assert.rejects(api.execute(admin,'ops_paystack_confirm',{...data,sellerUid:'other'}),e=>e.status===403);
 await assert.rejects(api.execute(admin,'ops_paystack_confirm',{...data,reference:'Bank-Receipt'}),e=>e.status===422);
 assert.equal(records.get('teyzaBilling/shop1'),undefined,'No billing is granted by a pending checkout');
 const result=await api.execute(admin,'ops_paystack_confirm',data);
 assert.equal(result.verified,true);
 assert.equal(records.get('teyzaPaystackPayments/'+checkout.reference).status,'paid');
 assert.equal(records.get('teyzaBilling/shop1').paymentProvider,'paystack');
 assert.equal(records.get('teyzaBilling/shop1').paymentEnvironment,'test');
 assert.equal(records.get('teyzaSellerAccounts/shop1').listingPlan,'basic');
 assert.equal((await api.execute(admin,'ops_paystack_confirm',data)).alreadyConfirmed,true);
});

test('A verified payment can repair a failed publication without charging or extending twice',async()=>{
 let attempts=0;
 const {api,auth,records}=fixture({}, {refresh:async()=>{if(++attempts===1)throw Error('temporary publication outage');}});
 const checkout=await api.execute(auth,'billing_checkout');
 await assert.rejects(api.execute(auth,'billing_confirm',{reference:checkout.reference}),/temporary publication outage/);
 const paidUntil=records.get('teyzaBilling/shop1').paidUntil;
 const retry=await api.execute(auth,'billing_confirm',{reference:checkout.reference});
 assert.equal(retry.alreadyConfirmed,true);assert.equal(retry.paymentEnvironment,'test');
 assert.equal(records.get('teyzaBilling/shop1').paidUntil,paidUntil);
 assert.equal(attempts,2);
});
test('Sandbox checkout cannot alter the production seller database',async()=>{
 const {api,auth,records}=fixture({}, {getProjectId:()=> 'business-lift-3c19c'});
 await assert.rejects(api.execute(auth,'billing_checkout'),e=>e.status===503);
 assert.equal(records.size,1);assert.equal(records.has('teyzaBilling/shop1'),false);
 const unknown=fixture({}, {getProjectId:()=> ''});
 await assert.rejects(unknown.api.execute(unknown.auth,'billing_checkout'),e=>e.status===503);
});
test('Verified renewal extends the membership once; duplicate or wrong-plan events do not',async()=>{
 const ref='recurring-payment-1',paidUntil=NOW+86400000;
 let plan='PLN_TEST99',refreshes=0;
 const send=async()=>({ok:true,json:async()=>({status:true,data:{reference:ref,status:'success',currency:'ZAR',
  amount:9900,id:100,plan:{plan_code:plan},customer:{customer_code:'CUS_TEST'}}})});
 const {api,records}=fixture({
  'teyzaSellerAccounts/shop1':{uid:'shop1',ownerEmail:'owner@example.test',category:'spaza',listingPlan:'basic'},
  'teyzaBilling/shop1':{ownerUid:'shop1',status:'paid',paidUntil,paystackCustomerCode:'CUS_TEST',paystackSubscriptionCode:'SUB_TEST'}
 },{send,refresh:async()=>{refreshes++;}});
 const payload={event:'charge.success',data:{reference:ref}},raw=Buffer.from(JSON.stringify(payload));
 const signature=crypto.createHmac('sha512','sk_test_FAKE').update(raw).digest('hex');
 plan='PLN_WRONG';await api.webhook(raw,signature,payload);
 assert.equal(records.get('teyzaBilling/shop1').paidUntil,paidUntil);
 plan='PLN_TEST99';await api.webhook(raw,signature,payload);
 assert.equal(records.get('teyzaBilling/shop1').paidUntil,nextMonth(paidUntil));
 await api.webhook(raw,signature,payload);
 assert.equal(records.get('teyzaBilling/shop1').paidUntil,nextMonth(paidUntil));
 assert.equal(records.get('teyzaPaystackPayments/'+ref).kind,'renewal');assert.equal(refreshes,2);
});
