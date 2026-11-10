'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {visibleDirectory}=require('./business-directory');
const left={sellerUid:'legacy',shopName:'Legacy',ownerEmail:'Same@Example.test',approvalStatus:'approved'};
const right={sellerUid:'authUid',shopName:'Current',ownerEmail:'same@example.TEST',approvalStatus:'pending'};
test('only the matching Auth UID is displayed; old approvals are NOT transferred',async()=>{
 const rows=await visibleDirectory([left,right],async email=>{
   assert.equal(email,'same@example.test');return {uid:'authUid'};
 });
 assert.equal(rows.length,1);
 assert.equal(rows[0].sellerUid,'authUid');
 assert.equal(rows[0].approvalStatus,'pending');
});
test('unknown owner blocks actions with one explicit conflict; no false approval',async()=>{
 const rows=await visibleDirectory([left,right],async()=>({uid:'unrelatedAuthUid'}));
 assert.equal(rows.length,1);
 assert.equal(rows[0].accountConflict,true);
 assert.equal(rows[0].sellerUid,null);
 assert.deepEqual(rows[0].conflictingSellerUids,['authUid','legacy']);
 assert.equal(rows[0].approvalStatus,'identity_conflict');
});
test('Auth lookup failure cannot lead to arbitrary account selection',async()=>{
 const rows=await visibleDirectory([left,right],async()=>{throw Error('temporarily unavailable')});
 assert.equal(rows.length,1);
 assert.equal(rows[0].accountConflict,true);
});
test('unrelated accounts and records without email remain distinct',async()=>{
 const rows=await visibleDirectory([{sellerUid:'a',ownerEmail:'one@example.test'},
   {sellerUid:'b',ownerEmail:'two@example.test'},{sellerUid:'c',ownerEmail:''}],async()=>{throw Error('should not query')});
 assert.equal(rows.length,3);
 assert.deepEqual(rows.map(x=>x.sellerUid),['a','b','c']);
});
