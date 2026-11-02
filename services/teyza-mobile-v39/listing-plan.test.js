'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const P=require('./publication');
const NOW=Date.parse('2026-11-02T07:00:00+02:00');
const seller={uid:'seller1',category:'spaza',shopName:'Local Shop',approvalStatus:'approved'};
const shop={sellerUid:'seller1',status:'active',name:'Local Shop',sellingEnabled:true};
const basic={...seller,listingPlan:'basic'};
const paid={ownerUid:'seller1',status:'paid',monthlyCents:9900,latestPeriod:P.period(NOW)};
test('approved free sellers appear locally without paid priority placement',()=>{
 const free={...seller,listingPlan:'free'};
 const result=P.state('seller1',free,{},null,shop,null,NOW);
 assert.equal(result.approved,true);assert.equal(result.live,true);
 assert.equal(result.hasListing,false);
 assert.equal(result.status,'active');
});
test('unpaid Basic sellers remain published but cannot claim paid prominence',()=>{
 for(const b of [null,{...paid,status:'invoiced'},{...paid,ownerUid:'another'},
   {...paid,latestPeriod:'2026-10'},{...paid,monthlyCents:1}]){
   assert.equal(P.state('seller1',basic,{},null,shop,b,NOW).live,true);
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
