// Teyza independent website advertiser payments. Never included as an in-app WebView.
// Only the Firebase service may determine the price or verify/activate a campaign.
const SERVICE_URL='https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile';
const firebaseConfig={apiKey:'AIzaSyC0dFsNcfwuYUbdCN6K2xrG3Ycx6tPvl_U',
 authDomain:'business-lift-3c19c.firebaseapp.com',projectId:'business-lift-3c19c',
 appId:'1:983479810697:web:bd021d86bbe6d787db2458'};
export const validAdReference=v=>/^TZA-[a-f0-9]{26}$/.test(String(v||''));
export function validAdCheckoutUrl(v){
 try{const u=new URL(v);return u.protocol==='https:'&&u.hostname==='checkout.paystack.com'&&
   !u.username&&!u.password&&!u.port;}catch{return false;}
}
export const validAdPrice=(cents,radius)=>Number.isInteger(radius)&&radius>=1&&radius<=50&&
 Number.isInteger(cents)&&cents===2900+Math.max(0,radius-10)*200;
export const canPurchaseAd=(ad,user,ready)=>Boolean(ready&&user?.emailVerified===true&&
 ad?.status==='approved_unpaid'&&ad.paymentStatus!=='paid'&&!ad.paymentReference&&
 validAdPrice(ad.amountCents,ad.radiusKm));
