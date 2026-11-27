'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createAdminSessions,hasIdleSession,IDLE_MS}=require('./admin-session'),{recentAdmin}=require('./seller-experience');
function fixture(){
 let now=1795700000000,row=null,enabled=true;
 const ref={get:async()=>({exists:!!row,data:()=>({...row})}),set:async value=>{row={...value}}};
 const db={doc:()=>ref,runTransaction:async fn=>fn({get:r=>r.get(),set:(_,value)=>{row={...value}},update:(_,patch)=>{row={...row,...patch}}})};
 const clock=()=>now,actor={uid:'admin1',auth_time:now/1000,teyzaAdmin:true,email_verified:true,firebase:{sign_in_provider:'password'}};
 const sessions=createAdminSessions({db,clock,rate:async()=>{},getAuthUser:async uid=>({uid,emailVerified:true,disabled:!enabled,customClaims:{teyzaAdmin:enabled}})});
 return {sessions,actor,clock,advance:ms=>{now+=ms},disable:()=>{enabled=false},row:()=>row};
}
test('Admin idle session extends only on explicit touch and expires after five inactive minutes',async()=>{
 const f=fixture(),{sessionToken:t}=await f.sessions.start(f.actor);
 assert(!JSON.stringify(f.row()).includes(t));
 f.advance(240000);await f.sessions.touch(f.actor,t,{activityId:1});f.advance(120000);
 const auth=await f.sessions.validate(f.actor,t);assert(hasIdleSession(auth,f.clock));assert.doesNotThrow(()=>recentAdmin(auth,f.clock));
 assert.throws(()=>recentAdmin(f.actor,f.clock),e=>e.status===401);
 f.advance(180000);await assert.rejects(f.sessions.validate(f.actor,t),e=>e.status===401);
 await assert.rejects(f.sessions.touch(f.actor,t,{activityId:2}),e=>e.status===401);
});
test('Password-only start, real role, bound auth time, replacement and logout are fail closed',async()=>{
 const f=fixture();
 await assert.rejects(f.sessions.start({...f.actor,firebase:{sign_in_provider:'google.com'}}),e=>e.status===401);
 await assert.rejects(f.sessions.start({...f.actor,teyzaPhoneBootstrap:true}),e=>e.status===401);
 const {sessionToken:a}=await f.sessions.start(f.actor);
 await assert.rejects(f.sessions.start(f.actor),e=>e.status===401);
 f.advance(1000);const newer={...f.actor,auth_time:f.clock()/1000};
 const {sessionToken:b}=await f.sessions.start(newer);
 await assert.rejects(f.sessions.validate(f.actor,a),e=>e.status===401);
 await f.sessions.end(f.actor,a);assert(await f.sessions.validate(newer,b));
 await assert.rejects(f.sessions.validate(f.actor,b),e=>e.status===401);
 await f.sessions.end(newer,b);await assert.rejects(f.sessions.validate(newer,b),e=>e.status===401);
 await assert.rejects(f.sessions.start(newer),e=>e.status===401);
 await assert.rejects(f.sessions.start(f.actor),e=>e.status===401);
 f.advance(1000);const fresh={...f.actor,auth_time:f.clock()/1000};
 const {sessionToken:c}=await f.sessions.start(fresh);f.disable();await assert.rejects(f.sessions.validate(fresh,c),e=>e.status===403);
});
test('Read-only status cannot refresh idle lifetime and start requires fresh authentication',async()=>{
 const f=fixture(),{sessionToken}=await f.sessions.start(f.actor);
 f.advance(IDLE_MS-1);await f.sessions.validate(f.actor,sessionToken);f.advance(1);
 await assert.rejects(f.sessions.validate(f.actor,sessionToken),e=>e.status===401);
 f.advance(1000);await assert.rejects(f.sessions.start(f.actor),e=>e.status===401);
});

test('Trailing activity reports extend expiry from the actual activity rather than heartbeat time',async()=>{
 const f=fixture(),{sessionToken}=await f.sessions.start(f.actor);
 f.advance(45000);await f.sessions.touch(f.actor,sessionToken,{activityLagMs:20000,activityId:1});
 assert.equal(f.row().expiresAt,f.clock()-20000+IDLE_MS);
 await assert.rejects(f.sessions.touch(f.actor,sessionToken,{activityLagMs:-1,activityId:2}),e=>e.status===400);
 f.advance(IDLE_MS-20000);await assert.rejects(f.sessions.validate(f.actor,sessionToken),e=>e.status===401);
});

test('No token, no password identity, or replayed heartbeat cannot extend or authorize Admin',async()=>{
 const f=fixture(),{sessionToken}=await f.sessions.start(f.actor);
 assert.throws(()=>recentAdmin(f.actor,f.clock),e=>e.status===401);
 await assert.rejects(f.sessions.validate(f.actor,undefined),e=>e.status===401);
 await assert.rejects(f.sessions.validate({...f.actor,firebase:{sign_in_provider:'google.com'}},sessionToken),e=>e.status===401);
 f.advance(1000);await f.sessions.touch(f.actor,sessionToken,{activityId:1});const expiry=f.row().expiresAt;
 f.advance(1000);await f.sessions.touch(f.actor,sessionToken,{activityId:1});assert.equal(f.row().expiresAt,expiry);
 await f.sessions.end(f.actor,sessionToken);await assert.rejects(f.sessions.touch(f.actor,sessionToken,{activityId:2}),e=>e.status===401);
 await assert.rejects(f.sessions.start(f.actor),e=>e.status===401);
});
