'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.resolve(__dirname,'../../web/app-first/public/ads/index.html'),'utf8');
const dart=fs.readFileSync(path.resolve(__dirname,'../../apps/teyza_shopper/lib/teyza_ads_page.dart'),'utf8');
test('Independent advertiser portal uses Firebase web auth, not an in-app payment WebView',()=>{
 assert.match(html,/Secure advertiser account/);
 const root=fs.readFileSync(path.resolve(__dirname,'../../ads/index.html'),'utf8');
 const js=fs.readFileSync(path.resolve(__dirname,'../../web/app-first/public/js/ads-web-billing.mjs'),'utf8');
 const rootJs=fs.readFileSync(path.resolve(__dirname,'../../js/ads-web-billing.mjs'),'utf8');
 assert.equal(root,html,'Ads root and app-first HTML must remain identical');
 assert.equal(js,rootJs,'Ads root and app-first JS must remain identical');
 assert.match(html,/<details id="legacyAccess"/,
  'Existing sellers must have hidden legacy access, rather than visible email as primary login');
 assert.match(html,/id="emailForm"/,'A verified legacy account can sign in');
 assert.match(js,/signInWithEmailAndPassword/,'Only existing accounts may use email/password');
 assert.match(js,/linkWithPopup\(user,provider\)/,'Link secure providers to the existing UID');
 assert.match(js,/auth\.currentUser\.uid!==uid\|\|result\.user\.uid!==uid/,'No UID switching during account linking');
 assert.doesNotMatch(js,/createUserWithEmailAndPassword/,'New email registration stays disabled');
 for(const label of ['Continue with Google','Continue with Facebook','Continue with Apple',
 'WhatsApp sign-in is not active yet','New to Teyza?',
 '7-day local sponsored campaign','Step 1','R29','adCreativePreview']) {
  assert.ok(html.includes(label),'Missing advertiser UX copy/element: '+label);
 }
 assert.match(js,/URL\.createObjectURL/,'Ad creative preview should use only a local object URL');
 assert.match(js,/URL\.revokeObjectURL/,'Local image preview should revoke previous object URLs');
 assert.match(html,/Receiving Teyza WhatsApp messages does not sign you in/,
  'Never imply support messaging is identity verification');

 assert.match(html,/ads-web-billing\.mjs/);
 assert.doesNotMatch(dart,/ads_checkout|checkout\.paystack\.com|launchUrl\(/);
 assert.doesNotMatch(html,/seller-web-billing\.mjs/);
});
test('Website checkout blocks invalid URL, price and an unmatched account',async()=>{
 const web=await import('../../web/app-first/public/js/ads-web-billing.mjs');
 assert.equal(web.validAdPrice(2900,10),true);
 assert.equal(web.validAdPrice(3900,15),true);
 assert.equal(web.validAdPrice(2900,15),false);
 assert.equal(web.validAdPrice(10900,50),true);
 assert.equal(web.validAdPrice(10900,51),false);
 assert.equal(web.validAdCheckoutUrl('https://checkout.paystack.com/valid'),true);
 assert.equal(web.validAdCheckoutUrl('http://checkout.paystack.com/valid'),false);
 assert.equal(web.validAdCheckoutUrl('https://checkout.paystack.com.evil.test/'),false);
 assert.equal(web.validAdCheckoutUrl('https://bad@checkout.paystack.com/'),false);
 assert.equal(web.validAdReference('TZA-'+'f'.repeat(26)),true);
 assert.equal(web.validAdReference('TZA-'+'z'.repeat(26)),false);
 assert.equal(web.canPurchaseAd({status:'approved_unpaid',paymentStatus:'unpaid',radiusKm:10,amountCents:2900},
   {emailVerified:true},true),true);
 assert.equal(web.canPurchaseAd({status:'pending_review',paymentStatus:'unpaid',radiusKm:10,amountCents:2900},
   {emailVerified:true},true),false);
 assert.equal(web.canPurchaseAd({status:'approved_unpaid',paymentStatus:'unpaid',radiusKm:10,amountCents:2900,paymentReference:'TZA-'+('f'.repeat(26))},
   {emailVerified:true},true),false);
 assert.equal(web.canPurchaseAd({status:'approved_unpaid',paymentStatus:'unpaid',radiusKm:10,amountCents:2900},
   {emailVerified:false},true),false);
});
