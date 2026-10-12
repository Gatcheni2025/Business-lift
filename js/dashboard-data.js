import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {auth} from "./firebase-config.js";
import {getBusinessContext,getWorkspaceSummary,hydrateBusiness,workspaceError} from "./business-context.js";

const API_BASE=location.hostname.endsWith(".vercel.app")?"/backend":"api";
const moneyShort=new Intl.NumberFormat("en-ZA",{style:"currency",currency:"ZAR",maximumFractionDigits:0});
const money=new Intl.NumberFormat("en-ZA",{style:"currency",currency:"ZAR",minimumFractionDigits:2,maximumFractionDigits:2});
const set=(selector,value)=>document.querySelectorAll(selector).forEach(node=>node.textContent=value);
const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
const totalOf=order=>Number(order.total??order.totalAmount??order.grandTotal??0)||0;
const normalizedStatus=order=>String(order.orderStatus||order.status||"new").toLowerCase();

function showError(message){
  const node=document.querySelector("[data-dashboard-status]");
  if(!node)return;
  node.hidden=false;node.textContent=message;node.classList.add("error");
}

async function getReadiness(user){
  const token=await user.getIdToken();
  const response=await fetch(`${API_BASE}/workspace.php?action=seller-readiness`,{headers:{Authorization:"Bearer "+token},cache:"no-store"});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.ok)throw new Error(data.error||"Unable to check seller verification.");
  return data;
}

async function getChatInbox(user){
  try{
    const token=await user.getIdToken();
    const url=new URL(`${API_BASE}/chat.php`,location.origin);url.searchParams.set("mode","seller-inbox");
    const response=await fetch(url,{headers:{Authorization:"Bearer "+token},cache:"no-store"});
    const data=await response.json().catch(()=>({}));
    return response.ok&&data.ok?(data.threads||[]):[];
  }catch(_){return []}
}

function renderApprovalTag(readiness){
  const tag=document.querySelector("[data-seller-approval-tag]");
  const text=document.querySelector("[data-seller-approval-text]");

  if(!tag||!text)return;

  const approval=readiness.companyApproval||{};
  const status=String(approval.status||"").toLowerCase();
  const submitted=Boolean(approval.submittedAt);

  /*
   * Only show "Pending admin approval" after the seller has
   * actually submitted the verification/company-approval package.
   */
  if(status==="pending"&&submitted){
    tag.hidden=false;
    tag.dataset.approvalState="pending";
    text.textContent="Pending admin approval";
    tag.title="Your seller verification has been submitted and is waiting for Teyza admin review.";
    return;
  }

  if(status==="approved"){
    tag.hidden=false;
    tag.dataset.approvalState="approved";
    text.textContent="Seller approved";
    tag.title="Your seller account has been approved by Teyza.";
    return;
  }

  if(status==="rejected"){
    tag.hidden=false;
    tag.dataset.approvalState="rejected";
    text.textContent="Admin action required";
    tag.title=approval.note||"Teyza requested changes to your seller verification.";
    return;
  }

  tag.hidden=true;
  delete tag.dataset.approvalState;
}

function renderReadiness(readiness){
  const dashboardAllowed=
    readiness.dashboardAccess===true ||
    readiness.sellerSetupComplete===true;

  console.info('[Teyza seller readiness]',{
    dashboardAccess:readiness.dashboardAccess,
    sellerSetupComplete:readiness.sellerSetupComplete,
    productReady:readiness.productReady,
    deliveryComplete:readiness.deliveryComplete,
    paymentComplete:readiness.paymentComplete,
    audienceComplete:readiness.audienceComplete,
    businessProfileComplete:readiness.businessProfileComplete,
    verificationComplete:readiness.verificationComplete,
    approvalComplete:readiness.approvalComplete
  });

  if(!dashboardAllowed){
    /*
     * guard.js is the single owner of access redirects.
     * Dashboard data must never create a second onboarding redirect loop.
     */
    return false;
  }

  document.querySelectorAll('[data-primary-seller-action]')
    .forEach(link=>link.href='sell.html');
  return true;
}

function renderOrders(orders){
  const list=document.querySelector("[data-recent-orders]");
  if(!list)return;
  if(!orders.length){
    list.innerHTML='<div class="empty-state"><h3>No sales yet</h3><p>Your first order will appear here after you start selling.</p></div>';
    return;
  }
  list.innerHTML=orders.slice(0,4).map(order=>{
    const status=normalizedStatus(order);
    const product=order.items?.[0]?.name||"Order";
    return '<a class="app-order-row" href="orders.html"><div><strong>'+escapeHtml(product)+'</strong><small>'+escapeHtml(order.customerName||order.customerId||"Customer")+' · '+escapeHtml(order.orderNumber||"Order")+'</small></div><div class="app-order-value">'+money.format(totalOf(order))+'<span class="app-status-mini">'+escapeHtml(status)+'</span></div></a>';
  }).join("");
}

