import {nearbyPanel,newSession} from './work-discovery.mjs';
import {auth,ready,api,el,label} from './work-auth.mjs';
import {onAuthStateChanged,GoogleAuthProvider,FacebookAuthProvider,OAuthProvider,signInWithPopup,signOut} from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js';
const $=id=>document.getElementById(id),sections=['login','application','pending','workspace'];
let epoch=0,busy=false,isAdmin=false,profile=null,visits=[],selected=null,next=null,profiles=[],reviews=[],nextProfiles=null,nextReviews=null,stream=null,capture=null,imageUrl=null,reviewAgent=null;
const nearbyError=e=>notice(e.message||'Nearby search is temporarily unavailable.',true);
const agentNearby=nearbyPanel($('agentNearby'),{onError:nearbyError,onStartVisit:record=>newVisit(record)}),adminNearby=nearbyPanel($('adminNearby'),{admin:true,onError:nearbyError});
function notice(message,error=false){$('notice').textContent=message;$('notice').className='notice'+(error?' error':'');$('notice').hidden=false;}
function show(id){for(const s of sections)$(s).hidden=s!==id;}
async function run(fn){if(busy)return;busy=true;const ticket=epoch,buttons=[...document.querySelectorAll('button')].map(b=>[b,b.disabled]);buttons.forEach(([b])=>b.disabled=true);try{await fn();}catch(e){if(ticket===epoch)notice(e.message||'Please try again.',true);}finally{busy=false;buttons.forEach(([b,disabled])=>{if(b.isConnected)b.disabled=disabled;});}}
function button(text,fn,cls='outline'){const b=el('button',text,cls);b.type='button';b.addEventListener('click',()=>run(fn));return b;}
function input(form,name,title,type='text',required=true){const l=el('label',title),i=el('input');i.name=name;i.type=type;i.required=required;l.append(i);form.append(l);return i;}
function checkbox(form,name,text){const l=el('label',undefined,'check'),i=el('input');i.type='checkbox';i.name=name;i.required=true;l.append(i,el('span',text));form.append(l);return i;}
function clearPrivate(){agentNearby.clear();adminNearby.clear();reviewAgent=null;$('profileEditor').hidden=true;$('profileEditor').replaceChildren();stopCamera();if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl=null;$('privateImage').removeAttribute('src');if($('imageDialog').open)$('imageDialog').close();visits=[];selected=null;profiles=[];reviews=[];next=nextProfiles=nextReviews=null;$('visitList').replaceChildren();const empty=el('div',undefined,'empty');empty.append(el('span','↗','empty-icon'),el('h2','Your next shop starts here'),el('p','Select a visit or start a new one. Every task stays connected to your own agent account.'));$('visitDetail').replaceChildren(empty);$('reviewDetail').replaceChildren();$('agentApplications').replaceChildren();$('workReviews').replaceChildren();}
function stopCamera(){stream?.getTracks().forEach(t=>t.stop());stream=null;capture=null;$('camera').srcObject=null;$('photoConsent').checked=false;if($('cameraDialog').open)$('cameraDialog').close();}
async function refreshAccount(){const ticket=epoch;const r=await api('agent_profile');if(ticket!==epoch)return;profile=r.profile;$('notice').hidden=true;const choices=$('province');choices.replaceChildren(...r.provinces.map(p=>{const o=el('option',p);o.value=p;return o;}));
 if((!profile||!profile.hasDocuments||profile.status==='rejected')&&profile?.status!=='approved'&&!isAdmin){show('application');return;}if(!isAdmin){
  show('pending');
  $('pendingTitle').textContent=profile?.status==='approved'?'You’re approved to work in the Teyza app':profile.status==='pending'?'Application received — awaiting Admin approval':'Application '+label(profile.status);
  $('pendingText').textContent=(profile.reviewNote?profile.reviewNote+' ':'')+'Download or update Teyza and sign in with the same method and account you used here. Once approved, choose Field Agent if Teyza asks you to select an account.';
  const identity=$('pendingAccount');
  if(identity)identity.textContent='Account: '+(auth.currentUser?.email||auth.currentUser?.phoneNumber||'Phone sign-in')+' · ID '+auth.currentUser.uid.slice(-8);
  return;
 }
 show('workspace');$('greeting').textContent='Field team review';
 $('reviewMode').hidden=false;$('sellerAdmin').hidden=false;
 await openReview();
}
async function loadRewards(){
 const summary=$('rewardSummary'),explanation=$('rewardExplanation');
 try{const r=await api('agent_rewards');
  summary.textContent='R'+(r.approvedPendingPaymentCents/100).toLocaleString('en-ZA',{minimumFractionDigits:2})+' approved · awaiting payment';
  explanation.textContent=r.approvedCount+' Admin-approved, seller-verified, uniquely attributed registration(s). No payment has been sent by this screen.'+(r.partial?' More rewards exist; ask Finance for a full statement.':'');
 }catch(_){summary.textContent='Reward verification status unavailable';explanation.textContent='Visit approvals do not establish earnings. Finance must verify R90 eligibility and settlement separately.';}
}
async function loadVisits(more=false){const r=await api('agent_visits',more&&next?{after:next}:{});visits=more?[...visits,...r.visits]:r.visits;next=r.next;drawVisits();if(!more)await loadRewards();}
function drawVisits(){$('visitCount').textContent=visits.length;$('reviewCount').textContent=visits.filter(v=>v.status==='submitted').length;$('approvedCount').textContent=visits.filter(v=>v.status==='approved').length;$('moreVisits').hidden=!next;const root=$('visitList');root.replaceChildren();if(!visits.length)root.append(el('p','No visits yet. Start with a shop owner who has agreed to your visit.','tiny'));for(const v of visits){const b=button('',()=>selectVisit(v.id),'visit-row'+(v.id===selected?.id?' selected':''));b.append(el('strong',v.shopName),el('small',v.area+' · '+v.province),el('span',label(v.status),'pill'));root.append(b);}}
async function selectVisit(id){const r=await api('agent_visit_get',{visitId:id});selected=r.visit;renderVisit();drawVisits();}
function task(root,number,title,text,done){const box=el('section',undefined,'task'+(done?' task-complete':' task-next')),dot=el('span',done?'✓':String(number),'step-dot'),body=el('div');body.append(el('h3',title),el('p',text));box.append(dot,body);root.append(box);return body;}
function whatsappInviteUrl(url,shopName,ownerPhone){
 let digits=String(ownerPhone||'').replace(/[^0-9]/g,'');
 if(/^0[0-9]{9}$/.test(digits))digits='27'+digits.slice(1);
 if(!/^(27[0-9]{9}|[1-9][0-9]{7,14})$/.test(digits))throw Error('Enter a valid owner WhatsApp number such as 082 123 4567 or +27 82 123 4567.');
 const text='Hello. As agreed during our Teyza shop visit for '+shopName+', please download Teyza from Google Play: https://play.google.com/store/apps/details?id=com.asiyedriver.asiye or the App Store: https://apps.apple.com/za/app/id6827037733, and sign in using your own account. Then open this private confirmation link to confirm the agent visit: '+url+'. Your shop registration is free. Admin will review verification separately; selling requires an optional Premium membership. Do not share passwords or OTPs.';
 return 'https://wa.me/'+digits+'?text='+encodeURIComponent(text);
}
function renderVisit(){const v=selected,p=v.progress||{},root=$('visitDetail'),editable=['draft','needs_changes'].includes(v.status);root.replaceChildren(el('span','STEP 2 OF 3 · VISIT AND CAPTURE','eyebrow'),el('h2',v.shopName),el('p',v.address),el('span',label(v.status),'pill'));const intro=el('p','At the shop: confirm owner permission → save GPS → take shop photo → take in-shop selfie → invite owner on WhatsApp → submit for Admin review.','visit-flow-intro');root.append(intro);if(v.reviewNote)root.append(el('p',v.reviewNote,'warning'));
 const a=task(root,1,'Capture your location',v.location?`Device location saved · approximately ${Math.round(v.location.accuracy)} m accuracy. ${v.location.latitude.toFixed(5)}, ${v.location.longitude.toFixed(5)}`:'Allow location access while you are at the shop. Capturing a new location clears the old photo steps.',!!v.location);
 if(editable)a.append(button(v.location?'Capture location again':'Capture shop location',async()=>{const pos=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,maximumAge:0,timeout:25000}));await api('agent_location',{visitId:v.id,revision:v.revision,latitude:pos.coords.latitude,longitude:pos.coords.longitude,accuracy:pos.coords.accuracy,capturedAt:pos.timestamp});await selectVisit(v.id);notice('Location saved. Take both photos during this visit.');}));
 for(const [i,kind,title,txt] of [[2,'shop','Photograph the shop','Show the shop front and its identifying signage.'],[3,'selfie','Take your in-shop selfie','Show yourself inside the shop, with enough shop context for review.']]){const part=task(root,i,title,v.photos?.[kind]?'Photo captured on '+new Date(v.photos[kind].capturedAt).toLocaleString('en-ZA'):txt,!!v.photos?.[kind]);if(editable){const b=button(v.photos?.[kind]?'Retake photo':'Open camera',()=>openCamera(v,kind));b.disabled=!v.location;part.append(b);}}
 const owner=task(root,4,'Let the owner confirm',v.ownerConfirmed?'Owner confirmed: '+(p.registeredShop?.name||'registered shop')+'.':'The owner signs in with their own Teyza shop account. A link never gives the agent access to the owner’s account.',v.ownerConfirmed);
 if(editable&&!v.ownerConfirmed)owner.append(button('Create owner invitation',async()=>{
  const r=await api('agent_owner_link',{visitId:v.id});
  const wrap=el('div',undefined,'owner-invite');
  wrap.append(el('p','Ask the owner for permission to send a WhatsApp message. This opens WhatsApp on your device; it does not send a message automatically. The owner must sign in and confirm personally.','tiny'));
  const phoneLabel=el('label','Owner’s WhatsApp number (not saved by Teyza Work)'),phone=el('input');phone.type='tel';phone.inputMode='tel';phone.placeholder='27821234567';phone.autocomplete='off';phone.maxLength=18;phoneLabel.append(phone);wrap.append(phoneLabel);
  const consentLabel=el('label',undefined,'check'),consent=el('input');consent.type='checkbox';consentLabel.append(consent,el('span','The owner asked me to send the Teyza invitation to this number.'));wrap.append(consentLabel);
  wrap.append(button('Open WhatsApp invitation',()=>{
    if(!consent.checked)throw Error('The owner must agree to receive this WhatsApp invitation.');
    const link=whatsappInviteUrl(r.url,v.shopName,phone.value);
    window.open(link,'_blank','noopener,noreferrer');
    notice('WhatsApp opened. Send the message to the owner and ask them to confirm from their own account.');
  },'primary'));
  wrap.append(button('Copy private owner link',async()=>{await navigator.clipboard.writeText(r.url);notice('Private link copied. Share only with the consenting owner.');},'outline'));
  owner.append(wrap);
},'primary'));
 const review=task(root,5,'Send for Admin verification','Teyza reviews your work evidence separately from seller approval. Registration is free; a seller chooses product access later.',['submitted','approved'].includes(v.status));
 if(editable){const submit=button('Submit completed visit',async()=>{await api('agent_visit_submit',{visitId:v.id,revision:v.revision});await selectVisit(v.id);await loadVisits();notice('Work submitted for review.');},'primary');submit.disabled=!v.location||!v.photos?.shop||!v.photos?.selfie||!v.ownerConfirmed;review.append(submit);}
 const statuses=el('div',undefined,'status-grid');for(const [title,value] of [['Seller approval',p.sellerApproval],['Owner confirmation',v.ownerConfirmed?'confirmed':'pending']]){const box=el('div');box.append(el('small',title),el('strong',label(value)));statuses.append(box);}root.append(statuses,el('p','STEP 3 OF 3 · After the owner confirms, Admin checks the seller and the agent visit. Once verified, the owner can choose Premium from their own Teyza account to sell products or services. WhatsApp verification and Premium notifications require separate consented server-side templates and delivery confirmation.','tiny'));
}
function newVisit(prefill){const suggested=prefill&&typeof prefill==='object'?prefill:null;selected=null;drawVisits();const root=$('visitDetail');root.replaceChildren(el('span','STEP 2 OF 3 · REGISTER VISIT','eyebrow'),el('h2','Confirm the shop with its owner'),el('p','Use the full street address, town and province. The owner’s registered address remains the source for the public shop listing.'));const f=el('form');const shopInput=input(f,'shopName','Shop name'),addressInput=input(f,'address','Full street address'),areaInput=input(f,'area','Town or suburb');
 if(suggested){shopInput.value=String(suggested.name||'').slice(0,160);addressInput.value=String(suggested.address||'').slice(0,350);areaInput.value='';root.append(el('p','Confirm the shop details with the owner. Google listing information is a suggestion, not a verified registration.','tiny'));}const l=el('label','Province'),s=el('select');s.name='province';for(const p of $('province').options){const o=el('option',p.textContent);o.value=p.value;s.append(o);}l.append(s);if(suggested&&profile?.province)s.value=profile.province;f.append(l);checkbox(f,'ownerPermission','The shop owner has agreed to this visit and the shop photograph. I will obtain consent from anyone visible in the photos.');const b=el('button','Save visit and capture photos','primary');b.type='submit';f.append(b);const requestId=newSession();f.addEventListener('submit',e=>{e.preventDefault();if(!f.reportValidity())return;run(async()=>{const d=Object.fromEntries(new FormData(f));const r=await api('agent_visit_start',{...d,ownerPermission:true,requestId});await loadVisits();await selectVisit(r.visit.id);});});root.append(f);root.scrollIntoView({block:'start',behavior:'smooth'});}
