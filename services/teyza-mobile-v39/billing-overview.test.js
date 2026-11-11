'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {summarize}=require('./billing-overview');
const NOW=1794150000000,MONTH=2678400000;
const seller=(uid,category)=>({uid,category,approvalStatus:'approved',listingPlan:'basic',shopName:category+' Seller'});
const active=(uid)=>({ownerUid:uid,status:'paid',paymentProvider:'paystack',paymentEnvironment:'live',
  paidUntil:NOW+MONTH,renewalSetup:'scheduled',nextBillingAt:NOW+MONTH,
  paystackSubscriptionCode:'SUB_ABC123',lastReference:'TZM_123'});
const txn=(uid)=>({ownerUid:uid,reference:'TZM_valid',kind:'intro',status:'paid',
  currency:'ZAR',amountCents:1000,verifiedAt:NOW-86400000,environment:'live'});
test('spaza and wholesaler both see the same verified Paystack R99 schedule',()=>{
  for(const category of ['spaza','wholesale','retail']){
    const uid='shop1',b=summarize(uid,seller(uid,category),active(uid),[txn(uid)],NOW);
    assert.equal(b.businessType,category);
    assert.equal(b.provider,'paystack');
    assert.equal(b.status,'paid');
    assert.equal(b.paymentVerified,true);
    assert.equal(b.monthlyFeeCents,9900);
    assert.equal(Object.hasOwn(b,'introductoryFeeCents'),false);
    assert.equal(b.nextBillingAt,NOW+MONTH);
    assert.equal(b.nextBillAmountCents,9900);
    assert.equal(b.amountDueCents,null,'A future scheduled bill is not an overdue invoice');
    assert.equal(b.transactions.length,1);
    assert.equal(b.transactions[0].paymentVerified,true);
  }
});
test('legacy Netcash processing and a complimentary grant never count as a Paystack charge',()=>{
 const uid='shop1',a={...seller(uid,'spaza'),listingPlan:'free'};
 const m={ownerUid:uid,mandateAccessKind:'processing_7d',mandateAccessStatus:'active',
   mandateAccessMandateId:'old_mandate',mandateAccessUntil:NOW+86400000};
 const info=summarize(uid,a,m,[],NOW);
 assert.equal(info.status,'legacy_temporary_access');
 assert.equal(info.paymentVerified,false);
 assert.equal(info.nextBillingAt,null);
 assert.equal(info.amountDueCents,null);
 assert.equal(info.temporaryAccessKind,'historic_mandate_processing');
 assert.equal(info.mandateCollectionEnabled,false);
 const c=summarize(uid,a,{ownerUid:uid,adminComplimentaryStatus:'active',
   adminComplimentaryBy:'admin2',adminComplimentaryReason:'Verified seller onboarding test',
   adminComplimentaryUntil:NOW+86400000},[],NOW);
 assert.equal(c.status,'complimentary_access');
 assert.equal(c.paymentVerified,false);
});
test('payment failure is an action required amount, not an automatically issued invoice',()=>{
 const uid='shop1',b=summarize(uid,seller(uid,'wholesale'),
   {...active(uid),paidUntil:NOW-1000,renewalSetup:'payment_failed',nextBillingAt:NOW-1000},[],NOW);
 assert.equal(b.status,'payment_failed');assert.equal(b.nextBillingAt,null);
 assert.equal(b.amountDueCents,9900);assert.equal(b.amountDueIsInvoice,false);
 assert.equal(b.paymentVerified,false);
});
test('no verified charge or a sandbox charge cannot activate membership',()=>{
 const uid='shop1',a=seller(uid,'spaza');
 const untrusted=summarize(uid,a,{...active(uid),paymentEnvironment:'test'},[
   {...txn(uid),environment:'test'},
   {...txn('another'),reference:'private_other'},
   {...txn(uid),reference:'TZM_pending',status:'pending'}
 ],NOW);
 assert.equal(untrusted.paymentVerified,false);
 assert.equal(untrusted.nextBillingAt,null);
 assert.equal(untrusted.amountDueCents,null);
 assert.deepEqual(untrusted.transactions.map(x=>x.reference),['TZM_valid','TZM_pending']);
 assert.equal(untrusted.transactions[0].paymentVerified,false);
 assert.throws(()=>summarize('wrong',a,active(uid),[],NOW),/identity/);
});
