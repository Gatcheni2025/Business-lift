import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {auth} from "./firebase-config.js";
const $=s=>document.querySelector(s);
const checkNames={business:"Shop details",phone:"Phone OTP",identity:"ID/passport + face photo",location:"Shop address",photo:"Shop photo",approval:"Teyza approval"};
let user=null,readiness=null,subscription=null;
function message(t,error=false){const node=$("[data-activation-status]");node.textContent=t;node.classList.toggle("error",error)}
async function api(action,payload=null){
  if(!user)throw new Error("Sign in first");
  const token=await user.getIdToken();
  const r=await fetch("api/workspace.php?action="+encodeURIComponent(action),{
    method:payload?"POST":"GET",cache:"no-store",
    headers:{"Authorization":"Bearer "+token,...(payload?{"Content-Type":"application/json"}:{})},
    ...(payload?{body:JSON.stringify(payload)}:{})
  });
  const d=await r.json().catch(()=>({}));
  if(!r.ok||!d.ok)throw new Error(d.error||"Cannot access your seller account");
  return d;
}
function renderCheck(name,done){
  const n=$('[data-check="'+name+'"]');
  if(n){n.classList.toggle("done",!!done);n.textContent=(done?"✓ ":"○ ")+checkNames[name];}
}
async function refresh(){
  const [ready,sub,mandate]=await Promise.all([
    api("seller-readiness"),api("seller-subscription"),api("seller-debit-order")
  ]);
  readiness=ready;subscription=sub.subscription||{};
  if(ready.sellerCategory!=="spaza"){message("This page is for Spaza Shop owners. Retail or wholesale sellers should use their dedicated dashboard.",true);return}
  const v=ready.businessVerification||{},approved=ready.companyApproval?.status==="approved";
  renderCheck("business",!ready.missingBusinessFields?.length);
  renderCheck("phone",v.phoneVerified);
  renderCheck("identity",v.identitySubmitted);
  renderCheck("location",v.locationConfirmed);
  renderCheck("photo",v.shopPhotoUploaded);
  renderCheck("approval",approved);
  const required=!ready.missingBusinessFields?.length&&v.phoneVerified&&v.identitySubmitted&&v.locationConfirmed&&v.shopPhotoUploaded;
  const active=subscription.status==="active";
  const activate=$("[data-activate]");
  activate.disabled=!required||active;
  activate.textContent=active?"Basic listing active ✓":subscription.plan==="basic"?"Refresh R99 activation":"Request R99 debit-order activation →";
  const row=$("[data-mandate-row]"),link=$("[data-mandate-link]");
  row.hidden=!mandate.mandateReady;
  if(mandate.mandateReady){link.href=mandate.mandateUrl;}
  else link.removeAttribute("href");
  if(active)message("Your Basic subscription is marked active. See subscription details in your seller dashboard.");
  else if(!required)message("Save your shop name, address and shop photo; verify your phone; then submit your ID/passport and camera selfie to continue. Company registration is optional.");
  else if(!approved)message("Your details are submitted for priority review. You may request the monthly listing now, but publication waits for Teyza approval and verified payment.");
  else if(mandate.mandateReady)message("Your secure R99 monthly mandate link is ready. Open the payment provider page to authorise the debit order. Listing activation is still subject to verified payment.");
  else if(subscription.plan==="basic")message("Your R99/month Basic request is saved. Awaiting your unique secure mandate link from Teyza; do not send banking details by email or chat.");
  else message("Your account is ready to request the R99/month Basic listing.");
}
$("[data-activate]").addEventListener("click",async e=>{
  const b=e.currentTarget;
  if(!readiness||!user)return;
  if(!$("[data-listing-consent]").checked){message("Please read and accept the public listing and R99 monthly billing terms first.",true);return}
  b.disabled=true;
  try{
    if(subscription?.plan!=="basic"||subscription?.status!=="pending_payment"){
      await api("seller-subscription",{plan:"basic",publicListingConsent:true});
    }
    await refresh();
  }catch(err){message(err.message,true);b.disabled=false;}
});
onAuthStateChanged(auth,async current=>{
  user=current;
  if(!current){location.replace("index.html?auth=login&redirect=seller-activation.html");return}
  try{await refresh()}catch(err){message(err.message,true)}
});