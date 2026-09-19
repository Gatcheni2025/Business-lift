import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {auth} from "./firebase-config.js";
import {getWorkspaceSummary,workspaceError} from "./business-context.js";

const form=document.querySelector('[data-product-form]');
const statusNode=document.querySelector('[data-product-status]');
const tableBody=document.querySelector('[data-products-table-body]');
const money=new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR'});
let currentUser=null,currentStep=1;

function safe(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function showStatus(m,t='error'){if(statusNode){statusNode.hidden=false;statusNode.textContent=m;statusNode.className='form-status '+t}}
function go(step){
 currentStep=step;
 document.querySelectorAll('[data-step]').forEach(x=>x.classList.toggle('active',Number(x.dataset.step)===step));
 document.querySelectorAll('[data-step-indicator]').forEach(x=>{const n=Number(x.dataset.stepIndicator);x.classList.toggle('active',n===step);x.classList.toggle('done',n<step)});
 window.scrollTo({top:0,behavior:'smooth'});
}
function validateStep1(){
 const required=['name','sku','category','price','stock','description'];
 for(const n of required){const el=form.elements[n];if(!el?.value?.trim?.() && el?.value!==0){el?.focus();showStatus('Please complete all required product information.');return false}}
 const files=form.elements.images?.files;if(!files?.length){showStatus('Please add at least one product image.');return false}
 return true;
}
function selectedChannels(){return [...form.querySelectorAll('input[name="channels[]"]:checked')].map(x=>x.value)}
function buildPreview(){
 document.querySelector('[data-preview-name]').textContent=form.elements.name.value;
 document.querySelector('[data-preview-price]').textContent=money.format(Number(form.elements.price.value||0));
 document.querySelector('[data-preview-description]').textContent=form.elements.description.value;
 document.querySelector('[data-preview-category]').textContent=form.elements.category.value;
 document.querySelector('[data-preview-stock]').textContent=form.elements.stock.value;
 const channels=selectedChannels();document.querySelector('[data-preview-channels]').innerHTML=channels.map(c=>'<span class="pill">'+safe(c.charAt(0).toUpperCase()+c.slice(1))+'</span>').join('');
 const file=form.elements.images.files[0];if(file){const img=document.createElement('img');img.src=URL.createObjectURL(file);const box=document.querySelector('[data-preview-image]');box.innerHTML='';box.appendChild(img)}
}
document.querySelectorAll('[data-next]').forEach(b=>b.addEventListener('click',()=>{const n=Number(b.dataset.next);if(currentStep===1&&!validateStep1())return;if(currentStep===2&&!selectedChannels().length){showStatus('Select at least one selling platform.');return}if(n===3)buildPreview();go(n)}));
document.querySelectorAll('[data-back]').forEach(b=>b.addEventListener('click',()=>go(Number(b.dataset.back))));
document.querySelectorAll('.channel-card input').forEach(input=>input.addEventListener('change',()=>input.closest('.channel-card').classList.toggle('selected',input.checked)));
form?.elements.images?.addEventListener('change',e=>{const box=document.querySelector('[data-image-preview]');box.innerHTML='';[...e.target.files].forEach(file=>{const img=document.createElement('img');img.src=URL.createObjectURL(file);box.appendChild(img)})});

function render(products=[]){
 if(!tableBody)return;
 tableBody.innerHTML=products.length?products.slice().reverse().map(p=>`<tr><td><strong>${safe(p.name)}</strong>${p.images?.[0]?`<br><img src="${safe(p.images[0])}" alt="" style="width:48px;height:48px;object-fit:cover;border-radius:8px;margin-top:7px">`:''}</td><td>${safe(p.sku||'-')}</td><td>${money.format(Number(p.price||0))}</td><td>${Number(p.stock||0)}</td><td>${(p.channels||[]).map(c=>'<span class="pill">'+safe(c)+'</span>').join(' ')||'—'}</td><td><span class="status-pill ${p.verificationStatus==='pending'?'status-pending':''}">${safe(p.verificationStatus||'Pending')}</span></td></tr>`).join(''):'<tr><td colspan="6">No products yet. Add your first product above.</td></tr>';
}
async function refresh(){const s=await getWorkspaceSummary(currentUser);render(s.products||[])}

form?.addEventListener('submit',async e=>{
 e.preventDefault();if(!currentUser)return;if(!validateStep1()||!selectedChannels().length)return;
 const b=form.querySelector('[type=submit]'),fd=new FormData(form);fd.set('desc',String(fd.get('description')||''));fd.set('channels',JSON.stringify(selectedChannels()));fd.set('verificationStatus','pending');
 b.disabled=true;b.textContent='Submitting…';
 try{
  const token=await currentUser.getIdToken();
  const r=await fetch('upload_product.php',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:fd});
  const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'Unable to submit product.');
  showStatus('Product submitted. Verification status: Pending.','success');await refresh();form.reset();document.querySelector('[data-image-preview]').innerHTML='';setTimeout(()=>go(1),1200);
 }catch(x){showStatus(workspaceError(x,'submit your product'))}finally{b.disabled=false;b.textContent='Submit for verification'}
});
onAuthStateChanged(auth,user=>{if(!user){location.href='index.html?auth=login';return}currentUser=user;refresh().catch(e=>showStatus(workspaceError(e)))});
