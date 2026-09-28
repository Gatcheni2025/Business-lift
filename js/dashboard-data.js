import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {auth} from "./firebase-config.js";
import {getBusinessContext,getWorkspaceSummary,hydrateBusiness,workspaceError} from "./business-context.js";

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
  const response=await fetch("api/workspace.php?action=seller-readiness",{headers:{Authorization:"Bearer "+token},cache:"no-store"});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.ok)throw new Error(data.error||"Unable to check seller verification.");
  return data;
}

async function getChatInbox(user){
  try{
    const token=await user.getIdToken();
    const url=new URL("api/chat.php",location.href);url.searchParams.set("mode","seller-inbox");
    const response=await fetch(url,{headers:{Authorization:"Bearer "+token},cache:"no-store"});
    const data=await response.json().catch(()=>({}));
    return response.ok&&data.ok?(data.threads||[]):[];
  }catch(_){return []}
}

function updateVerifyStep(name,done){
  const node=document.querySelector('[data-v-step="'+name+'"]');
  if(!node)return;
  node.classList.toggle("done",!!done);
  const icon=node.querySelector("span");if(icon)icon.textContent=done?"✓":"○";
}

function renderReadiness(readiness){
  const v=readiness.businessVerification||{};
  const approved=String(readiness.companyApproval?.status||"pending").toLowerCase()==="approved";
  const identityDone=Boolean(v.identityVerified);
  const proofDone=Boolean(v.proofAddressMatchVerified);
  const checks={phone:Boolean(v.phoneVerified),identity:identityDone,location:Boolean(v.locationConfirmed),proof:proofDone,approval:approved};
  Object.entries(checks).forEach(([key,value])=>updateVerifyStep(key,value));
  const complete=Object.values(checks).filter(Boolean).length;
  set("[data-app-verification-score]",complete+"/5");

  const verificationCard=document.querySelector("[data-app-verification]");
  const sellHero=document.querySelector("[data-app-sell-hero]");
  const title=document.querySelector("[data-app-verification-title]");
  const copy=document.querySelector("[data-app-verification-copy]");
  const action=document.querySelector("[data-app-verification-action]");
  const dockSell=document.querySelector("[data-app-dock-sell]");
  const canSell=approved&&Boolean(readiness.productReady);

  let nextHref="business-profile.html?setup=1";
  let nextLabel="Continue verification →";
  let nextCopy="Complete your business details and verification checks once. Teyza will review your documents before selling is unlocked.";

  if(!checks.phone||!v.identitySubmitted||!checks.location||!v.proofOfAddressUploaded){
    nextHref="business-profile.html?setup=1";
  }else if(!identityDone||!proofDone||!approved){
    nextHref="business-profile.html";
    nextLabel="View verification status →";
    nextCopy="Your verification is being reviewed. Once approved, finish your delivery and banking preferences and start selling.";
  }else if(!readiness.deliveryComplete){
    nextHref="delivery-settings.html?setup=1";
    nextLabel="Set delivery →";
    nextCopy="Your business is verified. Choose how customers will receive orders.";
  }else if(!readiness.paymentComplete){
    nextHref="payments.html";
    nextLabel="Set banking →";
    nextCopy="Your business is verified. Add where your sales money should be paid.";
  }

  if(action){action.href=nextHref;action.textContent=nextLabel}
  if(title){
    if(canSell)title.textContent="Verified and ready to sell";
    else if(approved)title.textContent="Verified — finish your selling setup";
    else if(v.identitySubmitted)title.textContent="Verification in progress";
    else title.textContent="Get verified to unlock selling";
  }
  if(copy)copy.textContent=canSell?"Your Teyza seller account is ready. Tap Sell whenever you want to add something new.":nextCopy;

  if(verificationCard)verificationCard.hidden=canSell;
  if(sellHero)sellHero.hidden=!canSell;
  if(dockSell){
    dockSell.href=canSell?"products.html#new-product":nextHref;
    dockSell.title=canSell?"Sell a product":"Finish setup to unlock selling";
  }
  document.querySelectorAll("[data-primary-seller-action]").forEach(link=>{link.href=canSell?"products.html#new-product":nextHref;});
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
  renderReadiness(readiness);

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
