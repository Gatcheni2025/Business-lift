import {onAuthStateChanged,signOut} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {auth} from "./firebase-config.js";

const money=new Intl.NumberFormat("en-ZA",{style:"currency",currency:"ZAR"});
const dateTime=new Intl.DateTimeFormat("en-ZA",{dateStyle:"medium",timeStyle:"short"});
const statusNode=document.querySelector("[data-admin-status]");

let user=null;
let session=null;
let sellers=[];
let products=[];
let orders=[];
let productFilter="pending";
let sellerFilter="all";
let sellerSearch="";
let orderSearch="";
let activeSellerUid="";
let activeSellerDetail=null;
let activeFileUrl="";

const safe=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const yesNo=v=>v?"Yes":"No";
const dash=v=>v===null||v===undefined||String(v).trim()===""?"—":String(v);
const fmtDate=v=>{
  if(!v)return "—";
  try{return dateTime.format(new Date(v))}catch(_){return String(v)}
};
const showStatus=(m,t="error")=>{
  statusNode.hidden=false;
  statusNode.textContent=m;
  statusNode.className="status "+(t==="success"?"success":"");
};
const clearStatus=()=>{
  statusNode.hidden=true;
  statusNode.textContent="";
};

async function api(action,{method="GET",body,params={}}={}){
  const token=await user.getIdToken();
  const url=new URL("api/workspace.php",location.href);
  url.searchParams.set("action",action);

  Object.entries(params).forEach(([key,value])=>{
    if(value!==undefined&&value!==null&&String(value)!==""){
      url.searchParams.set(key,String(value));
    }
  });

  const r=await fetch(url,{
    method,
    cache:"no-store",
    headers:{
      Authorization:`Bearer ${token}`,
      ...(body?{"Content-Type":"application/json"}:{})
    },
    body:body?JSON.stringify(body):undefined
  });

  const d=await r.json().catch(()=>({}));
  if(!r.ok||!d.ok)throw new Error(d.error||`Unable to load ${action}.`);
  return d;
}

function stateChip(ok,labelPending,labelOk){
  return `<span class="chip ${ok?"ok":"pending"}">${safe(ok?labelOk:labelPending)}</span>`;
}

function sellerApprovalState(s){
  return String(s.companyApproval?.status||"pending").toLowerCase();
}

function renderSellerCard(s){
  const v=s.verification||{};
  const b=s.business||{};
  const approval=sellerApprovalState(s);
  const canApprove=!!v.phoneVerified&&!!v.identityVerified&&!!v.locationConfirmed&&!!v.proofOfAddressUploaded&&!!v.proofAddressMatchVerified;
  const logo=b.logoUrl||"";

  return `<article class="seller-card seller-summary-card" data-seller="${safe(s.uid)}">
    <div class="seller-top">
      <div class="seller-summary-identity">
        <div class="seller-summary-logo" ${logo?`style="background-image:url('${safe(logo)}')"`:""}>${logo?"":safe(String(b.businessName||s.firstName||"T").slice(0,1).toUpperCase())}</div>
        <div>
          <h3>${safe(b.businessName||"Unnamed business")}</h3>
          <div class="sub">${safe(s.email||s.uid)}</div>
          <div class="sub">${safe(b.phone||"No phone")} · ${Number(s.productCount||0)} products · ${Number(s.orderCount||0)} orders</div>
        </div>
      </div>
      <span class="chip ${approval==="approved"?"ok":approval==="rejected"?"bad":"pending"}">${safe(approval)}</span>
    </div>

    <div class="chips">
      ${stateChip(v.phoneVerified,"Phone pending","Phone verified")}
      ${stateChip(v.identityVerified,v.identitySubmitted?"Identity review":"Identity missing","Identity verified")}
      ${stateChip(v.locationConfirmed,"Location pending","Location confirmed")}
      ${stateChip(v.proofOfAddressUploaded,"Proof missing","Proof uploaded")}
      ${stateChip(v.proofAddressMatchVerified,"Address match pending","Address match verified")}
    </div>

    <div class="seller-actions">
      <button class="btn primary" type="button" data-open-seller="${safe(s.uid)}">View all seller data</button>
      ${!v.identityVerified&&v.identitySubmitted?`<button class="btn secondary" data-seller-action="identity-verify">Verify identity</button>`:""}
      ${v.proofOfAddressUploaded&&!v.proofAddressMatchVerified?`<button class="btn secondary" data-seller-action="proof-match">Approve address proof</button>`:""}
      ${approval!=="approved"?`<button class="btn secondary" data-seller-action="company-approve" ${canApprove?"":"disabled"}>Approve seller</button>`:""}
    </div>
  </article>`;
}

