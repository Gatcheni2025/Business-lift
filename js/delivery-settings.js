import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {auth} from "./firebase-config.js";
import {getWorkspaceSection,saveWorkspaceSection,workspaceError} from "./business-context.js?v=2";
import {methods,methodByCode,methodFromSaved} from "./delivery-methods.js";

let user=null,selectedMode="courier",verifiedLocation=null;
const $=id=>document.getElementById(id);
const service=$("deliveryService"),fee=$("baseDeliveryFee"),status=$("saveStatus");
function renderGuide(method){
 const guide=$("deliveryGuide");guide.replaceChildren();
 guide.append(document.createTextNode(method.detail+(method.guide===null?" Ask the provider for a quote.":` Published guide: R${method.guide.toFixed(2)}.`)+" Your customer fee is editable; actual carrier charges vary. "));
 if(method.source){const link=document.createElement("a");link.href=method.source;link.target="_blank";link.rel="noopener noreferrer";link.textContent="Check provider pricing ↗";guide.append(link);}
}
function setMode(mode,saved){
 selectedMode=mode;
 document.querySelectorAll("[data-mode]").forEach(button=>button.classList.toggle("active",button.dataset.mode===mode));
 const available=methods.filter(method=>method.mode===mode);
 service.replaceChildren(...available.map(method=>new Option(method.name,method.code)));
 const chosen=saved?methodFromSaved(saved):available[0];
 service.value=available.some(method=>method.code===chosen.code)?chosen.code:available[0].code;
 renderGuide(methodByCode(service.value));
 if(!saved)fee.value=methodByCode(service.value).guide===null?"":methodByCode(service.value).guide.toFixed(2);
}
document.querySelectorAll("[data-mode]").forEach(button=>button.addEventListener("click",()=>setMode(button.dataset.mode)));
service.addEventListener("change",()=>{const method=methodByCode(service.value);renderGuide(method);fee.value=method.guide===null?"":method.guide.toFixed(2)});
async function readiness(){
 const token=await user.getIdToken();
 const response=await fetch("api/workspace.php?action=seller-readiness",{headers:{Authorization:"Bearer "+token}});
 const data=await response.json().catch(()=>({}));if(!response.ok||!data.ok)throw new Error(data.error||"Unable to load verified address.");
 return data;
}
onAuthStateChanged(auth,async current=>{
 if(!current)return;user=current;
 try{
  const [saved,state]=await Promise.all([getWorkspaceSection(user,"delivery"),readiness()]);const data=saved.data||{};
  verifiedLocation=state.businessVerification?.locationConfirmed?state.businessVerification.location:null;
  $("pickupAddress").value=verifiedLocation?.address||"";
  setMode(data.fulfilmentMode||"courier",data.fulfilmentMode?data:null);
  ["baseDeliveryFee","freeDeliveryThreshold","deliveryRadiusKm"].forEach(id=>{if(data[id]!=null)$(id).value=data[id]});
  $("allowCustomerPickup").checked=!!data.allowCustomerPickup;$("trackingEnabled").checked=data.trackingEnabled!==false;
  if(!verifiedLocation)status.textContent="Confirm your business address on the map in Business profile before saving delivery.";
 }catch(error){status.textContent=workspaceError(error,"load delivery settings");}
});
$("saveDelivery").addEventListener("click",async()=>{
 const button=$("saveDelivery");button.disabled=true;
 try{
  if(!verifiedLocation?.address)throw new Error("Confirm your business address on the map in Business profile first.");
  const method=methodByCode(service.value),amount=Number(fee.value);
  if(fee.value===""||!Number.isFinite(amount)||amount<0)throw new Error("Enter a valid customer delivery fee.");
  const data={fulfilmentMode:method.mode,serviceCode:method.code,courierPreference:method.provider,pickupAddress:verifiedLocation.address,pickupLocation:{lat:verifiedLocation.lat,lng:verifiedLocation.lng},baseDeliveryFee:amount,freeDeliveryThreshold:Number($("freeDeliveryThreshold").value||0),deliveryRadiusKm:Number($("deliveryRadiusKm").value||0),allowCustomerPickup:$("allowCustomerPickup").checked,trackingEnabled:$("trackingEnabled").checked};
  await saveWorkspaceSection(user,"delivery",data);
  status.textContent="Delivery saved. Collection uses your verified business address.";
  if(new URLSearchParams(location.search).get("embedded")==="1")parent.postMessage({type:"teyza-onboarding-next"},location.origin);
 }catch(error){status.textContent=workspaceError(error,"save delivery settings");}finally{button.disabled=false;}
});
