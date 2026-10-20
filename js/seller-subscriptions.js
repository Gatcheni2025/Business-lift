import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {auth} from "./firebase-config.js";
const status=document.getElementById("planStatus");
const buttons=[...document.querySelectorAll("[data-plan]")];
let seller=null;
const listingConsent=document.getElementById('listingConsent');
const labels={basic:"Basic • R99/month",plus:"Plus • Quote requested",sponsored:"Sponsored • Quote requested"};
function message(value,isError=false){status.textContent=value;status.classList.toggle("error",isError)}
async function subscription(action,plan){
  const token=await seller.getIdToken();
  const res=await fetch("api/workspace.php?action="+action,{
    method:plan?"POST":"GET",
    headers:{"Authorization":"Bearer "+token,...(plan?{"Content-Type":"application/json"}:{})},
    ...(plan?{body:JSON.stringify({plan,publicListingConsent:listingConsent.checked})}:{})
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok||!data.ok)throw new Error(data.error||"Unable to save your subscription request");
  return data;
}
function show(data){
  const sub=data.subscription||{};
  const plan=sub.plan;
  if(!plan){message("Choose a listing plan above to request activation.");return}
  const state=sub.status==="active"?"Active — see expiry in your dashboard":
    sub.status==="pending_payment"?"Awaiting verified payment":
    sub.status==="quote_requested"?"Your quotation request has been recorded":
    "Pending review";
  message("Selected plan: "+(labels[plan]||plan)+"\nStatus: "+state+
    (sub.expiresAt?"\nExpires: "+new Date(sub.expiresAt).toLocaleDateString("en-ZA"):"")+
    "\nTeyza will not activate a paid listing until payment is independently verified.");
}
onAuthStateChanged(auth,async user=>{
  seller=user;
  if(!user){
    buttons.forEach(b=>b.disabled=true);
    message("Log in to your seller account to choose a plan. Returning to login…");
    setTimeout(()=>location.replace("index.html?auth=login"),1900);
    return;
  }
  try {show(await subscription("seller-subscription"))}
  catch(e){message(e.message,true)}
});
buttons.forEach(button=>button.addEventListener("click",async()=>{
  if(!seller)return;
  if(!listingConsent.checked){message('Please confirm public shop listing consent before choosing a plan.',true);return;}
  const plan=button.dataset.plan;
  const existing=buttons.map(b=>b.disabled);
  buttons.forEach(b=>b.disabled=true);
  message("Saving your selection…");
  try {show(await subscription("seller-subscription",plan))}
  catch(e){message(e.message,true)}
  finally {buttons.forEach((b,i)=>b.disabled=existing[i])}
}));