function sellerMatches(s){
  const approval=sellerApprovalState(s);
  if(sellerFilter!=="all"&&approval!==sellerFilter)return false;

  const q=sellerSearch.trim().toLowerCase();
  if(!q)return true;

  const b=s.business||{};
  return [
    s.uid,
    s.email,
    s.firstName,
    b.businessId,
    b.businessName,
    b.phone,
    b.address,
    b.industry
  ].some(value=>String(value||"").toLowerCase().includes(q));
}

function renderSellers(){
  const shown=sellers.filter(sellerMatches);
  const html=shown.length
    ?shown.map(renderSellerCard).join("")
    :'<div class="empty">No sellers match this view.</div>';

  document.querySelector("[data-sellers]").innerHTML=html;

  document.querySelector("[data-recent-sellers]").innerHTML=
    sellers.slice(0,6).map(renderSellerCard).join("")||
    '<div class="empty">No sellers found.</div>';
}

function productStatus(p){
  return String(p.verificationStatus||"pending").toLowerCase();
}

function productMatches(p){
  const s=productStatus(p);
  if(productFilter==="all")return true;
  if(productFilter==="pending")return ["pending","pending_company_approval","waiting_verification"].includes(s);
  if(productFilter==="approved")return ["approved","active"].includes(s);
  return s==="rejected";
}

function renderProducts(){
  const pending=products.filter(p=>["pending","pending_company_approval","waiting_verification"].includes(productStatus(p))).length;
  const approved=products.filter(p=>["approved","active"].includes(productStatus(p))).length;
  const rejected=products.filter(p=>productStatus(p)==="rejected").length;

  document.querySelector("[data-count-pending]").textContent=pending;
  document.querySelector("[data-count-approved]").textContent=approved;
  document.querySelector("[data-count-rejected]").textContent=rejected;
  document.querySelector("[data-count-all]").textContent=products.length;

  const shown=products.filter(productMatches);

  document.querySelector("[data-products]").innerHTML=shown.length?shown.map(p=>{
    const imgs=Array.isArray(p.images)?p.images:[];
    const seller=p.seller||{};
    const status=productStatus(p);
    const isPending=["pending","pending_company_approval","waiting_verification"].includes(status);

    return `<article class="product-card" data-product="${safe(p.id)}" data-seller="${safe(seller.uid)}">
      <div class="gallery">${imgs.length?imgs.slice(0,6).map(x=>`<img src="${safe(x)}" alt="">`).join(""):'<div class="noimg">No product images</div>'}</div>
      <div>
        <div class="product-top">
          <div>
            <span class="chip ${status==="approved"||status==="active"?"ok":status==="rejected"?"bad":"pending"}">${safe(status.replaceAll("_"," "))}</span>
            <h3>${safe(p.name||"Unnamed product")}</h3>
            <div class="sub">
              <button class="admin-text-link" type="button" data-open-seller="${safe(seller.uid)}">${safe(seller.businessName||"Unnamed business")}</button>
              · ${safe(seller.email||"")}
            </div>
          </div>
          <strong>${money.format(Number(p.price||0))}</strong>
        </div>

        <p>${safe(p.desc||"")}</p>

        <div class="product-meta">
          <div><small>SKU</small><strong>${safe(p.sku||"—")}</strong></div>
          <div><small>STOCK</small><strong>${Number(p.stock||0)}</strong></div>
          <div><small>IMAGES</small><strong>${imgs.length}</strong></div>
          <div><small>REACH</small><strong>${Number(p.targetPopulation||5000).toLocaleString("en-ZA")}</strong></div>
          <div><small>AREA</small><strong>${safe(p.targetArea||"—")}</strong></div>
          <div><small>REACH FEE</small><strong>${Number(p.reachFee||0)?money.format(Number(p.reachFee)):"Free"}</strong></div>
          <div><small>DELIVERY</small><strong>${safe(p.deliveryProvider||p.deliveryMethod||"—")}</strong></div>
          <div><small>DELIVERY FEE</small><strong>${money.format(Number(p.deliveryFee||0))}</strong></div>
        </div>

        <div class="chips">${(p.channels||[]).map(c=>`<span class="chip ok">${safe(c)}</span>`).join("")}</div>

        ${p.verificationNote?`<p class="sub"><strong>Note:</strong> ${safe(p.verificationNote)}</p>`:""}

        ${isPending?`
          <textarea class="note" data-product-note placeholder="Optional admin review note"></textarea>
          <div class="review-actions">
            <button class="btn primary" data-product-action="approved" ${imgs.length<2?'disabled title="At least 2 images required"':""}>Approve product</button>
            <button class="btn danger" data-product-action="rejected">Reject product</button>
          </div>
          ${imgs.length<2?'<p class="sub" style="color:#a72e26"><strong>Cannot approve:</strong> at least 2 product images are required.</p>':""}
        `:""}
      </div>
    </article>`;
  }).join(""):'<div class="empty">No products in this view.</div>';
}