function renderDeliveries(orders){
  const target=document.querySelector("[data-dashboard-deliveries]");
  if(!target)return;

  const active=orders.filter(order=>
    ["new","processing","shipping"].includes(
      normalizedStatus(order)
    )
  );

  if(!active.length){
    target.innerHTML='<div class="empty-state"><h3>No active deliveries</h3><p>Orders that need collection or delivery will appear here.</p></div>';
    return;
  }

  target.innerHTML=active.slice(0,6).map(order=>{
    const state=normalizedStatus(order);
    const customer=order.customerName||order.customerId||"Customer";
    const reference=order.trackingNumber||order.orderNumber||"Order";

    return '<a class="app-order-row" href="orders.html#fulfilment"><div><strong>'+
      escapeHtml(reference)+'</strong><small>'+
      escapeHtml(customer)+' · '+escapeHtml(state)+
      '</small></div><div class="app-order-value">'+
      money.format(totalOf(order))+
      '<span class="app-status-mini">'+escapeHtml(state)+
      '</span></div></a>';
  }).join("");
}

function renderChats(threads){
  const target=document.querySelector("[data-app-chat-preview]");
  if(!target)return;
  if(!threads.length){
    target.innerHTML='<div class="empty-state"><h3>No conversations yet</h3><p>Share your Teyza store or customer chat link. Buyer messages will appear here.</p><button class="button" type="button" data-open-seller-chat>Open live chat</button></div>';
    return;
  }
  target.innerHTML=threads.slice(0,4).map(thread=>{
    const unread=Number(thread.unreadSeller||0);
    const name=thread.clientName||"Customer";
    const initial=String(name).trim().slice(0,1).toUpperCase()||"C";
    const unreadHtml=unread?'<span class="app-unread-dot">'+(unread>99?"99+":unread)+'</span>':"";
    const message=thread.lastSender==="seller"?"You: "+String(thread.lastMessage||""):thread.lastMessage||"Conversation";
    return '<button class="app-chat-row" type="button" data-open-seller-chat><span class="app-chat-avatar">'+escapeHtml(initial)+'</span><span class="app-chat-copy"><strong>'+escapeHtml(name)+'</strong><small>'+escapeHtml(message)+'</small></span>'+unreadHtml+'</button>';
  }).join("");
}

async function load(user){
  const [context,summary,readiness,threads]=await Promise.all([getBusinessContext(user),getWorkspaceSummary(user),getReadiness(user),getChatInbox(user)]);
  hydrateBusiness(context,user);
  if(!renderReadiness(readiness))return;
  renderApprovalTag(readiness);

  const business=summary.business||context.business||{};
  const orders=summary.orders||[];
  const products=summary.products||[];
  const firstName=summary.firstName||context.userData?.firstName||user.displayName?.split(" ")[0]||"seller";
  set("[data-greeting-name]",firstName);

  const avatar=document.querySelector(".app-profile-avatar");
  if(avatar){
    const logo=business.logoUrl||"";
    avatar.textContent=logo?"":String(business.businessName||firstName||"T").slice(0,1).toUpperCase();
    avatar.style.backgroundImage=logo?'url("'+logo+'")':"";
    avatar.style.backgroundSize=logo?"cover":"";
    avatar.style.backgroundPosition="center";
  }

  const customers=new Set(orders.map(order=>order.customerId||order.customerEmail||order.customerName).filter(Boolean));
  const deliveries=orders.filter(order=>["new","processing","shipping"].includes(normalizedStatus(order))).length;
  const paidTotal=orders.filter(order=>String(order.paymentStatus||"pending").toLowerCase()==="paid").reduce((sum,order)=>sum+totalOf(order),0);

  set("[data-stat-customers]",customers.size.toLocaleString("en-ZA"));
  set("[data-stat-deliveries]",deliveries.toLocaleString("en-ZA"));
  set("[data-stat-paid]",moneyShort.format(paidTotal));

  renderOrders(orders);
  renderDeliveries(orders);
  renderChats(threads);

  const sellHero=document.querySelector("[data-app-sell-hero]");
  if(sellHero&&!sellHero.hidden&&products.length===0){
    const copy=sellHero.querySelector("p:not(.eyebrow)");
    if(copy)copy.textContent="You are verified and ready. Add your first product in one tap.";
  }
}

onAuthStateChanged(auth,user=>{
  if(!user)return;
  load(user).catch(error=>{
    console.error("Dashboard app failed",error);
    showError(workspaceError(error));
  });
});
