// Teyza website-only seller subscription checkout.
// Never embed a Paystack secret here; the Firebase service owns all amounts and verification.
export const TERMS_VERSION='seller-r10-r99-first-2026-11';
export const SERVICE_URL='https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile';
const firebaseConfig={
  apiKey:'AIzaSyC0dFsNcfwuYUbdCN6K2xrG3Ycx6tPvl_U',
  authDomain:'business-lift-3c19c.firebaseapp.com',
  projectId:'business-lift-3c19c',
  appId:'1:983479810697:web:bd021d86bbe6d787db2458'
};
export function validCheckoutUrl(value){
  try{const u=new URL(value);return u.protocol==='https:'&&u.hostname==='checkout.paystack.com'&&!u.username&&!u.password;}
  catch(_){return false;}
}
export function validReceipt(value){return /^TZM-[a-f0-9]{26}$/.test(String(value||''));}
export function backendReady(data){
  const parts=String(data?.version||'').split('.').map(Number);
  const version=parts.length===3&&parts.every(Number.isInteger)&&
    (parts[0]>3||(parts[0]===3&&parts[1]>=25));
  return Boolean(data?.ok===true&&version&&data.approvalRequired===true&&
    data.sellerApprovalBeforeCheckout===true&&data.paystackCheckoutAvailable===true&&
    data.billingMode==='paystack_checkout'&&data.introductoryFirstMonthCents===1000&&
    data.subscriptionMonthlyCents===9900);
}
export function eligibility(summary,emailVerified,healthReady,matchedSeller=false){
  if(!summary||!matchedSeller)return {eligible:false,message:'Sign in to the exact Firebase account that owns this verified Teyza shop.'};
  if(summary.listingPaid===true)return {eligible:false,active:true,message:'Your verified membership is active. Product access follows your current seller approval.'};
  if(summary.complimentaryAccess===true)return {eligible:false,active:true,message:'Your administrator-granted product access is active until its stated expiry.'};
  if(summary.approvalStatus!=='approved'||summary.identityVerified!==true)
    return {eligible:false,message:'Your shop needs administrator approval, including its current ID and selfie review, before payment.'};
  if(summary.setupComplete!==true)
    return {eligible:false,message:'Complete mobile OTP verification and seller onboarding before subscribing.'};
  if(!emailVerified)return {eligible:false,message:'Verify the email address linked to this same seller account before paying.'};
  if(!healthReady)return {eligible:false,message:'Secure website subscription checkout is not activated on Teyza yet. No payment can be taken here.'};
  return {eligible:true,message:summary.introEligible===false?'Your next membership is R99, then R99 monthly.':'R10 today for access until month-end, then R99 on the first of each following month.'};
}
const receiptKey=uid=>'teyza_website_checkout_v1_'+uid;
async function startup(){
  const $=id=>document.getElementById(id),root=$('teyza-web-membership');
  if(!root)return;
  const view=(message,level='')=>{$('webCheckoutStatus').textContent=message;root.dataset.status=level;};
  let sdk,auth,health=null,summary=null,billing=null,activeUid=null,pending=false,returnProcessed=null;
  const set=(id,visible)=>{$(id).hidden=!visible;};
  function render(){
    const user=auth?.currentUser||null,logged=Boolean(user),matched=Boolean(user&&billing?.sellerUid===user.uid);
    const decision=eligibility(summary,user?.emailVerified===true,backendReady(health),matched);
    set('webLogin',!logged);set('webAccount',logged);
    $('webAccountEmail').textContent=user?.email||'Signed-in seller';
    $('webShopName').textContent=matched?billing.shopName:'Not verified for this login';
    $('webShopType').textContent=matched?({wholesale:'Wholesaler',spaza:'Spaza shop',retail:'Other business'}[billing.businessType]||'Business'):'Not verified';
    $('webShopUid').textContent=matched?billing.sellerUid:'No matching seller';
    $('webAccess').textContent=decision.message;
    $('webPrice').textContent=summary?.introEligible===false?'R99':'R10';
    $('webPriceDetail').textContent=summary?.introEligible===false?'Monthly membership':'Introductory month, then R99 on the 1st';
    set('webVerifyEmail',logged&&user?.emailVerified!==true&&Boolean(user?.email));
    set('webManage',logged&&Boolean(summary?.listingPaid));
    set('webConfirm',logged&&Boolean(readReceipt(user?.uid)));
    $('webCheckout').disabled=pending||!decision.eligible||!$('webTerms').checked||!$('webOwnShop').checked;
    $('webRefresh').disabled=pending;
    $('webCheckout').textContent=pending?'Checking…':'Pay securely with Paystack';
  }
  function readReceipt(uid){
    if(!uid)return null;
    try{const raw=sessionStorage.getItem(receiptKey(uid));if(!raw)return null;
      const row=JSON.parse(raw);if(!validReceipt(row.reference)||!Number.isFinite(row.createdAt)||
        Date.now()-row.createdAt>48*3600000){sessionStorage.removeItem(receiptKey(uid));return null;}
      return row.reference;
    }catch(_){return null;}
  }
  function saveReceipt(uid,reference){
    if(!uid||!validReceipt(reference))throw Error('Unexpected payment reference. Checkout was stopped.');
    sessionStorage.setItem(receiptKey(uid),JSON.stringify({reference,createdAt:Date.now()}));
    if(readReceipt(uid)!==reference)throw Error('Your browser could not save the payment return reference.');
  }
  async function post(action,data={}){
    const user=auth?.currentUser;if(!user)throw Error('Sign in to your seller account first.');
    const uid=user.uid,token=await user.getIdToken(true);
    const response=await fetch(SERVICE_URL,{method:'POST',cache:'no-store',credentials:'omit',
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
      body:JSON.stringify({action,data})});
    const payload=await response.json().catch(()=>({}));
    if(auth.currentUser?.uid!==uid)throw Error('The signed-in account changed. Sign in again.');
    if(!response.ok||payload.ok!==true)throw Error(payload.error||'The Teyza service could not complete the request.');
    return payload;
  }
  async function sync(){
    if(!auth?.currentUser)return;
    const uid=auth.currentUser.uid;
    pending=true;render();view('Checking seller approval and payment status…');
    try{
      await auth.currentUser.reload();
      const fetched=await Promise.all([
        fetch(SERVICE_URL,{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null),
        post('seller_summary'),
        post('seller_billing_overview')
      ]);
      if(auth.currentUser?.uid!==uid)return;
      if(fetched[2]?.sellerUid!==uid)throw Error('The secure billing account does not match this Firebase login.');
      health=fetched[0];summary=fetched[1];billing=fetched[2];view('Shop identity and seller status verified.');render();
      const isReturn=new URLSearchParams(location.search).get('payment')==='return';
      if(isReturn&&returnProcessed!==uid&&readReceipt(uid)){
        returnProcessed=uid;await confirmPayment();
      }else if(isReturn&&!readReceipt(uid)){
        view('Returned from Paystack. Refresh your seller status; if payment is missing, contact Teyza support with your Paystack receipt.');
      }
    }catch(error){if(auth.currentUser?.uid===uid){summary=null;billing=null;view(error.message||'Unable to verify this shop account.','error');}}
    finally{pending=false;render();}
  }
  async function confirmPayment(){
    const uid=auth?.currentUser?.uid,reference=readReceipt(uid);if(!reference){view('No pending browser payment receipt was found.','warning');return;}
    pending=true;render();view('Verifying the payment directly with Paystack…');
    try{
      const result=await post('billing_confirm',{reference});
      if(!result.paid){view('Payment cannot activate access yet. Contact support for payment review.','warning');return;}
      sessionStorage.removeItem(receiptKey(uid));
      summary=await post('seller_summary');
      view(summary.listingPaid===true?
        'Payment verified. Your active membership is available to your approved shop.':
        'Payment confirmed, but live membership is not active. Contact support before adding products.',
        summary.listingPaid===true?'success':'warning');
      history.replaceState(null,'',location.pathname);
    }catch(error){view(error.message||'Payment not yet confirmed. Use Check payment after Paystack completes.','error');}
    finally{pending=false;render();}
  }
  async function checkout(){
    const user=auth?.currentUser,uid=user?.uid,decision=eligibility(summary,user?.emailVerified===true,backendReady(health),Boolean(uid&&billing?.sellerUid===uid));
    if(pending||!decision.eligible||!$('webTerms').checked||!$('webOwnShop').checked){view('Confirm your exact Teyza business and recurring payment terms first.','warning');return;}
    pending=true;render();view('Preparing a secure, one-time Paystack checkout…');
    try{
      const result=await post('billing_checkout',{checkoutChannel:'web',confirmedSellerUid:uid,recurringConsent:true,termsVersion:TERMS_VERSION});
      if(!validCheckoutUrl(result.checkoutUrl)||!validReceipt(result.reference)||![1000,9900].includes(result.amountCents)||
        result.monthlyCents!==9900)throw Error('Checkout details failed validation. Nothing was opened.');
      if(auth.currentUser?.uid!==uid)throw Error('The signed-in account changed. Payment was not opened.');
      saveReceipt(uid,result.reference);
      window.location.assign(result.checkoutUrl);
    }catch(error){pending=false;render();view(error.message||'Checkout could not be started.','error');}
  }
  try{
    const [app,authApi]=await Promise.all([
      import('https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js')
    ]);
    sdk=authApi;
    auth=sdk.getAuth(app.getApps()[0]||app.initializeApp(firebaseConfig));
    await sdk.setPersistence(auth,sdk.browserSessionPersistence);
    sdk.onAuthStateChanged(auth,async user=>{
      activeUid=user?.uid||null;summary=null;billing=null;health=null;pending=false;
      $('webOwnShop').checked=false;$('webTerms').checked=false;render();
      if(user)await sync();
      else view('Sign in with the same verified email, Google or Apple account used to register your Teyza shop.');
    });
    $('webEmailForm').addEventListener('submit',async event=>{
      event.preventDefault();const email=$('webEmail').value.trim(),password=$('webPassword').value;
      view('Signing in securely…');
      try{await sdk.signInWithEmailAndPassword(auth,email,password);}
      catch(error){view(error.message||'Sign-in failed. Check your email and password.','error');}
      finally{$('webPassword').value='';}
    });
    $('webGoogle').addEventListener('click',async()=>{
      try{await sdk.signInWithPopup(auth,new sdk.GoogleAuthProvider());}
      catch(error){view(error.message||'Google sign-in failed.','error');}
    });
    $('webApple').addEventListener('click',async()=>{
      try{await sdk.signInWithPopup(auth,new sdk.OAuthProvider('apple.com'));}
      catch(error){view(error.message||'Apple sign-in is not available on this browser or account.','error');}
    });
    $('webLogout').addEventListener('click',()=>sdk.signOut(auth).catch(e=>view(e.message,'error')));
    $('webVerifyEmail').addEventListener('click',async()=>{
      try{await sdk.sendEmailVerification(auth.currentUser);view('Verification email requested. Open your inbox, verify it, then refresh your seller status.');}
      catch(e){view(e.message||'Unable to request verification email.','error');}
    });
    $('webRefresh').addEventListener('click',sync);
    $('webCheckout').addEventListener('click',checkout);
    $('webConfirm').addEventListener('click',confirmPayment);
    $('webTerms').addEventListener('change',render);
    $('webOwnShop').addEventListener('change',render);
    $('webManage').addEventListener('click',async()=>{
      pending=true;render();
      try{const result=await post('billing_manage');const url=new URL(result.manageUrl);
        if(url.protocol!=='https:'||url.hostname!=='paystack.com')throw Error('Unsafe subscription management address.');
        window.location.assign(result.manageUrl);
      }catch(error){view(error.message||'Subscription management is unavailable.','error');}
      finally{pending=false;render();}
    });
    render();
  }catch(error){view('Unable to load secure seller sign-in. Reload the page or contact Teyza support.','error');}
}
if(typeof document!=='undefined')startup();
