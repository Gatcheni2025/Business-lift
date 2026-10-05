import {onAuthStateChanged,RecaptchaVerifier,PhoneAuthProvider,updatePhoneNumber} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {app,auth} from "./firebase-config.js";
import {getBusinessContext,hydrateBusiness,workspaceError,saveBusinessProfile} from "./business-context.js";
import {suggestAddresses,addressAt} from "./address-search.js";
const API_BASE=location.hostname.endsWith(".vercel.app")?"/backend":"api";
const form=document.querySelector('[data-business-profile]'),retry=document.querySelector('[data-profile-retry]'),status=document.querySelector('[data-profile-status]');
const fields={'business-name':'businessName','business-type':'businessType',industry:'industry',country:'country',phone:'phone',address:'address',about:'about'};const shopFields={'support-email':'supportEmail','support-phone':'supportPhone','returns-policy':'returnsPolicy'};
let context=null,currentUser=null,busy=false,phoneVerificationId='',recaptcha=null,recaptchaWidgetId=null,map=null,marker=null,currentPoint=null,verification=null,selectedAddress='',otpPhone='',addressTimer=null,addressRequest=null,phoneVerificationAuth=null,currentProfileStep=1;
const $=s=>document.querySelector(s);
function show(message,tone='error'){status.hidden=false;status.textContent=message;status.className='form-status '+tone;}

let profileLoaded=false;
let logoUploading=false;

function setProfileLoaded(loaded){
 profileLoaded=Boolean(loaded);

 document.querySelectorAll("[data-profile-next],[data-profile-back],[data-profile-step-nav]").forEach(control=>{
  /*
   * Step 1 continue has its own image-upload gate.
   * Other controls remain unavailable until the backend profile is loaded.
   */
  if(control.matches("[data-step1-continue]"))return;
  control.disabled=!profileLoaded;
 });

 syncStepOneContinue();
}

function hasUploadedBusinessImage(){
 return Boolean(
  context?.business?.logoUrl ||
  $("[data-business-logo-image]")?.getAttribute("src")
 );
}

function syncStepOneContinue(){
 const next=$("[data-step1-continue]");
 if(!next)return;

 const ready=profileLoaded && hasUploadedBusinessImage() && !logoUploading;

 next.hidden=!ready;
 next.disabled=!ready;

 const editor=$(".business-logo-editor");
 if(editor)editor.classList.toggle("image-ready",ready);
}

function setLogoUploadState(state,message=""){
 const editor=$(".business-logo-editor");
 const progress=$("[data-logo-upload-progress]");
 const title=$("[data-logo-upload-title]");
 const copy=$("[data-logo-upload-copy]");
 const upload=$("[data-upload-logo]");
 const input=$("[data-logo-file]");

 editor?.classList.remove("is-uploading","is-uploaded","upload-error");

 if(state==="uploading"){
  logoUploading=true;
  editor?.classList.add("is-uploading");
  if(progress)progress.hidden=false;
  if(title)title.textContent="Uploading image…";
  if(copy)copy.textContent="Please wait while Teyza saves your business image.";
  if(upload){
   upload.disabled=true;
   upload.classList.add("button-loading");
   upload.textContent="Uploading…";
  }
  if(input)input.disabled=true;
 }

 if(state==="success"){
  logoUploading=false;
  editor?.classList.add("is-uploaded");
  if(progress)progress.hidden=false;
  if(title)title.textContent="Image uploaded ✓";
  if(copy)copy.textContent=message||"Your business image is saved. You can continue.";
  if(upload){
   upload.disabled=false;
   upload.classList.remove("button-loading");
   upload.textContent="Replace image";
  }
  if(input)input.disabled=false;

  window.setTimeout(()=>{
   if(progress)progress.hidden=true;
  },1800);
 }

 if(state==="error"){
  logoUploading=false;
  editor?.classList.add("upload-error");
  if(progress)progress.hidden=false;
  if(title)title.textContent="Image upload failed";
  if(copy)copy.textContent=message||"Check the image and try again.";
  if(upload){
   upload.disabled=false;
   upload.classList.remove("button-loading");
   upload.textContent="Upload image";
  }
  if(input)input.disabled=false;
 }

 if(state==="idle"){
  logoUploading=false;
  if(progress)progress.hidden=true;
  if(upload){
   upload.disabled=false;
   upload.classList.remove("button-loading");
   upload.textContent=hasUploadedBusinessImage()?"Replace image":"Upload image";
  }
  if(input)input.disabled=false;
 }

 syncStepOneContinue();
}

function setButtonBusy(button,busy,label="Saving…"){
 if(!button)return;

 if(busy){
  button.dataset.originalText=button.textContent;
  button.disabled=true;
  button.classList.add("button-loading");
  button.innerHTML=`<span class="inline-spinner" aria-hidden="true"></span><span>${label}</span>`;
 }else{
  button.disabled=false;
  button.classList.remove("button-loading");
  button.textContent=button.dataset.originalText||"Continue →";
  delete button.dataset.originalText;
 }
}


const PROFILE_STEP_TITLES={
  1:"Business details",
  2:"Phone verification",
  3:"Business location",
  4:"Documents & customer support",
  5:"Identity document",
  6:"Live face scan",
  7:"Review & submit"
};

function profileBusinessSnapshot(){
 const payload={};
 for(const [field,key] of Object.entries(fields)){
  payload[key]=form.elements[field]?.value?.trim?.()||"";
 }
 payload.profileComplete=completion(payload)===100;
 payload.setupProgress=completion(payload);
 return payload;
}

function businessStepComplete(){
 return Boolean(
  form.elements["business-name"]?.value.trim() &&
  form.elements.industry?.value.trim() &&
  hasUploadedBusinessImage()
 );
}