function renderOrders(){
  const tbody=document.querySelector("[data-admin-orders]");
  const q=orderSearch.trim().toLowerCase();

  const shown=orders.filter(order=>{
    if(!q)return true;
    const seller=order.seller||{};
    return [
      order.orderNumber,
      order.id,
      order.customerName,
      order.customerId,
      order.customerEmail,
      seller.businessName,
      seller.email
    ].some(value=>String(value||"").toLowerCase().includes(q));
  });

  if(!shown.length){
    tbody.innerHTML='<tr><td colspan="7">No orders match this view.</td></tr>';
    return;
  }

  tbody.innerHTML=shown.map(order=>{
    const seller=order.seller||{};
    const total=Number(order.total??order.totalAmount??order.grandTotal??0)||0;
    const status=String(order.orderStatus||order.status||"new").toLowerCase();

    return `<tr>
      <td><strong>${safe(order.orderNumber||order.id||"Order")}</strong></td>
      <td><button class="admin-text-link" type="button" data-open-seller="${safe(seller.uid)}">${safe(seller.businessName||"Unnamed business")}</button></td>
      <td>${safe(order.customerName||order.customerEmail||order.customerId||"—")}</td>
      <td>${money.format(total)}</td>
      <td><span class="chip ${status==="completed"?"ok":status==="cancelled"?"bad":"pending"}">${safe(status)}</span></td>
      <td>${safe(fmtDate(order.createdAt||order.updatedAt))}</td>
      <td><button class="btn secondary compact" type="button" data-open-seller="${safe(seller.uid)}">Seller</button></td>
    </tr>`;
  }).join("");
}

function dataItem(label,value,{wide=false,html=false}={}){
  return `<div class="seller-data-item ${wide?"wide":""}">
    <small>${safe(label)}</small>
    <strong>${html?value:safe(dash(value))}</strong>
  </div>`;
}

function renderChecklist(detail){
  const checklist=detail.checklist||{};
  const items=checklist.items||[];

  document.querySelector("[data-seller360-checklist]").innerHTML=
    items.map(item=>`<div class="seller-check-item ${item.complete?"done":"todo"}">
      <span>${item.complete?"✓":"○"}</span>
      <strong>${safe(item.label)}</strong>
    </div>`).join("")||
    '<div class="empty">No checklist information.</div>';

  const completed=Number(checklist.completed||0);
  const total=Number(checklist.total||0);
  const percent=total?Math.round(completed/total*100):0;

  document.querySelector("[data-seller360-progress]").textContent=
    `${completed} of ${total} setup and verification items complete`;

  document.querySelector("[data-seller360-progress-bar]").style.width=`${percent}%`;
}

