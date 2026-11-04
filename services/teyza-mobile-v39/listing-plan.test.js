'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const P=require('./publication'),B=require('./billing-paystack');
const NOW=Date.parse('2026-11-04T07:00:00+02:00');
const seller={uid:'seller1',category:'spaza',shopName:'Local Shop',approvalStatus:'approved'};
const shop={sellerUid:'seller1',status:'active',name:'Local Shop',sellingEnabled:true};
const free={...seller,listingPlan:'free'};
const basic={...seller,listingPlan:'basic'};
const legacyTrial={...seller,listingPlan:'trial',trialStartedAt:NOW,trialEndsAt:NOW+P.TRIAL_MS};
const billing={ownerUid:'seller1',status:'paid',monthlyCents:4900,paidUntil:B.nextMonth(NOW)};
test('Registration and historical trials are never paid entitlements',()=>{
 for(const a of [free,legacyTrial,{...seller}]){
  assert.equal(P.entitled('seller1',a,null,NOW),false);
  const state=P.state('seller1',a,{},null,shop,null,NOW);
  assert.equal(state.live,true,'approved, verified business appears without products');
  assert.equal(state.canSell,false);
 }
});
test('Introductory first month permits products until expiry',()=>{
 assert.equal(B.INTRO_CENTS,4900);assert.equal(B.MONTHLY_CENTS,9900);
 assert.equal(P.entitled('seller1',basic,billing,NOW),true);
 assert.equal(P.state('seller1',basic,{},null,shop,billing,NOW).canSell,true);
 assert.equal(P.entitled('seller1',basic,billing,billing.paidUntil),false);
 for(const bad of [null,{...billing,status:'pending'},{...billing,ownerUid:'someone'},
  {...billing,paidUntil:NOW-1}])assert.equal(P.entitled('seller1',basic,bad,NOW),false);
});
test('Paid subscription cannot bypass owner verification or rejection',()=>{
 assert.equal(P.state('seller1',{...basic,approvalStatus:'rejected'}, {},null,shop,billing,NOW).canSell,false);
 const setup={requiredVersion:2,completedAt:NOW,sellingStatus:'pending_approval',
  verifiedPhone:'+27712345678',selfieSubmissionId:'selfie-1'};
 assert.equal(P.state('seller1',basic,setup,null,shop,billing,NOW).canSell,false);
});
test('Seven-day paid promotion is separate from membership',()=>{
 assert.equal(B.PROMO_CENTS,2900);assert.equal(B.PROMO_MS,7*86400000);
 assert.equal(B.validCheckoutUrl('https://checkout.paystack.com/abc123'),true);
 assert.equal(B.validCheckoutUrl('https://example.com/checkout'),false);
 assert.equal(B.nextMonth(Date.UTC(2026,0,31)),Date.UTC(2026,1,28));
});