function updateProfileReview(){
 const set=(selector,text)=>{
  const node=$(selector);
  if(node)node.textContent=text;
 };

 set("[data-profile-review-business]",businessStepComplete()?"Saved ✓":"Incomplete");
 set("[data-profile-review-phone]",verification?.phoneVerified?"Verified ✓":(form.elements.phone?.value.trim()?"Saved · verification pending":"Not added"));
 set("[data-profile-review-location]",verification?.locationConfirmed?"Confirmed ✓":(form.elements.address?.value.trim()?"Saved · confirmation pending":"Not added"));
 set("[data-profile-review-proof]",verification?.proofOfAddressUploaded?"Uploaded ✓":"Not uploaded");

 const docName=
  verification?.identityDraft?.documentOriginalName ||
  verification?.identity?.documentOriginalName ||
  "";

 const docSaved=Boolean(
  verification?.identityDocumentDraft ||
  verification?.identitySubmitted ||
  verification?.identityVerified
 );

 const selfieSaved=Boolean(
  verification?.identitySelfieDraft ||
  verification?.identitySubmitted ||
  verification?.identityVerified
 );

 const reviewDoc=$("[data-review-document]");
 const reviewDocStatus=$("[data-review-document-status]");
 const reviewSelfie=$("[data-review-selfie]");
 const reviewSelfieStatus=$("[data-review-selfie-status]");

 if(reviewDoc)reviewDoc.textContent=docSaved?(docName||"Saved identity document"):"Not selected";
 if(reviewDocStatus)reviewDocStatus.textContent=docSaved?"Saved ✓":"Required";
 if(reviewSelfie)reviewSelfie.textContent=selfieSaved?"Live selfie saved":"Not captured";
 if(reviewSelfieStatus)reviewSelfieStatus.textContent=selfieSaved?"Saved ✓":"Required";

 const savedDocBox=$("[data-identity-document-saved]");
 if(savedDocBox)savedDocBox.hidden=!docSaved;
 const savedDocName=$("[data-identity-document-saved-name]");
 if(savedDocName&&docSaved)savedDocName.textContent=docName?`Saved: ${docName}`:"Saved identity document ✓";

 const savedSelfieBox=$("[data-identity-selfie-saved]");
 if(savedSelfieBox)savedSelfieBox.hidden=!selfieSaved;

 const finish=$("[data-identity-complete-actions]");
 if(finish)finish.hidden=!(verification?.identitySubmitted||verification?.identityVerified);
}

function updateProfileStepStates(){
 const completed={
  1:businessStepComplete(),
  2:Boolean(verification?.phoneVerified),
  3:Boolean(verification?.locationConfirmed),
  4:Boolean(verification?.proofOfAddressUploaded),
  5:Boolean(verification?.identityDocumentDraft||verification?.identitySubmitted||verification?.identityVerified),
  6:Boolean(verification?.identitySelfieDraft||verification?.identitySubmitted||verification?.identityVerified),
  7:Boolean(verification?.identitySubmitted||verification?.identityVerified)
 };

 document.querySelectorAll("[data-profile-step-nav]").forEach(button=>{
  const step=Number(button.dataset.profileStepNav);
  button.classList.toggle("done",Boolean(completed[step]));
  const bubble=button.querySelector("span");
  if(bubble)bubble.textContent=completed[step]?"✓":String(step);
 });

 updateProfileReview();
}

function setProfileStep(step,{scroll=true}={}){
 step=Math.max(1,Math.min(7,Number(step)||1));

 if(currentProfileStep===6 && step!==6){
  stopIdentityCamera();
 }

 currentProfileStep=step;

 document.querySelectorAll("[data-profile-step]").forEach(panel=>{
  panel.hidden=Number(panel.dataset.profileStep)!==step;
 });

 document.querySelectorAll("[data-profile-step-nav]").forEach(button=>{
  const active=Number(button.dataset.profileStepNav)===step;
  button.classList.toggle("active",active);
  button.setAttribute("aria-selected",String(active));
 });

 const title=$("[data-profile-step-title]");
 if(title)title.textContent=PROFILE_STEP_TITLES[step];

 const count=$("[data-profile-step-count]");
 if(count)count.textContent=`Step ${step} of 7`;

 const bar=$("[data-profile-progress-bar]");
 if(bar)bar.style.width=`${(step/7)*100}%`;

 if(step===3){
  initMap();
  setTimeout(()=>{
   try{
    map?.invalidateSize();
    if(currentPoint)map?.setView([currentPoint.lat,currentPoint.lng],16);
   }catch(_){}
  },120);
 }

 if(step===7)updateProfileReview();

 if(scroll){
  document.querySelector("[data-profile-progress-nav]")?.scrollIntoView({behavior:"smooth",block:"start"});
 }
}

function firstIncompleteProfileStep(){
 if(!businessStepComplete())return 1;
 if(!verification?.phoneVerified)return 2;
 if(!verification?.locationConfirmed)return 3;
 if(!verification?.proofOfAddressUploaded)return 4;
 if(!(verification?.identityDocumentDraft||verification?.identitySubmitted||verification?.identityVerified))return 5;
 if(!(verification?.identitySelfieDraft||verification?.identitySubmitted||verification?.identityVerified))return 6;
 return 7;
}