function renderSeller360(detail){
  activeSellerDetail=detail;

  const b=detail.business||{};
  const v=detail.verification||{};
  const raw=detail.verificationRaw||{};
  const approval=detail.companyApproval||{};
  const settings=detail.settings||{};
  const logo=b.logoUrl||"";

  const logoNode=document.querySelector("[data-seller360-logo]");
  logoNode.textContent=logo?"":String(b.businessName||detail.firstName||"T").slice(0,1).toUpperCase();
  logoNode.style.backgroundImage=logo?`url("${logo}")`:"";

  document.querySelector("[data-seller360-name]").textContent=b.businessName||"Unnamed business";
  document.querySelector("[data-seller360-subtitle]").textContent=
    `${detail.email||"No email"} · ${b.businessId||detail.uid}`;

  const approvalNode=document.querySelector("[data-seller360-approval]");
  const approvalStatus=String(approval.status||"pending").toLowerCase();
  approvalNode.textContent=approvalStatus.replaceAll("_"," ");
  approvalNode.className=`chip ${approvalStatus==="approved"?"ok":approvalStatus==="rejected"?"bad":"pending"}`;

  renderChecklist(detail);

  document.querySelector("[data-seller360-business]").innerHTML=[
    dataItem("Business name",b.businessName),
    dataItem("Business ID",b.businessId),
    dataItem("Business type",b.businessType),
    dataItem("Industry",b.industry),
    dataItem("Country",b.country),
    dataItem("Business phone",b.phone),
    dataItem("Business address",b.address,{wide:true}),
    dataItem("About",b.about,{wide:true}),
    dataItem("Profile progress",`${Number(b.setupProgress||0)}%`),
    dataItem("Profile updated",fmtDate(b.updatedAt))
  ].join("");

  document.querySelector("[data-seller360-account]").innerHTML=[
    dataItem("Seller UID",detail.uid,{wide:true}),
    dataItem("Email",detail.email),
    dataItem("First name",detail.firstName),
    dataItem("Workspace created",fmtDate(detail.createdAt)),
    dataItem("Dashboard setup complete",yesNo(detail.checklist?.dashboardAccess)),
    dataItem("Product ready",yesNo(detail.checklist?.productReady)),
    dataItem("Approval submitted",fmtDate(approval.submittedAt)),
    dataItem("Approval reviewed",fmtDate(approval.reviewedAt)),
    dataItem("Reviewed by",approval.reviewedBy),
    dataItem("Admin note",approval.note,{wide:true})
  ].join("");

  document.querySelector("[data-seller360-verification]").innerHTML=[
    dataItem("Phone verified",yesNo(v.phoneVerified)),
    dataItem("Phone verified at",fmtDate(v.phoneVerifiedAt)),
    dataItem("Identity status",v.identityStatus),
    dataItem("Identity submitted",yesNo(v.identitySubmitted)),
    dataItem("Identity verified",yesNo(v.identityVerified)),
    dataItem("Location confirmed",yesNo(v.locationConfirmed)),
    dataItem("Confirmed address",v.location?.address,{wide:true}),
    dataItem("Coordinates",v.location?`${v.location.lat}, ${v.location.lng}`:"—"),
    dataItem("Proof uploaded",yesNo(v.proofOfAddressUploaded)),
    dataItem("Proof / address match",v.proofAddressMatchStatus),
    dataItem("Proof uploaded at",fmtDate(v.proofOfAddress?.uploadedAt)),
    dataItem("Identity submitted at",fmtDate(raw.identity?.submittedAt))
  ].join("");

  const fileButtons=[];
  if(v.proofOfAddressUploaded){
    fileButtons.push(`<button class="btn secondary" type="button" data-verification-file="proof">View proof of address</button>`);
  }
  if(raw.identity?.documentName){
    fileButtons.push(`<button class="btn secondary" type="button" data-verification-file="identity-document">View ID document</button>`);
  }else if(v.identityDocumentDraft){
    fileButtons.push(`<button class="btn secondary" type="button" data-verification-file="identity-document-draft">View draft ID</button>`);
  }
  if(raw.identity?.selfieName){
    fileButtons.push(`<button class="btn secondary" type="button" data-verification-file="identity-selfie">View live selfie</button>`);
  }else if(v.identitySelfieDraft){
    fileButtons.push(`<button class="btn secondary" type="button" data-verification-file="identity-selfie-draft">View draft selfie</button>`);
  }

  document.querySelector("[data-seller360-files]").innerHTML=
    fileButtons.join("")||
    '<div class="empty compact-empty">No verification files are available yet.</div>';

  const canApprove=!!v.phoneVerified&&!!v.identityVerified&&!!v.locationConfirmed&&!!v.proofOfAddressUploaded&&!!v.proofAddressMatchVerified;
  document.querySelector("[data-seller360-review-actions]").innerHTML=`
    ${!v.identityVerified&&v.identitySubmitted?`
      <button class="btn secondary" type="button" data-detail-action="identity-verify">Verify identity</button>
      <button class="btn danger" type="button" data-detail-action="identity-reject">Reject identity</button>
    `:""}

    ${v.proofOfAddressUploaded&&!v.proofAddressMatchVerified?`
      <button class="btn secondary" type="button" data-detail-action="proof-match">Approve address proof</button>
      <button class="btn danger" type="button" data-detail-action="proof-mismatch">Reject address proof</button>
    `:""}

    ${approvalStatus!=="approved"?`
      <button class="btn primary" type="button" data-detail-action="company-approve" ${canApprove?"":"disabled"}>Approve seller</button>
    `:""}

    ${approvalStatus!=="rejected"?`
      <button class="btn danger" type="button" data-detail-action="company-reject">Reject seller</button>
    `:""}
  `;

  const delivery=settings.delivery||{};
  document.querySelector("[data-seller360-delivery]").innerHTML=[
    dataItem("Fulfilment mode",delivery.fulfilmentMode),
    dataItem("Service code",delivery.serviceCode),
    dataItem("Courier preference",delivery.courierPreference),
    dataItem("Base delivery fee",delivery.baseDeliveryFee!==undefined?money.format(Number(delivery.baseDeliveryFee||0)):"—"),
    dataItem("Tracking enabled",yesNo(delivery.trackingEnabled)),
    dataItem("Pickup address",delivery.pickupAddress,{wide:true}),
    dataItem("Pickup coordinates",delivery.pickupLocation?`${delivery.pickupLocation.lat}, ${delivery.pickupLocation.lng}`:"—")
  ].join("");

  const audience=settings.audience||{};
  document.querySelector("[data-seller360-audience]").innerHTML=[
    dataItem("Gender",audience.gender),
    dataItem("Age range",audience.ageRange),
    dataItem("Target area",audience.targetArea,{wide:true})
  ].join("");

  const shop=settings.shop||{};
  document.querySelector("[data-seller360-shop]").innerHTML=[
    dataItem("Shop name",shop.shopName),
    dataItem("Support email",shop.supportEmail),
    dataItem("Support phone",shop.supportPhone),
    dataItem("Order notifications",yesNo(shop.orderNotifications)),
    dataItem("Low stock notifications",yesNo(shop.lowStockNotifications)),
    dataItem("Returns / refund policy",shop.returnsPolicy,{wide:true})
  ].join("");

  const channels=settings.sellingChannels||[];
  document.querySelector("[data-seller360-channels]").innerHTML=
    channels.length
      ?channels.map(channel=>`<span class="chip ok">${safe(channel)}</span>`).join("")
      :'<span class="chip">Teyza Store</span>';

  const payments=settings.payments||{};
  const banking=payments.banking||{};
  const accountDisplay=banking.accountNumber
    ?`•••• ${safe(String(banking.accountNumber).slice(-4))}`
    :banking.accountNumberLast4
      ?`•••• ${safe(banking.accountNumberLast4)}`
      :"—";

  document.querySelector("[data-seller360-banking]").innerHTML=[
    dataItem("Bank",banking.bankName),
    dataItem("Account holder",banking.accountHolder),
    dataItem("Account number",accountDisplay,{html:true}),
    dataItem("Branch code",banking.branchCode),
    dataItem("Account type",banking.accountType)
  ].join("");

  const payfast=payments.payfast||{};
  const prefs=payments.paymentPreferences||{};
  document.querySelector("[data-seller360-payment-integrations]").innerHTML=[
    dataItem("PayFast merchant ID",payfast.merchantId),
    dataItem("PayFast connected",yesNo(payfast.connected)),
    dataItem("PayFast sandbox",yesNo(payfast.sandboxMode)),
    dataItem("Merchant key configured",yesNo(payfast.merchantKeyConfigured)),
    dataItem("Passphrase configured",yesNo(payfast.passphraseConfigured)),
    dataItem("Other gateway",prefs.otherGateway)
  ].join("");

  const sellerProducts=detail.products||[];
  document.querySelector("[data-seller360-products]").innerHTML=
    sellerProducts.length
      ?sellerProducts.map(p=>`<article>
        <div>
          <strong>${safe(p.name||"Unnamed product")}</strong>
          <small>${safe(p.sku||"No SKU")} · ${safe(productStatus(p))}</small>
        </div>
        <span>${money.format(Number(p.price||0))}</span>
      </article>`).join("")
      :'<div class="empty compact-empty">No products yet.</div>';

  const sellerOrders=detail.orders||[];
  document.querySelector("[data-seller360-orders]").innerHTML=
    sellerOrders.length
      ?sellerOrders.map(o=>{
        const total=Number(o.total??o.totalAmount??o.grandTotal??0)||0;
        return `<article>
          <div>
            <strong>${safe(o.orderNumber||o.id||"Order")}</strong>
            <small>${safe(o.customerName||o.customerEmail||o.customerId||"Customer")} · ${safe(o.orderStatus||o.status||"new")}</small>
          </div>
          <span>${money.format(total)}</span>
        </article>`;
      }).join("")
      :'<div class="empty compact-empty">No orders yet.</div>';
}

