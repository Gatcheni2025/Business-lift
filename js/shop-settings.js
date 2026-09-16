import {getBusinessContext,workspaceError} from "./business-context.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {auth} from "./firebase-config.js";
import {apiFetch} from "./api-client.js";
let businessId="";

onAuthStateChanged(auth,async user=>{
 if(!user)return window.location.href="login.html";
 try{businessId=(await getBusinessContext(user)).businessId;}catch(error){const status=document.querySelector("[data-workspace-status]");if(status){status.hidden=false;status.textContent=workspaceError(error);}return;}
 if(!businessId)return window.location.href="business-profile.html";
 try{const result=await apiFetch("api/settings.php?section=shop");const shop=result.data||{};document.getElementById("shopName").value=shop.shopName||"";document.getElementById("supportEmail").value=shop.supportEmail||"";document.getElementById("supportPhone").value=shop.supportPhone||"";document.getElementById("returnsPolicy").value=shop.returnsPolicy||"";document.getElementById("orderNotifications").checked=shop.orderNotifications!==false;document.getElementById("lowStockNotifications").checked=shop.lowStockNotifications!==false;}catch(error){console.error(error);}
});

document.getElementById("saveShop")?.addEventListener("click",async()=>{
 const btn=document.getElementById("saveShop");btn.disabled=true;btn.textContent="Saving...";
 try{await apiFetch("api/settings.php",{method:"PUT",body:JSON.stringify({section:"shop",data:{shopName:document.getElementById("shopName").value,supportEmail:document.getElementById("supportEmail").value,supportPhone:document.getElementById("supportPhone").value,returnsPolicy:document.getElementById("returnsPolicy").value,orderNotifications:document.getElementById("orderNotifications").checked,lowStockNotifications:document.getElementById("lowStockNotifications").checked}})});document.getElementById("saveStatus").textContent="Saved";}
 catch(error){document.getElementById("saveStatus").textContent=workspaceError(error,"save shop settings");console.error(error);}finally{btn.disabled=false;btn.textContent="Save settings";}
});