async function saveProfileSnapshot(message="Step saved."){
 if(!context||!currentUser)throw new Error("Your profile is still loading.");

 const payload=profileBusinessSnapshot();

 const saved=await saveBusinessProfile(currentUser,payload);

 const shopPayload={};
 for(const [field,key] of Object.entries(shopFields)){
  shopPayload[key]=form.elements[field]?.value.trim()||"";
 }
 shopPayload.shopName=payload.businessName;
 shopPayload.orderNotifications=true;
 shopPayload.lowStockNotifications=true;

 await api("section",{
  method:"POST",
  headers:{
   "Content-Type":"application/json",
   "X-Workspace-Section":"shop"
  },
  body:JSON.stringify(shopPayload)
 });

 context.business=saved.business||{
  ...context.business,
  ...payload
 };

 hydrateBusiness(context,currentUser);
 updateSummary(context.business);
 updateProfileStepStates();
 show(message,"success");

 return payload;
}

function validateProfileStep(step){
 if(step===1){
  if(!form.elements["business-name"]?.value.trim()){
   show("Enter your business name before continuing.");
   form.elements["business-name"]?.focus();
   return false;
  }
  if(!form.elements.industry?.value.trim()){
   show("Enter your business industry before continuing.");
   form.elements.industry?.focus();
   return false;
  }
  if(!hasUploadedBusinessImage()){
   show("Upload your seller photo or business logo before continuing.");
   $('[data-logo-file]')?.focus();
   return false;
  }
 }

 if(step===2){
  const phone=normalizePhone(form.elements.phone?.value||"");
  if(!/^\+27\d{9}$/.test(phone)){
   show("Enter a valid South African mobile number before continuing.");
   form.elements.phone?.focus();
   return false;
  }
  if(!verification?.phoneVerified){
   show("Verify the business phone with the SMS OTP before continuing.");
   return false;
  }
 }

 if(step===3){
  if(!form.elements.address?.value.trim()){
   show("Add your business address before continuing.");
   form.elements.address?.focus();
   return false;
  }
  if(!verification?.locationConfirmed){
   show("Confirm the address on the map before continuing.");
   return false;
  }
 }

 if(step===4 && !verification?.proofOfAddressUploaded){
  show("Upload your proof of address before continuing.");
  return false;
 }

 return true;
}