async function openSeller(uid){
  if(!uid)return;

  activeSellerUid=uid;
  activeSellerDetail=null;

  const shell=document.querySelector("[data-seller-drawer]");
  shell.hidden=false;
  document.body.classList.add("admin-modal-open");

  document.querySelector("[data-seller360-loading]").hidden=false;
  document.querySelector("[data-seller360-content]").hidden=true;

  switchSeller360Tab("overview");

  try{
    const d=await api("admin-seller-detail",{params:{uid}});
    renderSeller360(d.seller||{});
    document.querySelector("[data-seller360-loading]").hidden=true;
    document.querySelector("[data-seller360-content]").hidden=false;
  }catch(err){
    document.querySelector("[data-seller360-loading]").innerHTML=
      `<div class="status">${safe(err.message)}</div>`;
  }
}

function closeSeller(){
  document.querySelector("[data-seller-drawer]").hidden=true;
  document.body.classList.remove("admin-modal-open");
  activeSellerUid="";
  activeSellerDetail=null;
}

function switchSeller360Tab(tab){
  document.querySelectorAll("[data-seller360-tab]").forEach(button=>{
    button.classList.toggle("active",button.dataset.seller360Tab===tab);
  });

  document.querySelectorAll("[data-seller360-panel]").forEach(panel=>{
    panel.classList.toggle("active",panel.dataset.seller360Panel===tab);
  });
}

