'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const web=path.resolve(__dirname,'../../web/app-first/public');
let helpers;
async function service(){return helpers??=await import(pathToFileURL(path.join(web,'js/seller-web-billing.mjs')).href);}
test('Website merchant readiness fails closed for old production and incomplete payment configuration',async()=>{
 const {backendReady}=await service();
 const ready={ok:true,version:'3.25.0',approvalRequired:true,
  sellerApprovalBeforeCheckout:true,paystackCheckoutAvailable:true,
  billingMode:'paystack_checkout',introductoryFirstMonthCents:1000,subscriptionMonthlyCents:9900};
 assert.equal(backendReady({...ready,version:'3.20.0'}),false);
 assert.equal(backendReady({...ready,paystackCheckoutAvailable:false}),false);
 assert.equal(backendReady({...ready,sellerApprovalBeforeCheckout:undefined}),false);
 assert.equal(backendReady({...ready,subscriptionMonthlyCents:4900}),false);
 assert.equal(backendReady(ready),true);
});
test('Only a verified, approved, fully onboarded and email-verified shop can start website checkout',async()=>{
 const {eligibility}=await service();
 const seller={approvalStatus:'approved',identityVerified:true,setupComplete:true,
  listingPaid:false,complimentaryAccess:false,introEligible:true};
 assert.equal(eligibility({...seller,approvalStatus:'pending'},true,true,true).eligible,false);
 assert.equal(eligibility({...seller,identityVerified:false},true,true,true).eligible,false);
 assert.equal(eligibility({...seller,setupComplete:false},true,true,true).eligible,false);
 assert.equal(eligibility(seller,false,true,true).eligible,false);
 assert.equal(eligibility(seller,true,false,true).eligible,false);
 assert.equal(eligibility({...seller,listingPaid:true},true,true,true).active,true);
 assert.equal(eligibility({...seller,complimentaryAccess:true},true,true,true).active,true);
 assert.equal(eligibility(seller,true,true).eligible,false,'Contact email is not seller UID proof');
  assert.equal(eligibility(seller,true,true,true).eligible,true);
});
test('Client refuses wrong checkout host and non-Teyza payment references',async()=>{
 const {validCheckoutUrl,validReceipt}=await service();
 assert.equal(validCheckoutUrl('https://checkout.paystack.com/secure-path'),true);
 for(const url of ['http://checkout.paystack.com/path','https://checkout.paystack.com.attacker.test/','https://evil.example/','javascript:alert(1)']){
  assert.equal(validCheckoutUrl(url),false);
 }
 assert.equal(validReceipt('TZM-'+ 'f'.repeat(26)),true);
 assert.equal(validReceipt('TZP-'+ 'f'.repeat(26)),false);
 assert.equal(validReceipt('TZM-a'),false);
});
test('Dedicated /pay is self-contained and seller plans only link from website',()=>{
 const page=fs.readFileSync(path.join(web,'pay.html'),'utf8');
 const alias=fs.readFileSync(path.join(web,'pay/index.html'),'utf8');
 const marketing=fs.readFileSync(path.join(web,'seller-subscriptions.html'),'utf8');
 const js=fs.readFileSync(path.join(web,'js/seller-web-billing.mjs'),'utf8');
 assert.equal(page,alias,'Clean URL and directory alias must behave consistently');
 for(const id of ['teyza-web-membership','webEmailForm','webGoogle','webApple','webFacebook','webReturnGuidance',
   'webShopName','webShopUid','webShopType','webBillingStatus','webPaidThrough','webNextBill','webAmountDue','webPaymentHistory','webOwnShop','webTerms','webCheckout',
   'webCheckoutStatus','webManage','webConfirm']){
   assert(page.includes('id="'+id+'"'),'Missing secure payment field '+id);
 }
 assert(page.includes('noindex,nofollow'));
 assert(page.includes('src="/js/seller-web-billing.mjs"'));
 assert(marketing.includes('href="/pay"'));
 assert(!marketing.includes('id="webCheckout"')&&!marketing.includes('seller-web-billing.mjs'));
 assert(!page.includes('id="mandateAccountNumber"')&&!page.includes('id="mandateSign"'));
 assert(js.includes('seller_billing_overview')&&js.includes("confirmedSellerUid:uid"));
 assert(js.includes("billing_checkout")&&js.includes("billing_confirm"));
 assert(js.includes('getIdToken(true)')&&js.includes('1000')&&js.includes('9900'));
 assert(!js.includes('sk_live_')&&!page.includes('sk_live_'));
 assert(js.includes('new sdk.FacebookAuthProvider()'),'Existing Facebook-linked sellers need the same UID login');
 assert(js.includes('confirmedMembership(summary,billing,uid)'),'Paystack browser return is not payment proof');
 assert(page.includes('Reopen the app'),'Website guides owner back to the existing signed-in app');
 assert(js.includes('history.replaceState(null'),'Return marker is cleared only after verified entitlement');
});
test('Website statement only displays confirmed server amounts and local South African dates',async()=>{
 const {billingMoney,billingDate}=await service();
 assert.equal(billingMoney(9900),'R99.00');
 assert.equal(billingMoney(1000),'R10.00');
 assert.equal(billingMoney(null),'No confirmed amount');
 assert.match(billingDate(Date.UTC(2026,10,30,22,0,0)),/Dec|12/);
 assert.equal(billingDate(null),'Not scheduled');
});
test('App source never offers Paystack billing, due amounts or direct /pay checkout links',()=>{
 for(const f of ['seller_plan.dart','seller_workspace.dart','seller_tools.dart']){
   const source=fs.readFileSync(path.join(__dirname,'../../apps/teyza_shopper/lib',f),'utf8');
   for(const phrase of ["SellerBillingPage","SellerBillingCard","/pay","Pay securely with Paystack","Amount due"]){
     assert(!source.includes(phrase),f+' must not contain '+phrase);
   }
 }
});
test('Archived mandate module still validates historical bank consent but is not linked from checkout',async()=>{
 const {bankBranch,canSignMandate,mandateAmountCents}=await import(pathToFileURL(path.join(web,'js/seller-debit-order.mjs')).href);
 assert.equal(mandateAmountCents,9900);
 assert.equal(bankBranch([{name:'FNB',branchCode:'250655'}],'FNB'),'250655');
 const good={config:{termsVersion:'teyza-membership-v1'},identity:{evidenceId:'current',kind:'id'},
   consent:true,idConsent:true,account:'12345678901',bank:'FNB',
   firstName:'Test',surname:'Owner',holder:'Test Owner',firstDate:'2026-12-01'};
 assert(canSignMandate(good));
 assert(!canSignMandate({...good,consent:false}));
 assert(!canSignMandate({...good,identity:null}));
 assert(!canSignMandate({...good,account:'123'}));
});

test('Browser return requires matching original UID and independently verified live seller access',async()=>{
 const {confirmedMembership}=await service();
 const uid='approvedSeller1';
 const summary={listingPaid:true,approvalStatus:'approved'};
 const billing={sellerUid:uid,status:'paid',paymentVerified:true,renewalStatus:'scheduled'};
 assert.equal(confirmedMembership(summary,billing,uid),true,'Both Firebase server results agree');
 for(const wrong of [
   {summary:{...summary,listingPaid:false},billing,uid},
   {summary,billing:{...billing,sellerUid:'anotherOwner'},uid},
   {summary,billing:{...billing,status:'pending'},uid},
   {summary,billing:{...billing,paymentVerified:false},uid},
   {summary,billing,uid:'anotherOwner'}
 ])assert.equal(confirmedMembership(wrong.summary,wrong.billing,wrong.uid),false);
 assert.equal(confirmedMembership(null,billing,uid),false);
 assert.equal(confirmedMembership(summary,null,uid),false);
 assert.equal(confirmedMembership(summary,billing,''),false);
});