function completion(data){const values=Object.values(fields).map(key=>String(data[key]||'').trim());return Math.round(values.filter(Boolean).length/values.length*100);}
function renderLogo(url){
 const img=$('[data-business-logo-image]');
 const initial=$('[data-logo-preview] [data-business-initial]');
 const remove=$('[data-remove-logo]');

 if(url){
  img.onload=()=>{
   document.querySelectorAll('.workspace-avatar,.account-avatar,.profile-emblem').forEach(n=>{
    n.classList.add('has-logo');
    n.style.backgroundImage=`url("${url}")`;
   });
   syncStepOneContinue();
  };
  img.onerror=()=>{
   show('The image was saved but could not be displayed. Check the uploads/business-logos folder permissions.');
   syncStepOneContinue();
  };
  img.src=url;
  img.hidden=false;
  initial.hidden=true;
  remove.hidden=false;
 }else{
  img.removeAttribute('src');
  img.hidden=true;
  initial.hidden=false;
  remove.hidden=true;
 }

 document.querySelectorAll('.workspace-avatar,.account-avatar,.profile-emblem').forEach(n=>{
  n.classList.toggle('has-logo',!!url);
  n.style.backgroundImage=url?`url("${url}")`:'';
 });

 $('[data-logo-status]').textContent=url
  ?'Image uploaded ✓ You can replace it at any time.'
  :'Choose and upload an image before continuing.';

 syncStepOneContinue();
}
async function logoRequest(method,file){const token=await currentUser.getIdToken();const opts={method,headers:{Authorization:'Bearer '+token}};if(file){const fd=new FormData();fd.append('logo',file);opts.body=fd;}const res=await fetch(`${API_BASE}/business-logo.php`,opts);const d=await res.json();if(!res.ok||!d.ok)throw new Error(d.error||'Image update failed');return d;}
function updateSummary(data){$('[data-profile-progress]').textContent=completion(data)+'%';$('[data-verification-status]').textContent=data.profileComplete?'Information complete':'In progress';}
async function api(action,options={}){const token=await currentUser.getIdToken();const r=await fetch(`${API_BASE}/workspace.php?action=${encodeURIComponent(action)}`,{...options,headers:{...(options.headers||{}),Authorization:'Bearer '+token}});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'Request failed');return d;}
function renderVerification(v={}){
 verification=v;const items=[['[data-check-phone]',v.phoneVerified],['[data-check-identity]',v.identitySubmitted||v.identityVerified],['[data-check-location]',v.locationConfirmed],['[data-check-proof]',v.proofOfAddressUploaded]];
 items.forEach(([s,done])=>{const n=$(s);if(!n)return;n.classList.toggle('done',!!done);const icon=n.querySelector(':scope > span');if(icon)icon.textContent=done?'✓':'○';});
 const count=Number(v.completed||0),total=Number(v.total||4);$('[data-verification-title]').textContent=`Business verification — ${count} of ${total} complete`;$('[data-verification-badge]').textContent=`${count}/${total}`;$('[data-verification-badge]').classList.toggle('success',count===total);
 const identitySummary=$('[data-identity-summary]');if(identitySummary)identitySummary.textContent=v.identityVerified?'Identity approved ✓':v.identityStatus==='pending'?'ID + selfie uploaded ✓ · awaiting admin approval':v.identityStatus==='rejected'?'Identity rejected · please resubmit':'Upload your ID and take a live selfie.';
 $('[data-send-otp]').textContent=v.phoneVerified?'Phone verified ✓':'Verify phone';$('[data-send-otp]').disabled=!!v.phoneVerified;
 $('[data-location-status]').textContent=v.locationConfirmed?'Location confirmed ✓':'Location not confirmed';
 const proofStatus=$('[data-proof-status]');
 if(v.proofOfAddressUploaded){
   const expected=v.proofOfAddress?.addressAtUpload||v.location?.address||'your confirmed map address';
   const match=v.proofAddressMatchVerified?'Address match approved ✓':v.proofAddressMatchStatus==='mismatch'?'Address mismatch — upload a document showing the confirmed address.':'Awaiting Teyza address-match review';
   proofStatus.textContent=`Uploaded: ${v.proofOfAddress?.originalName||'proof of address'} · ${match} · Must show: ${expected}`;
 }else{
   proofStatus.textContent=v.locationConfirmed?`Upload a proof of address that clearly shows: ${v.location?.address||form.elements.address.value.trim()}`:'Confirm the map address before uploading proof of address.';
 }
 if(v.location?.lat!=null&&v.location?.lng!=null&&v.location.address===form.elements.address.value.trim()){setMapPoint(Number(v.location.lat),Number(v.location.lng),false);selectedAddress=v.location.address;}

 const otpInput=$('[data-otp-code]');
 const otpButton=$('[data-confirm-otp]');
 if(v.phoneVerified){
  if(otpInput)otpInput.disabled=true;
  if(otpButton)otpButton.disabled=true;
 }

 updateProfileStepStates();
}
function normalizePhone(raw){let s=String(raw||'').replace(/[\s()-]/g,'');if(/^0\d{9}$/.test(s))s='+27'+s.slice(1);if(/^27\d{9}$/.test(s))s='+'+s;return s;}
function initMap(){if(map||!window.L)return;map=L.map('businessMap').setView([-30.5595,22.9375],5);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);map.on('click',e=>reverseAddress(e.latlng.lat,e.latlng.lng));}
function setMapPoint(lat,lng,pan=true){initMap();currentPoint={lat,lng};if(!map)return;if(!marker){marker=L.marker([lat,lng],{draggable:true}).addTo(map);marker.on('dragend',()=>{const p=marker.getLatLng();reverseAddress(p.lat,p.lng);});}else marker.setLatLng([lat,lng]);if(pan)map.setView([lat,lng],16);}
function chooseAddress(place){form.elements.address.value=place.address;selectedAddress=place.address;setMapPoint(place.lat,place.lng);$('[data-address-suggestions]').hidden=true;$('[data-address-suggestions]').replaceChildren();$('[data-location-status]').textContent='Map pin selected · confirm this location to verify it.';}
async function reverseAddress(lat,lng){setMapPoint(lat,lng);selectedAddress='';$('[data-location-status]').textContent='Finding the address for this pin…';try{const place=await addressAt(lat,lng);if(!place)throw new Error('No address was found at this pin. Search for a nearby street address.');chooseAddress({...place,lat,lng});}catch(e){show(e.message);$('[data-location-status]').textContent='Choose an address suggestion before confirming.';}}
const addressInput=form.elements.address,suggestions=$('[data-address-suggestions]');
addressInput.addEventListener('input',()=>{
  selectedAddress='';currentPoint=null;clearTimeout(addressTimer);addressRequest?.abort();suggestions.hidden=true;
  $('[data-location-status]').textContent='Choose a suggestion to place the pin, or use your current location.';
  const query=addressInput.value.trim();if(query.length<4)return;
  addressTimer=setTimeout(async()=>{
    addressRequest=new AbortController();
    try{const places=await suggestAddresses(query,form.elements.country.value,addressRequest.signal);if(addressInput.value.trim()!==query)return;
      suggestions.replaceChildren();for(const place of places){const item=document.createElement('button');item.type='button';item.textContent=place.address;item.addEventListener('click',()=>chooseAddress(place));suggestions.append(item);}suggestions.hidden=!places.length;
    }catch(e){if(e.name!=='AbortError')show(e.message,'info');}
  },450);
});
function notifyOnboarding(){if(window.parent!==window)window.parent.postMessage({type:'teyza-onboarding-progress'},location.origin);}
async function refreshVerification(){const d=await api('verification');renderVerification(d.verification||{});notifyOnboarding();}
async function load(){
 if(!currentUser||busy)return;

 setProfileLoaded(false);
 retry.hidden=true;
 show('Loading your saved details…','info');

 try{
  context=await getBusinessContext(currentUser,{refresh:true});
  const business=context.business||{};

  if(business.businessName==='Your Teyza Store'){
   business.businessName='';
  }

  for(const [field,key] of Object.entries(fields)){
   const control=form.elements[field];
   const value=business[key];

   if(value!=null && control){
    if(
     control.tagName==='SELECT' &&
     ![...control.options].some(o=>o.value===value)
    ){
     control.add(new Option(value,value));
    }

    control.value=value;
   }
  }

  try{
   const shop=(await api('section',{
    headers:{'X-Workspace-Section':'shop'}
   })).data||{};

   for(const [field,key] of Object.entries(shopFields)){
    if(form.elements[field]){
     form.elements[field].value=shop[key]||'';
    }
   }
  }catch(e){
   console.warn('Shop details unavailable',e);
  }

  hydrateBusiness(context,currentUser);
  updateSummary(business);
  renderLogo(business.logoUrl||'');

  await refreshVerification();

  status.hidden=Boolean(context.business);

  if(!context.business){
   show('Finish your business details to create your workspace.','info');
  }

  setProfileLoaded(true);
  updateProfileStepStates();

  const requestedStep=Number(
   new URLSearchParams(location.search).get('step')||0
  );

  setProfileStep(
   requestedStep||firstIncompleteProfileStep(),
   {scroll:false}
  );
 }catch(error){
  context=null;
  setProfileLoaded(false);
  show(workspaceError(error,'load your business profile'));
  retry.hidden=false;
 }
}