async function openVerificationFile(type){
  if(!activeSellerUid)return;

  const viewer=document.querySelector("[data-admin-file-viewer]");
  const body=document.querySelector("[data-admin-file-body]");
  const title=document.querySelector("[data-admin-file-title]");

  const labels={
    "proof":"Proof of address",
    "identity-document":"Identity document",
    "identity-selfie":"Live identity selfie",
    "identity-document-draft":"Draft identity document",
    "identity-selfie-draft":"Draft identity selfie"
  };

  title.textContent=labels[type]||"Verification document";
  body.innerHTML='<div class="seller360-loading"><span class="admin-spinner"></span><strong>Loading secure document…</strong></div>';
  viewer.hidden=false;

  try{
    const token=await user.getIdToken();
    const url=new URL("api/verification-file.php",location.href);
    url.searchParams.set("uid",activeSellerUid);
    url.searchParams.set("type",type);

    const response=await fetch(url,{
      headers:{Authorization:`Bearer ${token}`},
      cache:"no-store"
    });

    if(!response.ok){
      const d=await response.json().catch(()=>({}));
      throw new Error(d.error||"Unable to load verification file.");
    }

    const blob=await response.blob();

    if(activeFileUrl)URL.revokeObjectURL(activeFileUrl);
    activeFileUrl=URL.createObjectURL(blob);

    if(blob.type==="application/pdf"){
      body.innerHTML=`<iframe class="admin-document-frame" src="${activeFileUrl}" title="${safe(title.textContent)}"></iframe>`;
    }else if(blob.type.startsWith("image/")){
      body.innerHTML=`<img class="admin-document-image" src="${activeFileUrl}" alt="${safe(title.textContent)}">`;
    }else{
      body.innerHTML=`<div class="empty">This document type cannot be previewed in the browser.</div>`;
    }
  }catch(err){
    body.innerHTML=`<div class="status">${safe(err.message)}</div>`;
  }
}

function closeFileViewer(){
  document.querySelector("[data-admin-file-viewer]").hidden=true;
  document.querySelector("[data-admin-file-body]").innerHTML="";
  if(activeFileUrl){
    URL.revokeObjectURL(activeFileUrl);
    activeFileUrl="";
  }
}

