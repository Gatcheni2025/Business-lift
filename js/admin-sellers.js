import {onAuthStateChanged,signOut} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {auth} from "./firebase-config.js";

const box=document.querySelector('[data-sellers]');
const status=document.querySelector('[data-admin-status]');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function api(action,options={}){
  const token=await auth.currentUser.getIdToken();
  const r=await fetch('api/workspace.php?action='+action,{
    ...options,
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(options.headers||{})}
  });
  const d=await r.json();
  if(!r.ok||!d.ok)throw new Error(d.error||'Request failed');
  return d;
}

async function openVerificationFile(uid,type='proof'){
  const token=await auth.currentUser.getIdToken();
  const r=await fetch('api/verification-file.php?uid='+encodeURIComponent(uid)+'&type='+encodeURIComponent(type),{
    headers:{Authorization:'Bearer '+token}
  });
  if(!r.ok){
    const d=await r.json().catch(()=>({}));
    throw new Error(d.error||'Unable to open verification document');
  }
  const blob=await r.blob();
  const url=URL.createObjectURL(blob);
  window.open(url,'_blank','noopener');
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}

function approvalReady(v){
  return Boolean(v.phoneVerified&&v.identityVerified&&v.locationConfirmed&&v.proofOfAddressUploaded&&v.proofAddressMatchVerified);
}

function render(list){
  box.innerHTML=list.length?list.map(s=>{
    const b=s.business||{},a=s.companyApproval||{},v=s.verification||{},proof=v.proofOfAddress||{};
    const ready=approvalReady(v);
    const proofMatch=v.proofAddressMatchVerified?'Address matches ✓':v.proofAddressMatchStatus==='mismatch'?'Address mismatch':'Needs address review';
    const checklist=[
      ['Phone',v.phoneVerified],
      ['Identity',v.identityVerified],
      ['Map location',v.locationConfirmed],
      ['Proof uploaded',v.proofOfAddressUploaded],
      ['Proof matches map',v.proofAddressMatchVerified],
    ].map(([label,done])=>`<span class="review-chip ${done?'done':'pending'}">${done?'✓':'○'} ${esc(label)}</span>`).join('');
    return `<article class="seller-card">
      <div class="seller-main">
        <div class="seller-heading">
          ${b.logoUrl?`<img class="seller-logo" src="${esc(b.logoUrl)}" alt="">`:'<div class="seller-logo seller-logo-empty">T</div>'}
          <div><h2>${esc(b.businessName||'Unnamed business')}</h2><small>${esc(s.email||'')}</small></div>
        </div>
        <div class="seller-meta"><span class="pill">Profile ${b.profileComplete?'complete':'incomplete'}</span><span class="pill">Verification ${Number(v.completed||0)}/4</span><span class="pill approval-${esc(a.status||'pending')}">${esc(a.status||'pending')}</span></div>
        <div class="review-checklist">${checklist}</div>
        <div class="address-review">
          <div><span>Confirmed map address</span><strong>${esc(v.location?.address||b.address||'Not confirmed')}</strong></div>
          <div><span>Proof uploaded for</span><strong>${esc(proof.addressAtUpload||'Not uploaded')}</strong></div>
          <div><span>Address review</span><strong class="${v.proofAddressMatchVerified?'ok':v.proofAddressMatchStatus==='mismatch'?'bad':'wait'}">${esc(proofMatch)}</strong></div>
        </div>
        ${b.about?`<p class="seller-about">${esc(b.about)}</p>`:''}
        ${!ready?'<p class="approval-note">Company approval stays locked until phone, identity, map location and proof-of-address checks are complete.</p>':''}
      </div>
      <div class="seller-actions">
        ${v.proofOfAddressUploaded?`<button class="button" data-view-proof data-uid="${esc(s.uid)}">View proof of address</button><button class="button address-ok" data-address-match="true" data-uid="${esc(s.uid)}">✓ Address matches map</button><button class="button" data-address-match="false" data-uid="${esc(s.uid)}">Address mismatch</button>`:''}
        ${v.identitySubmitted&&!v.identityVerified?'<button class="button" data-identity-decision="verified" data-uid="'+esc(s.uid)+'">Verify identity</button><button class="button" data-identity-decision="rejected" data-uid="'+esc(s.uid)+'">Reject identity</button>':''}
        <button class="button button-primary" data-decision="approved" data-uid="${esc(s.uid)}" ${ready?'':'disabled title="Complete all verification checks first"'}>Approve seller</button>
        <button class="button" data-decision="rejected" data-uid="${esc(s.uid)}">Reject seller</button>
      </div>
    </article>`;
  }).join(''):'<p>No sellers found.</p>';
}

async function load(){
  try{const d=await api('admin-sellers');render(d.sellers||[])}
  catch(e){status.hidden=false;status.textContent=e.message;status.classList.add('error');box.textContent='';}
}

box.addEventListener('click',async e=>{
  const proof=e.target.closest('[data-view-proof]');
  if(proof){
    proof.disabled=true;
    try{await openVerificationFile(proof.dataset.uid,'proof')}catch(x){alert(x.message)}finally{proof.disabled=false}
    return;
  }
  const address=e.target.closest('[data-address-match]');
  if(address){
    const matches=address.dataset.addressMatch==='true';
    const note=matches?'':prompt('Reason the proof address does not match the map address:','')||'Address on proof does not match confirmed map address';
    address.disabled=true;
    try{await api('admin-address-proof',{method:'POST',body:JSON.stringify({uid:address.dataset.uid,matches,note})});await load()}catch(x){alert(x.message)}finally{address.disabled=false}
    return;
  }
  const identity=e.target.closest('[data-identity-decision]');
  if(identity){
    const note=identity.dataset.identityDecision==='rejected'?prompt('Reason identity verification was rejected:','')||'':'';
    identity.disabled=true;
    try{await api('admin-identity',{method:'POST',body:JSON.stringify({uid:identity.dataset.uid,status:identity.dataset.identityDecision,note})});await load()}catch(x){alert(x.message)}finally{identity.disabled=false}
    return;
  }
  const b=e.target.closest('[data-decision]');
  if(!b)return;
  const note=b.dataset.decision==='rejected'?prompt('Reason for rejection (optional):','')||'':'';
  b.disabled=true;
  try{await api('admin-approval',{method:'POST',body:JSON.stringify({uid:b.dataset.uid,status:b.dataset.decision,note})});await load()}catch(x){alert(x.message)}finally{b.disabled=false}
});

document.querySelector('[data-admin-logout]')?.addEventListener('click',async()=>{await signOut(auth);location.replace('admin-login.html')});
onAuthStateChanged(auth,u=>{if(!u)location.replace('admin-login.html');else load()});