form.addEventListener('submit',e=>{
 e.preventDefault();
});

function phoneError(e){const messages={
 'auth/operation-not-allowed':'Phone sign-in is disabled in Firebase Authentication. Enable Phone and allow South Africa in the SMS region policy.',
 'auth/unauthorized-domain':'This domain is not authorized for Firebase phone verification. Add teyza.co.za in Authentication → Settings → Authorized domains.',
 'auth/invalid-phone-number':'Enter a South African mobile number, for example +27 60 123 4567.',
 'auth/credential-already-in-use':'This number is already used by another sign-in account. Teyza can still verify ownership without changing your current login. Request a new code and try again.',
 'auth/account-exists-with-different-credential':'This number is already used by another sign-in account. Teyza will verify the number separately without changing your current login.',
 'auth/provider-already-linked':'This account already has a verified phone. Use the same number saved on your profile.',
 'auth/too-many-requests':'Too many SMS attempts. Wait before requesting another code.',
 'auth/quota-exceeded':'The SMS quota has been reached. Contact Teyza support.',
 'auth/billing-not-enabled':'SMS billing is not enabled for this Firebase project. Contact Teyza support.',
 'auth/captcha-check-failed':`Firebase rejected the phone security check for ${location.hostname}. This is a hostname authorization problem. Add ${location.hostname} under Firebase Authentication → Settings → Authorized domains. For production use teyza.co.za (and www.teyza.co.za if you serve www). For Vercel phone testing, use the stable business-lift.vercel.app domain or authorize the exact preview hostname.`,
 'auth/invalid-app-credential':'The security check could not verify this site. Check the authorized domain and try again.',
 'auth/network-request-failed':'Connection failed while sending the code. Check your internet connection and retry.',
 'auth/invalid-verification-code':'That code is incorrect. Check the SMS and try again.',
 'auth/code-expired':'The code has expired. Request a new one.'
};return messages[e.code]||`Phone verification failed (${e.code||'unknown error'}). Try again or contact support.`;}
function resetPhoneRecaptcha(){
 if(recaptcha){
  try{recaptcha.clear();}catch(_){}
 }
 recaptcha=null;
 recaptchaWidgetId=null;
 const container=document.getElementById('phone-recaptcha');
 if(container)container.replaceChildren();
}

async function buildPhoneRecaptcha(){
 resetPhoneRecaptcha();

 recaptcha=new RecaptchaVerifier(auth,'phone-recaptcha',{
  size:'normal',
  callback:()=>{},
  'expired-callback':()=>{
   phoneVerificationId='';
   const node=$('[data-otp-status]');
   if(node)node.textContent='Security check expired. Request a new code.';
  }
 });

 recaptchaWidgetId=await recaptcha.render();
 return recaptcha;
}

