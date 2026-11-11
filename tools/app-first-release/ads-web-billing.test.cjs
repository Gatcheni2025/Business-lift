'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.resolve(__dirname,'../../web/app-first/public/ads/index.html'),'utf8');
const dart=fs.readFileSync(path.resolve(__dirname,'../../apps/teyza_shopper/lib/teyza_ads_page.dart'),'utf8');
test('Independent advertiser portal uses Firebase web auth, not an in-app payment WebView',()=>{
 assert.match(html,/Secure advertiser account/);
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
