import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {auth} from "./firebase-config.js";
import {getWorkspaceSummary,workspaceError} from "./business-context.js";

const form=document.querySelector('[data-product-form]');
const statusNode=document.querySelector('[data-product-status]');
const tableBody=document.querySelector('[data-products-table-body]');
const money=new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR'});
let currentUser=null,currentStep=1,stagedImages=[],loadedProducts=[];

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
function updateTargetSummary(){const area=form.elements.targetArea?.value||'';const pop=Number(form.elements.targetPopulation?.value||50000).toLocaleString('en-ZA');const gender=form.elements.targetGender?.selectedOptions?.[0]?.textContent||'All genders';const node=document.querySelector('[data-target-summary]');if(node)node.innerHTML=area?`<strong>Selling from:</strong> ${safe(area)} · <strong>Target:</strong> ${pop} people · <strong>Audience:</strong> ${safe(gender)}`:'Detect your location to set the centre of your selling area.'}
function reachPrice(pop){if(pop<=50000)return 0;if(pop<=100000)return 50;if(pop<=250000)return 100;if(pop<=500000)return 200;return 350}
function updatePopulation(){const v=Number(form.elements.targetPopulation?.value||50000),price=reachPrice(v);const n=document.querySelector('[data-population-value]');if(n)n.textContent=v.toLocaleString('en-ZA')+' people';const p=document.querySelector('[data-reach-price]'),label=document.querySelector('[data-plan-label]'),note=document.querySelector('[data-price-note]');if(p)p.textContent=price===0?'R0 · Free':'R'+price;if(label)label.innerHTML=price===0?'Base reach <span class="free-badge">FREE</span>':'Expanded reach';if(note)note.textContent=price===0?'Up to 50,000 target population':v.toLocaleString('en-ZA')+' target population';updateTargetSummary()}
async function reverseGeocode(lat,lng){try{const r=await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}`,{headers:{Accept:'application/json'}});const d=await r.json();const a=d.address||{};return [a.suburb||a.city_district||a.city||a.town||a.village,a.state,a.country].filter(Boolean).join(', ')||d.display_name||'Current location'}catch{return 'Current location'}}
async function detectLocation(){const button=document.querySelector('[data-detect-location]'),label=document.querySelector('[data-location-label]'),help=document.querySelector('[data-location-help]'),coords=document.querySelector('[data-location-coords]');if(!navigator.geolocation){help.textContent='Location is not supported by this browser.';return}button.disabled=true;button.textContent='Finding location…';navigator.geolocation.getCurrentPosition(async p=>{const lat=p.coords.latitude,lng=p.coords.longitude;const area=await reverseGeocode(lat,lng);form.elements.targetArea.value=area;form.elements.targetLat.value=lat.toFixed(6);form.elements.targetLng.value=lng.toFixed(6);label.textContent=area;help.textContent='Location detected from this device.';if(coords)coords.textContent=`GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)} · accuracy ±${Math.round(p.coords.accuracy)}m`;button.textContent='Refresh location';button.disabled=false;updateTargetSummary()},()=>{label.textContent='Location permission needed';help.textContent='Allow location access in your browser, then try again.';button.textContent='Try location again';button.disabled=false},{enableHighAccuracy:true,timeout:12000,maximumAge:300000})}
document.querySelector('[data-detect-location]')?.addEventListener('click',detectLocation);form?.elements.targetPopulation?.addEventListener('input',updatePopulation);form?.elements.targetGender?.addEventListener('change',updateTargetSummary);updatePopulation();
async function compressImage(file){
 return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{try{const max=1600,scale=Math.min(1,max/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);canvas.toBlob(blob=>{URL.revokeObjectURL(url);blob?resolve(new File([blob],file.name.replace(/\.[^.]+$/,'.jpg'),{type:'image/jpeg'})):reject(new Error('Unable to compress an image.'))},'image/jpeg',.82)}catch(e){reject(e)}};img.onerror=()=>reject(new Error('One selected image could not be read.'));img.src=url})
}
async function prepareAndUploadImages(button){
 const files=[...(form.elements.images?.files||[])];if(!files.length)throw new Error('Please add at least one product image.');
 const progress=document.querySelector('[data-upload-progress]'),bar=document.querySelector('[data-upload-bar]'),label=document.querySelector('[data-upload-text]');progress.hidden=false;button.disabled=true;
 label.textContent='Compressing images…';bar.style.width='12%';
 const compressed=[];for(let i=0;i<files.length;i++){compressed.push(await compressImage(files[i]));bar.style.width=(12+Math.round(((i+1)/files.length)*38))+'%';label.textContent=`Compressing image ${i+1} of ${files.length}…`}
 label.textContent='Uploading images securely…';bar.style.width='58%';
 const fd=new FormData();compressed.forEach(f=>fd.append('images[]',f,f.name));const token=await currentUser.getIdToken();
 const r=await fetch('upload_images.php',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:fd});const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)throw new Error(d.error||'Image upload failed.');
 stagedImages=d.images||[];bar.style.width='100%';label.textContent=`✓ ${stagedImages.length} image${stagedImages.length===1?'':'s'} compressed and uploaded`;return stagedImages;
}
function buildPreview(){
 document.querySelector('[data-preview-name]').textContent=form.elements.name.value;
 document.querySelector('[data-preview-price]').textContent=money.format(Number(form.elements.price.value||0));
 document.querySelector('[data-preview-description]').textContent=form.elements.description.value;
 document.querySelector('[data-preview-category]').textContent=form.elements.category.value;
 document.querySelector('[data-preview-stock]').textContent=form.elements.stock.value;
 const pop=Number(form.elements.targetPopulation.value||50000),fee=reachPrice(pop);document.querySelector('[data-preview-population]').textContent=pop.toLocaleString('en-ZA')+' people';document.querySelector('[data-preview-reach-price]').textContent=fee===0?'R0 · Free':'R'+fee;
 const channels=selectedChannels();document.querySelector('[data-preview-channels]').innerHTML=channels.map(c=>'<span class="pill">'+safe(c.charAt(0).toUpperCase()+c.slice(1))+'</span>').join('');
 const file=form.elements.images.files[0];if(file){const img=document.createElement('img');img.src=URL.createObjectURL(file);const box=document.querySelector('[data-preview-image]');box.innerHTML='';box.appendChild(img)}
}
document.querySelectorAll('[data-next]').forEach(b=>b.addEventListener('click',async()=>{const n=Number(b.dataset.next);if(currentStep===1){if(!validateStep1())return;const original=b.textContent;try{b.textContent='Preparing images…';await prepareAndUploadImages(b);b.textContent='Images uploaded ✓';setTimeout(()=>{b.disabled=false;b.textContent=original;go(n)},350)}catch(e){b.disabled=false;b.textContent=original;showStatus(e.message||'Unable to prepare images. Please try again.')}return}if(currentStep===2&&!form.elements.targetArea?.value?.trim()){showStatus('Use your device location before continuing.');document.querySelector('[data-detect-location]')?.focus();return}if(currentStep===2&&!selectedChannels().length){showStatus('Select at least one selling platform.');return}if(n===3)buildPreview();go(n)}));
document.querySelectorAll('[data-back]').forEach(b=>b.addEventListener('click',()=>go(Number(b.dataset.back))));
document.querySelectorAll('.channel-card input').forEach(input=>input.addEventListener('change',()=>input.closest('.channel-card').classList.toggle('selected',input.checked)));
form?.elements.images?.addEventListener('change',e=>{stagedImages=[];const progress=document.querySelector('[data-upload-progress]');if(progress)progress.hidden=true;const box=document.querySelector('[data-image-preview]');box.innerHTML='';[...e.target.files].forEach(file=>{const img=document.createElement('img');img.src=URL.createObjectURL(file);box.appendChild(img)})});

function render(products=[]){
 loadedProducts=products;if(!tableBody)return;
 tableBody.innerHTML=products.length?products.slice().reverse().map(p=>`<tr><td><strong>${safe(p.name)}</strong>${p.images?.[0]?`<br><img src="${safe(p.images[0])}" alt="" style="width:48px;height:48px;object-fit:cover;border-radius:8px;margin-top:7px">`:''}</td><td>${safe(p.sku||'-')}</td><td>${money.format(Number(p.price||0))}</td><td>${Number(p.stock||0)}</td><td>${(p.channels||[]).map(c=>'<span class="pill">'+safe(c)+'</span>').join(' ')||'—'}</td><td><span class="status-pill ${p.verificationStatus==='pending'?'status-pending':''}">${safe(p.verificationStatus||'Pending')}</span></td><td><button class="button" type="button" data-view-product="${safe(p.id)}">View</button></td></tr>`).join(''):'<tr><td colspan="7">No products yet. Add your first product above.</td></tr>';
}
function openProduct(id){const p=loadedProducts.find(x=>x.id===id);if(!p)return;const detail=document.querySelector('[data-product-detail]');detail.innerHTML=`${p.images?.[0]?`<img src="${safe(p.images[0])}" alt="${safe(p.name)}">`:''}<span class="status-pill status-pending" style="display:inline-block;margin-top:15px">${safe(p.verificationStatus||'Pending')}</span><h2>${safe(p.name)}</h2><div class="preview-price">${money.format(Number(p.price||0))}</div><p>${safe(p.desc||'')}</p><p><b>SKU:</b> ${safe(p.sku||'-')} · <b>Stock:</b> ${Number(p.stock||0)}</p><p><b>Selling area:</b> ${safe(p.targetArea||'Not set')}</p><p><b>Target population:</b> ${Number(p.targetPopulation||0).toLocaleString('en-ZA')}</p><p><b>Reach fee:</b> ${Number(p.reachFee||0)===0?'Free':'R'+Number(p.reachFee)}</p><p><b>Channels:</b> ${(p.channels||[]).map(safe).join(', ')||'—'}</p>`;document.querySelector('[data-product-modal]').classList.add('show')}
tableBody?.addEventListener('click',e=>{const b=e.target.closest('[data-view-product]');if(b)openProduct(b.dataset.viewProduct)});
document.querySelector('[data-close-product]')?.addEventListener('click',()=>document.querySelector('[data-product-modal]').classList.remove('show'));document.querySelector('[data-product-modal]')?.addEventListener('click',e=>{if(e.target.matches('[data-product-modal]'))e.currentTarget.classList.remove('show')});
async function refresh(){const s=await getWorkspaceSummary(currentUser);render(s.products||[])}

form?.addEventListener('submit',async e=>{
 e.preventDefault();if(!currentUser)return;if(!validateStep1()||!selectedChannels().length)return;
 const b=form.querySelector('[type=submit]'),fd=new FormData(form);fd.set('desc',String(fd.get('description')||''));fd.set('channels',JSON.stringify(selectedChannels()));fd.set('verificationStatus','pending');fd.set('reachFee',String(reachPrice(Number(form.elements.targetPopulation.value||50000))));fd.set('stagedImages',JSON.stringify(stagedImages));fd.delete('images');
 b.disabled=true;b.textContent='Submitting…';
 try{
  const token=await currentUser.getIdToken();
  const r=await fetch('upload_product.php',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:fd});
  const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'Unable to submit product.');
  await refresh();document.querySelectorAll('[data-step]').forEach(x=>x.classList.remove('active'));document.querySelector('.wizard-head').style.display='none';document.querySelector('[data-submit-success]').classList.add('show');document.querySelector('[data-success-message]').textContent=`${d.product?.name||'Your product'} has been submitted successfully and is now Pending verification.`;
 }catch(x){showStatus(workspaceError(x,'submit your product'))}finally{b.disabled=false;b.textContent='Submit for verification'}
});
onAuthStateChanged(auth,user=>{if(!user){location.href='index.html?auth=login';return}currentUser=user;refresh().catch(e=>showStatus(workspaceError(e)))});

document.querySelector('[data-add-new]')?.addEventListener('click',()=>{form.reset();stagedImages=[];document.querySelector('[data-image-preview]').innerHTML='';document.querySelector('[data-upload-progress]').hidden=true;document.querySelector('[data-submit-success]').classList.remove('show');document.querySelector('.wizard-head').style.display='block';document.querySelector('[data-location-label]').textContent='Location not detected yet';document.querySelector('[data-location-help]').textContent='Allow location access when your browser asks.';const coords=document.querySelector('[data-location-coords]');if(coords)coords.textContent='';currentStep=1;updatePopulation();go(1)});
