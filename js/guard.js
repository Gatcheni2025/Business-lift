import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {auth} from "./firebase-config.js";
import {getBusinessContext,hydrateBusiness,workspaceError} from "./business-context.js";
const page=location.pathname.split('/').pop() || 'dashboard.html';
onAuthStateChanged(auth, async user => {
 if(!user){location.replace('index.html?auth=login&redirect='+encodeURIComponent(page+location.search+location.hash));return;}
 // Show the account identity even when the business service is unavailable.
 document.querySelectorAll('[data-auth-name]').forEach(el=>el.textContent=user.displayName || 'Business owner');
 document.querySelectorAll('[data-auth-initial]').forEach(el=>el.textContent=(user.displayName || user.email || 'U')[0].toUpperCase());
 try {
  const context=await getBusinessContext(user);
  hydrateBusiness(context,user);
  if(context.categorySelectionRequired){
    location.replace("index.html?auth=login");
    return;
  }
  const category=context.sellerCategory||context.business?.sellerCategory||"spaza";
  if(page==="dashboard.html" && category==="retail"){
    location.replace("retailer-dashboard.html"+location.search);return;
  }
  if(page==="dashboard.html" && category==="spaza" &&
     new URLSearchParams(location.search).has("onboarding")){
    const token=await user.getIdToken();
    const response=await fetch('api/workspace.php?action=seller-readiness',{
      headers:{Authorization:'Bearer '+token},cache:'no-store'});
    const readiness=await response.json().catch(()=>({}));
    if(!response.ok||!readiness.ok)throw new Error(readiness.error||'Seller onboarding is temporarily unavailable');
    if(!readiness.productReady){
      location.replace('business-profile.html?setup=spaza');return;
    }
    // Clear an old setup marker for an already-approved Spaza owner.
    history.replaceState({},'', 'dashboard.html');
  }
  if(page==="retailer-dashboard.html" && category!=="retail"){
    location.replace("dashboard.html");return;
  }
  if(!context.businessId && page!=='business-profile.html'&&page!=='dashboard.html'){location.replace((category==='retail'?'retailer-dashboard.html':'dashboard.html')+'?onboarding=1');return;}
  const setupPages=new Set(['dashboard.html','business-profile.html','seller-activation.html','delivery-settings.html','payments.html','seller-onboarding.html','retailer-dashboard.html']);
  if(!setupPages.has(page)){
   const token=await user.getIdToken();
   const response=await fetch('api/workspace.php?action=seller-readiness',{headers:{Authorization:'Bearer '+token}});
   const readiness=await response.json();
   if(response.ok&&readiness.ok&&!readiness.productReady){
    location.replace((category==='retail'?'retailer-dashboard.html':'dashboard.html')+'?onboarding=1');return;
   }
  }
 } catch(error) {
  console.error('Business access failed',error);
  const status=document.querySelector('[data-workspace-status]');
  if(status){status.hidden=false;status.classList.add('error');status.textContent=workspaceError(error);}
 }
});
