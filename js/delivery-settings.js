import {getBusinessContext,workspaceError} from "./business-context.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {doc,getDoc} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import {getFunctions,httpsCallable} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-functions.js";
import {app,auth,db} from "./firebase-config.js";

const functions=getFunctions(app);
const getOps=httpsCallable(functions,"getSellerOperations");
const saveOps=httpsCallable(functions,"saveSellerOperations");
let businessId="";let selectedMode="courier";

function setMode(mode){selectedMode=mode;document.querySelectorAll("[data-mode]").forEach(b=>b.classList.toggle("active",b.dataset.mode===mode));}
document.querySelectorAll("[data-mode]").forEach(b=>b.addEventListener("click",()=>setMode(b.dataset.mode)));

function fill(d){if(!d)return;setMode(d.fulfilmentMode||"courier");document.getElementById("courierPreference").value=d.courierPreference||"";document.getElementById("pickupAddress").value=d.pickupAddress||"";document.getElementById("baseDeliveryFee").value=d.baseDeliveryFee||0;document.getElementById("freeDeliveryThreshold").value=d.freeDeliveryThreshold||0;document.getElementById("deliveryRadiusKm").value=d.deliveryRadiusKm||0;document.getElementById("allowCustomerPickup").checked=Boolean(d.allowCustomerPickup);document.getElementById("trackingEnabled").checked=d.trackingEnabled!==false;}

async function resolveBusiness(user){return (await getBusinessContext(user)).businessId;}

document.getElementById("saveDelivery")?.addEventListener("click",async()=>{const status=document.getElementById("saveStatus");const btn=document.getElementById("saveDelivery");if(!businessId){status.textContent="Load your business profile before saving.";return;}btn.disabled=true;status.textContent="Saving...";try{await saveOps({businessId,section:"delivery",data:{fulfilmentMode:selectedMode,courierPreference:document.getElementById("courierPreference").value,pickupAddress:document.getElementById("pickupAddress").value,baseDeliveryFee:Number(document.getElementById("baseDeliveryFee").value||0),freeDeliveryThreshold:Number(document.getElementById("freeDeliveryThreshold").value||0),deliveryRadiusKm:Number(document.getElementById("deliveryRadiusKm").value||0),allowCustomerPickup:document.getElementById("allowCustomerPickup").checked,trackingEnabled:document.getElementById("trackingEnabled").checked}});status.textContent="Saved ✓";}catch(error){console.error(error);status.textContent=workspaceError(error,"save delivery settings");}finally{btn.disabled=false;}});

onAuthStateChanged(auth,async user=>{
 if(!user)return;
 try{
  businessId=await resolveBusiness(user);
  if(!businessId)return;
  const res=await getOps({businessId});fill(res.data?.delivery);
 }catch(error){console.error(error);document.getElementById('saveStatus').textContent=workspaceError(error,'load delivery settings');}
});
