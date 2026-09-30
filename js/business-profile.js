import {onAuthStateChanged,RecaptchaVerifier,signInWithPhoneNumber,getAuth,setPersistence,inMemoryPersistence,signOut,getAdditionalUserInfo,deleteUser} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {initializeApp,getApps} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import {app,auth} from "./firebase-config.js";
import {getBusinessContext,hydrateBusiness,workspaceError,saveBusinessProfile} from "./business-context.js";
import {suggestAddresses,addressAt} from "./address-search.js";
const form=document.querySelector('[data-business-profile]'),button=form.querySelector('[type=submit]'),retry=document.querySelector('[data-profile-retry]'),status=document.querySelector('[data-profile-status]');
const fields={'business-name':'businessName','business-type':'businessType',industry:'industry',country:'country',phone:'phone',address:'address',about:'about'};const shopFields={'support-email':'supportEmail','support-phone':'supportPhone','returns-policy':'returnsPolicy'};
let context=null,currentUser=null,busy=false,confirmationResult=null,recaptcha=null,map=null,marker=null,currentPoint=null,verification=null,selectedAddress='',otpPhone='',addressTimer=null,addressRequest=null,phoneVerificationAuth=null;
async function getPhoneVerificationAuth(){
 if(phoneVerificationAuth)return phoneVerificationAuth;
 const named=getApps().find(a=>a.name==='teyza-phone-verification')||initializeApp(app.options,'teyza-phone-verification');
 phoneVerificationAuth=getAuth(named);
 await setPersistence(phoneVerificationAuth,inMemoryPersistence);
 return phoneVerificationAuth;
}
const $=s=>document.querySelector(s);
function show(message,tone='error'){status.hidden=false;status.textContent=message;status.className='form-status '+tone;}
function completion(data){const values=Object.values(fields).map(key=>String(data[key]||'').trim());return Math.round(values.filter(Boolean).length/values.length*100);}
function renderLogo(url){const img=$('[data-business-logo-image]'),initial=$('[data-logo-preview] [data-business-initial]'),remove=$('[data-remove-logo]');if(url){img.onload=()=>{document.querySelectorAll('.workspace-avatar,.account-avatar,.profile-emblem').forEach(n=>{n.classList.add('has-logo');n.style.backgroundImage=`url("${url}")`;});};img.onerror=()=>show('The image was saved but could not be displayed. Check the uploads/business-logos folder permissions.');img.src=url;img.hidden=false;initial.hidden=true;remove.hidden=false;}else{img.removeAttribute('src');img.hidden=true;initial.hidden=false;remove.hidden=true;}document.querySelectorAll('.workspace-avatar,.account-avatar,.profile-emblem').forEach(n=>{n.classList.toggle('has-logo',!!url);n.style.backgroundImage=url?`url("${url}")`:'';});$('[data-logo-status]').textContent=url?'Image uploaded. You can replace it at any time.':'Your business initial is shown until you upload an image.';}
async function logoRequest(method,file){const token=await currentUser.getIdToken();const opts={method,headers:{Authorization:'Bearer '+token}};if(file){const fd=new FormData();fd.append('logo',file);opts.body=fd;}const res=await fetch('api/business-logo.php',opts);const d=await res.json();if(!res.ok||!d.ok)throw new Error(d.error||'Image update failed');return d;}
function updateSummary(data){$('[data-profile-progress]').textContent=completion(data)+'%';$('[data-verification-status]').textContent=data.profileComplete?'Information complete':'In progress';}
async function api(action,options={}){const token=await currentUser.getIdToken();const r=await fetch('api/workspace.php?action='+encodeURIComponent(action),{...options,headers:{...(options.headers||{}),Authorization:'Bearer '+token}});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'Request failed');return d;}
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
async function load(){if(!currentUser||busy)return;button.disabled=true;retry.hidden=true;show('Loading your saved details…','info');try{context=await getBusinessContext(currentUser,{refresh:true});const business=context.business||{};if(business.businessName==='Your Teyza Store')business.businessName='';for(const [field,key] of Object.entries(fields)){const control=form.elements[field],value=business[key];if(value!=null){if(control.tagName==='SELECT'&&![...control.options].some(o=>o.value===value))control.add(new Option(value,value));control.value=value;}}try{const shop=(await api('section',{headers:{'X-Workspace-Section':'shop'}})).data||{};for(const [field,key] of Object.entries(shopFields))if(form.elements[field])form.elements[field].value=shop[key]||'';}catch(e){console.warn('Shop details unavailable',e);}hydrateBusiness(context,currentUser);updateSummary(business);renderLogo(business.logoUrl||'');initMap();await refreshVerification();status.hidden=!!context.business;if(!context.business)show('Finish your business details to create your workspace.','info');button.disabled=false;button.textContent='Save changes';}catch(error){context=null;show(workspaceError(error,'load your business profile'));retry.hidden=false;button.textContent='Save changes';}}
form.addEventListener('submit',async e=>{e.preventDefault();if(busy)return;if(!context||!currentUser){show('Your profile has not loaded yet. Select Retry loading before saving.');retry.hidden=false;return;}if(!form.reportValidity())return;const payload={};for(const [field,key] of Object.entries(fields))payload[key]=form.elements[field].value.trim();if(!payload.businessName||!payload.industry){show('Enter a business name and industry.');return;}payload.profileComplete=completion(payload)===100;payload.setupProgress=completion(payload);busy=true;button.disabled=true;button.textContent='Saving…';show('Saving your business profile…','info');try{const saved=await saveBusinessProfile(currentUser,payload);const shopPayload={};for(const [field,key] of Object.entries(shopFields))shopPayload[key]=form.elements[field]?.value.trim()||'';shopPayload.shopName=payload.businessName;shopPayload.orderNotifications=true;shopPayload.lowStockNotifications=true;await api('section',{method:'POST',headers:{'Content-Type':'application/json','X-Workspace-Section':'shop'},body:JSON.stringify(shopPayload)});context.business=saved.business||{...context.business,...payload};hydrateBusiness(context,currentUser);updateSummary(context.business);await refreshVerification();show(payload.profileComplete?'Your business information is complete. Finish the verification checks shown on the right.':'Your business profile has been saved. Complete all fields before adding products.','success');}catch(error){show(workspaceError(error,'save your business profile'));}finally{busy=false;button.disabled=false;button.textContent='Save changes';}});
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
 'auth/captcha-check-failed':'The security check expired or failed. Complete the visible check and try again.',
 'auth/invalid-app-credential':'The security check could not verify this site. Check the authorized domain and try again.',
 'auth/network-request-failed':'Connection failed while sending the code. Check your internet connection and retry.',
 'auth/invalid-verification-code':'That code is incorrect. Check the SMS and try again.',
 'auth/code-expired':'The code has expired. Request a new one.'
};return messages[e.code]||`Phone verification failed (${e.code||'unknown error'}). Try again or contact support.`;}
async function saveVerifiedPhone(phone,phoneToken){
 const mainToken=await currentUser.getIdToken();
 const r=await fetch('api/workspace.php?action=verification',{
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
 if(!/^\+27\d{9}$/.test(phone)){show('Enter a South African mobile number, for example +27 60 123 4567.');return;}
 send.disabled=true;send.textContent='Preparing phone check…';
 try{
  if(currentUser.phoneNumber===phone){
    await saveVerifiedPhone(phone,await currentUser.getIdToken(true));
    show('This phone was already verified on your account.','success');
    return;
  }
  if(recaptcha){try{recaptcha.clear();}catch(_){}recaptcha=null;document.getElementById('phone-recaptcha').replaceChildren();}
  const phoneAuth=await getPhoneVerificationAuth();
  try{await signOut(phoneAuth);}catch(_){}
  recaptcha=new RecaptchaVerifier(phoneAuth,'phone-recaptcha',{size:'normal'});
  await recaptcha.render();
  send.textContent='Sending code…';
  confirmationResult=await signInWithPhoneNumber(phoneAuth,phone,recaptcha);otpPhone=phone;
  form.elements.phone.readOnly=true;$('[data-otp-panel]').hidden=false;$('[data-otp-code]').value='';$('[data-otp-status]').textContent='Code sent to '+phone;
  show('Enter the SMS code below to verify that you control this business number.','success');
 }catch(e){
  console.error('Phone verification:',e.code||e);
  confirmationResult=null;otpPhone='';form.elements.phone.readOnly=false;
  show(phoneError(e));send.disabled=false;send.textContent='Verify phone';
 }
});
$('[data-resend-otp]').addEventListener('click',()=>{
 confirmationResult=null;otpPhone='';$('[data-otp-code]').value='';form.elements.phone.readOnly=false;
 $('[data-send-otp]').disabled=false;$('[data-send-otp]').textContent='Verify phone';$('[data-send-otp]').click();
});
$('[data-confirm-otp]').addEventListener('click',async()=>{
 const code=$('[data-otp-code]').value.trim();
 if(!/^\d{6}$/.test(code)){show('Enter the 6-digit verification code.');return;}
 if(!confirmationResult){show('Request a new code first.');return;}
 try{
   $('[data-confirm-otp]').disabled=true;
   const credential=await confirmationResult.confirm(code);
   const phoneToken=await credential.user.getIdToken(true);
   const isNewPhoneUser=Boolean(getAdditionalUserInfo(credential)?.isNewUser);
   await saveVerifiedPhone(otpPhone,phoneToken);
   try{if(isNewPhoneUser)await deleteUser(credential.user);else await signOut(credential.user.auth);}catch(_){}
   form.elements.phone.readOnly=false;$('[data-otp-panel]').hidden=true;confirmationResult=null;otpPhone='';
   $('[data-send-otp]').textContent='Phone verified ✓';$('[data-send-otp]').disabled=true;
   show('Business phone verified successfully.','success');
 }catch(e){
   console.error('Phone verification:',e.code||e);
   if(e.code==='auth/code-expired'){
     confirmationResult=null;otpPhone='';form.elements.phone.readOnly=false;
     $('[data-send-otp]').disabled=false;$('[data-send-otp]').textContent='Send new code';
     $('[data-otp-status]').textContent='This code expired. Request a new SMS code.';
   }
   show(phoneError(e));
 }finally{$('[data-confirm-otp]').disabled=false;}
});
$('[data-use-location]').addEventListener('click',()=>{if(!navigator.geolocation){show('Location is not supported by this browser.');return;}const b=$('[data-use-location]');b.disabled=true;b.textContent='Finding location…';navigator.geolocation.getCurrentPosition(async p=>{await reverseAddress(p.coords.latitude,p.coords.longitude);if(selectedAddress)$('[data-location-status]').textContent=`Current location found · accuracy ±${Math.round(p.coords.accuracy)}m. Check the address and pin before confirming.`;b.disabled=false;b.textContent='Use my current location';},e=>{show(e.code===1?'Location permission was denied. Type your address and select a suggestion, or choose a point on the map.':'Location could not be detected. Type your address and select a suggestion.');b.disabled=false;b.textContent='Use my current location';},{enableHighAccuracy:true,timeout:15000,maximumAge:0});});
$('[data-confirm-location]').addEventListener('click',async()=>{const address=form.elements.address.value.trim();if(!currentPoint||!selectedAddress||address!==selectedAddress){show('Select an address suggestion, detect your location, or tap the map pin before confirming.');return;}try{const d=await api('verification',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'location',lat:currentPoint.lat,lng:currentPoint.lng,address})});context.business.address=address;renderVerification(d.verification);notifyOnboarding();show('Business location confirmed. Delivery will use this same collection address.','success');}catch(e){show(e.message);}});
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
   const r=await fetch('api/verification-upload.php',{method:'POST',headers:{Authorization:'Bearer '+token},body:fd});
   const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)throw new Error(d.error||(r.status===413?'The server upload limit was exceeded. Choose a smaller file.':'Upload failed. Please try again.'));
   await refreshVerification();
   show('Proof of address uploaded. Teyza will confirm that the document address matches the map address before seller approval.','success');
 }catch(e){show(e.message);}finally{b.disabled=false;b.textContent='Upload proof';}
});
form.elements.phone.addEventListener('input',()=>{if(verification?.phoneVerified){verification={...verification,phoneVerified:false,completed:Math.max(0,Number(verification.completed||0)-1)};renderVerification(verification);}});
$('[data-upload-logo]').addEventListener('click',async()=>{const file=$('[data-logo-file]').files[0];if(!file){show('Choose a JPG or PNG image first.');return;}const b=$('[data-upload-logo]');try{b.disabled=true;b.textContent='Uploading…';const d=await logoRequest('POST',file);context.business.logoUrl=d.logoUrl;renderLogo(d.logoUrl);show('Seller photo / business logo updated.','success');}catch(e){show(e.message);}finally{b.disabled=false;b.textContent='Upload image';}});
$('[data-remove-logo]').addEventListener('click',async()=>{try{const d=await logoRequest('DELETE');delete context.business.logoUrl;renderLogo(d.logoUrl);show('Business image removed.','success');}catch(e){show(e.message);}});
let identityStream=null,selfieBlob=null,identityStep=1;const identityModal=$('[data-identity-modal]'),identityFile=$('[data-identity-document]'),identityVideo=$('[data-identity-video]');
function stepMessage(step,message,type='error'){const s=document.querySelector('[data-identity-step-status="'+step+'"]');if(!s)return;s.hidden=false;s.textContent=message;s.className='identity-step-status '+type;}
function clearStepMessage(step){const s=document.querySelector('[data-identity-step-status="'+step+'"]');if(s){s.hidden=true;s.textContent='';}}
function identityStatus(message,type='error'){const s=$('[data-identity-status]');s.hidden=false;s.textContent=message;s.className='form-status '+type;}
function setIdentityStep(step){identityStep=step;document.querySelectorAll('[data-identity-step]').forEach(function(p){const active=Number(p.getAttribute('data-identity-step'))===step;p.hidden=!active;p.classList.toggle('active',active);});document.querySelectorAll('[data-identity-progress]').forEach(function(p){const n=Number(p.getAttribute('data-identity-progress'));p.classList.toggle('active',n===step);p.classList.toggle('done',n<step);});if(step===3){const doc=identityFile.files&&identityFile.files[0];$('[data-review-document]').textContent=doc?doc.name:'Not selected';$('[data-review-document-status]').textContent=doc?'Ready ✓':'Required';$('[data-review-selfie]').textContent=selfieBlob?'Selfie captured':'Not captured';$('[data-review-selfie-status]').textContent=selfieBlob?'Ready ✓':'Required';}}
function stopIdentityCamera(){if(identityStream){identityStream.getTracks().forEach(function(t){t.stop();});identityStream=null;}if(identityVideo)identityVideo.srcObject=null;}
async function startIdentityCamera(){clearStepMessage(2);if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){stepMessage(2,'This browser does not support camera capture. Use current Chrome, Edge or Safari over HTTPS.');return false;}try{stopIdentityCamera();identityStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:720},height:{ideal:720}},audio:false});identityVideo.srcObject=identityStream;identityVideo.hidden=false;$('[data-camera-placeholder]').hidden=true;await identityVideo.play();$('[data-capture-selfie]').disabled=false;$('[data-start-camera]').textContent='Camera active';$('[data-start-camera]').disabled=true;stepMessage(2,'Camera ready. Centre your face, then tap Capture selfie.','success');return true;}catch(e){let msg='Camera could not start. Check browser camera permission and try again.';if(e&&e.name==='NotAllowedError')msg='Camera permission was blocked. Allow camera access for teyza.co.za in the browser address bar, then try again.';else if(e&&e.name==='NotFoundError')msg='No camera was found on this device.';else if(e&&e.name==='NotReadableError')msg='Your camera is being used by another application. Close it there and try again.';stepMessage(2,msg);$('[data-start-camera]').disabled=false;$('[data-start-camera]').textContent='Try camera again';return false;}}
$('[data-open-identity]').addEventListener('click',function(){setIdentityStep(1);identityModal.classList.add('show');identityModal.setAttribute('aria-hidden','false');});
function closeIdentity(){stopIdentityCamera();identityModal.classList.remove('show');identityModal.setAttribute('aria-hidden','true');}$('[data-close-identity]').addEventListener('click',closeIdentity);
identityFile.addEventListener('change',function(){const file=identityFile.files&&identityFile.files[0];$('[data-identity-file-name]').textContent=file?file.name:'Tap to select a file · Maximum 8 MB';clearStepMessage(1);});
document.querySelectorAll('[data-identity-next]').forEach(function(b){b.addEventListener('click',async function(e){e.preventDefault();const next=Number(b.getAttribute('data-identity-next'));if(next===2){const file=identityFile.files&&identityFile.files[0];if(!file){stepMessage(1,'Choose your identity document before continuing.');return;}if(file.size>8*1024*1024){stepMessage(1,'Your identity document is larger than 8 MB. Choose a smaller file.');return;}clearStepMessage(1);setIdentityStep(2);setTimeout(function(){startIdentityCamera();},150);return;}if(next===3){if(!selfieBlob){stepMessage(2,'Capture your live selfie before continuing.');return;}stopIdentityCamera();setIdentityStep(3);}});});
document.querySelectorAll('[data-identity-back]').forEach(function(b){b.addEventListener('click',function(){stopIdentityCamera();setIdentityStep(Number(b.getAttribute('data-identity-back')));});});
$('[data-start-camera]').addEventListener('click',startIdentityCamera);
$('[data-capture-selfie]').addEventListener('click',function(){if(!identityStream||!identityVideo.videoWidth){stepMessage(2,'Wait for the camera image to appear, then capture your selfie.');return;}const canvas=$('[data-identity-canvas]');canvas.width=identityVideo.videoWidth;canvas.height=identityVideo.videoHeight;canvas.getContext('2d').drawImage(identityVideo,0,0,canvas.width,canvas.height);canvas.toBlob(function(blob){if(!blob){stepMessage(2,'The selfie could not be captured. Please try again.');return;}selfieBlob=blob;const img=$('[data-identity-selfie-preview]');img.src=URL.createObjectURL(blob);img.hidden=false;identityVideo.hidden=true;$('[data-retake-selfie]').hidden=false;$('[data-capture-selfie]').hidden=true;$('[data-identity-next="3"]').disabled=false;stopIdentityCamera();stepMessage(2,'Selfie captured successfully ✓','success');},'image/jpeg',0.86);});
$('[data-retake-selfie]').addEventListener('click',async function(){selfieBlob=null;$('[data-identity-selfie-preview]').hidden=true;$('[data-retake-selfie]').hidden=true;$('[data-capture-selfie]').hidden=false;$('[data-capture-selfie]').disabled=true;$('[data-identity-next="3"]').disabled=true;$('[data-start-camera]').disabled=false;$('[data-start-camera]').textContent='Start camera';await startIdentityCamera();});
$('[data-submit-identity]').addEventListener('click',async function(){const doc=identityFile.files&&identityFile.files[0],consent=$('[data-identity-consent]').checked,b=$('[data-submit-identity]');if(!doc||!selfieBlob){identityStatus('Your ID document and live selfie are both required.');return;}if(!consent){identityStatus('Please confirm consent before submitting.');return;}try{b.disabled=true;b.textContent='Submitting securely…';const token=await currentUser.getIdToken();const fd=new FormData();fd.append('type','identity');fd.append('document',doc);fd.append('selfie',selfieBlob,'live-selfie.jpg');fd.append('consent','yes');const res=await fetch('api/verification-upload.php',{method:'POST',headers:{Authorization:'Bearer '+token},body:fd});const d=await res.json().catch(()=>({}));if(!res.ok||!d.ok)throw new Error(d.error||(res.status===413?'The server upload limit was exceeded. Choose smaller files.':'Identity submission failed. Please try again.'));await refreshVerification();identityStatus('ID and selfie uploaded successfully. Teyza will review your submission before approving verification.','success');b.textContent='Submitted for review ✓';setTimeout(()=>{closeIdentity();if(window.parent!==window)notifyOnboarding();else show('Identity submitted for review. You can continue with your other settings.','success');},1200);}catch(e){identityStatus(e.message);}finally{if(b.textContent!=='Submitted for review ✓'){b.disabled=false;b.textContent='Submit for verification';}}});
retry.addEventListener('click',load);onAuthStateChanged(auth,user=>{currentUser=user;if(user)load();else{context=null;button.disabled=true;}});
