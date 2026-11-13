'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {createWebhook,checkSignature,safeEvents}=require('./whatsapp-webhook');
const secret='test-meta-app-secret',verify='test-only-verify-token';
const payload={object:'whatsapp_business_account',entry:[{id:'waba_1',changes:[{field:'messages',value:{
 metadata:{phone_number_id:'123456789'},messages:[{id:'wamid.abc_123',from:'27711111111',type:'text',text:{body:'NEVER STORE ME'}}],
 statuses:[{id:'wamid.sent_12',status:'delivered',timestamp:'1794600000',recipient_id:'27711111111'}]}}]}]};
function setup(){
 const docs=new Map();
 const db={collection:name=>{assert.equal(name,'teyzaWhatsAppWebhookEvents');return {doc:id=>({create:async record=>{
  if(docs.has(id)){const e=Error('exists');e.code=6;throw e;}
  docs.set(id,record);
 }})}}};
 const webhook=createWebhook({db,getVerifyToken:()=>verify,getAppSecret:()=>secret,clock:()=>1794600000000});
 async function request(method,body=payload,options={}){
  const raw=Buffer.isBuffer(body)?body:Buffer.from(JSON.stringify(body));
  const signature='sha256='+crypto.createHmac('sha256',secret).update(raw).digest('hex');
  const req={method,rawBody:raw,query:options.query||{},get:name=>name==='X-Hub-Signature-256'?(options.signature??signature):null};
  const response={statusCode:200,headers:{},set(k,v){this.headers[k]=v;return this;},status(n){this.statusCode=n;return this;},send(v){this.body=v;return this;}};
  await webhook.handle(req,response);return response;
 }
 return {docs,request};
}
test('GET verifies challenge exactly, never accepts wrong or missing token',async()=>{
 const {request}=setup();
 assert.equal((await request('GET',null,{query:{'hub.mode':'subscribe','hub.verify_token':verify,'hub.challenge':'238441'}})).body,'238441');
 for(const query of [{},{'hub.mode':'subscribe','hub.verify_token':'wrong','hub.challenge':'238441'},
 {'hub.mode':'subscribe','hub.verify_token':verify,'hub.challenge':'no script'}]){
  assert.equal((await request('GET',null,{query})).statusCode,403);
 }
});
test('POST requires valid raw byte HMAC and never trusts object body alone',async()=>{
 const {request,docs}=setup();const altered='sha256='+'0'.repeat(64);
 assert.equal((await request('POST',payload,{signature:altered})).statusCode,403);
 assert.equal((await request('POST',payload,{signature:'sha256=broken'})).statusCode,403);
 assert.equal(docs.size,0);
 assert.equal((await request('POST')).statusCode,200);
 assert.equal(docs.size,2);
 for(const row of docs.values()){assert(!JSON.stringify(row).includes('NEVER STORE ME'));assert(!JSON.stringify(row).includes('27711111111'));assert(!JSON.stringify(row).includes('wamid.abc_123'));}
});
test('Meta retries are deduped; distinct status transitions are recorded separately',async()=>{
 const {request,docs}=setup();await request('POST');await request('POST');assert.equal(docs.size,2);
 const next=structuredClone(payload);next.entry[0].changes[0].value.statuses[0].status='read';
 await request('POST',next);assert.equal(docs.size,3);
});
test('Invalid bodies, unrelated objects and unsupported methods are rejected',async()=>{
 const {request,docs}=setup();
 assert.equal((await request('POST',Buffer.from('{oops'))).statusCode,400);
 assert.equal((await request('POST',{object:'page',entry:[]})).statusCode,400);
 assert.equal((await request('DELETE')).statusCode,405);
 assert.equal(docs.size,0);
});
test('Events are bounded, filter unexpected fields and never include chat text or phone',()=>{
 const entries=safeEvents(payload);assert.equal(entries.length,2);
 for(const item of entries){assert(!('text' in item));assert(!('from' in item));}
 assert.deepEqual(safeEvents({object:'page',entry:[]}),[]);
 assert.equal(checkSignature(Buffer.from('abc'),'sha256='+'0'.repeat(64),secret),false);
});
test('Firestore failures return 503 so Meta retries, not false 200',async()=>{
 const db={collection:()=>({doc:()=>({create:async()=>{throw Error('quota exceeded');}})})};
 const svc=createWebhook({db,getVerifyToken:()=>verify,getAppSecret:()=>secret});
 const raw=Buffer.from(JSON.stringify(payload)),sig='sha256='+crypto.createHmac('sha256',secret).update(raw).digest('hex');
 const res={statusCode:0,set(){return this;},status(n){this.statusCode=n;return this;},send(){return this;}};
 await svc.handle({method:'POST',rawBody:raw,get:()=>sig},res);
 assert.equal(res.statusCode,503);
});
