'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const web=path.resolve(__dirname,'../../web/app-first/public');
let helpers;
async function service(){return helpers??=await import(path.join(web,'js/seller-web-billing.mjs'));}
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
 assert.equal(eligibility({...seller,approvalStatus:'pending'},true,true).eligible,false);
 assert.equal(eligibility({...seller,identityVerified:false},true,true).eligible,false);
 assert.equal(eligibility({...seller,setupComplete:false},true,true).eligible,false);
 assert.equal(eligibility(seller,false,true).eligible,false);
 assert.equal(eligibility(seller,true,false).eligible,false);
 assert.equal(eligibility({...seller,listingPaid:true},true,true).active,true);
 assert.equal(eligibility({...seller,complimentaryAccess:true},true,true).active,true);
 assert.equal(eligibility(seller,true,true).eligible,true);
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
test('Website seller membership uses a gated Paystack card checkout, never a bank mandate form',()=>{
 const html=fs.readFileSync(path.join(web,'seller-subscriptions.html'),'utf8');
 const js=fs.readFileSync(path.join(web,'js/seller-web-billing.mjs'),'utf8');
 for(const id of ['teyza-web-membership','webEmailForm','webGoogle','webApple',
   'webPrice','webTerms','webCheckout','webCheckoutStatus','webManage','webConfirm']){
  assert(html.includes('id="'+id+'"'),'Missing secure website billing element '+id);
 }
 assert(html.includes('src="/js/seller-web-billing.mjs"'));
 assert(html.includes('R10 introductory')||html.includes('R10 initial'));
 assert(html.includes('R99'));
 assert(html.includes('Pay securely with Paystack'));
 assert(!html.includes('id="mandateAccountNumber"')&&!html.includes('id="mandateSign"'));
 assert(!html.includes('src="/js/seller-debit-order.mjs"'));
 assert(js.includes("billing_checkout")&&js.includes("billing_confirm"));
 assert(js.includes('getIdToken()')&&js.includes('1000')&&js.includes('9900'));
 assert(!html.includes('sk_live_')&&!js.includes('sk_live_'));
 assert(!html.includes('sk_test_')&&!js.includes('sk_test_'));
});
test('Archived mandate module still validates historical bank consent but is not linked from checkout',async()=>{
 const {bankBranch,canSignMandate,mandateAmountCents}=await import(path.join(web,'js/seller-debit-order.mjs'));
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