async function handleSellerAction(uid,action,note=""){
  if(!uid)return;

  if(action==="identity-verify"||action==="identity-reject"){
    await api("admin-identity",{
      method:"POST",
      body:{
        uid,
        status:action==="identity-verify"?"verified":"rejected",
        note
      }
    });
  }

  if(action==="proof-match"||action==="proof-mismatch"){
    await api("admin-address-proof",{
      method:"POST",
      body:{
        uid,
        matches:action==="proof-match",
        note
      }
    });
  }

  if(action==="company-approve"||action==="company-reject"){
    await api("admin-approval",{
      method:"POST",
      body:{
        uid,
        status:action==="company-approve"?"approved":"rejected",
        note
      }
    });
  }
}

async function loadOverview(){
  const d=await api("admin-overview");
  document.querySelector("[data-stat-sellers]").textContent=d.stats?.sellers??0;
  document.querySelector("[data-stat-pending]").textContent=d.stats?.pendingSellers??0;
  document.querySelector("[data-stat-products]").textContent=d.stats?.products??0;
  document.querySelector("[data-stat-orders]").textContent=d.stats?.orders??0;
}

async function loadSellers(){
  const d=await api("admin-sellers");
  sellers=d.sellers||[];
  renderSellers();
}

async function loadCatalog(){
  const d=await api("admin-catalog");
  products=d.products||[];
  orders=d.orders||[];
  renderProducts();
  renderOrders();
}

async function loadAdmins(){
  try{
    const d=await api("admin-users");
    const tbody=document.querySelector("[data-admin-users]");
    tbody.innerHTML=(d.admins||[]).map(a=>`<tr>
      <td>${safe(a.email)}</td>
      <td>${safe(a.role||"admin")}</td>
      <td>${a.active===false?"Inactive":"Active"}</td>
    </tr>`).join("")||'<tr><td colspan="3">No admins.</td></tr>';
  }catch(e){
    document.querySelector("[data-admin-users]").innerHTML=
      '<tr><td colspan="3">Super Admin access is required.</td></tr>';
  }
}

async function reloadAll(){
  await Promise.all([
    loadOverview(),
    loadSellers(),
    loadCatalog(),
    loadAdmins()
  ]);
}

/* Primary admin navigation */
document.querySelectorAll("[data-view]").forEach(btn=>btn.addEventListener("click",()=>{
  const v=btn.dataset.view;

  document.querySelectorAll("[data-view]").forEach(b=>{
    b.classList.toggle("active",b===btn);
  });

  document.querySelectorAll("[data-panel]").forEach(p=>{
    p.classList.toggle("active",p.dataset.panel===v);
  });

  document.querySelector("[data-page-title]").textContent=btn.textContent.trim();
}));

/* Seller list filters */
document.querySelector("[data-seller-search]")?.addEventListener("input",event=>{
  sellerSearch=event.currentTarget.value||"";
  renderSellers();
});

document.querySelectorAll("[data-seller-filter]").forEach(btn=>{
  btn.addEventListener("click",()=>{
    sellerFilter=btn.dataset.sellerFilter||"all";
    document.querySelectorAll("[data-seller-filter]").forEach(b=>{
      b.classList.toggle("active",b===btn);
    });
    renderSellers();
  });
});

/* Orders search */
document.querySelector("[data-order-search]")?.addEventListener("input",event=>{
  orderSearch=event.currentTarget.value||"";
  renderOrders();
});

/* Product filters */
document.querySelectorAll("[data-product-filter]").forEach(btn=>btn.addEventListener("click",()=>{
  productFilter=btn.dataset.productFilter;
  document.querySelectorAll("[data-product-filter]").forEach(b=>{
    b.classList.toggle("active",b===btn);
  });
  renderProducts();
}));

/* Global seller-open buttons */
document.addEventListener("click",event=>{
  const button=event.target.closest("[data-open-seller]");
  if(!button)return;
  openSeller(button.dataset.openSeller);
});