async function saveVerifiedPhone(phone,phoneToken){
 const mainToken=await currentUser.getIdToken();
 const r=await fetch(`${API_BASE}/workspace.php?action=verification`,{
   method:'POST',
   headers:{Authorization:'Bearer '+mainToken,'Content-Type':'application/json','X-Phone-Verification-Token':phoneToken},
   body:JSON.stringify({type:'phone',phone})
 });
 const d=await r.json().catch(()=>({}));
 if(!r.ok||!d.ok)throw new Error(d.error||'Phone verification could not be saved.');
 form.elements.phone.value=phone;
 context.business={...context.business,phone};
 renderVerification(d.verification||{});
 notifyOnboarding();
}
$('[data-send-otp]').addEventListener('click',async()=>{
 const phone=normalizePhone(form.elements.phone.value),send=$('[data-send-otp]');

 if(location.hostname.toLowerCase()==='www.teyza.co.za'){
  const canonical=new URL(location.href);
  canonical.hostname='teyza.co.za';
  show('Opening the secure Teyza domain for phone verification…','info');
  location.replace(canonical.toString());
  return;
 }

 if(!/^\+27\d{9}$/.test(phone)){
  show('Enter a South African mobile number, for example +27 60 123 4567.');
  return;
 }

 send.disabled=true;
 send.textContent='Preparing phone check…';

 try{
  if(currentUser.phoneNumber===phone){
   await saveVerifiedPhone(phone,await currentUser.getIdToken(true));
   show('This phone was already verified on your account.','success');
   return;
  }

  const verifier=await buildPhoneRecaptcha();
  const provider=new PhoneAuthProvider(auth);

  send.textContent='Complete security check…';
  phoneVerificationId=await provider.verifyPhoneNumber(phone,verifier);
  otpPhone=phone;

  form.elements.phone.readOnly=true;
  $('[data-otp-panel]').hidden=false;

  const otpInput=$('[data-otp-code]');
  const otpButton=$('[data-confirm-otp]');
  otpInput.value='';
  otpInput.disabled=false;
  otpButton.disabled=false;
  otpInput.focus();

  $('[data-otp-status]').textContent='Code sent to '+phone;
  show('SMS code sent. Enter the 6-digit OTP below.','success');
  send.textContent='Code sent ✓';
 }catch(e){
  console.error('Phone verification:',e.code||e,e);
  phoneVerificationId='';
  otpPhone='';
  form.elements.phone.readOnly=false;
  resetPhoneRecaptcha();
  show(phoneError(e));
  send.disabled=false;
  send.textContent='Verify phone';
 }
});
$('[data-resend-otp]').addEventListener('click',()=>{
 phoneVerificationId='';
 otpPhone='';
 $('[data-otp-code]').value='';
 $('[data-otp-code]').disabled=true;
 $('[data-confirm-otp]').disabled=true;
 form.elements.phone.readOnly=false;
 resetPhoneRecaptcha();

 const send=$('[data-send-otp]');
 send.disabled=false;
 send.textContent='Verify phone';
 send.click();
});
$('[data-confirm-otp]').addEventListener('click',async()=>{
 const code=$('[data-otp-code]').value.trim();

 if(!/^\d{6}$/.test(code)){
  show('Enter the 6-digit verification code.');
  return;
 }

 if(!phoneVerificationId){
  show('Request a new code first.');
  return;
 }

 const confirmButton=$('[data-confirm-otp]');

 try{
  confirmButton.disabled=true;
  confirmButton.textContent='Verifying…';

  const credential=PhoneAuthProvider.credential(
   phoneVerificationId,
   code
  );

  await updatePhoneNumber(currentUser,credential);
  await currentUser.reload();

  const phoneToken=await currentUser.getIdToken(true);

  await saveVerifiedPhone(
   otpPhone,
   phoneToken
  );

  form.elements.phone.readOnly=false;
  phoneVerificationId='';
  otpPhone='';
  resetPhoneRecaptcha();

  const otpInput=$('[data-otp-code]');
  otpInput.value='';
  otpInput.disabled=true;
  confirmButton.disabled=true;
  $('[data-otp-status]').textContent='Business phone verified successfully ✓';

  $('[data-send-otp]').textContent='Phone verified ✓';
  $('[data-send-otp]').disabled=true;

  await saveProfileSnapshot('Business phone verified and saved ✓');
  updateProfileStepStates();
 }catch(e){
  console.error('Phone verification:',e.code||e,e);

  if(e.code==='auth/code-expired'){
   phoneVerificationId='';
   otpPhone='';
   form.elements.phone.readOnly=false;
   $('[data-send-otp]').disabled=false;
   $('[data-send-otp]').textContent='Send new code';
   $('[data-otp-status]').textContent='This code expired. Request a new SMS code.';
  }

  show(phoneError(e));
 }finally{
  if(!verification?.phoneVerified){
   confirmButton.disabled=false;
  }
  confirmButton.textContent='Verify OTP';
 }
});
$('[data-use-location]').addEventListener('click',()=>{if(!navigator.geolocation){show('Location is not supported by this browser.');return;}const b=$('[data-use-location]');b.disabled=true;b.textContent='Finding location…';navigator.geolocation.getCurrentPosition(async p=>{await reverseAddress(p.coords.latitude,p.coords.longitude);if(selectedAddress)$('[data-location-status]').textContent=`Current location found · accuracy ±${Math.round(p.coords.accuracy)}m. Check the address and pin before confirming.`;b.disabled=false;b.textContent='Use my current location';},e=>{show(e.code===1?'Location permission was denied. Type your address and select a suggestion, or choose a point on the map.':'Location could not be detected. Type your address and select a suggestion.');b.disabled=false;b.textContent='Use my current location';},{enableHighAccuracy:true,timeout:15000,maximumAge:0});});
$('[data-confirm-location]').addEventListener('click',async()=>{const address=form.elements.address.value.trim();if(!currentPoint||!selectedAddress||address!==selectedAddress){show('Select an address suggestion, detect your location, or tap the map pin before confirming.');return;}try{const d=await api('verification',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'location',lat:currentPoint.lat,lng:currentPoint.lng,address})});context.business.address=address;renderVerification(d.verification);notifyOnboarding();await saveProfileSnapshot('Business location confirmed and saved ✓');}catch(e){show(e.message);}});
$('[data-upload-proof]').addEventListener('click',async()=>{
 const file=$('[data-proof-file]').files[0];
 if(!file){show('Choose a proof of address document first.');return;}
 if(file.size>8*1024*1024){show('Proof of address must be 8 MB or smaller. Choose a smaller file.');return;}
 if(file.type&&!['application/pdf','image/jpeg','image/png'].includes(file.type)){show('Choose a PDF, JPG or PNG proof of address.');return;}
 try{await refreshVerification();}catch(error){show('Could not check your confirmed address. Please try again.');return;}
 if(!verification?.locationConfirmed){show('Confirm the business address on the map first. Your proof of address must show that same address.');return;}
 const expected=verification?.location?.address||form.elements.address.value.trim();
 if(!window.confirm(`Upload this document as proof for:\n\n${expected}\n\nTeyza will compare the document address with this confirmed map address before approval.`))return;
 const b=$('[data-upload-proof]');
 try{
   b.disabled=true;b.textContent='Uploading…';
   const token=await currentUser.getIdToken();const fd=new FormData();fd.append('proof',file);
   const r=await fetch(`${API_BASE}/verification-upload.php`,{method:'POST',headers:{Authorization:'Bearer '+token},body:fd});
   const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)throw new Error(d.error||(r.status===413?'The server upload limit was exceeded. Choose a smaller file.':'Upload failed. Please try again.'));
   await refreshVerification();
   updateProfileStepStates();
   show('Proof of address uploaded and saved. Teyza will confirm that the document address matches the map address before seller approval.','success');
 }catch(e){show(e.message);}finally{b.disabled=false;b.textContent='Upload proof';}
});
form.elements.phone.addEventListener('input',()=>{if(verification?.phoneVerified){verification={...verification,phoneVerified:false,completed:Math.max(0,Number(verification.completed||0)-1)};renderVerification(verification);}});
$('[data-logo-file]')?.addEventListener('change',()=>{
 const file=$('[data-logo-file]').files?.[0];
 const statusNode=$('[data-logo-status]');

 if(!file){
  if(statusNode){
   statusNode.textContent=hasUploadedBusinessImage()
    ?'Image uploaded ✓ You can replace it at any time.'
    :'Choose and upload an image before continuing.';
  }
  syncStepOneContinue();
  return;
 }

 if(!['image/jpeg','image/png'].includes(file.type)){
  show('Choose a JPG or PNG image.');
  $('[data-logo-file]').value='';
  return;
 }

 if(file.size>5*1024*1024){
  show('Business image must be 5 MB or smaller.');
  $('[data-logo-file]').value='';
  return;
 }

 /*
  * Show an immediate local preview while making it clear
  * that the image still has to be uploaded.
  */
 const img=$('[data-business-logo-image]');
 const initial=$('[data-logo-preview] [data-business-initial]');
 const previewUrl=URL.createObjectURL(file);

 img.onload=()=>URL.revokeObjectURL(previewUrl);
 img.src=previewUrl;
 img.hidden=false;
 if(initial)initial.hidden=true;

 if(statusNode){
  statusNode.textContent='Image selected. Tap Upload image to save it.';
 }

 const next=$('[data-step1-continue]');
 if(next){
  next.hidden=true;
  next.disabled=true;
 }
});

