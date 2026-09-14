import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {auth} from "./firebase-config.js";
import {apiFetch} from "./api-client.js";
import {workspaceError} from "./business-context.js";

const form=document.querySelector("[data-product-form]");
const statusNode=document.querySelector("[data-product-status]");
const tableBody=document.querySelector("[data-products-table-body]");
const businessIdNode=document.querySelector("[data-business-id]");
const channelTogglesContainer=document.querySelector("[data-channel-toggles]");
const channelDistribution=document.querySelector("[data-channel-distribution]");
const money=new Intl.NumberFormat("en-ZA",{style:"currency",currency:"ZAR",maximumFractionDigits:2});
let activeBusinessId="",channels=[],products=[];

function showStatus(message,tone="error"){
  if(!statusNode)return;statusNode.hidden=false;statusNode.textContent=message;statusNode.className="form-status "+tone;
}
function installImageUploader(){
  if(!form)return;
  const old=form.querySelector('input[name="imageUrl"]');
  if(!old)return;
  const label=old.closest("label");
  if(!label)return;
  label.innerHTML='Product images <input type="file" name="images" accept="image/jpeg,image/png,image/webp" multiple><small class="muted" data-image-help>Up to 5 JPG, PNG or WebP images. Images are compressed before upload.</small>';
}
function channelName(provider){return provider==="meta"?"Facebook & Instagram":provider==="google"?"Google Merchant":provider==="whatsapp"?"WhatsApp Business":provider;}
function renderChannelToggles(data){
  if(!channelTogglesContainer)return;
  if(!data.length){channelTogglesContainer.innerHTML='<p class="muted">No connected channels yet. You can save the product first, then <a href="sales-channels.html?return=dashboard">connect a sales channel</a>.</p>';return;}
  channelTogglesContainer.innerHTML=data.map(c=>`<div class="channel-toggle"><input type="checkbox" id="channel-${c.id}" name="channels" value="${c.id}" checked><label for="channel-${c.id}">${c.channelName}</label></div>`).join("");
}
function renderDistribution(){
  if(!channelDistribution)return;
  const distribution=channels.map(c=>({name:c.channelName,count:products.filter(p=>p.channelPublish?.[c.id]).length}));
  const total=products.length;
  channelDistribution.innerHTML=distribution.map(d=>`<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(23,53,45,0.04);"><span>${d.name}</span><span><strong>${d.count}</strong> products (${total?((d.count/total)*100).toFixed(0):0}%)</span></div>`).join("");
}
function esc(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function renderRows(){
  if(!tableBody)return;
  if(!products.length){tableBody.innerHTML='<tr><td colspan="8">No products yet. Add your first product above.</td></tr>';return;}
  tableBody.innerHTML=products.map(product=>{
    const published=Object.entries(product.channelPublish||{}).filter(([,v])=>v===true).map(([id])=>channels.find(c=>c.id===id)).filter(Boolean);
    const badges=published.length?published.map(c=>`<span class="pill">${esc(c.channelName)}</span>`).join(" "):'<span class="muted">Not published</span>';
    const status=String(product.status||"draft");
    return `<tr><td><strong>${esc(product.name)}</strong></td><td>${esc(product.sku||"-")}</td><td>${money.format(Number(product.price||0))}</td><td>${money.format(Number(product.costPrice||0))}</td><td>${Number(product.stock||0)}</td><td>${badges}</td><td><span class="status-pill">${esc(status.charAt(0).toUpperCase()+status.slice(1))}</span></td><td><button class="icon-button small" data-product-toggle="${esc(product.id)}" title="Toggle publishing">📤</button></td></tr>`;
  }).join("");
}
async function loadChannels(){
  try{
    const response=await apiFetch("api/social-connections.php?action=list");
    channels=Object.entries(response.connections||{}).filter(([,state])=>state?.connected).map(([id])=>({id,channelName:channelName(id),status:"active",defaultPublish:true}));
  }catch(error){console.warn("Channel load failed",error);channels=[];}
  renderChannelToggles(channels);renderRows();renderDistribution();
}
async function loadProducts(){
  const response=await apiFetch("api/products.php");products=Array.isArray(response.products)?response.products:[];window.products=products;renderRows();renderDistribution();
}
function loadImage(file){
  return new Promise((resolve,reject)=>{const img=new Image();const url=URL.createObjectURL(file);img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error(`Unable to read ${file.name}.`))};img.src=url;});
}
async function compressImage(file){
  if(!/^image\/(jpeg|png|webp)$/i.test(file.type))throw new Error(`${file.name} is not a supported image.`);
  const image=await loadImage(file);const max=1600;const scale=Math.min(1,max/Math.max(image.naturalWidth,image.naturalHeight));
  const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
  canvas.getContext("2d",{alpha:true}).drawImage(image,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/webp",0.78));
  if(!blob)return file;
  const base=file.name.replace(/\.[^.]+$/,"").replace(/[^a-z0-9_-]+/gi,"-").replace(/^-|-$/g,"")||"product";
  return new File([blob],`${base}.webp`,{type:"image/webp",lastModified:Date.now()});
}

installImageUploader();
if(form){
  form.addEventListener("submit",async event=>{
    event.preventDefault();const button=form.querySelector('button[type="submit"]');if(!(button instanceof HTMLButtonElement))return;
    const data=new FormData(form);const required=["name","description","category","sku"];
    if(required.some(k=>!String(data.get(k)||"").trim())){showStatus("Complete all required product fields before saving.");return;}
    button.disabled=true;
    try{
      const outgoing=new FormData();
      ["name","description","price","costPrice","sku","stock","category","status"].forEach(k=>outgoing.append(k,String(data.get(k)||"")));
      const selected=[...form.querySelectorAll('input[name="channels"]:checked')].map(el=>el.value);const channelPublish={};channels.forEach(c=>channelPublish[c.id]=selected.includes(c.id));outgoing.append("channelPublish",JSON.stringify(channelPublish));
      const imageInput=form.querySelector('input[name="images"]');const files=[...(imageInput?.files||[])].slice(0,5);
      if(files.length){button.textContent="Compressing images…";for(const file of files)outgoing.append("images[]",await compressImage(file));}
      button.textContent="Saving…";await apiFetch("api/products.php",{method:"POST",body:outgoing});
      showStatus("Product saved successfully.","success");form.reset();if(form.elements["status"])form.elements["status"].value="active";await loadProducts();renderChannelToggles(channels);
    }catch(error){console.error("Create product failed",error);showStatus(workspaceError(error,"save your product"));}
    finally{button.disabled=false;button.textContent="Add Product";}
  });
  if(form.elements["status"])form.elements["status"].value="active";
}
document.addEventListener("click",async event=>{
  const button=event.target.closest?.("[data-product-toggle]");if(!button)return;
  const product=products.find(p=>p.id===button.dataset.productToggle);if(!product)return;
  const hasPublished=Object.values(product.channelPublish||{}).some(Boolean);const next={};channels.forEach(c=>next[c.id]=!hasPublished);
  try{await apiFetch("api/products.php",{method:"PATCH",body:JSON.stringify({id:product.id,channelPublish:next})});await loadProducts();}
  catch(error){console.error("Toggle publish failed",error);showStatus(error.message||"Unable to update product publishing.");}
});
onAuthStateChanged(auth,async user=>{
  if(!user){window.location.href="login.html?redirect=products.html";return;}
  activeBusinessId=user.uid;if(businessIdNode)businessIdNode.textContent=activeBusinessId;
  try{await Promise.all([loadChannels(),loadProducts()]);}catch(error){console.error("Products load failed",error);showStatus(workspaceError(error,"load products"));if(tableBody)tableBody.innerHTML='<tr><td colspan="8">Unable to load products.</td></tr>';}
});
