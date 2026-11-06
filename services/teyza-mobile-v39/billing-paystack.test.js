'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {createBilling,verifySignature,validCheckoutUrl,nextMonth,INTRO_CENTS,MONTHLY_CENTS,PROMO_CENTS,SUBSCRIPTION_TERMS_VERSION}=require('./billing-paystack');
const NOW=Date.parse('2026-11-04T07:00:00+02:00');
const consent={recurringConsent:true,termsVersion:SUBSCRIPTION_TERMS_VERSION};
function fixture(seed={},options={}) {
 const records=new Map(Object.entries({'teyzaSellerAccounts/shop1':{
  uid:'shop1',ownerEmail:'owner@example.test',category:'spaza',listingPlan:'free',approvalStatus:'approved'},...seed}));
 let previousTransaction=Promise.resolve();
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
  runTransaction:fn=>{
   const result=previousTransaction.then(async()=>{
    const writes=[],tx={
      get:ref=>ref.get(),set:(ref,v,o)=>writes.push(()=>ref.set(v,o)),
      update:(ref,v)=>writes.push(()=>ref.update(v)),
      create:(ref,v)=>writes.push(()=>ref.create(v))
    };
    const result=await fn(tx);
    for(const write of writes)await write();
    return result;
   });
   previousTransaction=result.catch(()=>{});
   return result;
  }
 };
 const requests=[];
 const send=async(url,options)=>{
  requests.push({url,options});
  let data;
  if(url.includes('/plan/'))data={plan_code:'PLN_TEST99',amount:9900,interval:'monthly',currency:'ZAR',domain:'test'};
  else if(url.includes('/transaction/initialize'))data={
   authorization_url:'https://checkout.paystack.com/test-payment'};
  else if(url.includes('/transaction/verify/')){
    const reference=decodeURIComponent(url.split('/').at(-1));
    const pending=records.get('teyzaPaystackPayments/'+reference);
    if(!pending)throw Error('Reference is not Teyza-issued');
    data={reference,status:'success',currency:'ZAR',domain:'test',paid_at:new Date(NOW).toISOString(),amount:pending.amountCents,
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
 const result=await api.execute(auth,'billing_checkout',{...consent,amount:1});
 assert.equal(result.amountCents,INTRO_CENTS);
 assert.equal(result.monthlyCents,MONTHLY_CENTS);
 assert.equal(result.introductory,true);
 assert.match(result.reference,/^TZM-[a-f0-9]{26}$/,'Reference must use Paystack-supported characters');
 assert(validCheckoutUrl(result.checkoutUrl));
 assert.equal(records.get('teyzaPaystackPayments/'+result.reference).status,'pending');
 assert.equal(records.get('teyzaPaystackPayments/'+result.reference).termsVersion,SUBSCRIPTION_TERMS_VERSION);
 assert.equal(records.get('teyzaPaystackPayments/'+result.reference).recurringConsent,true);
 const payload=JSON.parse(requests.find(x=>x.url.endsWith('/transaction/initialize')).options.body);
 assert.equal(payload.amount,4900);assert.equal(payload.currency,'ZAR');
 assert.equal(payload.plan,undefined,'First month must not bill R99 accidentally');
 assert.equal(records.has('teyzaBilling/shop1'),false,'Checkout is not payment verification');
});
test('Checkout requires explicit consent to the current recurring price',async()=>{
 const {api,auth,records,requests}=fixture();
 await assert.rejects(api.execute(auth,'billing_checkout',{}),e=>e.status===422&&/renewal terms/.test(e.message));
 await assert.rejects(api.execute(auth,'billing_checkout',{...consent,termsVersion:'outdated'}),e=>e.status===422);
 assert.equal(records.size,1);assert.equal(requests.length,0);
});
test('Pending and rejected sellers cannot start either membership or promotion checkout',async()=>{
 for(const status of ['pending','rejected']){
  const {api,auth,records,requests}=fixture();
  records.set('teyzaSellerAccounts/shop1',{...records.get('teyzaSellerAccounts/shop1'),approvalStatus:status});
  for(const action of ['billing_checkout','promote_checkout'])
   await assert.rejects(api.execute(auth,action,consent),e=>e.status===403&&/approved/.test(e.message));
  assert.equal(requests.length,0);
 }
});
test('A modern approved seller with incomplete verification or a hold cannot be charged',async()=>{
 const {api,auth,records,requests}=fixture({'teyzaSellerOnboarding/shop1':{requiredVersion:2,sellingStatus:'not_started'}});
 await assert.rejects(api.execute(auth,'billing_checkout',consent),e=>e.status===409);
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
 await assert.rejects(api.execute({...auth,email_verified:false},'billing_checkout',consent),e=>e.status===403);
 await assert.rejects(api.execute(auth,'promote_checkout'),e=>e.status===403);
 assert.equal(INTRO_CENTS,4900);assert.equal(MONTHLY_CENTS,9900);
});

test('Only a fresh administrator can verify a Teyza-issued transaction for its original seller',async()=>{
 const {api,auth,records}=fixture();
 const checkout=await api.execute(auth,'billing_checkout',consent);
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
 const checkout=await api.execute(auth,'billing_checkout',consent);
 await assert.rejects(api.execute(auth,'billing_confirm',{reference:checkout.reference}),/temporary publication outage/);
 const paidUntil=records.get('teyzaBilling/shop1').paidUntil;
 const retry=await api.execute(auth,'billing_confirm',{reference:checkout.reference});
 assert.equal(retry.alreadyConfirmed,true);assert.equal(retry.paymentEnvironment,'test');
 assert.equal(records.get('teyzaBilling/shop1').paidUntil,paidUntil);
 assert.equal(attempts,2);
});
test('Sandbox checkout cannot alter the production seller database',async()=>{
 const {api,auth,records}=fixture({}, {getProjectId:()=> 'business-lift-3c19c'});
 await assert.rejects(api.execute(auth,'billing_checkout',consent),e=>e.status===503);
 assert.equal(records.size,1);assert.equal(records.has('teyzaBilling/shop1'),false);
 const unknown=fixture({}, {getProjectId:()=> ''});
 await assert.rejects(unknown.api.execute(unknown.auth,'billing_checkout',consent),e=>e.status===503);
});
test('Verified invoice renewal extends the membership once; duplicate or wrong-plan events do not',async()=>{
 const ref='recurring-payment-1',paidUntil=NOW+86400000;
 let plan='PLN_TEST99',refreshes=0;
 const send=async url=>({ok:true,json:async()=>({status:true,data:url.includes('/subscription/')?
  {subscription_code:'SUB_TEST',domain:'test',amount:9900,plan:{plan_code:plan},customer:{customer_code:'CUS_TEST'}}:
  {reference:ref,status:'success',currency:'ZAR',domain:'test',paid_at:new Date(NOW).toISOString(),
   amount:9900,id:100,customer:{customer_code:'CUS_TEST'}}})});
 const {api,records}=fixture({
  'teyzaSellerAccounts/shop1':{uid:'shop1',ownerEmail:'owner@example.test',category:'spaza',listingPlan:'basic'},
  'teyzaBilling/shop1':{ownerUid:'shop1',status:'paid',paidUntil,paymentEnvironment:'test',paystackCustomerCode:'CUS_TEST',paystackSubscriptionCode:'SUB_TEST'}
 },{send,refresh:async()=>{refreshes++;}});
 const payload={event:'invoice.update',data:{domain:'test',status:'success',paid:true,amount:9900,
  subscription:{subscription_code:'SUB_TEST'},customer:{customer_code:'CUS_TEST'},
  transaction:{reference:ref,status:'success',amount:9900,currency:'ZAR'}}},raw=Buffer.from(JSON.stringify(payload));
 const signature=crypto.createHmac('sha512','sk_test_FAKE').update(raw).digest('hex');
 plan='PLN_WRONG';await api.webhook(raw,signature,payload);
 assert.equal(records.get('teyzaBilling/shop1').paidUntil,paidUntil);
 plan='PLN_TEST99';await api.webhook(raw,signature,payload);
 assert.equal(records.get('teyzaBilling/shop1').paidUntil,nextMonth(paidUntil));
 await api.webhook(raw,signature,payload);
 assert.equal(records.get('teyzaBilling/shop1').paidUntil,nextMonth(paidUntil));
 assert.equal(records.get('teyzaPaystackPayments/'+ref).kind,'renewal');assert.equal(refreshes,2);
});

function recurringFixture({failInitialization=false,failSubscription=false,verifiedDomain,oldStatus='cancelled',refundAmount=4900,mode='test',project='teyza-isolated-test',paidAt=NOW}={}){
 let records;const calls=[];
 const send=async(url,options)=>{
  calls.push({url,options});let data;
  if(url.includes('/plan/'))data={plan_code:'PLN_TEST99',amount:9900,interval:'monthly',currency:'ZAR',domain:mode};
  else if(url.endsWith('/transaction/initialize')){
   if(failInitialization)throw Error('connection lost after initialization');
   data={authorization_url:'https://checkout.paystack.com/synthetic'};
  }else if(url.includes('/transaction/verify/')){
   const reference=decodeURIComponent(url.split('/').at(-1)),pending=records.get('teyzaPaystackPayments/'+reference);
   data={reference,status:'success',currency:'ZAR',domain:verifiedDomain||mode,paid_at:new Date(paidAt).toISOString(),
    amount:pending.amountCents,id:12345,customer:{email:'owner@example.test',customer_code:'CUS_TEST'},
    authorization:{reusable:true,authorization_code:'AUTH_TEST'}};
  }else if(url.endsWith('/subscription/SUB_PREV')){
   data={subscription_code:'SUB_PREV',domain:mode,status:oldStatus,customer:{customer_code:'CUS_TEST'}};
  }else if(url.endsWith('/refund/345')){
   data={id:345,transaction:12345,domain:mode,amount:refundAmount,currency:'ZAR',status:'processed'};
  }else if(url.endsWith('/subscription')){
   if(failSubscription)throw Error('connection lost after subscription request');
   data={subscription_code:'SUB_TEST',domain:mode,amount:9900};
  }else throw Error('Unexpected Paystack request '+url);
  return {ok:true,json:async()=>({status:true,data})};
 };
 const f=fixture({}, {send,getSecret:()=> 'sk_'+mode+'_SYNTHETIC',getProjectId:()=>project});records=f.records;return {...f,calls};
}

test('Repeated and concurrent checkout requests cannot create two payable references',async()=>{
 const f=recurringFixture();
 const attempts=await Promise.allSettled([f.api.execute(f.auth,'billing_checkout',consent),f.api.execute(f.auth,'billing_checkout',consent)]);
 const success=attempts.filter(r=>r.status==='fulfilled');
 assert(success.length>=1);assert.equal(f.calls.filter(c=>c.url.endsWith('/transaction/initialize')).length,1);
 const first=success[0].value,again=await f.api.execute(f.auth,'billing_checkout',consent);
 assert.equal(again.reference,first.reference);assert.equal(again.alreadyStarted,true);
 assert.equal(f.calls.filter(c=>c.url.endsWith('/transaction/initialize')).length,1);
});

test('An uncertain checkout initialization never opens a second payment',async()=>{
 const f=recurringFixture({failInitialization:true});
 await assert.rejects(f.api.execute(f.auth,'billing_checkout',consent),/connection lost/);
 await assert.rejects(f.api.execute(f.auth,'billing_checkout',consent),e=>e.status===409&&/already being prepared/.test(e.message));
 assert.equal(f.calls.filter(c=>c.url.endsWith('/transaction/initialize')).length,1);
});

test('A verified R49 payment schedules one R99 monthly renewal after the paid month',async()=>{
 const f=recurringFixture(),checkout=await f.api.execute(f.auth,'billing_checkout',consent);
 const firstPayload=JSON.parse(f.calls.find(c=>c.url.endsWith('/transaction/initialize')).options.body);
 assert.equal(firstPayload.amount,4900);assert.equal(firstPayload.plan,undefined);
 const paid=await f.api.execute(f.auth,'billing_confirm',{reference:checkout.reference});
 assert.equal(paid.paid,true);assert.equal(paid.paidUntil,nextMonth(NOW));
 const subscriptionCalls=f.calls.filter(c=>c.url.endsWith('/subscription'));
 assert.equal(subscriptionCalls.length,1);
 const subscription=JSON.parse(subscriptionCalls[0].options.body);
 assert.equal(subscription.plan,'PLN_TEST99');assert.equal(subscription.start_date,new Date(nextMonth(NOW)).toISOString());
 assert.equal(subscription.authorization,'AUTH_TEST');
 assert.equal(f.records.get('teyzaBilling/shop1').renewalSetup,'scheduled');
 await f.api.execute(f.auth,'billing_confirm',{reference:checkout.reference});
 assert.equal(f.calls.filter(c=>c.url.endsWith('/subscription')).length,1);
});

test('A simulated live transaction grants paid access only after verification',async()=>{
 const f=recurringFixture({mode:'live',project:'business-lift-3c19c'});
 const checkout=await f.api.execute(f.auth,'billing_checkout',consent);
 assert.equal(f.records.has('teyzaBilling/shop1'),false);
 await f.api.execute(f.auth,'billing_confirm',{reference:checkout.reference});
 const bill=f.records.get('teyzaBilling/shop1'),account=f.records.get('teyzaSellerAccounts/shop1');
 assert.equal(bill.paymentEnvironment,'live');assert.equal(bill.renewalSetup,'scheduled');
 assert.equal(require('./publication').entitled('shop1',account,bill,NOW),true);
});

test('A paid transaction can recover renewal setup interrupted before the subscription request',async()=>{
 const f=recurringFixture(),checkout=await f.api.execute(f.auth,'billing_checkout',consent);
 const pay=f.records.get('teyzaPaystackPayments/'+checkout.reference);
 f.records.set('teyzaPaystackPayments/'+checkout.reference,{...pay,status:'paid',paymentEnvironment:'test'});
 f.records.set('teyzaBilling/shop1',{ownerUid:'shop1',status:'paid',lastReference:checkout.reference,paidUntil:nextMonth(NOW),renewalSetup:'pending'});
 const result=await f.api.execute(f.auth,'billing_confirm',{reference:checkout.reference});
 assert.equal(result.alreadyConfirmed,true);assert.equal(f.records.get('teyzaBilling/shop1').paidUntil,nextMonth(NOW));
 assert.equal(f.calls.filter(c=>c.url.endsWith('/subscription')).length,1);
});

test('An uncertain recurring subscription request is flagged instead of retried',async()=>{
 const f=recurringFixture({failSubscription:true}),checkout=await f.api.execute(f.auth,'billing_checkout',consent);
 await f.api.execute(f.auth,'billing_confirm',{reference:checkout.reference});
 assert.equal(f.records.get('teyzaBilling/shop1').renewalSetup,'action_required');
 assert.equal(f.records.get('teyzaPaystackRenewal/shop1').status,'needs_attention');
 await f.api.execute(f.auth,'billing_confirm',{reference:checkout.reference});
 assert.equal(f.calls.filter(c=>c.url.endsWith('/subscription')).length,1);
});

test('A payment confirmed after its paid month never schedules a debit in the past',async()=>{
 const f=recurringFixture({paidAt:NOW-45*86400000}),checkout=await f.api.execute(f.auth,'billing_checkout',consent);
 await f.api.execute(f.auth,'billing_confirm',{reference:checkout.reference});
 assert.equal(f.records.get('teyzaBilling/shop1').renewalSetup,'action_required');
 assert.equal(f.calls.filter(c=>c.url.endsWith('/subscription')).length,0);
});

test('A verified payment from the wrong Paystack environment never grants access',async()=>{
 const f=recurringFixture({verifiedDomain:'live'}),checkout=await f.api.execute(f.auth,'billing_checkout',consent);
 await assert.rejects(f.api.execute(f.auth,'billing_confirm',{reference:checkout.reference}),e=>e.status===409);
 assert.equal(f.records.has('teyzaBilling/shop1'),false);
});

test('An existing renewable subscription blocks a second checkout',async()=>{
 const f=recurringFixture({oldStatus:'attention'});
 f.records.set('teyzaBilling/shop1',{ownerUid:'shop1',introUsed:true,status:'expired',paidUntil:NOW-1,
  paymentEnvironment:'test',paystackCustomerCode:'CUS_TEST',paystackSubscriptionCode:'SUB_PREV'});
 await assert.rejects(f.api.execute(f.auth,'billing_checkout',consent),e=>e.status===409&&/still renew/.test(e.message));
 assert.equal(f.calls.filter(c=>c.url.endsWith('/transaction/initialize')).length,0);
});

test('A previously cancelled member pays R99 once and sets up a new renewal',async()=>{
 const f=recurringFixture();
 f.records.set('teyzaBilling/shop1',{ownerUid:'shop1',introUsed:true,status:'expired',paidUntil:NOW-1,
  paymentEnvironment:'test',paystackCustomerCode:'CUS_TEST',paystackSubscriptionCode:'SUB_PREV'});
 f.records.set('teyzaPaystackRenewal/shop1',{status:'created',firstPaymentReference:'old-ref',subscriptionCode:'SUB_PREV'});
 const checkout=await f.api.execute(f.auth,'billing_checkout',consent);assert.equal(checkout.amountCents,9900);
 const init=JSON.parse(f.calls.find(c=>c.url.endsWith('/transaction/initialize')).options.body);
 assert.equal(init.amount,9900);assert.equal(init.plan,undefined);
 await f.api.execute(f.auth,'billing_confirm',{reference:checkout.reference});
 assert.equal(f.records.get('teyzaBilling/shop1').paystackSubscriptionCode,'SUB_TEST');
 assert.equal(f.records.get('teyzaBilling/shop1').renewalSetup,'scheduled');
});

test('Payment after account closure is held for a verified full refund',async()=>{
 const f=recurringFixture(),checkout=await f.api.execute(f.auth,'billing_checkout',consent);
 f.records.set('teyzaSellerAccounts/shop1',{...f.records.get('teyzaSellerAccounts/shop1'),deletionPending:true});
 const r=await f.api.execute(f.auth,'billing_confirm',{reference:checkout.reference});
 assert.equal(r.paid,false);assert.equal(r.refundReviewRequired,true);
 assert.equal(f.records.get('teyzaPaystackPayments/'+checkout.reference).status,'refund_review');
 assert.equal(f.records.get('teyzaPaystackCheckoutLocks/shop1_membership').status,'refund_review');
 assert.equal(f.records.has('teyzaBilling/shop1'),false);
 const admin={uid:'admin1',email_verified:true,teyzaAdmin:true,auth_time:NOW/1000};
 const done=await f.api.execute(admin,'ops_paystack_refund_confirm',{sellerUid:'shop1',reference:checkout.reference,refundId:'345'});
 assert.equal(done.refunded,true);assert.equal(f.records.get('teyzaPaystackCheckoutLocks/shop1_membership').status,'refunded');
});

test('A partial refund cannot clear payment review as a full refund',async()=>{
 const f=recurringFixture({refundAmount:1000}),checkout=await f.api.execute(f.auth,'billing_checkout',consent);
 f.records.set('teyzaSellerAccounts/shop1',{...f.records.get('teyzaSellerAccounts/shop1'),deletionPending:true});
 await f.api.execute(f.auth,'billing_confirm',{reference:checkout.reference});
 const admin={uid:'admin1',email_verified:true,teyzaAdmin:true,auth_time:NOW/1000};
 await assert.rejects(f.api.execute(admin,'ops_paystack_refund_confirm',{sellerUid:'shop1',reference:checkout.reference,refundId:'345'}),e=>e.status===409);
 assert.equal(f.records.get('teyzaPaystackCheckoutLocks/shop1_membership').status,'refund_review');
});
