'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const rollout=require('./paystack-rollout');
const original={
  flag:process.env.TEYZA_SELLER_PAYSTACK_ENABLED,
  uids:process.env.TEYZA_PAYSTACK_PILOT_UIDS,
  full:process.env.TEYZA_PAYSTACK_FULL_ROLLOUT_APPROVED
};
function env(flag,uids,full){
  process.env.TEYZA_SELLER_PAYSTACK_ENABLED=flag;
  process.env.TEYZA_PAYSTACK_PILOT_UIDS=uids;
  process.env.TEYZA_PAYSTACK_FULL_ROLLOUT_APPROVED=full;
}
test.after(()=>{
  for(const [key,value] of [
    ['TEYZA_SELLER_PAYSTACK_ENABLED',original.flag],
    ['TEYZA_PAYSTACK_PILOT_UIDS',original.uids],
    ['TEYZA_PAYSTACK_FULL_ROLLOUT_APPROVED',original.full]
  ]){if(value===undefined)delete process.env[key];else process.env[key]=value;}
});
test('Pilot rollout defaults closed with no live checkout audience',()=>{
 env('false','','false');
 assert.equal(rollout.allowed('sellerOne'),false);
 assert.equal(rollout.hasEligibleAudience(),false);
 assert.equal(rollout.mode(),'disabled');
 env('true','','false');
 assert.equal(rollout.hasEligibleAudience(),false);
 assert.equal(rollout.allowed('sellerOne'),false);
 assert.equal(rollout.mode(),'no_eligible_sellers');
});
test('Only exact authenticated UIDs in the allowlist can check out',()=>{
 env('true',' sellerOne,sellerTwo ','false');
 assert.equal(rollout.allowed('sellerOne'),true);
 assert.equal(rollout.allowed('sellerTwo'),true);
 assert.equal(rollout.allowed('sellerOne2'),false);
 assert.equal(rollout.allowed('SELLERONE'),false);
 assert.equal(rollout.hasEligibleAudience(),true);
 assert.equal(rollout.mode(),'pilot');
});
test('Wildcard alone cannot turn on global payments',()=>{
 env('true','*','false');
 assert.equal(rollout.allowed('sellerOne'),false);
 assert.equal(rollout.hasEligibleAudience(),false);
 env('true','*','true');
 assert.equal(rollout.allowed('sellerOne'),true);
 assert.equal(rollout.mode(),'full');
 env('false','*','true');
 assert.equal(rollout.allowed('sellerOne'),false);
});
