import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {auth} from "./firebase-config.js";
import {getBusinessContext,getWorkspaceSection,saveWorkspaceSection,workspaceError} from "./business-context.js?v=2";

let currentUser=null,businessId="",selectedPay="eft",selectedGender="all";
const $=id=>document.getElementById(id);
function markStatus(id,text,done=true){const el=$(id);if(!el)return;el.textContent=text;el.classList.toggle("connected",done)}
function choosePayment(type){
 selectedPay=type;
 document.querySelectorAll("[data-pay]").forEach(b=>b.classList.toggle("active",b.dataset.pay===type));
 ["eft","yeyza","ozow","payfast","other"].forEach(name=>{const el=$(name+"Fields");if(el)el.style.display=name===type?"grid":"none"});
}
function syncBranch(force=true){
 const bank=$("bankName"),branch=$("branchCode");if(!bank||!branch)return;
 const option=bank.selectedOptions?.[0],code=String(option?.dataset?.branch||"");
 const manual=bank.value==="__other__"||!code;
 branch.readOnly=!manual;branch.placeholder=manual?"Enter 6-digit branch code":"Universal branch code";
 if(force)branch.value=code;
}
$("bankName")?.addEventListener("change",()=>syncBranch(true));
function setSavedBank(name,branchCode){
 const bank=$("bankName"),branch=$("branchCode");if(!bank||!branch)return;
 const saved=String(name||"").trim(),savedBranch=String(branchCode||"").trim();
 if(saved){
   let option=[...bank.options].find(item=>item.value===saved);
   if(!option){option=document.createElement("option");option.value=saved;option.textContent=savedBranch?`${saved} · ${savedBranch}`:saved;if(savedBranch)option.dataset.branch=savedBranch;bank.append(option);}
   bank.value=saved;
 }
 const option=bank.selectedOptions?.[0],known=String(option?.dataset?.branch||"");
 branch.value=savedBranch||known;branch.readOnly=Boolean(known)&&bank.value!=="__other__";branch.placeholder=branch.readOnly?"Universal branch code":"Enter 6-digit branch code";
}
async function readiness(payload){const token=await currentUser.getIdToken();const r=await fetch("api/workspace.php?action=seller-readiness",{method:"POST",headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},body:JSON.stringify(payload)});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.error||"Unable to update seller setup.");return d}
async function loadState(){
 const [delivery,banking,payfast,prefs,audience]=await Promise.all(["delivery","banking","payfast","paymentPreferences","audience"].map(s=>getWorkspaceSection(currentUser,s).then(r=>r.data||{}).catch(()=>({}))));
 if(delivery.fulfilmentMode){$("deliveryMethod").value=delivery.fulfilmentMode;$("deliveryProvider").value=delivery.courierPreference||"";$("dispatchAddress").value=delivery.pickupAddress||"";$("deliveryFee").value=delivery.baseDeliveryFee||0;markStatus("deliveryStatus","Saved")}
 if(banking.bankName){setSavedBank(banking.bankName||"",banking.branchCode||"");$("accountHolder").value=banking.accountHolder||"";if(banking.accountNumberLast4)$("accountNumber").placeholder="Saved account ending "+banking.accountNumberLast4;choosePayment("eft");markStatus("paymentStatus","Saved")}
 else if(payfast.merchantId){$("payfastMerchantId").value=payfast.merchantId||"";$("payfastSandbox").value=String(Boolean(payfast.sandboxMode));choosePayment("payfast");markStatus("paymentStatus","Saved")}
 else if(prefs.otherGateway){
   const gateway=String(prefs.otherGateway||"").toLowerCase();
   if(gateway==="yeyza"){$("yeyzaReference").value=prefs.otherReference||"";choosePayment("yeyza")}
   else if(gateway==="ozow"){$("ozowReference").value=prefs.otherReference||"";choosePayment("ozow")}
   else {$("otherGateway").value=prefs.otherGateway||"";$("otherReference").value=prefs.otherReference||"";choosePayment("other")}
   markStatus("paymentStatus","Saved");
 }
 if(audience.gender){selectedGender=audience.gender;document.querySelectorAll("[data-gender]").forEach(b=>b.classList.toggle("active",b.dataset.gender===selectedGender));$("ageRange").value=audience.ageRange||"All adults";$("targetArea").value=audience.targetArea||"";markStatus("audienceStatus","Saved")}
}
document.querySelectorAll("[data-pay]").forEach(btn=>btn.addEventListener("click",()=>choosePayment(btn.dataset.pay)));
document.querySelectorAll("[data-gender]").forEach(btn=>btn.addEventListener("click",()=>{selectedGender=btn.dataset.gender;document.querySelectorAll("[data-gender]").forEach(b=>b.classList.toggle("active",b===btn))}));
$("saveDelivery")?.addEventListener("click",async e=>{const b=e.currentTarget;b.disabled=true;b.textContent="Saving…";try{await saveWorkspaceSection(currentUser,"delivery",{fulfilmentMode:$("deliveryMethod").value,courierPreference:$("deliveryProvider").value,pickupAddress:$("dispatchAddress").value,baseDeliveryFee:Number($("deliveryFee").value||0),trackingEnabled:true});await readiness({deliveryComplete:true});markStatus("deliveryStatus","Saved")}catch(error){alert(workspaceError(error,"save delivery settings"))}finally{b.disabled=false;b.textContent="Save delivery"}});
$("savePayments")?.addEventListener("click",async e=>{const b=e.currentTarget;b.disabled=true;b.textContent="Saving…";try{
 if(selectedPay==="eft"){
   const n=$("accountNumber").value.trim(),saved=$("accountNumber").placeholder.includes("ending"),bank=$("bankName").value.trim(),branch=$("branchCode").value.trim();
   if(!bank||!$("accountHolder").value.trim()||(!n&&!saved))throw new Error("Complete the bank, account holder and account number.");
   if(!/^\d{6}$/.test(branch))throw new Error("Branch code must be 6 digits.");
   const data={bankName:bank==="__other__"?"Other South African bank":bank,accountHolder:$("accountHolder").value.trim(),branchCode:branch,accountType:"Business"};if(n){data.accountNumberLast4=n.slice(-4);data.accountNumber=n}await saveWorkspaceSection(currentUser,"banking",data)
 }
 else if(selectedPay==="yeyza"){await saveWorkspaceSection(currentUser,"paymentPreferences",{otherGateway:"Yeyza",otherReference:$("yeyzaReference").value.trim()})}
 else if(selectedPay==="ozow"){await saveWorkspaceSection(currentUser,"paymentPreferences",{otherGateway:"Ozow",otherReference:$("ozowReference").value.trim()})}
 else if(selectedPay==="payfast"){if(!$("payfastMerchantId").value.trim()||!$("payfastMerchantKey").value.trim())throw new Error("Enter your PayFast Merchant ID and Merchant Key.");await saveWorkspaceSection(currentUser,"payfast",{merchantId:$("payfastMerchantId").value.trim(),merchantKey:$("payfastMerchantKey").value,passphrase:$("payfastPassphrase").value,sandboxMode:$("payfastSandbox").value==="true",connected:true})}
 else {if(!$("otherGateway").value.trim())throw new Error("Enter the payment gateway name.");await saveWorkspaceSection(currentUser,"paymentPreferences",{otherGateway:$("otherGateway").value.trim(),otherReference:$("otherReference").value.trim()})}
 await readiness({paymentComplete:true,sellerSetupComplete:true});markStatus("paymentStatus","Saved");setTimeout(()=>{if(new URLSearchParams(location.search).get("embedded")==="1")parent.postMessage({type:"teyza-onboarding-next"},location.origin);else location.href="products.html#new-product";},500)
 }catch(error){alert(error.message||"Unable to save payment settings.")}finally{b.disabled=false;b.textContent="Save payment option"}});
$("saveAudience")?.addEventListener("click",async e=>{const b=e.currentTarget;b.disabled=true;try{await saveWorkspaceSection(currentUser,"audience",{gender:selectedGender,ageRange:$("ageRange").value,targetArea:$("targetArea").value});markStatus("audienceStatus","Saved")}catch(error){alert(workspaceError(error,"save audience"))}finally{b.disabled=false}});
onAuthStateChanged(auth,async user=>{if(!user)return location.href="index.html?auth=login";currentUser=user;try{const ctx=await getBusinessContext(user);businessId=ctx.businessId;if(!businessId)return location.href="business-profile.html?setup=1";await loadState();if(location.hash==="#payment-setup")setTimeout(()=>$("payment-setup")?.scrollIntoView({behavior:"smooth",block:"start"}),100)}catch(error){console.error("Seller setup load failed",error);const s=document.querySelector("[data-workspace-status]");if(s){s.hidden=false;s.textContent=workspaceError(error)}}});
