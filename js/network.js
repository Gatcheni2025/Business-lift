import {getBusinessContext,workspaceError} from "./business-context.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {auth} from "./firebase-config.js";
import {apiFetch} from "./api-client.js";
let businessId="";
function setStatus(message){const el=document.getElementById("networkStatus");if(el)el.textContent=message;}
async function loadProfile(){const result=await apiFetch("api/settings.php?section=partner");const p=result.data||{};document.getElementById("category").value=p.category||"";document.getElementById("serviceArea").value=p.serviceArea||"";document.getElementById("offers").value=p.offers||"";document.getElementById("needs").value=p.needs||"";document.getElementById("discoverable").checked=p.discoverable!==false;document.getElementById("allowContact").checked=p.allowContact!==false;}

document.getElementById("saveNetwork")?.addEventListener("click",async event=>{const btn=event.currentTarget;btn.disabled=true;btn.textContent="Saving…";try{await apiFetch("api/settings.php",{method:"PUT",body:JSON.stringify({section:"partner",data:{discoverable:document.getElementById("discoverable").checked,category:document.getElementById("category").value,serviceArea:document.getElementById("serviceArea").value,offers:document.getElementById("offers").value,needs:document.getElementById("needs").value,allowContact:document.getElementById("allowContact").checked}})});setStatus("Saved ✓");}catch(error){console.error(error);setStatus(workspaceError(error,"save network profile"));}finally{btn.disabled=false;btn.textContent="Save network profile";}});

onAuthStateChanged(auth,async user=>{if(!user)return window.location.href="login.html";try{businessId=(await getBusinessContext(user)).businessId;}catch(error){const status=document.querySelector("[data-workspace-status]");if(status){status.hidden=false;status.textContent=workspaceError(error);}return;}if(!businessId)return window.location.href="business-profile.html";try{await loadProfile();}catch(error){console.error(error);setStatus(workspaceError(error,"load network profile"));}});
