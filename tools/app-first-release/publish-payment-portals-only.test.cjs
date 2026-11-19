'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {FILES,checkReviewedFiles,verifyExactFileChange}=require('./publish-payment-portals-only.cjs');
const root=path.resolve(__dirname,'../..');
test('exact reviewed /pay and /ads HTML and scripts are pinned and mirrored',()=>{
 const reviewed=checkReviewedFiles(root);
 assert.equal(reviewed.size,5);
 assert.deepEqual([...reviewed.keys()],FILES);
 for(const [name,data] of reviewed){
  assert(data.raw.byteLength>1000,name);
  assert(data.gzip.byteLength>500,name);
 }
});
test('only five reviewed Hosting file hashes may change',()=>{
 const previous=new Map([
  ['/index.html','homepage'],['/admin.html','keep-me'],['/js/admin.js','keep-admin'],
  ...FILES.map((f,i)=>[f,'old-'+i])
 ]);
 const approved=new Map(FILES.map((f,i)=>[f,'approved-'+i]));
 const updated=new Map([...previous]);
 for(const [f,h] of approved)updated.set(f,h);
 assert.doesNotThrow(()=>verifyExactFileChange(previous,updated,approved));
 const evil=new Map(updated);evil.set('/admin.html','hijacked');
 assert.throws(()=>verifyExactFileChange(previous,evil,approved),/Unrelated/);
 const missing=new Map(updated);missing.delete('/pay/index.html');
 assert.throws(()=>verifyExactFileChange(previous,missing,approved));
 const extra=new Map(updated);extra.set('/something-new.html','not-approved');
 assert.throws(()=>verifyExactFileChange(previous,extra,approved),/count changed/);
 const rogue=new Map(approved);rogue.set('/checkout-evasion.js','rogue');
 assert.throws(()=>verifyExactFileChange(previous,updated,rogue),/scoped upload list/);
});
test('publisher never auto-runs during require and requires explicit --publish',()=>{
 assert.equal(typeof checkReviewedFiles,'function');
 assert.equal(typeof verifyExactFileChange,'function');
});
