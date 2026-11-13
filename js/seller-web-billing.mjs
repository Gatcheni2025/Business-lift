// SECURITY REMEDIATION: independently rewritten, fail-closed Teyza seller portal.
// No card details or Paystack secrets are handled here. Pending independent review.
export const TERMS_VERSION='seller-r99-monthly-2026-11';
export const PRORATED_TERMS_VERSION='seller-r99-calendar-proration-2026-11';
export const SERVICE_URL='https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile';
const config={
  apiKey:'AIzaSyC0dFsNcfwuYUbdCN6K2xrG3Ycx6tPvl_U',
  authDomain:'business-lift-3c19c.firebaseapp.com',
  projectId:'business-lift-3c19c',
  appId:'1:983479810697:web:bd021d86bbe6d787db2458'
};
export function validCheckoutUrl(input){
  try{
    const url=new URL(input);
    return url.protocol==='https:' && url.hostname==='checkout.paystack.com' &&
      !url.username && !url.password && !url.port;
  }catch{return false;}
}
export function validReceipt(value){return /^TZM-[a-f0-9]{26}$/.test(String(value||''));}
export function confirmedMembership(summary,billing,uid){
  return typeof uid==='string' && uid.length>0 && billing?.sellerUid===uid &&
    summary?.listingPaid===true && billing?.paymentVerified===true && billing?.status==='paid';
}
export function backendReady(health){
  const v=String(health?.version||'').split('.').map(Number);
  return Boolean(health?.ok===true && v.length===3 && v.every(Number.isInteger) &&
    (v[0]>3 || v[0]===3 && v[1]>=25) &&
    health.approvalRequired===true && health.sellerApprovalBeforeCheckout===true &&
    health.paystackCheckoutAvailable===true && health.billingMode==='paystack_checkout' &&
    health.subscriptionMonthlyCents===9900 &&
    (health.membershipProrationEnabled===true?
      Number.isSafeInteger(health.membershipInitialChargeCents)&&
      health.membershipInitialChargeCents>0&&health.membershipInitialChargeCents<=9900&&
      /^\\d{4}-\\d{2}-\\d{2}$/.test(health.membershipProrationQuoteDate||'')&&
      health.subscriptionTermsVersion===PRORATED_TERMS_VERSION:
      health.membershipInitialChargeCents===9900&&
      health.subscriptionTermsVersion===TERMS_VERSION));
}
export function verifiedInitialQuote(health,billing,uid){
 if(!backendReady(health)||billing?.sellerUid!==uid)return null;
 if(health.membershipProrationEnabled!==true)
   return {amountCents:9900,monthlyCents:9900,prorated:false,
     termsVersion:TERMS_VERSION};
 const q=billing?.firstPaymentQuote;
 if(!q||q.prorated!==true||q.currency!=='ZAR'||
    !Number.isSafeInteger(q.amountCents)||q.amountCents!==health.membershipInitialChargeCents||
    q.monthlyCents!==9900||q.quoteDate!==health.membershipProrationQuoteDate||
    !Number.isInteger(q.daysRemaining)||!Number.isInteger(q.daysInMonth)||
    q.daysRemaining<1||q.daysInMonth>31||q.daysInMonth<28||
    q.daysRemaining>q.daysInMonth||!Number.isFinite(q.nextRenewalAt)||
    !Number.isFinite(q.quoteExpiresAt))return null;
 return {...q,termsVersion:PRORATED_TERMS_VERSION};
}
export function eligibility(summary,verified,ready,matched=false){
  if(!summary || !matched) return {eligible:false,message:'Sign in using the original Firebase account for your shop.'};
  if(summary.listingPaid===true) return {eligible:false,active:true,message:'Verified membership active. Open the Teyza app to manage products.'};
  if(summary.complimentaryAccess===true) return {eligible:false,active:true,message:'Temporary complimentary access is active. This is not a Paystack payment.'};
  if(summary.approvalStatus!=='approved' || summary.identityVerified!==true)
    return {eligible:false,message:'Shop approval and identity review must be completed first.'};
  if(summary.setupComplete!==true) return {eligible:false,message:'Complete phone verification and seller onboarding in Teyza.'};
  if(!verified) return {eligible:false,message:'Verify the email on the same seller account before payment.'};
  if(!ready) return {eligible:false,message:'Secure seller payments are currently disabled. No charge will be initiated.'};
  if(summary.pilotCheckoutEligible!==true) return {eligible:false,message:'Membership checkout is not yet open for this business account. Your shop remains listed for free.'};
  return {eligible:true,message:'First payment is shown below for the current month, then R99 on the 1st of following months.'};
}
export const billingMoney=cents=>Number.isSafeInteger(cents)&&cents>=0?'R'+(cents/100).toFixed(2):'No confirmed amount';
export const billingDate=value=>Number.isFinite(value)&&value>0?
  new Date(value).toLocaleDateString('en-ZA',{timeZone:'Africa/Johannesburg',day:'numeric',month:'short',year:'numeric'}):'Not scheduled';
