import {createOperations} from '/js/teyza-operations.js?v=R317';
import {auth} from '/js/teyza-app-admin-firebase.mjs?v=R317';
import {createApi,ReviewState,filteredRows,photoBlob} from '/js/teyza-app-admin-model.mjs?v=R317';
import {onAuthStateChanged,GoogleAuthProvider,EmailAuthProvider,signInWithPopup,signInWithEmailAndPassword,
  reauthenticateWithPopup,reauthenticateWithCredential,signOut,setPersistence,browserSessionPersistence}
  from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js';

const $=id=>document.getElementById(id),state=new ReviewState();
const api=createApi({user:()=>auth.currentUser});
const operations=createOperations({api,onError:failed});
let activeUser=null,busy=false,expiresAt=0,objectUrl=null,renewing=false,authorised=false;
const controls=['refreshQueue','loadMore','viewIdentity','viewSelfie','approveSeller','rejectSeller','requestPhoto'];
function notice(message,kind=''){ $('notice').textContent=message;$('notice').className='notice '+kind;$('notice').hidden=false; }
function set(id,value){$(id).textContent=value||'Not supplied';}
function clearPhoto(){
  $('photoDialog').close();$('largePhoto').removeAttribute('src');
  $('evidenceImage').onload=null;$('evidenceImage').onerror=null;
  $('evidenceImage').hidden=true;$('evidenceImage').removeAttribute('src');
  if(objectUrl)URL.revokeObjectURL(objectUrl);objectUrl=null;
  $('imageHint').hidden=false;$('imageHint').textContent='Choose a document or selfie above.';
  $('identityDetails').replaceChildren();$('identityDetails').hidden=true;
}
function clearViews(){state.views.clear();clearPhoto();$('reviewConfirmed').checked=false;updateControls();}
function resetDetails(){clearPhoto();$('sellerDetail').hidden=true;$('emptyDetail').hidden=false;$('reviewConfirmed').checked=false;$('reason').value='';}
function lock(message,kind='error'){
  operations.clear();state.clear();busy=false;authorised=false;expiresAt=0;resetDetails();$('sellerList').replaceChildren();
  $('workspace').hidden=true;$('loginPanel').hidden=false;
  renewing=Boolean(activeUser);$('email').value=activeUser?.email||'';$('email').readOnly=renewing;
  set('loginTitle',renewing?'Renew your review session':'Welcome back');
  set('loginHint',renewing?'Sign in again to open a fresh five-minute review session.':'Use your authorised administrator account.');
  if(message)notice(message,kind);
}
function failed(error){
  if(error.status===401){lock(error.message);return;}
  if(error.status===403){lock(error.message+' Administrator access must be assigned by the Teyza project owner.');return;}
  notice(error.message||'The request could not be completed. Please try again.','error');
}
function updateControls(){
  const s=state.selected,own=s?.sellerUid===state.uid;
  for(const id of controls)$(id).disabled=busy||!authorised;
  $('viewIdentity').disabled||=!s?.evidenceId||own;
  $('viewSelfie').disabled||=!s||own||s.expired;
  $('rejectSeller').disabled||=!s||own;
  $('requestPhoto').disabled||=!s||own;
  $('approveSeller').disabled||=!state.canApprove()||!$('reviewConfirmed').checked;
  $('loadMore').hidden=!state.next;
  for(const [key,id] of [['identity','Identity'],['selfie','Selfie']]){
    const done=state.views.has(key);$('view'+id).classList.toggle('viewed',done);
    set(key+'State',done?'Viewed in this review':key==='identity'?'Open document':'Open photo');
  }
}
function drawQueue(){
  const rows=filteredRows(state.rows,$('search').value,$('category').value),root=$('sellerList');root.replaceChildren();
  set('queueCount',String(state.rows.length));set('spazaCount',String(state.rows.filter(s=>s.category==='spaza').length));
  set('retailCount',String(state.rows.filter(s=>s.category==='retail').length));
  $('queueHint').textContent=state.next?'More sellers are available. Load more to search additional registrations.':'Showing all loaded pending submissions.';
  if(!rows.length){const p=document.createElement('p');p.className='footnote';
    p.textContent=state.rows.length?'No loaded sellers match your search.':'All caught up. No owner photos are awaiting review.';root.append(p);}
  for(const row of rows){
    const button=document.createElement('button');button.type='button';button.className='seller-row';
    button.setAttribute('aria-current',String(row.sellerUid===state.selected?.sellerUid));button.disabled=busy;
    const avatar=document.createElement('span');avatar.className='seller-avatar';avatar.textContent=String(row.shopName||'T').slice(0,1).toUpperCase();
    const body=document.createElement('span'),name=document.createElement('strong'),email=document.createElement('small'),category=document.createElement('span');
    name.textContent=row.shopName||'Shop registration';email.textContent=row.ownerEmail||row.phone||'';category.className='row-tag';
    category.textContent=row.expired?'Selfie expired · new photo needed':row.category==='spaza'?'Spaza shop · awaiting review':'Retail / wholesale · awaiting review';
    body.append(name,email,category);button.append(avatar,body);button.addEventListener('click',()=>selectSeller(row));root.append(button);
  }
  updateControls();
}
async function loadQueue(more=false){
  if(busy||!authorised)return;
  const after=more?state.next:null;
  if(!more){state.clear();resetDetails();}
  const ticket=state.ticket();busy=true;updateControls();
  try{
    const r=await api('admin_seller_queue',after?{after}:{});if(!state.current(ticket))return;
    const merged=new Map([...state.rows,...(r.sellers||[])].map(s=>[s.sellerUid,s]));
    state.rows=[...merged.values()];state.next=r.next||null;drawQueue();
  }catch(error){if(state.current(ticket))failed(error);}
  finally{if(state.current(ticket)){busy=false;drawQueue();}}
}
function selectSeller(row){
  if(busy)return;state.select(row);resetDetails();$('sellerDetail').hidden=false;$('emptyDetail').hidden=true;
  set('sellerTitle',row.shopName);set('sellerCategory',row.category==='spaza'?'SPAZA SHOP':'RETAIL / WHOLESALE');
  set('submittedAt',row.submittedAt?'Submitted '+new Date(row.submittedAt).toLocaleString('en-ZA'):'Submission date unavailable');
  set('sellerEmail',row.ownerEmail);set('sellerPhone',row.phone);set('sellerAddress',row.address);
  set('sellerCompany',[row.companyName,row.registrationNumber].filter(Boolean).join(' · ')||'Individual shop owner');
  set('identityLabel',row.evidenceKind==='company'?'Company registration':row.evidenceKind==='passport'?'Passport':'ID / passport');
  $('selfReview').hidden=row.sellerUid!==state.uid;
  set('sellerStatus',row.expired?'New selfie needed':'Awaiting review');
  $('decisionHint').textContent=row.expired?'This selfie expired. Add a note and request a new selfie.':!row.evidenceId?
    'No current identity document was found. The seller must submit their ID, passport or company document.':
    'Open both photos to enable approval. Verified mobile registration is checked by the server.';
  drawQueue();
}
function showIdentityDetails(details){
  const box=$('identityDetails');box.replaceChildren();
  const fields=details.legalType==='company'?[['Company',details.companyName],['Registration number',details.registrationNumber]]:
    [['Document type',details.kind==='passport'?'Passport':'ID'],['Document number',details.documentNumber]];
  for(const [label,value] of fields){const div=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value||'Not supplied';div.append(dt,dd);box.append(div);}
  box.hidden=false;
}
async function viewEvidence(kind){
  if(busy||!state.selected||!authorised)return;const row=state.selected,ticket=state.ticket();
  busy=true;clearPhoto();$('imageHint').textContent='Opening private verification photo…';updateControls();
  try{
    const r=await api(kind==='identity'?'seller_identity_read':'verification_read',kind==='identity'?
      {sellerUid:row.sellerUid,evidenceId:row.evidenceId}:{sellerUid:row.sellerUid,submissionId:row.submissionId});
    if(!state.current(ticket)||document.hidden)return;
    objectUrl=URL.createObjectURL(photoBlob(r.imageBase64));
    await new Promise((resolve,reject)=>{
      $('evidenceImage').onload=resolve;$('evidenceImage').onerror=()=>reject(new Error('This photo could not be displayed. Please open it again.'));
      $('evidenceImage').src=objectUrl;
    });
    if(!state.current(ticket)||document.hidden)return;
    $('evidenceImage').hidden=false;$('imageHint').hidden=true;
    $('evidenceImage').alt=(kind==='identity'?'Private identity document':'Private owner selfie')+' for '+row.shopName;
    if(kind==='identity'&&r.details)showIdentityDetails(r.details);
    state.viewed(kind);$('reviewConfirmed').checked=false;
  }catch(error){if(state.current(ticket)){clearPhoto();failed(error);}}
  finally{if(state.current(ticket)){busy=false;updateControls();}}
}
async function decide(status){
  if(busy||!authorised)return;let data;
  try{data=state.decision(status,$('reason').value);}catch(error){failed(error);return;}
  if(status==='approved'&&!$('reviewConfirmed').checked){notice('Confirm that you inspected both verification photos.','error');return;}
  const name=state.selected.shopName;
  if(!window.confirm(status==='approved'?`Approve ${name} and grant the verified owner badge?`:
    `${status==='needs_new_photo'?'Request a new selfie from':'Reject the registration for'} ${name}? The seller will receive your review note.`))return;
  const ticket=state.ticket();busy=true;updateControls();
  try{
    await api('admin_seller_review',data);if(!state.current(ticket))return;
    resetDetails();state.select(null);busy=false;
    notice(status==='approved'?'Seller approved. The owner will receive a notification.':'Review saved. The owner will receive your note.','success');
    await loadQueue();
  }catch(error){if(state.current(ticket)){clearViews();failed(error);if(error.status===409){busy=false;await loadQueue();}}}
  finally{if(state.current(ticket)){busy=false;updateControls();}}
}
async function authorise(user){
  state.account(user.uid);activeUser=user;authorised=false;busy=false;resetDetails();
  $('signOut').hidden=false;set('accountEmail',user.email||'Teyza administrator');const ticket=state.ticket();
  try{
    const token=await user.getIdTokenResult(true);if(!state.current(ticket))return;
    if(token.claims.teyzaAdmin!==true||token.claims.email_verified!==true){
      lock('This account needs administrator access and a verified email. The Teyza project owner can grant access to your Firebase user UID.');return;}
    const time=Number(token.claims.auth_time)*1000;expiresAt=time+300000;
    if(!Number.isFinite(time)||time>Date.now()+60000||expiresAt<=Date.now()){
      lock('Sign in again before reviewing sellers. Each private review session lasts five minutes.','warning');return;}
    authorised=true;renewing=false;$('loginPanel').hidden=true;$('workspace').hidden=false;
    $('email').readOnly=false;$('notice').hidden=true;await loadQueue();if(authorised)await operations.load();
  }catch(error){if(state.current(ticket))failed(error);}
}
async function login(event,google=false){
  event?.preventDefault();$('loginButton').disabled=true;$('googleLogin').disabled=true;
  try{
    if(google){
      const provider=new GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});
      const result=renewing&&activeUser?await reauthenticateWithPopup(activeUser,provider):await signInWithPopup(auth,provider);
      // Reauthentication does not necessarily emit onAuthStateChanged.
      if(renewing)await authorise(result.user);
    }else{
      const email=$('email').value.trim(),password=$('password').value;
      if(renewing&&activeUser){const result=await reauthenticateWithCredential(activeUser,EmailAuthProvider.credential(email,password));await authorise(result.user);}
      else await signInWithEmailAndPassword(auth,email,password);
    }
  }catch(error){const message=({'auth/invalid-credential':'The email or password was not accepted. Please try again.',
    'auth/popup-blocked':'Allow the Google sign-in popup for teyza.co.za, then try again.',
    'auth/unauthorized-domain':'Add teyza.co.za to Firebase Authentication authorised domains.',
    'auth/user-mismatch':'Renew with the same administrator account, or sign out to switch accounts.'})[error.code];notice(message||error.message||'Sign-in could not be completed.','error');}
  finally{$('password').value='';$('loginButton').disabled=false;$('googleLogin').disabled=false;}
}
$('enlargePhoto').addEventListener('click',()=>{if(!authorised||!objectUrl||$('evidenceImage').hidden)return;$('largePhoto').src=objectUrl;$('photoDialog').showModal();});
$('closePhoto').addEventListener('click',()=>{$('photoDialog').close();$('largePhoto').removeAttribute('src');});
$('emailLogin').addEventListener('submit',login);$('googleLogin').addEventListener('click',()=>login(null,true));
$('signOut').addEventListener('click',async()=>{lock();await signOut(auth).catch(failed);});
$('renewSession').addEventListener('click',()=>lock('Sign in again to renew your review session.','warning'));
$('refreshQueue').addEventListener('click',()=>loadQueue());$('loadMore').addEventListener('click',()=>loadQueue(true));
$('search').addEventListener('input',drawQueue);$('category').addEventListener('change',drawQueue);
$('viewIdentity').addEventListener('click',()=>viewEvidence('identity'));$('viewSelfie').addEventListener('click',()=>viewEvidence('selfie'));
$('reviewConfirmed').addEventListener('change',updateControls);
$('approveSeller').addEventListener('click',()=>decide('approved'));$('rejectSeller').addEventListener('click',()=>decide('rejected'));
$('requestPhoto').addEventListener('click',()=>decide('needs_new_photo'));
document.addEventListener('teyza-admin-view-change',clearViews);
document.addEventListener('visibilitychange',()=>{if(document.hidden){state.generation++;busy=false;clearViews();operations.hideSensitive();}});
window.addEventListener('pagehide',()=>{state.generation++;clearViews();operations.clear();});
setInterval(()=>{if(!authorised)return;const remaining=Math.max(0,Math.ceil((expiresAt-Date.now())/1000));
  if(!remaining){lock('Your private review session expired. Sign in again to continue.','warning');return;}
  set('sessionTime',`${Math.floor(remaining/60)}:${String(remaining%60).padStart(2,'0')} remaining`);updateControls();},1000);
try{await setPersistence(auth,browserSessionPersistence);}catch(_){notice('Your browser could not save this sign-in session. Allow site storage for teyza.co.za.','warning');}
onAuthStateChanged(auth,user=>{
  operations.clear();activeUser=user;state.account(user?.uid||null);busy=false;authorised=false;resetDetails();
  if(user)authorise(user);else{renewing=false;expiresAt=0;$('workspace').hidden=true;$('loginPanel').hidden=false;$('signOut').hidden=true;
    $('email').readOnly=false;set('accountEmail','Secure seller review');set('loginTitle','Welcome back');set('loginHint','Use your authorised administrator account.');}
});