async function openCamera(v,kind){const r=await api('agent_capture_begin',{visitId:v.id,kind});const uid=auth.currentUser.uid;stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:kind==='selfie'?'user':'environment'},width:{ideal:1280}},audio:false});if(auth.currentUser?.uid!==uid){stopCamera();return;}capture={...r,visitId:v.id,kind};$('camera').srcObject=stream;await $('camera').play();$('cameraTitle').textContent=kind==='selfie'?'Your in-shop selfie':'Shop-front photo';$('cameraChallenge').textContent='Visit code '+r.nonce+' · capture now';$('cameraDialog').showModal();}
$('snap').onclick=()=>run(async()=>{if(!capture||!$('photoConsent').checked)throw Error('Confirm the photo consent before saving.');const c=capture,video=$('camera');if(!video.videoWidth||!video.videoHeight)throw Error('Wait for the camera image, then retry.');const canvas=document.createElement('canvas'),scale=Math.min(1,1200/Math.max(video.videoWidth,video.videoHeight));canvas.width=Math.round(video.videoWidth*scale);canvas.height=Math.round(video.videoHeight*scale);const ctx=canvas.getContext('2d');ctx.drawImage(video,0,0,canvas.width,canvas.height);ctx.fillStyle='#0c3c30dd';ctx.fillRect(0,canvas.height-55,canvas.width,55);ctx.fillStyle='white';ctx.font=Math.max(12,Math.round(canvas.width/52))+'px sans-serif';ctx.fillText('TEYZA WORK · '+c.nonce+' · '+new Date().toISOString(),12,canvas.height-21);const imageBase64=canvas.toDataURL('image/jpeg',.82).split(',')[1];stopCamera();await api('agent_photo_submit',{visitId:c.visitId,captureId:c.captureId,consent:true,imageBase64});await selectVisit(c.visitId);notice('Private work photo saved.');});
$('closeCamera').onclick=stopCamera;$('cameraDialog').addEventListener('cancel',stopCamera);$('closeImage').onclick=()=>{if(imageUrl)URL.revokeObjectURL(imageUrl);imageUrl=null;$('privateImage').removeAttribute('src');$('imageDialog').close();};document.addEventListener('visibilitychange',()=>{if(document.hidden){stopCamera();if($('imageDialog').open)$('closeImage').click();}});
async function openReview(){if(!isAdmin)throw Error('Administrator access is required.');$('agentArea').hidden=true;$('reviewArea').hidden=false;await Promise.all([loadProfiles(),loadReviews()]);}
async function loadProfiles(more=false){const r=await api('agent_admin_profiles',more&&nextProfiles?{after:nextProfiles}:{});profiles=more?[...profiles,...r.profiles]:r.profiles;nextProfiles=r.next;$('moreProfiles').hidden=!nextProfiles;const root=$('agentApplications');root.replaceChildren();if(!profiles.length)root.append(el('p','No agent applications yet.','tiny'));for(const p of profiles){const box=el('article',undefined,'visit-row');box.append(el('strong',p.name),el('small',[p.area,p.province,p.phone,p.email,p.address].filter(Boolean).join(' · ')),el('span',label(p.status),'pill'));box.append(button('View this agent’s work',async()=>{reviewAgent={uid:p.uid,name:p.name};await loadReviews();$('workReviews').scrollIntoView({block:'start',behavior:'smooth'});},'text-button'));if(p.address)box.append(button('Search this address',async()=>adminNearby.setAddress(p.address),'text-button'));for(const status of ['approved','suspended','rejected'])box.append(button(status==='approved'?'Approve':status==='suspended'?'Suspend':'Reject',async()=>{const note=prompt('Review note (engagement and expense terms must be agreed before work starts):');if(note===null)return;await api('agent_admin_profile_decide',{agentUid:p.uid,revision:p.revision,status,note});await loadProfiles();},'text-button'));root.append(box);}}
async function loadReviews(more=false){const r=await api('agent_admin_visits',{...(more&&nextReviews?{after:nextReviews}:{}),...(reviewAgent?{agentUid:reviewAgent.uid}:{})});$('reviewFilter').textContent=reviewAgent?'Showing work for '+reviewAgent.name+'.':'Showing all loaded field work.';$('allReviews').hidden=!reviewAgent;reviews=more?[...reviews,...r.visits]:r.visits;nextReviews=r.next;$('moreReviews').hidden=!nextReviews;const root=$('workReviews');root.replaceChildren();if(!reviews.length)root.append(el('p','No work visits have been submitted yet.','tiny'));for(const v of reviews){const b=button('',()=>reviewVisit(v),'visit-row');b.append(el('strong',v.shopName),el('small',v.area+' · '+v.agentUid),el('span','Work: '+label(v.status)+' · Seller: '+label(v.progress.sellerApproval),'pill'));root.append(b);if(v.status==='approved')root.append(button('Check seller verification & approve R90',async()=>{const result=await api('agent_admin_reward_approve',{visitId:v.id});notice(result.status==='approved_pending_payment'?'R90 reward approved for manual payout. No bank transfer was initiated.':'Reward review completed.');await loadReviews();},'outline'));}}
function reviewVisit(v){const root=$('reviewDetail');root.hidden=false;root.replaceChildren(el('span','PRIVATE WORK REVIEW','eyebrow'),el('h2',v.shopName),el('p',v.address));const viewed=new Set(),box=el('div',undefined,'actions');root.append(box);for(const kind of ['shop','selfie'])box.append(button('Open '+(kind==='shop'?'shop photo':'in-shop selfie'),async()=>{const r=await api('agent_admin_photo',{visitId:v.id,kind});if(imageUrl)URL.revokeObjectURL(imageUrl);const bytes=Uint8Array.from(atob(r.imageBase64),c=>c.charCodeAt(0));imageUrl=URL.createObjectURL(new Blob([bytes],{type:'image/jpeg'}));$('privateImage').src=imageUrl;$('imageDialog').showModal();viewed.add(kind);}));
 if(v.location){const map=el('a','Open reported location in Maps ↗','outline');map.href='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(v.location.latitude+','+v.location.longitude);map.target='_blank';map.rel='noopener noreferrer';root.append(el('p','Device-reported location · '+Math.round(v.location.accuracy)+' m accuracy. GPS and camera evidence can be spoofed; verify the shop and owner confirmation.','tiny'),map);}
 if(v.progress.distanceFromShopMeters!==null&&v.progress.distanceFromShopMeters!==undefined)root.append(el('p',v.progress.distanceFromShopMeters+' m from the owner’s saved shop pin.','tiny'));
 if(v.progress.registeredShop)root.append(el('h3','Owner’s registered shop'),el('p',v.progress.registeredShop.name+' · '+v.progress.registeredShop.address,'tiny'));
 root.append(el('p','Seller: '+label(v.progress.sellerApproval)+' · Owner confirmation: '+(v.ownerConfirmed?'confirmed':'pending'),'tiny'));
 if(v.status==='submitted'){const f=el('form'),note=input(f,'note','Review note','text',false),checked=checkbox(f,'reviewConfirmed','I opened both current photos and reviewed the location, shop details and owner confirmation.');root.append(f);const controls=el('div',undefined,'actions');for(const status of ['approved','needs_changes','rejected'])controls.append(button(status==='approved'?'Approve work':status==='needs_changes'?'Request changes':'Reject work',async()=>{if(status==='approved'&&(!checked.checked||viewed.size!==2))throw Error('Open both photos and confirm your review first.');await api('agent_admin_visit_decide',{visitId:v.id,revision:v.revision,status,note:note.value,reviewConfirmed:checked.checked});root.hidden=true;await loadReviews();notice('Work review saved. Seller approval remains in Seller administration.');},status==='approved'?'primary':'outline'));root.append(controls);}
 root.scrollIntoView({behavior:'smooth',block:'start'});
}
$('allReviews').onclick=()=>run(async()=>{reviewAgent=null;await loadReviews();});
$('editProfile').onclick=()=>{const root=$('profileEditor');if(!root.hidden){root.hidden=true;return;}root.hidden=false;root.replaceChildren(el('span','MY DETAILS','eyebrow'),el('h2','Your contact and working details'),el('p','Keep these details current for Teyza’s field team.','tiny'));const f=el('form');for(const [key,title,type] of [['name','Full name','text'],['phone','Mobile number','tel'],['address','Home or working address','text'],['area','Town or working area','text']]){const i=input(f,key,title,type);i.value=profile?.[key]||'';}const l=el('label','Province'),s=el('select');s.name='province';s.required=true;for(const o of $('province').options){const n=el('option',o.textContent);n.value=o.value;s.append(n);}s.value=profile?.province||'';l.append(s);f.append(l);const b=el('button','Save details','primary');b.type='submit';f.append(b);f.onsubmit=e=>{e.preventDefault();if(!f.reportValidity())return;run(async()=>{await api('agent_profile_update',{...Object.fromEntries(new FormData(f)),revision:profile.revision});root.hidden=true;await refreshAccount();notice('Your details were saved.');});};root.append(f);};
$('google').onclick=()=>run(async()=>{await ready;await signInWithPopup(auth,new GoogleAuthProvider());});
$('apple').onclick=()=>run(async()=>{await ready;await signInWithPopup(auth,new OAuthProvider('apple.com'));});
$('facebook').onclick=()=>run(async()=>{await ready;await signInWithPopup(auth,new FacebookAuthProvider());});
$('logout').onclick=()=>run(()=>signOut(auth));
$('checkApproval').onclick=()=>run(async()=>{await auth.currentUser?.getIdToken(true);await refreshAccount();});
async function encodeApplicationFile(file,label,max){
 if(!(file instanceof File)||!file.size)throw Error('Attach a valid '+label+' file.');
 const permitted=label==='CV'?['application/pdf']:['application/pdf','image/png','image/jpeg'];
 if(!permitted.includes(file.type))throw Error('Choose a PDF'+(label==='ID/passport'?', JPG or PNG':'')+' for '+label+'.');
 if(file.size>max&&file.type.startsWith('image/')){
  const image=await createImageBitmap(file).catch(()=>{throw Error('Could not open the ID image. Try another JPG or PNG.');});
  const canvas=document.createElement('canvas');
  try{
   for(const longEdge of [2400,2000,1600]){
    const scale=Math.min(1,longEdge/Math.max(image.width,image.height));
    canvas.width=Math.max(1,Math.round(image.width*scale));
    canvas.height=Math.max(1,Math.round(image.height*scale));
    const context=canvas.getContext('2d',{alpha:false});
    if(!context)break;
    context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);
    context.drawImage(image,0,0,canvas.width,canvas.height);
    const jpeg=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',0.88));
    if(jpeg?.size&&jpeg.size<=max&&jpeg.type==='image/jpeg'){
     file=new File([jpeg],file.name.replace(/\.[^.]+$/,'')+'.jpg',{type:jpeg.type});
     break;
    }
   }
  }finally{image.close();canvas.width=canvas.height=0;}
 }
 if(file.size>max)throw Error(label+' exceeds '+max/1000000+' MB. '+(file.type==='application/pdf'?'Export a smaller PDF and try again.':'Choose a smaller, readable image.'));
 return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error('Could not read the '+label+' file.'));reader.onload=()=>resolve({name:file.name,mime:file.type,base64:String(reader.result).split(',')[1]});reader.readAsDataURL(file);});
}
$('applyForm').onsubmit=e=>{
 e.preventDefault();
 const form=$('applyForm');
 if(!form.reportValidity())return;
 run(async()=>{
  const ticket=epoch,progress=$('applicationProgress'),status=$('applicationProgressText');
  progress.hidden=false;status.textContent='Preparing your documents…';
  try{
   const data=Object.fromEntries(new FormData(form));
   data.identityFile=await encodeApplicationFile(data.identityFile,'ID/passport',3000000);
   data.cvFile=await encodeApplicationFile(data.cvFile,'CV',5000000);
   if(ticket!==epoch)return;
   status.textContent='Uploading your application…';
   await api('agent_apply',{...data,consent:true});
   if(ticket!==epoch)return;
   form.reset();
   show('pending');
   $('pendingTitle').textContent='Application received';
   $('pendingText').textContent='Download Teyza and sign in with the same account. Field Agent access appears after approval.';
   $('pendingAccount')?.replaceChildren();
  }finally{progress.hidden=true;status.textContent='';}
 });
};
onAuthStateChanged(auth,async user=>{epoch++;clearPrivate();isAdmin=false;profile=null;$('logout').hidden=!user;$('refresh').hidden=!user;$('notice').hidden=true;if(!user){show('login');return;}if(!user.emailVerified&&!user.phoneNumber){show('login');notice('Use a verified Google, Apple or Facebook account to continue.',true);return;}try{const ticket=epoch,token=await user.getIdTokenResult();if(ticket!==epoch)return;isAdmin=token.claims.teyzaAdmin===true;await refreshAccount();}catch(e){notice(e.message,true);show('pending');$('pendingTitle').textContent='Workspace unavailable';$('pendingText').textContent='Refresh to retry. If a review session expired, sign out and sign in again.';}});
