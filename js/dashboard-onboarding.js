/* Legacy compatibility module: old iframe popup retired as of full-site R3.
   This file remains only so stale cached HTML cannot open nested dashboards. */
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {auth} from "./firebase-config.js";

const legacy=document.querySelector("[data-dashboard-onboarding]");
if(legacy){
  legacy.hidden=true;
  legacy.remove();
  document.body.classList.remove("onboarding-modal-open");
}
onAuthStateChanged(auth,async user=>{
  if(!user||!location.pathname.endsWith("/dashboard.html"))return;
  try{
    const token=await user.getIdToken();
    const response=await fetch("api/workspace.php?action=seller-readiness",{
      cache:"no-store",headers:{Authorization:"Bearer "+token}
    });
    if(!response.ok)return;
    const readiness=await response.json();
    if(!readiness.ok)return;
    if(readiness.sellerCategory==="spaza"&&!readiness.productReady){
      const url="business-profile.html?setup=spaza";
      // Never nest another dashboard/verification dialog inside a frame.
      if(window.self!==window.top)window.top.location.replace(url);
      else location.replace(url);
    }
  }catch(error){
    console.warn("Old onboarding compatibility check:",error);
  }
});