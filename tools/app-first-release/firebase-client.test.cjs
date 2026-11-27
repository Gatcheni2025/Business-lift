'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
for(const modulePath of ['./firebase-client.cjs','../admin-release/firebase-client.cjs']){
 const {uploadWithRetry}=require(modulePath),target=new URL('https://upload-firebasehosting.googleapis.com/upload/sites/business-lift-3c19c/versions/abc/files/'+'a'.repeat(64));
 test(modulePath+' retries transient upload errors without logging credentials',async()=>{
  const calls=[],waits=[],logs=[],client={request:async o=>{calls.push(o);if(calls.length<3)throw Object.assign(new Error('Failed to make request to hidden-url'),{original:Object.assign(new Error('secret-value'),{code:'ECONNRESET'})});}};
  await uploadWithRetry(client,target,Buffer.from('abc'),{wait:async n=>waits.push(n),log:m=>logs.push(m)});
  assert.equal(calls.length,3);assert.deepEqual(waits,[1000,2000]);assert.equal(calls[0].headers.Connection,undefined);assert.equal(calls[1].headers.Connection,'close');assert(!logs.join(' ').includes('secret-value'));
 });
 test(modulePath+' fails closed for permission errors and exhausted retries',async()=>{
  let count=0;const opts={wait:async()=>{},log:()=>{}};
  await assert.rejects(uploadWithRetry({request:async()=>{count++;throw Object.assign(new Error('secret body'),{context:{response:{statusCode:403}}});}},target,Buffer.from('a'),opts),e=>e.message.includes('HTTP 403')&&!e.message.includes('secret body'));assert.equal(count,1);
  count=0;await assert.rejects(uploadWithRetry({request:async()=>{count++;throw Object.assign(new Error('Failed to make request'),{original:{code:'ENOTFOUND'}});}},target,Buffer.from('a'),opts),/ENOTFOUND/);assert.equal(count,4);
 });
}
