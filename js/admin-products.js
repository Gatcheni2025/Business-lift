import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {auth} from "./firebase-config.js";

const list=document.querySelector("[data-admin-products]");
const statusNode=document.querySelector("[data-admin-status]");
const money=new Intl.NumberFormat("en-ZA",{style:"currency",currency:"ZAR"});
let user=null,products=[],filter="pending";

const safe=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const statusOf=p=>String(p.verificationStatus||"pending").toLowerCase();
const showStatus=(m)=>{statusNode.hidden=false;statusNode.textContent=m};
const clearStatus=()=>{statusNode.hidden=true;statusNode.textContent=""};

async function api(action,{method="GET",body}={}){
 const token=await user.getIdToken();
 const r=await fetch(`api/workspace.php?action=${encodeURIComponent(action)}`,{
  method,cache:"no-store",
  headers:{Authorization:`Bearer ${token}`,...(body?{"Content-Type":"application/json"}:{})},
  body:body?JSON.stringify(body):undefined
 });
 const d=await r.json().catch(()=>({}));
 if(!r.ok||!d.ok)throw new Error(d.error||"Admin request failed.");
 return d;
}

function counts(){
 const all=products.length;
 const pending=products.filter(p=>["pending","pending_company_approval","waiting_verification"].includes(statusOf(p))).length;
 const approved=products.filter(p=>["approved","active"].includes(statusOf(p))).length;
 const rejected=products.filter(p=>statusOf(p)==="rejected").length;
 document.querySelector("[data-count-all]").textContent=all;
 document.querySelector("[data-count-pending]").textContent=pending;
 document.querySelector("[data-count-approved]").textContent=approved;
 document.querySelector("[data-count-rejected]").textContent=rejected;
}

function match(p){
 const s=statusOf(p);
 if(filter==="all")return true;
 if(filter==="pending")return ["pending","pending_company_approval","waiting_verification"].includes(s);
 if(filter==="approved")return ["approved","active"].includes(s);
 return s==="rejected";
}

function card(p){
 const images=Array.isArray(p.images)?p.images:[];
 const seller=p.seller||{};
 const status=statusOf(p);
 const pending=["pending","pending_company_approval","waiting_verification"].includes(status);
 const imageHtml=images.length?images.slice(0,6).map(src=>`<img src="${safe(src)}" alt="">`).join(""):'<div class="empty">No product images</div>';
 return `<article class="product-card" data-product-id="${safe(p.id)}" data-seller-uid="${safe(seller.uid)}">
  <div class="gallery">${imageHtml}</div>
  <div>
   <div class="product-top">
    <div><span class="badge">${safe(status.replaceAll("_"," "))}</span><h2>${safe(p.name||"Unnamed product")}</h2>
    <div class="seller">${safe(seller.businessName||"Unnamed business")} · ${safe(seller.email||seller.uid||"")}</div></div>
    <strong>${money.format(Number(p.price||0))}</strong>
   </div>
   <p>${safe(p.desc||"")}</p>
   <div class="meta">
    <div><small>SKU</small><strong>${safe(p.sku||"—")}</strong></div>
    <div><small>STOCK</small><strong>${Number(p.stock||0)}</strong></div>
    <div><small>IMAGES</small><strong>${images.length}</strong></div>
    <div><small>REACH</small><strong>${Number(p.targetPopulation||5000).toLocaleString("en-ZA")}</strong></div>
    <div><small>SELLING AREA</small><strong>${safe(p.targetArea||"—")}</strong></div>
    <div><small>REACH FEE</small><strong>${Number(p.reachFee||0)?money.format(Number(p.reachFee)):"Free"}</strong></div>
    <div><small>DELIVERY</small><strong>${safe(p.deliveryProvider||p.deliveryMethod||"—")}</strong></div>
    <div><small>DELIVERY FEE</small><strong>${money.format(Number(p.deliveryFee||0))}</strong></div>
   </div>
   <div class="channels">${(p.channels||[]).map(c=>`<span class="channel">${safe(c)}</span>`).join("")}</div>
   ${p.verificationNote?`<p><strong>Review note:</strong> ${safe(p.verificationNote)}</p>`:""}
   ${pending?`<div class="review-box">
      <textarea placeholder="Optional admin note. Required if you want to explain a rejection." data-review-note></textarea>
      <div class="actions">
       <button class="btn approve" type="button" data-review="approved" ${images.length<2?"disabled title=\"At least 2 images required\"":""}>Approve product</button>
       <button class="btn reject" type="button" data-review="rejected">Reject</button>
      </div>
      ${images.length<2?'<p style="color:#a52b22;font-size:12px"><strong>Cannot approve:</strong> seller must upload at least 2 product images.</p>':""}
    </div>`:""}
  </div>
 </article>`;
}

function render(){
 counts();
 const shown=products.filter(match);
 list.innerHTML=shown.length?shown.map(card).join(""):'<div class="empty-state">No products in this view.</div>';
}

async function load(){
 clearStatus();
 const d=await api("admin-catalog");
 products=d.products||[];
 render();
}

document.querySelectorAll("[data-filter]").forEach(btn=>btn.addEventListener("click",()=>{
 filter=btn.dataset.filter;
 document.querySelectorAll("[data-filter]").forEach(b=>b.classList.toggle("active",b===btn));
 render();
}));

list.addEventListener("click",async e=>{
 const btn=e.target.closest("[data-review]");if(!btn)return;
 const card=btn.closest("[data-product-id]");
 const decision=btn.dataset.review;
 const note=card.querySelector("[data-review-note]")?.value.trim()||"";
 if(decision==="rejected"&&!note&&!confirm("Reject this product without an admin note?"))return;
 btn.disabled=true;
 try{
  await api("admin-product-review",{method:"POST",body:{
   uid:card.dataset.sellerUid,
   productId:card.dataset.productId,
   decision,note
  }});
  await load();
 }catch(err){
  showStatus(err.message);
  btn.disabled=false;
 }
});

onAuthStateChanged(auth,async current=>{
 if(!current){location.href="index.html?auth=login";return}
 user=current;
 document.querySelector("[data-admin-user]").textContent=current.email||"Admin";
 try{await load()}catch(err){showStatus(err.message);list.innerHTML='<div class="empty-state">Unable to load admin products.</div>'}
});
