'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {reviewer}=require('./reviewer.cjs');
function setup(extra={}){
 const user={localId:'admin1',email:'reviewer@example.test',emailVerified:true,customAttributes:JSON.stringify({otherRole:'preserve',paidPlan:true}),...extra},writes=[];
 const client={identity:async(method,url,body)=>{
  assert.equal(method,'POST');assert(url.startsWith('/projects/business-lift-3c19c/accounts:'));
  if(url.endsWith(':lookup'))return {users:[structuredClone(user)]};
  writes.push(body);user.customAttributes=body.customAttributes;return {};
 }};return {client,writes,uid:'admin1',log:()=>{}};
}
test('Reviewer grant and revoke preserve existing claims and target only the explicit UID',async()=>{
 const f=setup();await reviewer(f);assert.deepEqual(JSON.parse(f.writes[0].customAttributes),{otherRole:'preserve',paidPlan:true,teyzaAdmin:true});
 assert.equal(f.writes[0].localId,'admin1');assert.deepEqual(Object.keys(f.writes[0]).sort(),['customAttributes','localId']);
 await reviewer({...f,revoke:true});assert.deepEqual(JSON.parse(f.writes[1].customAttributes),{otherRole:'preserve',paidPlan:true});assert(f.writes[1].validSince);
});
test('Disabled, unverified, corrupt or ambiguous accounts are never granted access',async()=>{
 for(const extra of [{disabled:true},{emailVerified:false},{email:''},{customAttributes:'broken'},{localId:'different'}]){
  const f=setup(extra);await assert.rejects(reviewer(f));assert.equal(f.writes.length,0);
 }
 const f=setup();await assert.rejects(reviewer({...f,uid:'../other'}));assert.equal(f.writes.length,0);
});
