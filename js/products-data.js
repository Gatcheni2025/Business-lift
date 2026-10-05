import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {auth} from "./firebase-config.js";
import {getBusinessContext,getWorkspaceSummary,getWorkspaceSection,workspaceError} from "./business-context.js";

const API_BASE=location.hostname.endsWith(".vercel.app")?"/backend":"api";
const ROOT_BACKEND=location.hostname.endsWith(".vercel.app")?"/root-backend":".";
const form=document.querySelector('[data-product-form]');
const statusNode=document.querySelector('[data-product-status]');
const tableBody=document.querySelector('[data-products-table-body]');
const money=new Intl.NumberFormat('en-ZA',{style:'currency',currency:'ZAR'});
const FUNCTIONS_BASE_URL='https://us-central1-business-lift-3c19c.cloudfunctions.net';

async function callFunction(name,payload={}){
 const user=auth.currentUser;
 if(!user)throw new Error('You must be signed in to load selling channels.');
 const token=await user.getIdToken();
 const response=await fetch(`${FUNCTIONS_BASE_URL}/${name}`,{
  method:'POST',
  headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},
  body:JSON.stringify({data:payload})
 });
 const body=await response.json().catch(()=>({}));
 if(!response.ok||body.error){
  const error=new Error(body?.error?.message||body?.message||`Unable to call ${name}.`);
  error.code=body?.error?.status||body?.error?.code||`http-${response.status}`;
  throw error;
 }
 return {data:body.data??body.result??body};
}
const getConnections=(payload)=>callFunction('getChannelConnections',payload);
const getProviderPerformance=(payload)=>callFunction('getProductPerformance',payload);
let currentUser=null,currentStep=1,stagedImages=[],loadedProducts=[],businessId='',sellingMap=null,sellingMarker=null,editingProductId='';
let sellerReady=false;
function syncProductView(){
 const adding=location.hash==='#new-product';
 document.querySelector('[data-product-catalog]').hidden=adding;
 document.querySelector('[data-product-workspace]').hidden=!adding||!sellerReady;
 document.querySelector('[data-readiness-gate]').hidden=!adding||sellerReady;
 document.title=adding?'Sell | Teyza':'Products | Teyza';
}
window.addEventListener('hashchange',syncProductView);
syncProductView();
const channelLabels={teyza:'Teyza Store',facebook:'Facebook',instagram:'Instagram',x:'X',youtube:'YouTube',whatsapp:'WhatsApp Business',tiktok:'TikTok',google:'Google Shopping'};

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
 const files=form.elements.images?.files;if(!editingProductId&&(!files||files.length<2)){showStatus('Please add at least 2 product images from different angles.');return false}
 return true;
}
function selectedChannels(){return [...productSellingChannels]}
function channelLabel(c){return channelLabels[c]||c}
let savedSellingSetup={delivery:{},audience:{},channels:new Set(["teyza"])};
let connectedSellingChannels=new Set(["teyza"]);
let productSellingChannels=new Set(["teyza"]);
let sellingSelectionInitialized=false;
let productDelivery={method:"Delivery",provider:"",fee:0,address:""};
let productSellingAreas=[];

async function loadConnectedChannels(){
 const connected=new Set(["teyza"]);
 try{
  const response=await getConnections({businessId}),state=response.data||{};
  if(state.meta?.connected)connected.add("facebook");
  if(state.meta?.connected&&state.meta?.instagramBusinessId)connected.add("instagram");
  if(state.google?.connected)connected.add("google");
  if(state.whatsapp?.connected)connected.add("whatsapp");
  if(state.x?.connected||state.twitter?.connected)connected.add("x");
  if(state.youtube?.connected)connected.add("youtube");
  if(state.tiktok?.connected)connected.add("tiktok");
  const flat=state.connectedChannels||state.channels||[];
  if(Array.isArray(flat))flat.forEach(item=>{
   const key=String(typeof item==="string"?item:(item?.id||item?.channel||item?.name||"")).toLowerCase();
   if(["facebook","instagram","google","whatsapp","x","youtube","tiktok"].includes(key))connected.add(key);
   if(key==="twitter")connected.add("x");
  });
 }catch(error){console.warn("Unable to load external channel status:",error)}
 connectedSellingChannels=connected;
 savedSellingSetup.channels=new Set(connected);

 /*
  * A new product starts with currently connected channels selected.
  * After the seller edits the selling list, refreshing connection status
  * must not remove channels they deliberately added for later connection.
  */
 if(!sellingSelectionInitialized){
  productSellingChannels=new Set(connected);
  productSellingChannels.add("teyza");
  sellingSelectionInitialized=true;
 }

 document.querySelectorAll('input[name="channels[]"]').forEach(
  x=>x.checked=productSellingChannels.has(x.value)
 );
 renderConfirmedChannels();
 return connected;
}

function renderConfirmedChannels(){
 const list=document.querySelector("[data-confirm-channels]");
 if(!list)return;

 list.innerHTML=[...productSellingChannels].map(channel=>{
  const connected=connectedSellingChannels.has(channel);
  const locked=channel==="teyza";
  const cls=locked||connected?"is-connected":"is-selling-list";
  const prefix=locked||connected?"✓":"+";
  const suffix=locked||connected?"":" · connect later";
  return `<span class="${cls}">${prefix} ${safe(channelLabel(channel))}${suffix}</span>`;
 }).join("");
}