const money=c=>Number.isSafeInteger(c)?'R'+(c/100).toFixed(2):'Unavailable';
const receiptKey=uid=>'teyza_ads_website_receipt_'+uid;
const el=id=>document.getElementById(id);
async function start(){
 if(!el('ad-web-root'))return;
 let auth,sdk,ads=[],health=null,selectedId=null,busy=false,generation=0;
 const notice=(msg,kind='')=>{el('status').textContent=msg;el('status').dataset.kind=kind;};
 const current=(uid,g)=>auth?.currentUser?.uid===uid&&generation===g;
 function receipt(uid){
  try{const v=JSON.parse(sessionStorage.getItem(receiptKey(uid))||'null');
   if(!validAdReference(v?.reference)||typeof v?.advertisementId!=='string'||
    !Number.isFinite(v?.time)||v.time>Date.now()+300000||Date.now()-v.time>48*3600000)return null;
   return v;
  }catch{return null;}
 }
 function render(){
  const user=auth?.currentUser;
  el('login').hidden=!!user;el('signedIn').hidden=!user;
  el('campaigns').replaceChildren();
  if(!user)return;
  el('signedEmail').textContent=user.email||'Original Firebase business account';
  el('shopUid').textContent='Seller account ID: '+user.uid;
  const ready=health?.ok===true&&health.shopperAdsWebPaystackEnabled===true;
  if(!ads.length){const p=document.createElement('p');p.textContent='No campaigns yet. Submit a creative in your Teyza seller workspace for review.';el('campaigns').append(p);}
  for(const ad of ads){
   const box=document.createElement('article');box.className='ad';box.dataset.selected=String(selectedId===ad.id);
   const h=document.createElement('strong');h.textContent=ad.title||'Local advertisement';box.append(h);
   const p=document.createElement('p');p.textContent=[ad.status.replaceAll('_',' '),
     ad.radiusKm+' km',money(ad.amountCents),'7 days'].join(' · ');p.className='meta';box.append(p);
   if(ad.reviewNote){const note=document.createElement('p');note.textContent='Review note: '+ad.reviewNote;box.append(note);}
   if(ad.status==='active'&&Number.isFinite(ad.endsAt)){const end=document.createElement('p');
     end.textContent='Runs until '+new Date(ad.endsAt).toLocaleString('en-ZA',{timeZone:'Africa/Johannesburg'});box.append(end);}
   if(canPurchaseAd(ad,user,ready)){
    const choose=document.createElement('button');choose.type='button';choose.className='secondary';
    choose.textContent=selectedId===ad.id?'Selected for checkout':'Choose this campaign';
    choose.disabled=busy;choose.addEventListener('click',()=>{selectedId=ad.id;el('ownerConsent').checked=false;el('paymentConsent').checked=false;render();});
    box.append(choose);
   }else if(ad.paymentReference&&validAdReference(ad.paymentReference)&&ad.status!=='active'){
    const verify=document.createElement('button');verify.type='button';verify.className='secondary';
    verify.textContent='Check existing payment';verify.disabled=busy;
    verify.addEventListener('click',()=>confirm(ad.paymentReference));box.append(verify);
   }
   el('campaigns').append(box);
  }
  const selected=ads.find(a=>a.id===selectedId);
  el('checkout').disabled=busy||!canPurchaseAd(selected,user,ready)||
   !el('ownerConsent').checked||!el('paymentConsent').checked;
  el('refresh').disabled=busy;
 }
 async function api(action,data={}){
  if(!auth?.currentUser)throw Error('Sign in to the approved account first.');
  const uid=auth.currentUser.uid,g=generation;
  const token=await auth.currentUser.getIdToken(true);
  if(!current(uid,g))throw Error('The signed-in account changed.');
  const r=await fetch(SERVICE_URL,{method:'POST',cache:'no-store',credentials:'omit',
   headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
   body:JSON.stringify({action,data})});
  const json=await r.json().catch(()=>({}));
  if(!current(uid,g))throw Error('The signed-in account changed.');
  if(!r.ok||json.ok!==true)throw Error(json.error||'Secure request unavailable.');
  return json;
 }
 async function reload(){
  const uid=auth?.currentUser?.uid,g=generation;if(!uid||busy)return;
  busy=true;render();notice('Verifying your original shop account and campaigns…');
  try{
   await auth.currentUser.reload();
   const [h,mine]=await Promise.all([fetch(SERVICE_URL,{cache:'no-store'}).then(r=>r.ok?r.json():null),api('ads_mine')]);
   if(!current(uid,g))return;
   health=h;ads=Array.isArray(mine.ads)?mine.ads.filter(a=>typeof a.id==='string'):[];
   if(!ads.some(a=>a.id===selectedId))selectedId=null;
   const isReady=h?.ok===true&&h.shopperAdsWebPaystackEnabled===true;
   notice(isReady?'Reviewed campaigns loaded. Select one approved campaign for a one-time charge.':
    'Advertising checkout is not enabled yet; no payment can be started.',isReady?'':'warning');
  }catch(e){if(current(uid,g)){ads=[];health=null;notice(e.message||'Campaign lookup unavailable.','error');}}
  finally{if(current(uid,g)){busy=false;render();}}
  const pending=receipt(uid);
  if(current(uid,g)&&pending&&new URLSearchParams(location.search).get('payment')==='return')
   await confirm(pending.reference);
  else if(current(uid,g)&&new URLSearchParams(location.search).get('payment')==='return')
   notice('Returned from Paystack. Select Check existing payment for your campaign; the return URL is not proof of payment.','warning');
 }
 async function checkout(){
  const user=auth?.currentUser;if(!user||busy)return;
  const uid=user.uid,g=generation,ad=ads.find(x=>x.id===selectedId);
  if(!canPurchaseAd(ad,user,health?.ok&&health.shopperAdsWebPaystackEnabled)||
   !el('ownerConsent').checked||!el('paymentConsent').checked)
   return notice('Choose your reviewed campaign and confirm the one-time payment terms.','warning');
  busy=true;render();notice('Preparing the Paystack payment for '+money(ad.amountCents)+'…');
  try{
   const r=await api('ads_checkout',{advertisementId:ad.id,checkoutChannel:'website',
    confirmedSellerUid:uid});
   if(!validAdReference(r.reference)||!validAdCheckoutUrl(r.checkoutUrl)||
     r.amountCents!==ad.amountCents||!validAdPrice(r.amountCents,ad.radiusKm)||r.days!==7)
    throw Error('Invalid Paystack reference, amount, or checkout destination. Payment cancelled.');
   if(!current(uid,g))return;
   sessionStorage.setItem(receiptKey(uid),JSON.stringify({reference:r.reference,
    advertisementId:ad.id,time:Date.now()}));
   if(receipt(uid)?.reference!==r.reference)throw Error('Payment reference was not saved. Contact support.');
   window.location.assign(r.checkoutUrl);
  }catch(e){if(current(uid,g))notice(e.message||'Checkout unavailable; do not retry an uncertain charge.','error');}
  finally{if(current(uid,g)){busy=false;render();}}
 }
 async function confirm(reference){
  const uid=auth?.currentUser?.uid,g=generation;
  if(!uid||busy||!validAdReference(reference))return;
  busy=true;render();notice('Verifying the recorded transaction directly with Paystack…');
  try{
   const result=await api('ads_confirm',{reference});
   if(!current(uid,g))return;
   if(result.paid===true){
    sessionStorage.removeItem(receiptKey(uid));
    history.replaceState(null,'',location.pathname);
    notice('Verified payment! Your reviewed ad is now active for seven days.','success');
   }else notice('This payment requires manual support review; do not pay again.','warning');
  }catch(e){if(current(uid,g))notice(e.message||'Payment is not yet verified. Do not pay twice.','warning');}
  finally{if(current(uid,g)){busy=false;render();}}
  if(current(uid,g)){
   try{const mine=await api('ads_mine');if(current(uid,g)){
    ads=Array.isArray(mine.ads)?mine.ads:[];selectedId=null;render();
   }}catch{/* Keep the confirmation message and let the seller refresh manually. */}
  }
 }
 try{
  const [firebase,sdkAuth]=await Promise.all([
   import('https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js'),
   import('https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js')]);
  sdk=sdkAuth;auth=sdk.getAuth(firebase.getApps()[0]||firebase.initializeApp(firebaseConfig));
  await sdk.setPersistence(auth,sdk.browserSessionPersistence);
  sdk.onAuthStateChanged(auth,user=>{
   generation++;ads=[];health=null;selectedId=null;busy=false;
   el('ownerConsent').checked=false;el('paymentConsent').checked=false;
   render();if(user)void reload();else notice('Sign in to manage approved Teyza advertising campaigns.');
  });
  el('emailForm').addEventListener('submit',async event=>{
   event.preventDefault();try{await sdk.signInWithEmailAndPassword(auth,el('email').value.trim(),el('password').value);}
   catch(e){notice(e.message||'Sign-in failed.','error');}finally{el('password').value='';}
  });
  for(const [id,provider] of [['google',()=>new sdk.GoogleAuthProvider()],['apple',()=>new sdk.OAuthProvider('apple.com')],['facebook',()=>new sdk.FacebookAuthProvider()]]){
   el(id).addEventListener('click',async()=>{try{await sdk.signInWithPopup(auth,provider());}catch(e){notice(e.message||'Sign-in failed.','error');}});
  }
  el('logout').addEventListener('click',()=>sdk.signOut(auth).catch(e=>notice(e.message,'error')));
  el('refresh').addEventListener('click',reload);
  el('checkout').addEventListener('click',checkout);
  el('ownerConsent').addEventListener('change',render);el('paymentConsent').addEventListener('change',render);
  render();
 }catch(e){notice('Secure sign-in is unavailable; no payment will be initiated.','error');}
}
if(typeof document!=='undefined')void start();