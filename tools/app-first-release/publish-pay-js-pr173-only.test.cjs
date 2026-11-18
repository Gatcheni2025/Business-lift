'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {verifyOneFileChange}=require('./publish-pay-js-pr173-only.cjs');
const FILE='/js/seller-web-billing.mjs',hash='approved-compressed-hash';
const base=new Map([
 ['/index.html','index'],['/pay/index.html','pay'],['/ads/index.html','ads'],
 [FILE,'old-payment-js'],['/admin.html','admin']
]);
test('Only the pre-existing payment JS may change',()=>{
 const next=new Map(base);next.set(FILE,hash);
 assert.doesNotThrow(()=>verifyOneFileChange(base,next,hash));
 assert.equal(next.get('/pay/index.html'),'pay');
 assert.equal(next.get('/ads/index.html'),'ads');
});
test('Missing source payment JS or unrelated live file change fails closed',()=>{
 const missing=new Map(base);missing.delete(FILE);
 assert.throws(()=>verifyOneFileChange(missing,new Map(base),hash),/Live payment JavaScript missing/);
 const changed=new Map(base);changed.set(FILE,hash);changed.set('/ads/index.html','changed');
 assert.throws(()=>verifyOneFileChange(base,changed,hash),/Unrelated Hosting file changed/);
 const extra=new Map(base);extra.set(FILE,hash);extra.set('/unexpected','extra');
 assert.throws(()=>verifyOneFileChange(base,extra,hash),/Unexpected Hosting file count/);
});
test('Reserved Firebase initialization files may regenerate but cannot disappear',()=>{
 const old=new Map(base),next=new Map(base);
 for(const f of ['/__/firebase/init.js','/__/firebase/init.json']){
  old.set(f,'a'.repeat(64));next.set(f,'b'.repeat(64));
 }
 next.set(FILE,hash);
 assert.doesNotThrow(()=>verifyOneFileChange(old,next,hash));
 next.delete('/__/firebase/init.json');
 assert.throws(()=>verifyOneFileChange(old,next,hash),/file count|reserved initialization/);
});
