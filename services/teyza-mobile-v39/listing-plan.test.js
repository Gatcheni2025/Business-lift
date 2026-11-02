'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const P=require('./publication');
const NOW=Date.parse('2026-11-02T07:00:00+02:00');
const seller={uid:'seller1',category:'spaza',shopName:'Local Shop',approvalStatus:'approved'};
const shop={sellerUid:'seller1',status:'active',name:'Local Shop',sellingEnabled:true};
const basic={...seller,listingPlan:'basic'};
const paid={ownerUid:'seller1',status:'paid',monthlyCents:9900,latestPeriod:P.period(NOW)};
test('Seven-day trial is active only once and expires exactly on day eight',()=>{
 const trial={...seller,listingPlan:'trial',trialStartedAt:NOW,
   trialEndsAt:NOW+P.TRIAL_MS};
 assert.equal(P.TRIAL_MS,7*24*60*60*1000);
 assert.equal(P.state('seller1',trial,{},null,shop,null,NOW).live,true);
 assert.equal(P.state('seller1',trial,{},null,shop,null,NOW+P.TRIAL_MS-1).live,true);
 const expired=P.state('seller1',trial,{},null,shop,null,NOW+P.TRIAL_MS);
 assert.equal(expired.live,false);
 assert.equal(expired.status,'awaiting_subscription');
 assert.equal(P.entitled('seller1',{...trial,trialEndsAt:NOW+20*P.TRIAL_MS},null,NOW),false);
 assert.equal(P.state('seller1',{...seller,listingPlan:'free'}, {},null,shop,null,NOW).live,false);
});
test('Unpaid R99 Basic cannot publish, paid membership can',()=>{
 for(const b of [null,{...paid,status:'invoiced'},{...paid,ownerUid:'another'},
   {...paid,latestPeriod:'2026-10'},{...paid,monthlyCents:1}]){
   assert.equal(P.state('seller1',basic,{},null,shop,b,NOW).live,false);
   assert.equal(P.entitled('seller1',basic,b,NOW),false);
 }
 assert.equal(P.state('seller1',basic,{},null,shop,paid,NOW).live,true);
 assert.equal(P.entitled('seller1',basic,paid,NOW),true);
});
test('paid plan cannot bypass rejection or incomplete verification',()=>{
 assert.equal(P.state('seller1',{...basic,approvalStatus:'rejected'},{},null,shop,paid,NOW).live,false);
 const setup={requiredVersion:2,completedAt:NOW,sellingStatus:'pending_approval',
   verifiedPhone:'+27712345678',selfieSubmissionId:'selfie-1'};
 assert.equal(P.state('seller1',basic,setup,null,shop,paid,NOW).live,false);
});
test('legacy approved shops have backwards-compatible publication while migration is planned',()=>{
 assert.equal(P.state('seller1',seller,{},null,shop,null,NOW).live,true);
 assert.equal(P.publicRow('seller1',{...shop,sponsored:true}).sponsored,true);
});