$('[data-upload-logo]').addEventListener('click',async()=>{
 const file=$('[data-logo-file]').files?.[0];

 if(!file){
  show('Choose a JPG or PNG image first.');
  return;
 }

 try{
  setLogoUploadState('uploading');

  const d=await logoRequest('POST',file);

  context.business=context.business||{};
  context.business.logoUrl=d.logoUrl;

  renderLogo(d.logoUrl);
  setLogoUploadState(
   'success',
   'Image uploaded successfully. Save & continue is now available.'
  );

  show('Business image uploaded successfully ✓','success');
 }catch(e){
  setLogoUploadState('error',e.message||'The image could not be uploaded.');
  show(e.message||'Image upload failed.');
 }
});

$('[data-remove-logo]').addEventListener('click',async()=>{
 try{
  setLogoUploadState('uploading');

  const d=await logoRequest('DELETE');

  if(context?.business){
   delete context.business.logoUrl;
  }

  $('[data-logo-file]').value='';
  renderLogo(d.logoUrl||'');
  setLogoUploadState('idle');

  show('Business image removed. Upload another image before continuing.','info');
 }catch(e){
  setLogoUploadState('error',e.message||'The image could not be removed.');
  show(e.message);
 }
});

let identityStream=null,selfieBlob=null;
const identityFile=$('[data-identity-document]');
const identityVideo=$('[data-identity-video]');

function stepMessage(step,message,type='error'){
 const s=document.querySelector('[data-identity-step-status="'+step+'"]');
 if(!s)return;
 s.hidden=false;
 s.textContent=message;
 s.className='identity-step-status '+type;
}

function clearStepMessage(step){
 const s=document.querySelector('[data-identity-step-status="'+step+'"]');
 if(s){
  s.hidden=true;
  s.textContent='';
 }
}

function identityStatus(message,type='error'){
 const s=$('[data-identity-status]');
 if(!s)return;
 s.hidden=false;
 s.textContent=message;
 s.className='form-status '+type;
}

function stopIdentityCamera(){
 if(identityStream){
  identityStream.getTracks().forEach(t=>t.stop());
  identityStream=null;
 }
 if(identityVideo)identityVideo.srcObject=null;
}

async function startIdentityCamera(){
 clearStepMessage(2);

 if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){
  stepMessage(2,'This browser does not support camera capture. Use current Chrome, Edge or Safari over HTTPS.');
  return false;
 }

 try{
  stopIdentityCamera();
  identityStream=await navigator.mediaDevices.getUserMedia({
   video:{facingMode:'user',width:{ideal:720},height:{ideal:720}},
   audio:false
  });

  identityVideo.srcObject=identityStream;
  identityVideo.hidden=false;
  $('[data-camera-placeholder]').hidden=true;
  await identityVideo.play();

  $('[data-capture-selfie]').disabled=false;
  $('[data-start-camera]').textContent='Camera active';
  $('[data-start-camera]').disabled=true;

  stepMessage(2,'Camera ready. Centre your face, then tap Capture selfie.','success');
  return true;
 }catch(e){
  let msg='Camera could not start. Check browser camera permission and try again.';
  if(e?.name==='NotAllowedError')msg='Camera permission was blocked. Allow camera access for teyza.co.za in the browser address bar, then try again.';
  else if(e?.name==='NotFoundError')msg='No camera was found on this device.';
  else if(e?.name==='NotReadableError')msg='Your camera is being used by another application. Close it there and try again.';

  stepMessage(2,msg);
  $('[data-start-camera]').disabled=false;
  $('[data-start-camera]').textContent='Start camera';
  return false;
 }
}

async function uploadIdentityDraft(type,file,filename){
 const token=await currentUser.getIdToken();
 const fd=new FormData();
 fd.append('type',type);
 fd.append(type==='identity-document-draft'?'document':'selfie',file,filename||file.name);

 const res=await fetch(`${API_BASE}/verification-upload.php`,{
  method:'POST',
  headers:{Authorization:'Bearer '+token},
  body:fd
 });

 const d=await res.json().catch(()=>({}));

 if(!res.ok||!d.ok){
  throw new Error(d.error||(res.status===413?'The upload is too large. Choose a smaller file.':'Verification upload failed. Please try again.'));
 }

 await refreshVerification();
 updateProfileStepStates();
 return d;
}

identityFile?.addEventListener('change',()=>{
 const file=identityFile.files&&identityFile.files[0];
 const label=$('[data-identity-file-name]');
 if(label)label.textContent=file?file.name:'Tap to select a file · Maximum 8 MB';
 clearStepMessage(1);
});

$('[data-start-camera]')?.addEventListener('click',startIdentityCamera);