/* Product review */
document.querySelector("[data-products]").addEventListener("click",async e=>{
  const btn=e.target.closest("[data-product-action]");
  if(!btn)return;

  const card=btn.closest("[data-product]");
  const decision=btn.dataset.productAction;
  const note=card.querySelector("[data-product-note]")?.value.trim()||"";

  btn.disabled=true;
  clearStatus();

  try{
    await api("admin-product-review",{
      method:"POST",
      body:{
        uid:card.dataset.seller,
        productId:card.dataset.product,
        decision,
        note
      }
    });

    showStatus(`Product ${decision}.`,"success");
    await loadCatalog();
    await loadOverview();

    if(activeSellerUid===card.dataset.seller){
      await openSeller(activeSellerUid);
    }
  }catch(err){
    showStatus(err.message);
    btn.disabled=false;
  }
});

/* Seller quick actions */
document.querySelector("[data-sellers]").addEventListener("click",async e=>{
  const btn=e.target.closest("[data-seller-action]");
  if(!btn)return;

  const card=btn.closest("[data-seller]");
  const uid=card.dataset.seller;
  const action=btn.dataset.sellerAction;

  btn.disabled=true;
  clearStatus();

  try{
    await handleSellerAction(uid,action);
    showStatus("Seller record updated.","success");
    await loadSellers();
    await loadOverview();
  }catch(err){
    showStatus(err.message);
    btn.disabled=false;
  }
});

/* Seller 360 tabs */
document.querySelectorAll("[data-seller360-tab]").forEach(button=>{
  button.addEventListener("click",()=>{
    switchSeller360Tab(button.dataset.seller360Tab);
  });
});

document.querySelectorAll("[data-close-seller-drawer]").forEach(button=>{
  button.addEventListener("click",closeSeller);
});

document.querySelector("[data-seller360-review-actions]")?.addEventListener("click",async event=>{
  const button=event.target.closest("[data-detail-action]");
  if(!button||!activeSellerUid)return;

  const action=button.dataset.detailAction;
  const note=document.querySelector("[data-seller360-note]")?.value.trim()||"";

  button.disabled=true;
  clearStatus();

  try{
    await handleSellerAction(activeSellerUid,action,note);
    showStatus("Seller verification record updated.","success");

    await Promise.all([
      loadSellers(),
      loadOverview()
    ]);

    await openSeller(activeSellerUid);
  }catch(err){
    showStatus(err.message);
    button.disabled=false;
  }
});

document.querySelector("[data-seller360-files]")?.addEventListener("click",event=>{
  const button=event.target.closest("[data-verification-file]");
  if(!button)return;
  openVerificationFile(button.dataset.verificationFile);
});

document.querySelectorAll("[data-close-file-viewer]").forEach(button=>{
  button.addEventListener("click",closeFileViewer);
});

document.addEventListener("keydown",event=>{
  if(event.key!=="Escape")return;

  if(!document.querySelector("[data-admin-file-viewer]").hidden){
    closeFileViewer();
    return;
  }

  if(!document.querySelector("[data-seller-drawer]").hidden){
    closeSeller();
  }
});

/* Admin management */
document.querySelector("[data-admin-form]").addEventListener("submit",async e=>{
  e.preventDefault();

  const fd=new FormData(e.currentTarget);
  const btn=e.currentTarget.querySelector("button");
  btn.disabled=true;

  try{
    await api("admin-users",{
      method:"POST",
      body:Object.fromEntries(fd.entries())
    });

    e.currentTarget.reset();
    showStatus("Admin user saved.","success");
    await loadAdmins();
  }catch(err){
    showStatus(err.message);
  }finally{
    btn.disabled=false;
  }
});

document.querySelector("[data-signout]").addEventListener("click",async()=>{
  await signOut(auth);
  location.href="admin-login.html";
});

onAuthStateChanged(auth,async current=>{
  if(!current){
    location.replace("admin-login.html");
    return;
  }

  user=current;

  try{
    const s=await api("admin-session");
    session=s.admin||{};

    document.querySelector("[data-admin-email]").textContent=
      session.email||current.email||"Admin";

    document.querySelector("[data-admin-role]").textContent=
      String(session.role||"admin").replace("_"," ").toUpperCase();

    await reloadAll();
  }catch(err){
    console.error("Admin session failed",err);

    try{
      await signOut(auth);
    }catch(_){}

    const reason=encodeURIComponent(
      err.message||
      "This account does not have Teyza administrator access."
    );

    location.replace("admin-login.html?error="+reason);
  }
});
