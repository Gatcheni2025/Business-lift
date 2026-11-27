'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const path=require('node:path');
const {ASSETS,verifyAdsOverlay,assets}=require('./publish-ads-web-r1-only.cjs');
const existing=new Map([
 ['/index.html','home'],['/pay/index.html','membership'],
 ['/js/seller-web-billing.mjs','member-js'],['/admin.html','admin']
]);
const expected=new Map([['/ads/index.html','new-ads'],['/js/ads-web-billing.mjs','new-ads-js']]);
function merged(){return new Map([...existing,...expected]);}
test('Only the exact ads page and JS are eligible for deployment',()=>{
 assert.deepEqual(ASSETS,['/ads/index.html','/js/ads-web-billing.mjs']);
 assert.doesNotThrow(()=>verifyAdsOverlay(existing,merged(),expected));
});
test('Existing membership and admin files cannot change',()=>{
 for(const p of ['/pay/index.html','/js/seller-web-billing.mjs','/admin.html']){
  const changed=merged();changed.set(p,'modified');
  assert.throws(()=>verifyAdsOverlay(existing,changed,expected),/Unrelated Hosting file changed/);
 }
});
test('Existing ads asset updates are allowed, other files remain immutable',()=>{
 const before=new Map([...existing,['/ads/index.html','old-ads'],['/js/ads-web-billing.mjs','old-js']]);
 assert.doesNotThrow(()=>verifyAdsOverlay(before,merged(),expected));
 const unexpected=merged();unexpected.set('/unexpected','new');
 assert.throws(()=>verifyAdsOverlay(existing,unexpected,expected),/Unexpected Hosting file count/);
});
test('Reserved Firebase initialization may rehash but cannot disappear',()=>{
 const old=new Map(existing);const next=merged();
 for(const p of ['/__/firebase/init.js','/__/firebase/init.json']){
  old.set(p,'a'.repeat(64));next.set(p,'b'.repeat(64));
 }
 assert.doesNotThrow(()=>verifyAdsOverlay(old,next,expected));
 next.delete('/__/firebase/init.js');
 assert.throws(()=>verifyAdsOverlay(old,next,expected),/Unexpected Hosting file count|Reserved Firebase file/);
});
test('Reviewed frontend contains hosted checkout, verification and campaign constraints',()=>{
 const found=assets(path.resolve(__dirname,'../..'));
 assert.equal(found.size,2);
 for(const p of ASSETS)assert.match(found.get(p).hash,/^[a-f0-9]{64}$/);
});
