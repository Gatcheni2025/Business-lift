'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {verifyOneFileChange}=require('./publish-seller-guide-only.cjs');
const page='/seller-getting-started.html',hash='checked-page-hash';
const original=new Map([
 ['/index.html','home-hash'],['/ads/index.html','approved-ads-hash'],
 ['/pay/index.html','approved-pay-hash'],['/admin.html','admin-hash']
]);
test('First publication allows one new seller guide and no other changes',()=>{
 const next=new Map([...original,[page,hash]]);
 assert.doesNotThrow(()=>verifyOneFileChange(original,next,hash));
 assert.equal(original.has(page),false);
});
test('Updating an existing seller guide preserves the original file count',()=>{
 const old=new Map([...original,[page,'old-page-hash']]);
 const next=new Map([...old]);next.set(page,hash);
 assert.doesNotThrow(()=>verifyOneFileChange(old,next,hash));
});
test('Missing, changed, or extra existing files prevent publication',()=>{
 const missing=new Map([...original]);missing.delete('/pay/index.html');missing.set(page,hash);
 assert.throws(()=>verifyOneFileChange(original,missing,hash),/Unexpected Hosting file count|Unrelated Hosting file changed/);
 const changed=new Map([...original,[page,hash]]);changed.set('/ads/index.html','different');
 assert.throws(()=>verifyOneFileChange(original,changed,hash),/Unrelated Hosting file changed/);
 const extra=new Map([...original,[page,hash],['/unapproved.html','unexpected']]);
 assert.throws(()=>verifyOneFileChange(original,extra,hash),/Unexpected Hosting file count/);
 const incorrect=new Map([...original,[page,'wrong']]);
 assert.throws(()=>verifyOneFileChange(original,incorrect,hash),/Seller guide failed hash check/);
});

test('Firebase reserved initialization hashes may differ but both paths remain present',()=>{
 const init='/__/firebase/init.js',json='/__/firebase/init.json';
 const before=new Map([...original,[init,'a'.repeat(64)],[json,'b'.repeat(64)]]);
 const after=new Map([...before,[page,hash]]);
 after.set(init,'c'.repeat(64));after.set(json,'d'.repeat(64));
 assert.doesNotThrow(()=>verifyOneFileChange(before,after,hash));
});
test('Reserved Firebase files cannot be missing or malformed',()=>{
 const init='/__/firebase/init.js',json='/__/firebase/init.json';
 const before=new Map([...original,[init,'a'.repeat(64)],[json,'b'.repeat(64)]]);
 const missing=new Map([...before,[page,hash]]);missing.delete(init);missing.set('/unexpected','a'.repeat(64));
 assert.throws(()=>verifyOneFileChange(before,missing,hash),/Firebase reserved file missing or invalid/);
 const invalid=new Map([...before,[page,hash]]);invalid.set(json,'invalid');
 assert.throws(()=>verifyOneFileChange(before,invalid,hash),/Firebase reserved file missing or invalid/);
});
