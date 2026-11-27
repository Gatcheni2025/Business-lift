'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../..');
const html=fs.readFileSync(path.join(root,'web/app-first/public/ads/index.html'),'utf8');
const reviewed=fs.readFileSync(path.join(root,'ads/index.html'),'utf8');
const js=fs.readFileSync(path.join(root,'web/app-first/public/js/ads-web-billing.mjs'),'utf8');
const mirror=fs.readFileSync(path.join(root,'js/ads-web-billing.mjs'),'utf8');
const load=()=>import('../../web/app-first/public/js/ads-web-billing.mjs');
test('Mirrored HTML and JS are exact equals',()=>{
 assert.equal(html,reviewed);assert.equal(js,mirror);
});
test('Campaign creation form collects all server-required fields with clear consent',()=>{
 for(const id of ['createAdForm','adTitle','adMessage','adImage','adRadius','adPricePreview','adPublicConsent','submitAd'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/accept="image\/jpeg,image\/png"/);
 assert.match(html,/No payment is taken until Teyza approves/);
 assert.match(html,/independent review/i);
});
test('Pricing matches the immutable server quote for 7 days',async()=>{
 const {estimatedAdCents,validAdPrice}=await load();
 for(const [km,cents] of [[1,2900],[5,2900],[10,2900],[15,3900],[20,4900],[50,10900]]){
  assert.equal(estimatedAdCents(km),cents);
  assert.equal(validAdPrice(cents,km),true);
 }
 for(const n of [0,51,10.5,'20',null,NaN])assert.equal(estimatedAdCents(n),null);
});
test('Draft validation fails closed and requires permission',async()=>{
 const {validAdDraft,validAdImageFile}=await load();
 const ok={title:'Local grocery sale',message:'Visit our local grocer for specials.',radiusKm:10,consent:true};
 assert.equal(validAdDraft(ok),true);
 for(const bad of [{title:'Hi'},{message:'Short'},{radiusKm:51},{consent:false}]){
  assert.equal(validAdDraft({...ok,...bad}),false);
 }
 assert.equal(validAdImageFile({type:'image/jpeg',size:120000}),true);
 assert.equal(validAdImageFile({type:'image/png',size:120000}),true);
 for(const bad of [{type:'image/svg+xml',size:1000},{type:'image/jpeg',size:2500000},
  {type:'image/png',size:0},null])assert.equal(validAdImageFile(bad),false);
});
test('Submitting a campaign never bypasses separate admin review or verified payment',()=>{
 assert.match(js,/api\('ads_submit'/);
 assert.match(js,/result\.status!=='pending_review'/);
 assert.match(js,/api\('ads_mine'\)/);
 assert.match(js,/api\('ads_checkout'/);
 assert.match(js,/api\('ads_confirm'/);
 assert.match(js,/ad\?\.status==='approved_unpaid'/);
 assert.match(js,/validAdCheckoutUrl/);
 assert.match(js,/current\(uid,g\)/);
});