export function shouldConfirmReturn(params,reference,verified){
  return params?.get('payment')==='return' && validReceipt(reference) && !verified;
}
const receiptKey=uid=>'teyza_website_checkout_v1_'+uid;
async function startup(){
  const el=id=>document.getElementById(id);
  const root=el('teyza-web-membership');
  if(!root) return;
  const show=(id,on)=>{el(id).hidden=!on;};
  const notice=(message,level='')=>{el('webCheckoutStatus').textContent=message;root.dataset.status=level;};
  let sdk=null,auth=null,summary=null,billing=null,health=null,busy=false,accountGeneration=0;
  const current=(uid,generation)=>auth?.currentUser?.uid===uid && accountGeneration===generation;
  function receipt(uid){
    if(!uid) return null;
    try{
      const stored=JSON.parse(sessionStorage.getItem(receiptKey(uid))||'null');
      if(!validReceipt(stored?.reference) || !Number.isFinite(stored?.createdAt) ||
        stored.createdAt>Date.now()+300000 || Date.now()-stored.createdAt>48*3600000){
        sessionStorage.removeItem(receiptKey(uid));return null;
      }
      return stored.reference;
    }catch{return null;}
  }
  function render(){
    const user=auth?.currentUser,uid=user?.uid,matched=Boolean(uid&&billing?.sellerUid===uid);
    const quote=matched?verifiedInitialQuote(health,billing,uid):null;
    const ready=backendReady(health)&&(health?.membershipProrationEnabled!==true||quote!==null);
    const status=eligibility(summary,user?.emailVerified===true,ready,matched);
    show('webLogin',!user);show('webAccount',!!user);
    el('webAccountEmail').textContent=user?.email||'';
    el('webShopName').textContent=matched?billing.shopName||'Unnamed shop':'Not verified';
    el('webShopType').textContent=matched?({spaza:'Spaza shop',retail:'Other business',wholesale:'Wholesaler'}[billing.businessType]||'Business'):'Not verified';
    el('webShopUid').textContent=matched?uid:'No matching seller';
    el('webAccess').textContent=status.eligible&&quote?.prorated?
      'First payment '+billingMoney(quote.amountCents)+' for '+quote.daysRemaining+
      ' of '+quote.daysInMonth+' calendar days, followed by R99 on the 1st of each month.':
      status.message;
    el('webBillingStatus').textContent=matched?({
      paid:'Paid · active',complimentary_access:'Temporary complimentary access',
      legacy_temporary_access:'Historic temporary access · not a Paystack payment',
      payment_failed:'Renewal failed',cancelled:'Renewal cancelled',
      action_required:'Paystack action required',not_subscribed:'Not subscribed'
    }[billing.status]||'Awaiting verification'):'Not verified';
    el('webPaidThrough').textContent=matched&&billing.paymentVerified?billingDate(billing.paidThrough):'No verified live payment';
    el('webNextBill').textContent=matched?billingDate(billing.nextBillingAt):'Not scheduled';
    el('webAmountDue').textContent=matched?billingMoney(billing.amountDueCents):'No confirmed amount';
    el('webPrice').textContent=quote?billingMoney(quote.amountCents):'—';
    el('webPriceDetail').textContent=quote?.prorated?
      quote.daysRemaining+' of '+quote.daysInMonth+' calendar days, billed through month-end':
      'Full first month at R99, then R99 on the 1st';
    el('webTermsText').textContent=quote?.prorated?
      'I authorise an initial prorated Paystack charge of '+billingMoney(quote.amountCents)+
      ' for the remaining '+quote.daysRemaining+' calendar days of this month, and recurring R99 charges on the first of each following month until cancelled. I understand this is a recurring subscription.':
      'I authorise an initial R99 Paystack card charge for access until the end of the current calendar month and recurring R99 charges on the first of each following month until cancelled. I understand this is a recurring subscription.';
    const historyNode=el('webPaymentHistory');historyNode.replaceChildren();
    const records=matched&&Array.isArray(billing.transactions)?billing.transactions.slice(0,30):[];
    if(!records.length){
      const p=document.createElement('p');p.textContent='No verified Paystack membership transactions recorded yet.';
      historyNode.append(p);
    }else for(const record of records){
      const p=document.createElement('p');
      p.textContent=[billingDate(record.date),billingMoney(record.amountCents),
        record.kind||'membership',record.paymentVerified?'Verified live Paystack':record.status||'unverified'].join(' · ');
      historyNode.append(p);
    }
    el('webAvailabilityNotice').textContent=backendReady(health)?
      'Checkout is available only to approved and verified sellers.':
      'New membership checkout is disabled while security verification is completed.';
    show('webReturnGuidance',confirmedMembership(summary,billing,uid));
    el('webReturnGuidance').textContent='Verified membership is linked to this account. Reopen the app to refresh selling access.';
    show('webVerifyEmail',Boolean(user&&user.email&&!user.emailVerified));
    show('webManage',Boolean(matched&&['scheduled','active'].includes(billing.renewalStatus)&&Number.isFinite(billing.nextBillingAt)));
    show('webConfirm',Boolean(uid&&receipt(uid)));
    el('webCheckout').disabled=busy||!status.eligible||!quote||!el('webTerms').checked||!el('webOwnShop').checked;
    el('webRefresh').disabled=busy;
  }
  async function api(action,data={}){
    const user=auth?.currentUser;
    if(!user) throw Error('Sign in first.');
    const uid=user.uid,generation=accountGeneration,token=await user.getIdToken(true);
    const response=await fetch(SERVICE_URL,{
      method:'POST',cache:'no-store',credentials:'omit',
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
      body:JSON.stringify({action,data})
    });
    const output=await response.json().catch(()=>({}));
    if(!current(uid,generation)) throw Error('Seller account changed. Sign in again.');
    if(!response.ok||output.ok!==true) throw Error(output.error||'Unable to verify this request.');
    return output;
  }
  async function reload(){
    const uid=auth?.currentUser?.uid;if(!uid)return;
    const generation=accountGeneration;
    busy=true;render();notice('Checking your seller account securely…');
    try{
      await auth.currentUser.reload();
      const [h,s,b]=await Promise.all([
        fetch(SERVICE_URL,{cache:'no-store'}).then(r=>r.ok?r.json():null),
        api('seller_summary'),api('seller_billing_overview')
      ]);
      if(!current(uid,generation))return;
      if(b?.sellerUid!==uid)throw Error('Seller identity does not match billing record.');
      health=h;summary=s;billing=b;notice('Shop identity and seller status verified.');
      if(confirmedMembership(summary,billing,uid)){
        sessionStorage.removeItem(receiptKey(uid));
        if(new URLSearchParams(location.search).get('payment')==='return'){
          history.replaceState(null,'',location.pathname);
          notice('Membership verified by Firebase. Reopen Teyza to use your selling tools.','success');
        }
      }else if(shouldConfirmReturn(new URLSearchParams(location.search),receipt(uid),false)){
        // Return parameters are navigation hints, not payment proof.
        // The backend independently verifies the saved Teyza reference.
        await confirm(true);
      }else if(new URLSearchParams(location.search).get('payment')==='return'){
        notice('Your return is pending verification. Refresh status; do not pay twice.','warning');
      }
    }catch(error){
      if(current(uid,generation)){
        summary=null;billing=null;health=null;
        notice(error.message||'Account check unavailable.','error');
      }
    }finally{if(current(uid,generation)){busy=false;render();}}
  }
  async function confirm(fromReturn=false){
    const uid=auth?.currentUser?.uid,reference=receipt(uid),generation=accountGeneration;
    if(busy && !fromReturn)return;
    if(!reference)return notice('No pending payment reference is available.','warning');
    busy=true;render();notice('Verifying payment through Firebase…');
    try{
      const verified=await api('billing_confirm',{reference});
      if(verified.paid!==true)throw Error('Payment requires further review.');
      const [s,b]=await Promise.all([api('seller_summary'),api('seller_billing_overview')]);
      if(!current(uid,generation))return;
      if(b.sellerUid!==uid)throw Error('Seller identity mismatch.');
      summary=s;billing=b;
      if(!confirmedMembership(summary,billing,uid))throw Error('Payment not yet reflected as active seller membership.');
      sessionStorage.removeItem(receiptKey(uid));
      history.replaceState(null,'',location.pathname);
      notice('Verified payment activated. Reopen the Teyza app.','success');
    }catch(error){if(current(uid,generation))notice(error.message||'Unable to confirm payment.','warning');}
    finally{if(current(uid,generation)){busy=false;render();}}
  }
  async function checkout(){
    const uid=auth?.currentUser?.uid,generation=accountGeneration;
    if(!uid||busy||!eligibility(summary,auth.currentUser.emailVerified,backendReady(health),billing?.sellerUid===uid).eligible||
      !el('webOwnShop').checked||!el('webTerms').checked)return notice('Confirm your shop identity and subscription terms.','warning');
    busy=true;render();notice('Preparing verified Paystack checkout…');
    try{
      const quote=verifiedInitialQuote(health,billing,uid);
      if(!quote)throw Error('The initial payment quote is out of date. Refresh your account before proceeding.');
      const result=await api('billing_checkout',{checkoutChannel:'web',confirmedSellerUid:uid,
        recurringConsent:true,termsVersion:quote.termsVersion,
        ...(quote.prorated?{expectedAmountCents:quote.amountCents,
          expectedQuoteDate:quote.quoteDate}:{})});
      if(!validReceipt(result.reference)||!validCheckoutUrl(result.checkoutUrl)||
        result.amountCents!==quote.amountCents||result.monthlyCents!==9900||
        (quote.prorated&&result.quoteDate!==quote.quoteDate)||
        result.introductory!==false)
        throw Error('Unexpected checkout details.');
      if(!current(uid,generation))return;
      sessionStorage.setItem(receiptKey(uid),JSON.stringify({reference:result.reference,createdAt:Date.now()}));
      if(receipt(uid)!==result.reference)throw Error('Unable to save your checkout reference.');
      if(!current(uid,generation))return;
      window.location.assign(result.checkoutUrl);
    }catch(error){if(current(uid,generation)){notice(error.message||'Checkout unavailable. No payment initiated.','error');busy=false;render();}}
  }
  try{
    const [app,sdkAuth]=await Promise.all([
      import('https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js')
    ]);
    sdk=sdkAuth;
    auth=sdk.getAuth(app.getApps()[0]||app.initializeApp(config));
    await sdk.setPersistence(auth,sdk.browserSessionPersistence);
    sdk.onAuthStateChanged(auth,async user=>{
      accountGeneration++;
      summary=null;billing=null;health=null;busy=false;
      el('webOwnShop').checked=false;el('webTerms').checked=false;render();
      if(user)await reload();
      else notice('Sign in using the original Firebase account for your approved Teyza shop.');
    });
    el('webEmailForm').addEventListener('submit',async event=>{
      event.preventDefault();
      try{await sdk.signInWithEmailAndPassword(auth,el('webEmail').value.trim(),el('webPassword').value);}
      catch(error){notice(error.message||'Sign-in unavailable.','error');}
      finally{el('webPassword').value='';}
    });
    el('webGoogle').addEventListener('click',async()=>{
      try{await sdk.signInWithPopup(auth,new sdk.GoogleAuthProvider());}
      catch(error){notice(error.message||'Google sign-in failed.','error');}
    });
    el('webApple').addEventListener('click',async()=>{
      try{await sdk.signInWithPopup(auth,new sdk.OAuthProvider('apple.com'));}
      catch(error){notice(error.message||'Apple sign-in failed.','error');}
    });
    el('webFacebook').addEventListener('click',async()=>{
      try{await sdk.signInWithPopup(auth,new sdk.FacebookAuthProvider());}
      catch(error){notice(error.message||'Facebook sign-in failed.','error');}
    });
    el('webLogout').addEventListener('click',()=>sdk.signOut(auth).catch(e=>notice(e.message,'error')));
    el('webVerifyEmail').addEventListener('click',async()=>{
      try{await sdk.sendEmailVerification(auth.currentUser);notice('Verification email sent. Verify and refresh your account.');}
      catch(error){notice(error.message||'Email verification unavailable.','error');}
    });
    el('webCheckout').addEventListener('click',checkout);
    el('webConfirm').addEventListener('click',()=>confirm(false));
    el('webRefresh').addEventListener('click',reload);
    el('webTerms').addEventListener('change',render);
    el('webOwnShop').addEventListener('change',render);
    el('webManage').addEventListener('click',async()=>{
      try{
        const uid=auth?.currentUser?.uid,generation=accountGeneration;
        const result=await api('billing_manage');
        const url=new URL(result.manageUrl);
        if(url.protocol!=='https:'||url.hostname!=='paystack.com'||url.username||url.password||url.port)
          throw Error('Unexpected management URL.');
        if(!current(uid,generation))return;
        window.location.assign(result.manageUrl);
      }catch(error){notice(error.message||'Subscription management unavailable.','error');}
    });
    render();
  }catch(error){notice('Secure sign-in is temporarily unavailable. Contact Teyza support.','error');}
}
if(typeof document!=='undefined')startup();