function openSellingChannelEditor(){
 const modal=document.querySelector("[data-selling-channel-modal]");
 const options=document.querySelector("[data-selling-channel-options]");
 if(!modal||!options)return;

 const order=["teyza","facebook","instagram","whatsapp","google","x","youtube","tiktok"];

 options.innerHTML=order.map(channel=>{
  const connected=connectedSellingChannels.has(channel);
  const selected=productSellingChannels.has(channel);
  const locked=channel==="teyza";

  const detail=locked
   ?"Included automatically"
   :connected
    ?"Connected and ready when the product is approved."
    :"Not connected. You can still add it to this product's selling list and connect the account later.";

  const badge=locked
   ?"Always on"
   :connected
    ?"Available"
    :selected
     ?"Added · connect later"
     :"Add to selling list";

  const rowClass=locked||connected
   ?"is-connected"
   :selected
    ?"is-selling-list"
    :"is-pending-channel";

  return `<label class="selling-channel-option ${rowClass}" data-channel-option="${safe(channel)}">
   <span class="selling-channel-check">
    <input type="checkbox" value="${safe(channel)}" ${selected?"checked":""} ${locked?"disabled":""}>
   </span>
   <span class="selling-channel-option-copy">
    <strong>${safe(channelLabel(channel))}</strong>
    <small>${safe(detail)}</small>
   </span>
   <span class="selling-channel-state" data-channel-state>
    ${safe(badge)}
   </span>
  </label>`;
 }).join("");

 options.querySelectorAll('input[type="checkbox"]:not(:disabled)').forEach(input=>{
  input.addEventListener("change",()=>{
   const channel=input.value;
   const row=input.closest("[data-channel-option]");
   const badge=row?.querySelector("[data-channel-state]");
   const connected=connectedSellingChannels.has(channel);

   row?.classList.toggle("is-selling-list",!connected&&input.checked);
   row?.classList.toggle("is-pending-channel",!connected&&!input.checked);

   if(badge&&!connected){
    badge.textContent=input.checked
     ?"Added · connect later"
     :"Add to selling list";
   }
  });
 });

 modal.hidden=false;
 document.body.classList.add("selling-channel-modal-open");
}

function closeSellingChannelEditor(){
 const modal=document.querySelector("[data-selling-channel-modal]");
 if(modal)modal.hidden=true;
 document.body.classList.remove("selling-channel-modal-open");
}

document.querySelector("[data-edit-selling]")?.addEventListener("click",openSellingChannelEditor);
document.querySelector("[data-close-selling-channels]")?.addEventListener("click",closeSellingChannelEditor);
document.querySelector("[data-cancel-selling-channels]")?.addEventListener("click",closeSellingChannelEditor);
document.querySelector("[data-selling-channel-modal]")?.addEventListener("click",e=>{if(e.target===e.currentTarget)closeSellingChannelEditor()});
document.querySelector("[data-save-selling-channels]")?.addEventListener("click",()=>{
 const modal=document.querySelector("[data-selling-channel-modal]");
 const next=new Set(["teyza"]);
 modal?.querySelectorAll('input[type="checkbox"]:checked').forEach(input=>next.add(input.value));
 productSellingChannels=next;
 sellingSelectionInitialized=true;
 document.querySelectorAll('input[name="channels[]"]').forEach(x=>x.checked=next.has(x.value));
 renderConfirmedChannels();
 closeSellingChannelEditor();
});

async function loadSavedSellingSetup(){
 const [delivery,audience]=await Promise.all([
  getWorkspaceSection(currentUser,"delivery").catch(()=>({})),
  getWorkspaceSection(currentUser,"audience").catch(()=>({}))
 ]);
 savedSellingSetup.delivery=delivery||{};savedSellingSetup.audience=audience||{};
 const area=String(audience?.targetArea||audience?.area||delivery?.pickupAddress||delivery?.address||"").trim();
 const lat=audience?.targetLat??audience?.lat??delivery?.pickupLocation?.lat??delivery?.latitude??"";
 const lng=audience?.targetLng??audience?.lng??delivery?.pickupLocation?.lng??delivery?.longitude??"";
 const population=Number(audience?.targetPopulation||50000),gender=String(audience?.targetGender||"all");
 form.elements.targetArea.value=area;form.elements.targetLat.value=lat;form.elements.targetLng.value=lng;
 form.elements.targetPopulation.value=population;form.elements.targetGender.value=gender;
 const method=String(delivery?.method||delivery?.deliveryMethod||"Delivery"),provider=String(delivery?.provider||delivery?.preferredProvider||"");
 const fee=Number(delivery?.baseDeliveryFee??delivery?.standardDeliveryFee??delivery?.deliveryFee??0);
 productDelivery={method,provider,fee,address:String(delivery?.pickupAddress||delivery?.address||area||"")};
 form.elements.deliveryMethod.value=method;
 form.elements.deliveryProvider.value=provider;
 form.elements.deliveryFee.value=String(fee);
 document.querySelector("[data-confirm-area]").textContent=area||"Saved business selling area";
 document.querySelector("[data-confirm-audience]").textContent=`Target: ${population.toLocaleString("en-ZA")} people${gender!=="all"?" · "+gender:""}`;
 document.querySelector("[data-confirm-delivery]").textContent=[method,provider].filter(Boolean).join(" · ")||"Saved delivery setup";
 document.querySelector("[data-confirm-delivery-address]").textContent=String(delivery?.pickupAddress||delivery?.address||area||"");
 document.querySelector("[data-confirm-delivery-fee]").textContent=fee>0?money.format(fee):"Free / R0";
 const feeNote=document.querySelector("[data-confirm-delivery-fee-note]");if(feeNote)feeNote.textContent=fee>0?"Customer delivery charge for this product.":"Free delivery for this product.";
 document.querySelector("[data-review-area]").textContent=area||"Saved selling area";
 document.querySelector("[data-review-delivery]").textContent=[method,provider].filter(Boolean).join(" · ")||"Saved delivery setup";
}