$('[data-capture-selfie]')?.addEventListener('click',()=>{
 if(!identityStream||!identityVideo.videoWidth){
  stepMessage(2,'Wait for the camera image to appear, then capture your selfie.');
  return;
 }

 const canvas=$('[data-identity-canvas]');
 canvas.width=identityVideo.videoWidth;
 canvas.height=identityVideo.videoHeight;
 canvas.getContext('2d').drawImage(identityVideo,0,0,canvas.width,canvas.height);

 canvas.toBlob(blob=>{
  if(!blob){
   stepMessage(2,'The selfie could not be captured. Please try again.');
   return;
  }

  selfieBlob=blob;
  const img=$('[data-identity-selfie-preview]');
  img.src=URL.createObjectURL(blob);
  img.hidden=false;
  identityVideo.hidden=true;
  $('[data-retake-selfie]').hidden=false;
  $('[data-capture-selfie]').hidden=true;
  stopIdentityCamera();

  stepMessage(2,'Selfie captured. Tap Save selfie & continue.','success');
 },'image/jpeg',0.86);
});

$('[data-retake-selfie]')?.addEventListener('click',async()=>{
 selfieBlob=null;
 $('[data-identity-selfie-preview]').hidden=true;
 $('[data-retake-selfie]').hidden=true;
 $('[data-capture-selfie]').hidden=false;
 $('[data-capture-selfie]').disabled=true;
 $('[data-start-camera]').disabled=false;
 $('[data-start-camera]').textContent='Start camera';
 await startIdentityCamera();
});

$('[data-submit-identity]')?.addEventListener('click',async()=>{
 const consent=$('[data-identity-consent]')?.checked;
 const b=$('[data-submit-identity]');

 if(!verification?.identityDocumentDraft && !verification?.identitySubmitted){
  identityStatus('Save your identity document first.');
  return;
 }

 if(!verification?.identitySelfieDraft && !verification?.identitySubmitted){
  identityStatus('Save your live selfie first.');
  return;
 }

 if(!consent){
  identityStatus('Please confirm consent before submitting.');
  return;
 }

 try{
  b.disabled=true;
  b.textContent='Submitting securely…';

  const token=await currentUser.getIdToken();
  const fd=new FormData();
  fd.append('type','identity-submit');
  fd.append('consent','yes');

  const res=await fetch(`${API_BASE}/verification-upload.php`,{
   method:'POST',
   headers:{Authorization:'Bearer '+token},
   body:fd
  });

  const d=await res.json().catch(()=>({}));

  if(!res.ok||!d.ok){
   throw new Error(d.error||'Identity submission failed. Please try again.');
  }

  await refreshVerification();
  updateProfileStepStates();

  identityStatus('Identity submitted successfully. Teyza will review the ID document and live selfie.','success');
  b.textContent='Submitted for review ✓';
  b.disabled=true;

  const actions=$('[data-identity-complete-actions]');
  if(actions)actions.hidden=false;

  notifyOnboarding();
 }catch(e){
  identityStatus(e.message);
  b.disabled=false;
  b.textContent='Submit identity for verification →';
 }
});

document.querySelectorAll("[data-profile-step-nav]").forEach(button=>{
 button.addEventListener("click",()=>{
  setProfileStep(Number(button.dataset.profileStepNav));
 });
});

document.querySelectorAll("[data-profile-back]").forEach(button=>{
 button.addEventListener("click",()=>{
  setProfileStep(Number(button.dataset.profileBack));
 });
});

document.querySelectorAll("[data-profile-next]").forEach(button=>{
 button.addEventListener("click",async()=>{
  const step=Number(button.dataset.saveStep||currentProfileStep);
  const next=Number(button.dataset.profileNext);

  if(step<=4 && !validateProfileStep(step))return;

  setButtonBusy(button,true,"Saving…");

  try{
   if(step===5){
    const file=identityFile?.files?.[0];

    if(!file && !verification?.identityDocumentDraft && !verification?.identitySubmitted){
     stepMessage(1,'Choose your identity document before continuing.');
     return;
    }

    if(file){
     if(file.size>8*1024*1024){
      stepMessage(1,'Your identity document is larger than 8 MB. Choose a smaller file.');
      return;
     }

     await uploadIdentityDraft('identity-document-draft',file,file.name);
     stepMessage(1,'Identity document saved securely ✓','success');
    }

    setProfileStep(next);
    return;
   }

   if(step===6){
    if(!selfieBlob && !verification?.identitySelfieDraft && !verification?.identitySubmitted){
     stepMessage(2,'Capture your live selfie before continuing.');
     return;
    }

    if(selfieBlob){
     await uploadIdentityDraft('identity-selfie-draft',selfieBlob,'live-selfie.jpg');
     selfieBlob=null;
     stepMessage(2,'Live selfie saved securely ✓','success');
    }

    setProfileStep(next);
    return;
   }

   await saveProfileSnapshot(`Step ${step} saved ✓`);
   await refreshVerification();
   setProfileStep(next);
  }catch(error){
   const message=error?.message||workspaceError(error,"save this profile step");
   if(step===5)stepMessage(1,message);
   else if(step===6)stepMessage(2,message);
   else show(message);
  }finally{
   setButtonBusy(button,false);
  }
 });
});



document.querySelectorAll("[data-profile-jump]").forEach(button=>{
 button.addEventListener("click",event=>{
  event.preventDefault();
  setProfileStep(Number(button.dataset.profileJump));
 });
});

retry.addEventListener('click',load);
onAuthStateChanged(auth,user=>{
 currentUser=user;

 if(user){
  load();
 }else{
  context=null;
  setProfileLoaded(false);
 }
});
