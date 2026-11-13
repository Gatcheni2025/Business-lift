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
  billingMode:'paystack_checkout',membershipInitialChargeCents:9900,subscriptionMonthlyCents:9900,
  subscriptionTermsVersion:'seller-r99-monthly-2026-11'};
 assert.equal(backendReady({...ready,version:'3.20.0'}),false);
 assert.equal(backendReady({...ready,paystackCheckoutAvailable:false}),false);
 assert.equal(backendReady({...ready,sellerApprovalBeforeCheckout:undefined}),false);
 assert.equal(backendReady({...ready,subscriptionMonthlyCents:4900}),false);
 assert.equal(backendReady({...ready,membershipInitialChargeCents:1000}),false,'Old introductory backend must fail closed');
 assert.equal(backendReady({...ready,subscriptionTermsVersion:'seller-r10-r99-first-2026-11'}),false);
 assert.equal(backendReady(ready),true);
});
test('Only a verified, approved, fully onboarded and email-verified shop can start website checkout',async()=>{
 const {eligibility}=await service();
 const seller={approvalStatus:'approved',identityVerified:true,setupComplete:true,
  listingPaid:false,complimentaryAccess:false,pilotCheckoutEligible:true};
 assert.equal(eligibility({...seller,approvalStatus:'pending'},true,true,true).eligible,false);
 assert.equal(eligibility({...seller,identityVerified:false},true,true,true).eligible,false);
 assert.equal(eligibility({...seller,setupComplete:false},true,true,true).eligible,false);
 assert.equal(eligibility(seller,false,true,true).eligible,false);
 assert.equal(eligibility(seller,true,false,true).eligible,false);
 assert.equal(eligibility({...seller,listingPaid:true},true,true,true).active,true);
 assert.equal(eligibility({...seller,complimentaryAccess:true},true,true,true).active,true);
 assert.equal(eligibility(seller,true,true).eligible,false,'Contact email is not seller UID proof');
  assert.equal(eligibility({...seller,pilotCheckoutEligible:false},true,true,true).eligible,false,'Pilot restrictions apply to authenticated UID');
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
   'webCheckoutStatus','webAvailabilityNotice','webManage','webConfirm','webTermsText']){
   assert(page.includes('id="'+id+'"'),'Missing secure payment field '+id);
 }
 assert(page.includes('noindex,nofollow'));
 assert(page.includes('src="/js/seller-web-billing.mjs"'));
 assert(marketing.includes('href="/pay"'));
 assert(!marketing.includes('id="webCheckout"')&&!marketing.includes('seller-web-billing.mjs'));
 assert(!page.includes('id="mandateAccountNumber"')&&!page.includes('id="mandateSign"'));
 assert(js.includes('seller_billing_overview')&&js.includes("confirmedSellerUid:uid"));
 assert(js.includes("billing_checkout")&&js.includes("billing_confirm"));
 assert(js.includes('getIdToken(true)')&&js.includes('membershipInitialChargeCents===9900')&&js.includes('subscriptionTermsVersion===TERMS_VERSION')&&js.includes('verifiedInitialQuote('));
 assert(!page.includes('R10')&&!alias.includes('R10')&&!marketing.includes('R10'));
 assert(js.includes('result.amountCents!==quote.amountCents')&&js.includes('result.introductory!==false'));
 assert(!js.includes('sk_live_')&&!page.includes('sk_live_'));
 assert(js.includes('new sdk.FacebookAuthProvider()'),'Existing Facebook-linked sellers need the same UID login');
 assert(js.includes('confirmedMembership(summary,billing,uid)'),'Paystack browser return is not payment proof');
 assert(page.includes('Reopen the app'),'Website guides owner back to the existing signed-in app');
 assert(js.includes('history.replaceState(null'),'Return marker is cleared only after verified entitlement');
});
test('Website statement only displays confirmed server amounts and local South African dates',async()=>{
 const {billingMoney,billingDate}=await service();
 assert.equal(billingMoney(9900),'R99.00');
 assert.equal(billingMoney(4900),'R49.00');
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

test('Payment return recovery is bound to a valid server-issued reference, not a redirect alone',async()=>{
 const {shouldConfirmReturn}=await service();
 const returnUrl=new URLSearchParams('payment=return');
 const reference='TZM-'+ 'a'.repeat(26);
 assert.equal(shouldConfirmReturn(returnUrl,reference,false),true);
 assert.equal(shouldConfirmReturn(returnUrl,reference,true),false);
 assert.equal(shouldConfirmReturn(returnUrl,'TZM-invalid',false),false);
 assert.equal(shouldConfirmReturn(new URLSearchParams('payment=success'),reference,false),false);
 assert.equal(shouldConfirmReturn(new URLSearchParams('uid=other'),reference,false),false);
});
test('Account switch invalidates asynchronous reads and navigation before state mutations',()=>{
 const src=fs.readFileSync(path.join(web,'js/seller-web-billing.mjs'),'utf8');
 assert(src.includes('accountGeneration++'),'Switch must invalidate outstanding operations');
 assert(src.includes('const current=(uid,generation)'),'Both UID and auth generation must match');
 assert(src.includes('if(!current(uid,generation))return;'),'Stale operations must exit');
 assert(src.includes('if(!current(uid,generation)) throw Error('),'Authenticated API results must reject stale UID');
 assert(src.includes('await confirm(true)'),'Return recovery must invoke Firebase backend verification');
 assert(src.includes("api('billing_confirm',{reference})"),'Only backend can confirm a saved reference');
 assert(src.includes("confirmedMembership(summary,billing,uid)"),'Backend access state controls success');
 assert(src.includes("url.hostname!=='paystack.com'||url.username||url.password||url.port"),
  'Subscription management navigation must refuse unsafe URL authority');
});

test('Prorated membership website requires matching health, exact seller UID and server-only first payment quote',async()=>{
 const {backendReady,verifiedInitialQuote,PRORATED_TERMS_VERSION}=await service();
 const health={ok:true,version:'3.25.0',approvalRequired:true,sellerApprovalBeforeCheckout:true,
  paystackCheckoutAvailable:true,billingMode:'paystack_checkout',subscriptionMonthlyCents:9900,
  membershipProrationEnabled:true,membershipInitialChargeCents:6270,
  membershipProrationQuoteDate:'2026-11-12',
  subscriptionTermsVersion:PRORATED_TERMS_VERSION};
 const billing={sellerUid:'seller1',firstPaymentQuote:{
  amountCents:6270,monthlyCents:9900,currency:'ZAR',prorated:true,
  daysRemaining:19,daysInMonth:30,quoteDate:'2026-11-12',
  quoteExpiresAt:Date.parse('2026-11-12T22:00:00Z'),
  nextRenewalAt:Date.parse('2026-12-01T00:00:00Z')}};
 assert.equal(backendReady(health),true);
 assert.equal(verifiedInitialQuote(health,billing,'seller1').amountCents,6270);
 assert.equal(verifiedInitialQuote(health,billing,'seller1').termsVersion,PRORATED_TERMS_VERSION);
 for(const invalid of [
  {...health,membershipInitialChargeCents:9900},
  {...health,membershipProrationQuoteDate:'2026-11-13'},
  {...health,subscriptionTermsVersion:'seller-r99-monthly-2026-11'},
  {...health,membershipInitialChargeCents:0},
 ]){
  assert.equal(verifiedInitialQuote(invalid,billing,'seller1'),null,
   'Never navigate to checkout for mismatched or stale quote');
 }
 assert.equal(verifiedInitialQuote(health,billing,'other-seller'),null);
 assert.equal(verifiedInitialQuote(health,{...billing,firstPaymentQuote:{...billing.firstPaymentQuote,amountCents:1}},'seller1'),null);
 assert.equal(verifiedInitialQuote(health,{...billing,firstPaymentQuote:{...billing.firstPaymentQuote,quoteDate:'2026-11-11'}},'seller1'),null);
});
test('Website displays explicit variable amount consent and does not trust a client-entered charge',()=>{
 const js=fs.readFileSync(path.join(web,'js/seller-web-billing.mjs'),'utf8');
 const page=fs.readFileSync(path.join(web,'pay.html'),'utf8');
 assert(js.includes('expectedAmountCents:quote.amountCents'));
 assert(js.includes('expectedQuoteDate:quote.quoteDate'));
 assert(js.includes('termsVersion:quote.termsVersion'));
 assert(js.includes("el('webTermsText').textContent"));
 assert(page.includes('id="webTermsText"'));
 assert(!page.includes('it is not prorated'));
 assert(!js.includes('amount:el('));
});

test('Payment success banner appears only after verified membership confirmation',()=>{
 const page=fs.readFileSync(path.join(web,'pay.html'),'utf8');
 const js=fs.readFileSync(path.join(web,'js/seller-web-billing.mjs'),'utf8');
 assert(page.includes('id="webPaymentSuccess"') && page.includes('Payment successful!'));
 assert(page.includes('aria-live="polite"') && page.includes('id="webPaymentSuccess"') && page.includes('hidden>'));
 assert(js.includes("const paidMembership=confirmedMembership(summary,billing,uid)"));
 assert(js.includes("show('webPaymentSuccess',paidMembership)"));
 assert(js.includes("el('webSuccessHeading').textContent=paymentSuccess?'Payment successful!':'Payment confirmed!'"));
 assert(js.includes("if(confirmedMembership(summary,billing,uid)){"));
 assert(js.includes("if(!confirmedMembership(summary,billing,uid))throw Error("));
 assert(js.includes("paymentSuccess=false;"));
 assert(js.includes("paymentSuccess=true;"));
 assert(!js.includes("params?.get('payment')==='return' && paymentSuccess=true"));
});

test('Previously verified paid seller sees a confirmation on revisit without suggesting a new charge',()=>{
 const html=fs.readFileSync(path.join(web,'pay.html'),'utf8');
 const js=fs.readFileSync(path.join(web,'js/seller-web-billing.mjs'),'utf8');
 assert(html.includes('id="webSuccessHeading">Payment confirmed!'));
 assert(html.includes('id="webSuccessDetail"'));
 assert(js.includes("show('webPaymentSuccess',paidMembership)"));
 assert(js.includes("show('webReturnGuidance',false)"));
 assert(js.includes("'Your verified Teyza membership is active."));
 assert(js.includes("const paidMembership=confirmedMembership(summary,billing,uid)"));
 assert(js.includes("paymentSuccess=false;"));
});