function syncSellingAreas(){
 const primary=String(form.elements.targetArea?.value||"").trim();
 const all=[primary,...productSellingAreas.map(x=>x.name)].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i);
 form.elements.sellingAreas.value=JSON.stringify(all);
 const box=document.querySelector("[data-selling-area-list]");
 if(box)box.innerHTML=productSellingAreas.map((area,index)=>`<span class="selling-area-chip">${safe(area.name)} <button type="button" data-remove-area="${index}" aria-label="Remove ${safe(area.name)}">×</button></span>`).join("");
}
document.querySelector("[data-selling-area-list]")?.addEventListener("click",e=>{
 const b=e.target.closest("[data-remove-area]");if(!b)return;
 productSellingAreas.splice(Number(b.dataset.removeArea),1);syncSellingAreas();
});
function openAreaEditor(){
 const modal=document.querySelector("[data-area-editor]");if(!modal)return;
 modal.hidden=false;document.body.classList.add("selling-channel-modal-open");
 const input=modal.querySelector("[data-area-search]");input.value="";
 modal.querySelector("[data-area-search-results]").innerHTML="";
 setTimeout(()=>input.focus(),50);
}
function closeAreaEditor(){const m=document.querySelector("[data-area-editor]");if(m)m.hidden=true;document.body.classList.remove("selling-channel-modal-open")}
document.querySelector("[data-add-selling-area]")?.addEventListener("click",openAreaEditor);
document.querySelector("[data-close-area-editor]")?.addEventListener("click",closeAreaEditor);
document.querySelector("[data-cancel-area-editor]")?.addEventListener("click",closeAreaEditor);
document.querySelector("[data-area-editor]")?.addEventListener("click",e=>{if(e.target===e.currentTarget)closeAreaEditor()});
let areaSearchTimer;
document.querySelector("[data-area-search]")?.addEventListener("input",e=>{
 clearTimeout(areaSearchTimer);const q=e.target.value.trim(),results=document.querySelector("[data-area-search-results]");
 if(q.length<3){results.innerHTML="";return}
 areaSearchTimer=setTimeout(async()=>{
  results.innerHTML='<p class="area-searching">Searching…</p>';
  try{
   const r=await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6`);
   const d=await r.json(),features=d.features||[];
   results.innerHTML=features.map((f,i)=>{
    const p=f.properties||{},name=[p.name,p.city||p.district,p.state,p.country].filter(Boolean).filter((v,k,a)=>a.indexOf(v)===k).join(", ");
    return `<button type="button" class="area-result" data-area-result="${i}"><strong>${safe(name||q)}</strong><small>${safe(p.osm_value||"Area")}</small></button>`;
   }).join("")||'<p class="area-searching">No matching areas found.</p>';
   results.querySelectorAll("[data-area-result]").forEach(btn=>btn.addEventListener("click",()=>{
    const f=features[Number(btn.dataset.areaResult)],p=f.properties||{},coords=f.geometry?.coordinates||[];
    const name=[p.name,p.city||p.district,p.state,p.country].filter(Boolean).filter((v,k,a)=>a.indexOf(v)===k).join(", ")||q;
    if(!productSellingAreas.some(x=>x.name===name))productSellingAreas.push({name,lng:Number(coords[0]||0),lat:Number(coords[1]||0)});
    syncSellingAreas();closeAreaEditor();
   }));
  }catch(_){results.innerHTML='<p class="area-searching">Unable to search areas right now.</p>'}
 },350);
});

async function reverseGeocode(lat,lng){
 try{
  const url=`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&zoom=14&addressdetails=1`;
  const response=await fetch(url,{headers:{"Accept":"application/json"}});
  if(!response.ok)throw new Error("Reverse geocoding failed");
  const data=await response.json();
  const a=data.address||{};
  return [a.suburb||a.neighbourhood||a.city_district,a.city||a.town||a.village,a.state].filter(Boolean).filter((v,i,arr)=>arr.indexOf(v)===i).join(", ")||data.display_name||`${lat.toFixed(5)}, ${lng.toFixed(5)}`;
 }catch(_){return `${lat.toFixed(5)}, ${lng.toFixed(5)}`}
}

async function detectCurrentSellingArea(){
 const button=document.querySelector("[data-detect-selling-area]");
 const areaNode=document.querySelector("[data-confirm-area]");
 const note=document.querySelector("[data-confirm-audience]");
 if(!navigator.geolocation){if(note)note.textContent="Location is not supported by this browser.";return}
 const old=button?.textContent;if(button){button.disabled=true;button.textContent="Detecting…"}
 if(areaNode)areaNode.textContent="Detecting current location…";
 navigator.geolocation.getCurrentPosition(async pos=>{
  const lat=pos.coords.latitude,lng=pos.coords.longitude;
  const label=await reverseGeocode(lat,lng);
  form.elements.targetArea.value=label;form.elements.targetLat.value=String(lat);form.elements.targetLng.value=String(lng);
  if(areaNode)areaNode.textContent=label;
  if(note)note.textContent="Current location detected from this device.";syncSellingAreas();
  if(button){button.disabled=false;button.textContent=old||"Refresh location"}
 },error=>{
  const fallback=form.elements.targetArea.value||savedSellingSetup.audience?.targetArea||productDelivery.address||"Saved business selling area";
  if(areaNode)areaNode.textContent=fallback;
  if(note)note.textContent=error.code===1?"Location permission was not granted. Using your saved seller location.":"Unable to detect current location. Using your saved seller location.";
  if(button){button.disabled=false;button.textContent=old||"Use current location"}
 },{enableHighAccuracy:true,timeout:12000,maximumAge:60000});
}

function renderProductDelivery(){
 const label=[productDelivery.method,productDelivery.provider].filter(Boolean).join(" · ")||"Delivery";
 document.querySelector("[data-confirm-delivery]").textContent=label;
 document.querySelector("[data-confirm-delivery-address]").textContent=productDelivery.address||form.elements.targetArea.value||"";
 document.querySelector("[data-confirm-delivery-fee]").textContent=productDelivery.fee>0?money.format(productDelivery.fee):"Free / R0";
 const note=document.querySelector("[data-confirm-delivery-fee-note]");if(note)note.textContent=productDelivery.fee>0?"Customer delivery charge for this product.":"Free delivery for this product.";
 form.elements.deliveryMethod.value=productDelivery.method;form.elements.deliveryProvider.value=productDelivery.provider;form.elements.deliveryFee.value=String(productDelivery.fee);
}

function openDeliveryEditor(focusFee=false){
 const modal=document.querySelector("[data-delivery-editor]");if(!modal)return;
 modal.querySelector("[data-delivery-method]").value=productDelivery.method||"Delivery";
 modal.querySelector("[data-delivery-provider]").value=productDelivery.provider||"";
 modal.querySelector("[data-delivery-fee]").value=String(productDelivery.fee||0);
 modal.hidden=false;document.body.classList.add("selling-channel-modal-open");
 if(focusFee)setTimeout(()=>modal.querySelector("[data-delivery-fee]")?.focus(),50);
}
function closeDeliveryEditor(){const modal=document.querySelector("[data-delivery-editor]");if(modal)modal.hidden=true;document.body.classList.remove("selling-channel-modal-open")}
document.querySelector("[data-edit-delivery]")?.addEventListener("click",()=>openDeliveryEditor(false));
document.querySelector("[data-edit-delivery-fee]")?.addEventListener("click",()=>openDeliveryEditor(true));
document.querySelector("[data-close-delivery-editor]")?.addEventListener("click",closeDeliveryEditor);
document.querySelector("[data-cancel-delivery-editor]")?.addEventListener("click",closeDeliveryEditor);
document.querySelector("[data-delivery-editor]")?.addEventListener("click",e=>{if(e.target===e.currentTarget)closeDeliveryEditor()});
document.querySelector("[data-save-delivery-editor]")?.addEventListener("click",()=>{
 const modal=document.querySelector("[data-delivery-editor]");
 productDelivery.method=modal.querySelector("[data-delivery-method]").value;
 productDelivery.provider=modal.querySelector("[data-delivery-provider]").value.trim();
 productDelivery.fee=Math.max(0,Number(modal.querySelector("[data-delivery-fee]").value||0));
 renderProductDelivery();closeDeliveryEditor();
});
document.querySelector("[data-detect-selling-area]")?.addEventListener("click",detectCurrentSellingArea);

function reachPrice(population=Number(form.elements.targetPopulation?.value||5000)){
 return Math.max(0,Math.ceil((Math.max(5000,population)-5000)/1000))*20;
}
function updateReach(){
 const slider=form.elements.targetPopulation;if(!slider)return;
 const population=Math.max(5000,Number(slider.value||5000)),fee=reachPrice(population);
 document.querySelector("[data-reach-value]")?.replaceChildren(document.createTextNode(population.toLocaleString("en-ZA")+" people"));
 document.querySelector("[data-reach-cost]")?.replaceChildren(document.createTextNode(fee?money.format(fee):"Included"));
 const reviewReach=document.querySelector("[data-review-reach]");if(reviewReach)reviewReach.textContent=population.toLocaleString("en-ZA")+" people";
 const reviewFee=document.querySelector("[data-review-reach-fee]");if(reviewFee)reviewFee.textContent=fee?money.format(fee):"Included";
}
form.elements.targetPopulation?.addEventListener("input",updateReach);
function updatePopulation(){}
async function compressImage(file){
 return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{try{const max=1600,scale=Math.min(1,max/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);canvas.toBlob(blob=>{URL.revokeObjectURL(url);blob?resolve(new File([blob],file.name.replace(/\.[^.]+$/,'.jpg'),{type:'image/jpeg'})):reject(new Error('Unable to compress an image.'))},'image/jpeg',.82)}catch(e){reject(e)}};img.onerror=()=>reject(new Error('One selected image could not be read.'));img.src=url})
}
async function prepareAndUploadImages(button){
 const files=[...(form.elements.images?.files||[])];if(files.length<2)throw new Error('Please add at least 2 product images from different angles.');
 const progress=document.querySelector('[data-upload-progress]'),bar=document.querySelector('[data-upload-bar]'),label=document.querySelector('[data-upload-text]');progress.hidden=false;button.disabled=true;
 label.textContent='Compressing images…';bar.style.width='12%';
 const compressed=[];for(let i=0;i<files.length;i++){compressed.push(await compressImage(files[i]));bar.style.width=(12+Math.round(((i+1)/files.length)*38))+'%';label.textContent=`Compressing image ${i+1} of ${files.length}…`}
 label.textContent='Uploading images securely…';bar.style.width='58%';
 const fd=new FormData();compressed.forEach(f=>fd.append('images[]',f,f.name));const token=await currentUser.getIdToken();
 const r=await fetch(`${ROOT_BACKEND}/upload_images.php`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:fd});const d=await r.json().catch(()=>({}));if(!r.ok||!d.ok)throw new Error(d.error||'Image upload failed.');
 stagedImages=d.images||[];bar.style.width='100%';label.textContent=`✓ ${stagedImages.length} image${stagedImages.length===1?'':'s'} compressed and uploaded`;return stagedImages;
}
function buildPreview(){
 document.querySelector('[data-preview-name]').textContent=form.elements.name.value;
 document.querySelector('[data-preview-price]').textContent=money.format(Number(form.elements.price.value||0));
 document.querySelector('[data-preview-description]').textContent=form.elements.description.value;
 document.querySelector('[data-preview-category]').textContent=form.elements.category.value;
 document.querySelector('[data-preview-stock]').textContent=form.elements.stock.value;
 const pop=Number(form.elements.targetPopulation.value||50000),fee=reachPrice(pop);document.querySelector('[data-preview-population]').textContent=pop.toLocaleString('en-ZA')+' people';document.querySelector('[data-preview-reach-price]').textContent=fee===0?'R0 · Free':'R'+fee;
 const channels=selectedChannels();
 document.querySelector('[data-preview-channels]').innerHTML=channels.map(channel=>{
  const connected=connectedSellingChannels.has(channel);
  const suffix=channel==="teyza"||connected?"":" · connect later";
  const cls=channel==="teyza"||connected?"pill":"pill pill-pending-connection";
  return `<span class="${cls}">${safe(channelLabel(channel))}${suffix}</span>`;
 }).join('');
 const file=form.elements.images.files[0];if(file){const img=document.createElement('img');img.src=URL.createObjectURL(file);const box=document.querySelector('[data-preview-image]');box.innerHTML='';box.appendChild(img)}
 const allAreas=JSON.parse(form.elements.sellingAreas.value||"[]");
 document.querySelector('[data-review-area]').textContent=allAreas.length?allAreas.join(" · "):(form.elements.targetArea.value||'Saved selling area');
 const reviewPopulation=Math.max(5000,Number(form.elements.targetPopulation.value||5000)),boost=reachPrice(reviewPopulation);
 const rr=document.querySelector('[data-review-reach]');if(rr)rr.textContent=reviewPopulation.toLocaleString("en-ZA")+" people";
 const rf=document.querySelector('[data-review-reach-fee]');if(rf)rf.textContent=boost?money.format(boost):"Included";
 document.querySelector('[data-review-delivery]').textContent=[productDelivery.method,productDelivery.provider].filter(Boolean).join(' · ')||'Delivery';
 const reviewFee=document.querySelector('[data-review-delivery-fee]');if(reviewFee)reviewFee.textContent=productDelivery.fee>0?money.format(productDelivery.fee):'Free';
}
document.querySelectorAll('[data-next]').forEach(b=>b.addEventListener('click',async()=>{
 const n=Number(b.dataset.next);
 if(currentStep===1&&!validateStep1())return;
 if(n===2){await loadSavedSellingSetup();await loadConnectedChannels();renderProductDelivery();syncSellingAreas();updateReach();detectCurrentSellingArea();}
 if(n===3)buildPreview();
 go(n);
}));
document.querySelectorAll('[data-back]').forEach(b=>b.addEventListener('click',()=>go(Number(b.dataset.back))));
document.querySelectorAll('.channel-card input').forEach(input=>input.addEventListener('change',()=>input.closest('.channel-card').classList.toggle('selected',input.checked)));
form?.elements.images?.addEventListener('change',e=>{stagedImages=[];const progress=document.querySelector('[data-upload-progress]');if(progress)progress.hidden=true;const box=document.querySelector('[data-image-preview]');box.innerHTML='';[...e.target.files].forEach(file=>{const img=document.createElement('img');img.src=URL.createObjectURL(file);box.appendChild(img)})});

function publishLabel(p,c){const s=p.publishing?.[c]?.status||'waiting_verification';return ({published:'✓',publishing:'↻',queued:'◷',error:'!',setup_required:'＋',waiting_connection:'＋',waiting_verification:'◷'})[s]||'◷'}
function render(products=[]){
 loadedProducts=products;if(!tableBody)return;
 tableBody.innerHTML=products.length?products.slice().reverse().map(p=>{
  const teyzaDaily=p.analytics?.teyza?.daily||{};
  const allTime=Object.values(teyzaDaily).reduce((a,d)=>a+Number(d?.views||0),0);
  return `<tr>
   <td><strong>${safe(p.name)}</strong>${p.images?.[0]?`<br><img src="${safe(p.images[0])}" alt="" style="width:48px;height:48px;object-fit:cover;border-radius:8px;margin-top:7px">`:''}</td>
   <td>${safe(p.sku||'-')}</td>
   <td>${money.format(Number(p.price||0))}</td>
   <td>${Number(p.stock||0)}</td>
   <td>${(p.channels||[]).map(c=>'<span class="pill" title="'+safe(p.publishing?.[c]?.status||'waiting_verification')+'">'+publishLabel(p,c)+' '+safe(channelLabel(c))+'</span>').join(' ')||'—'}</td>
   <td><div class="performance-cell"><button class="performance-button" type="button" data-performance-product="${safe(p.id)}">View stats</button><small>${allTime.toLocaleString('en-ZA')} Teyza views</small></div></td>
   <td><span class="status-pill ${p.verificationStatus==='pending'?'status-pending':''}">${safe(p.verificationStatus||'Pending')}</span></td>
   <td><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="button" type="button" data-view-product="${safe(p.id)}">View</button><button class="button" type="button" data-edit-product="${safe(p.id)}">Edit</button><button class="button" type="button" data-delete-product="${safe(p.id)}" style="color:#b42318">Delete</button></div></td>
  </tr>`;
 }).join(''):'<tr><td colspan="8">No products yet. Select Add product to create your first listing.</td></tr>';
 const labels=['Product','SKU','Price','Stock','Channels','Performance','Verification','Actions'];
 tableBody.querySelectorAll('tr').forEach(row=>{if(row.children.length===8)[...row.children].forEach((cell,index)=>cell.dataset.label=labels[index]);});
}
function openProduct(id){const p=loadedProducts.find(x=>x.id===id);if(!p)return;const detail=document.querySelector('[data-product-detail]');if(!detail)return;detail.innerHTML=`${p.images?.[0]?`<img src="${safe(p.images[0])}" alt="${safe(p.name)}">`:''}<span class="status-pill status-pending" style="display:inline-block;margin-top:15px">${safe(p.verificationStatus||'Pending')}</span><h2>${safe(p.name)}</h2><div class="preview-price">${money.format(Number(p.price||0))}</div><p>${safe(p.desc||'')}</p><p><b>SKU:</b> ${safe(p.sku||'-')} · <b>Stock:</b> ${Number(p.stock||0)}</p><p><b>Selling area:</b> ${safe(p.targetArea||'Not set')}</p><p><b>Target population:</b> ${Number(p.targetPopulation||0).toLocaleString('en-ZA')}</p><p><b>Reach fee:</b> ${Number(p.reachFee||0)===0?'Free':'R'+Number(p.reachFee)}</p><p><b>Publishing:</b></p><div class="selected-channels">${(p.channels||[]).map(c=>'<span class="pill">'+publishLabel(p,c)+' '+safe(channelLabel(c))+' · '+safe((p.publishing?.[c]?.status||'waiting_verification').replaceAll('_',' '))+'</span>').join(' ')||'—'}</div>`;const modal=document.querySelector('[data-product-modal]');if(modal){modal.classList.add('show');document.body.classList.add('product-modal-open')}}
async function deleteProduct(id){const p=loadedProducts.find(x=>x.id===id);if(!p||!confirm('Delete "'+p.name+'"? This cannot be undone.'))return;const token=await currentUser.getIdToken();const r=await fetch(`${API_BASE}/workspace.php?action=product&productId=`+encodeURIComponent(id),{method:'DELETE',headers:{Authorization:'Bearer '+token}});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'Unable to delete product.');await refresh()}
function editProduct(id){
 const p=loadedProducts.find(x=>x.id===id);if(!p)return;
 document.querySelector('[data-submit-success]')?.classList.remove('show');
 editingProductId=id;location.hash="new-product";syncProductView();
 productSellingChannels=new Set(["teyza",...(Array.isArray(p.channels)?p.channels:[])]);
 sellingSelectionInitialized=true;
 ['name','sku','category','brand','condition','price','costPrice','stock'].forEach(k=>{if(form.elements[k])form.elements[k].value=p[k]??''});
 form.elements.description.value=p.desc||'';
 renderConfirmedChannels();
 go(1);window.scrollTo({top:0,behavior:'smooth'});
 showStatus('Editing '+p.name+'. Publish again to save your changes.','success');
}

let performanceProductId='',performancePeriod='30';

async function getTeyzaPerformance(productId,period){
 const token=await currentUser.getIdToken();
 const url=new URL(`${API_BASE}/workspace.php`,location.origin);
 url.searchParams.set('action','product-performance');
 url.searchParams.set('productId',productId);
 url.searchParams.set('period',period);
 const r=await fetch(url,{headers:{Authorization:`Bearer ${token}`},cache:'no-store'});
 const d=await r.json().catch(()=>({}));
 if(!r.ok||!d.ok)throw new Error(d.error||'Unable to load Teyza performance.');
 return d;
}

function metric(label,value){return `<div class="metric"><small>${safe(label)}</small><strong>${safe(value)}</strong></div>`}

function renderPerformance(product,teyza,provider){
 const box=document.querySelector('[data-performance-content]');
 const t=teyza.teyza||{},google=provider?.data?.google||provider?.google||{};
 const orders=teyza.orders||{};
 const ctr=Number(google.clickThroughRate||0);
 const googleSelected=(product.channels||[]).includes('google');

 let googleHtml;
 if(!googleSelected){
  googleHtml='<div class="performance-note">Google Shopping is not selected for this product.</div>';
 }else if(!google.connected){
  googleHtml='<div class="performance-note">Google Shopping is not connected for this seller.</div>';
 }else if(!google.available){
  googleHtml='<div class="performance-note">'+safe(google.message||'Google performance is not available yet for this product.')+'</div>';
 }else{
  googleHtml=`<div class="metric-grid">
   ${metric('Impressions',Number(google.impressions||0).toLocaleString('en-ZA'))}
   ${metric('Clicks',Number(google.clicks||0).toLocaleString('en-ZA'))}
   ${metric('CTR',(ctr*100).toFixed(2)+'%')}
   ${metric('Offer ID',google.offerId||'—')}
  </div>`;
 }

 const selectedMeta=(product.channels||[]).filter(c=>['facebook','instagram','whatsapp'].includes(c));
 const otherHtml=selectedMeta.length?`
 <div class="performance-channel-card">
  <div class="performance-channel-head"><h3>Facebook / Instagram / WhatsApp</h3><span class="performance-status muted">Not wired yet</span></div>
  <div class="performance-note">These channels can remain connected for selling, but Teyza does not currently have provider-insights endpoints for their product metrics. No figures are estimated or invented.</div>
 </div>`:'';

 box.innerHTML=`
 <div class="performance-summary">
  <div class="performance-kpi"><small>TEYZA VIEWS</small><strong>${Number(t.views||0).toLocaleString('en-ZA')}</strong></div>
  <div class="performance-kpi"><small>ORDERS</small><strong>${Number(orders.orders||0).toLocaleString('en-ZA')}</strong></div>
  <div class="performance-kpi"><small>REVENUE</small><strong>${money.format(Number(orders.revenue||0))}</strong></div>
 </div>
 <div class="performance-channel-grid">
  <div class="performance-channel-card">
   <div class="performance-channel-head"><h3>Teyza Store</h3><span class="performance-status">Teyza data</span></div>
   <div class="metric-grid">
    ${metric('Views',Number(t.views||0).toLocaleString('en-ZA'))}
    ${metric('Unique visitors',Number(t.uniqueViews||0).toLocaleString('en-ZA'))}
    ${metric('Product clicks',Number(t.clicks||0).toLocaleString('en-ZA'))}
    ${metric('Enquiries',Number(t.enquiries||0).toLocaleString('en-ZA'))}
    ${metric('Add to cart',Number(t.addToCart||0).toLocaleString('en-ZA'))}
    ${metric('Units sold',Number(orders.units||0).toLocaleString('en-ZA'))}
   </div>
  </div>
  <div class="performance-channel-card">
   <div class="performance-channel-head"><h3>Google Shopping</h3><span class="performance-status ${google.available?'':'muted'}">${google.available?'Live report':'Provider data'}</span></div>
   ${googleHtml}
  </div>
  ${otherHtml}
 </div>
 <div class="performance-note">X, YouTube and TikTok are intentionally excluded because their Teyza backend integrations are not configured yet.</div>`;
 box.hidden=false;
 document.querySelector('[data-performance-loading]').hidden=true;
}

async function loadPerformance(){
 const product=loadedProducts.find(p=>p.id===performanceProductId);if(!product)return;
 const loading=document.querySelector('[data-performance-loading]'),box=document.querySelector('[data-performance-content]');
 if(!loading||!box){
  console.error('Performance modal markup is missing.');
  return;
 }
 loading.hidden=false;loading.textContent='Loading performance…';box.hidden=true;
 try{
  const offerIds=[product.publishing?.google?.externalId,product.sku,product.id].filter(Boolean);
  const [teyza,provider]=await Promise.all([
   getTeyzaPerformance(product.id,performancePeriod),
   getProviderPerformance({
    businessId,
    offerIds,
    period:performancePeriod,
    createdAt:product.createdAt||null
   }).catch(error=>({data:{google:{connected:(product.channels||[]).includes('google'),available:false,message:error.message||'Google performance could not be loaded.'}}}))
  ]);
  renderPerformance(product,teyza,provider);
 }catch(error){
  loading.hidden=false;loading.textContent=workspaceError(error,'load product performance');
 }
}

function openPerformance(id){
 const product=loadedProducts.find(p=>p.id===id);if(!product)return;
 const modal=document.querySelector('[data-performance-modal]');
 const title=document.querySelector('[data-performance-title]');
 const loading=document.querySelector('[data-performance-loading]');
 const content=document.querySelector('[data-performance-content]');
 if(!modal||!title||!loading||!content){
  console.error('Performance UI is missing from products.html. Upload the matching products.html v41 file.');
  showStatus('Performance panel files are out of sync. Upload the latest products.html and products.css, then refresh.');
  return;
 }
 performanceProductId=id;performancePeriod='30';
 title.textContent=product.name+' performance';
 document.querySelectorAll('[data-performance-period]').forEach(b=>b.classList.toggle('active',b.dataset.performancePeriod==='30'));
 modal.hidden=false;document.body.classList.add('selling-channel-modal-open');
 loadPerformance();
}
function closePerformance(){const modal=document.querySelector('[data-performance-modal]');if(modal)modal.hidden=true;document.body.classList.remove('selling-channel-modal-open')}
document.querySelector('[data-close-performance]')?.addEventListener('click',closePerformance);
document.querySelector('[data-performance-modal]')?.addEventListener('click',e=>{if(e.target===e.currentTarget)closePerformance()});
document.querySelectorAll('[data-performance-period]').forEach(btn=>btn.addEventListener('click',()=>{
 performancePeriod=btn.dataset.performancePeriod;
 document.querySelectorAll('[data-performance-period]').forEach(b=>b.classList.toggle('active',b===btn));
 loadPerformance();
}));

tableBody?.addEventListener('click',async e=>{const perf=e.target.closest('[data-performance-product]');if(perf)return openPerformance(perf.dataset.performanceProduct);const view=e.target.closest('[data-view-product]');if(view)return openProduct(view.dataset.viewProduct);const edit=e.target.closest('[data-edit-product]');if(edit)return editProduct(edit.dataset.editProduct);const del=e.target.closest('[data-delete-product]');if(del)try{del.disabled=true;await deleteProduct(del.dataset.deleteProduct)}catch(x){showStatus(x.message)}finally{del.disabled=false}});
document.querySelector('[data-close-product]')?.addEventListener('click',()=>{document.querySelector('[data-product-modal]')?.classList.remove('show');document.body.classList.remove('product-modal-open')});
document.querySelector('[data-product-modal]')?.addEventListener('click',e=>{if(e.target.matches('[data-product-modal]')){e.currentTarget.classList.remove('show');document.body.classList.remove('product-modal-open')}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.querySelector('[data-product-modal]')?.classList.contains('show')){document.querySelector('[data-product-modal]')?.classList.remove('show');document.body.classList.remove('product-modal-open')}});
async function refresh(){const s=await getWorkspaceSummary(currentUser);render(s.products||[])}

form?.addEventListener('submit',async e=>{
 e.preventDefault();if(!currentUser)return;if(!validateStep1())return;
 if(!editingProductId&&!stagedImages.length){
  const sb=form.querySelector('[type=submit]'),old=sb.textContent;
  try{sb.disabled=true;sb.textContent='Preparing photos…';await prepareAndUploadImages(sb)}
  catch(error){sb.disabled=false;sb.textContent=old;showStatus(error.message||'Unable to upload product photos.');return}
 }
 const b=form.querySelector('[type=submit]'),fd=new FormData(form);if(editingProductId)fd.set('productId',editingProductId);fd.set('desc',String(fd.get('description')||''));fd.set('channels',JSON.stringify(selectedChannels()));fd.set('connectedChannels',JSON.stringify([...connectedSellingChannels]));fd.set('verificationStatus','pending');fd.set('targetPopulation',String(Math.max(5000,Number(form.elements.targetPopulation.value||5000))));
 fd.set('reachFee',String(reachPrice(Number(form.elements.targetPopulation.value||5000))));
 fd.set('sellingAreas',form.elements.sellingAreas.value||"[]");fd.set('stagedImages',JSON.stringify(stagedImages));fd.delete('images');
 b.disabled=true;b.textContent='Sending for verification…';
 try{
  const token=await currentUser.getIdToken();
  const r=await fetch(editingProductId?`${API_BASE}/workspace.php?action=product&productId=`+encodeURIComponent(editingProductId):`${ROOT_BACKEND}/upload_product.php`,{method:'POST',headers:{Authorization:`Bearer ${token}`},body:editingProductId?JSON.stringify(Object.fromEntries(
   [...fd.entries()]
    .filter(([k])=>!["channels","connectedChannels"].includes(k))
    .concat([
     ["channels",selectedChannels()],
     ["connectedChannels",[...connectedSellingChannels]]
    ])
  )):fd,...(editingProductId?{headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'}}:{headers:{Authorization:`Bearer ${token}`}})});
  const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'Unable to submit product.');
  await refresh();
  document.querySelectorAll('[data-step]').forEach(x=>x.classList.remove('active'));
  const wizardHeader=document.querySelector('.product-wizard-header');
  if(wizardHeader)wizardHeader.style.display='none';
  const successPanel=document.querySelector('[data-submit-success]');
  if(successPanel)successPanel.classList.add('show');
  editingProductId='';
  const successMessage=document.querySelector('[data-success-message]');
  if(successMessage)successMessage.textContent=`${d.product?.name||'Your product'} has been sent to Teyza admin for verification.`;
 }catch(x){showStatus(workspaceError(x,'submit your product'))}finally{b.disabled=false;b.textContent='Submit for verification'}
});
async function enforceReadiness(user){const token=await user.getIdToken();const r=await fetch(`${API_BASE}/workspace.php?action=seller-readiness`,{headers:{Authorization:'Bearer '+token}});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||'Unable to check seller setup.');const ready=!!d.productReady;sellerReady=ready;syncProductView();if(!ready){const msg=!d.businessComplete?'Complete your business profile and verification first.':!d.deliveryComplete?'Your business profile is complete. Set up delivery before adding products.':'Delivery is complete. Set up how your business will be paid before adding products.';document.querySelector('[data-readiness-message]').textContent=msg;const actions=document.querySelector('[data-readiness-gate] .success-actions');if(actions)actions.innerHTML=!d.businessComplete?'<a class="button button-primary" href="business-profile.html?setup=1">Complete business profile →</a>':!d.deliveryComplete?'<a class="button button-primary" href="delivery-settings.html?setup=1">Set up delivery →</a>':'<a class="button button-primary" href="seller-onboarding.html#payment-setup">Set up payments →</a>';}else if(d.companyApproval?.status!=='approved'){showStatus('Company approval is '+(d.companyApproval?.status||'pending')+'. You can add products now, but products will remain pending and will not publish until Teyza approves your company.','success');}return ready}
onAuthStateChanged(auth,async user=>{if(!user){location.href='index.html?auth=login';return}currentUser=user;try{const context=await getBusinessContext(user);businessId=String(context.businessId||user.uid);const ready=await enforceReadiness(user);await refresh();if(ready){await loadSavedSellingSetup();await loadConnectedChannels()}}catch(e){showStatus(workspaceError(e,'load your selling channels'));const catalogStatus=document.querySelector('[data-catalog-status]');catalogStatus.hidden=false;catalogStatus.textContent=workspaceError(e,'load products');tableBody.innerHTML='<tr><td colspan="8">Products could not be loaded. Refresh to try again.</td></tr>'}});

document.querySelector('[data-add-new]')?.addEventListener('click',async()=>{
 form.reset();stagedImages=[];editingProductId='';
 productSellingChannels=new Set(["teyza"]);
 sellingSelectionInitialized=false;
 const box=document.querySelector('[data-image-preview]');if(box)box.innerHTML='';
 const progress=document.querySelector('[data-upload-progress]');if(progress)progress.hidden=true;
 document.querySelector('[data-submit-success]')?.classList.remove('show');
 await loadSavedSellingSetup();await loadConnectedChannels();go(1);
});
