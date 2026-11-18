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
