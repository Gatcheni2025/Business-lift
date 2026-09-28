import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {auth} from "./firebase-config.js";
import {getWorkspaceSection,saveWorkspaceSection} from "./business-context.js?v=2";
import {methods,methodByCode,methodFromSaved} from "./delivery-methods.js";

const modal=document.querySelector("#teyzaOnboarding"),message=document.querySelector("[data-ob-message]");
const frame=document.querySelector("[data-ob-business-frame]");
const q=s=>document.querySelector(s),all=s=>[...document.querySelectorAll(s)];
let user=null,state=null,pay="eft",loading=false;
const deliverySelect=q("[data-ob-delivery-method]");
const bankSelect=q("[data-ob-bank]"),branchInput=q("[data-ob-branch]");
deliverySelect.innerHTML=methods.map(method=>`<option value="${method.code}">${method.name}</option>`).join("");
function deliveryGuide(method){
  const guide=q("[data-ob-guide]");guide.replaceChildren();
  guide.append(document.createTextNode(method.detail+(method.guide===null?" Quote needed.":` Published guide: R${method.guide.toFixed(2)}.`)+" Set your own customer fee; actual carrier charges can vary. "));
  if(method.source){const link=document.createElement("a");link.href=method.source;link.target="_blank";link.rel="noopener noreferrer";link.textContent="See provider price ↗";guide.append(link);}
}
deliverySelect.addEventListener("change",()=>{const method=methodByCode(deliverySelect.value);deliveryGuide(method);q("[data-ob-fee]").value=method.guide===null?"":method.guide.toFixed(2);});
function bankOption(){return bankSelect?.selectedOptions?.[0]||null;}
function syncBranch({force=true}={}){
  if(!bankSelect||!branchInput)return;
  const option=bankOption(),code=String(option?.dataset?.branch||"");
  const manual=bankSelect.value==="__other__"||!code;
  branchInput.readOnly=!manual;
  branchInput.placeholder=manual?"Enter 6-digit branch code":"Universal branch code";
  if(force)branchInput.value=code;
}
bankSelect?.addEventListener("change",()=>syncBranch({force:true}));
function setSavedBank(name,branchCode){
  if(!bankSelect||!branchInput)return;
  const saved=String(name||"").trim(),branch=String(branchCode||"").trim();
  if(saved){
    let option=[...(bankSelect.options||[])].find(item=>item.value===saved);
    if(!option&&typeof document.createElement==="function"){
      option=document.createElement("option");option.value=saved;option.textContent=branch?`${saved} · ${branch}`:saved;
      if(branch)option.dataset.branch=branch;
      bankSelect.append(option);
    }
    bankSelect.value=saved;
  }
  const option=bankOption(),known=String(option?.dataset?.branch||"");
  branchInput.value=branch||known;
  branchInput.readOnly=Boolean(known)&&bankSelect.value!=="__other__";
  branchInput.placeholder=branchInput.readOnly?"Universal branch code":"Enter 6-digit branch code";
}
function notice(value){message.hidden=!value;message.textContent=value||"";}
async function api(action){
  const token=await user.getIdToken();
  const response=await fetch("api/workspace.php?action="+action,{headers:{Authorization:"Bearer "+token}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.ok)throw new Error(data.error||"Seller setup is unavailable. Please retry.");
  return data;
}
function yes(selector,done,label){const element=q(selector);element.textContent=(done?"✓ ":"○ ")+label;element.classList.toggle("done",!!done);}
function stage(number){
  all("[data-ob-step]").forEach(element=>element.hidden=Number(element.dataset.obStep)!==number);
  all("[data-ob-tab]").forEach(element=>{
    const step=Number(element.dataset.obTab);
    element.classList.toggle("active",step===number);
    element.classList.toggle("done",step<number);
    element.disabled=step>number;
  });
  q("[data-ob-count]").textContent=`Step ${number} of 3`;
  if(number===1&&!frame.getAttribute("src"))frame.src="business-profile.html?embedded=1&setup=1";
}
function choosePayment(type){
  pay=type;
  all("[data-ob-pay]").forEach(item=>item.classList.toggle("active",item.dataset.obPay===type));
  all("[data-ob-pay-fields]").forEach(item=>item.hidden=item.dataset.obPayFields!==type);
}
function fillDelivery(data){
  const method=methodFromSaved(data);
  deliverySelect.value=method.code;deliveryGuide(method);
  q("[data-ob-address]").textContent=state.businessVerification?.location?.address||"Verify your business address first";
  q("[data-ob-fee]").value=data.baseDeliveryFee??method.guide??"";
}
function fillPayment(banking,payfast,other){
  setSavedBank(banking.bankName||"",banking.branchCode||"");
  q("[data-ob-holder]").value=banking.accountHolder||"";
  q("[data-ob-merchant]").value=payfast.merchantId||"";
  const gateway=String(other.otherGateway||"").trim();
  const reference=other.otherReference||"";
  q("[data-ob-yeyza-reference]").value=gateway.toLowerCase()==="yeyza"?reference:"";
  q("[data-ob-ozow-reference]").value=gateway.toLowerCase()==="ozow"?reference:"";
  q("[data-ob-gateway]").value=!["yeyza","ozow"].includes(gateway.toLowerCase())?gateway:"";
  q("[data-ob-reference]").value=!["yeyza","ozow"].includes(gateway.toLowerCase())?reference:"";
  if(banking.bankName)choosePayment("eft");
  else if(payfast.merchantId)choosePayment("payfast");
  else if(gateway.toLowerCase()==="yeyza")choosePayment("yeyza");
  else if(gateway.toLowerCase()==="ozow")choosePayment("ozow");
  else if(gateway)choosePayment("other");
  else choosePayment("eft");
}
async function load(){
  if(!user||loading)return;
  loading=true;
  try{
    state=await api("seller-readiness");
    if(state.productReady){modal.hidden=true;document.body.classList.remove("ob2-open");return;}
    modal.hidden=false;document.body.classList.add("ob2-open");
    const v=state.businessVerification||{};
    yes("[data-ob-business-info]",!state.missingBusinessFields?.length,"Business information");
    yes("[data-ob-phone]",v.phoneVerified,"Phone verification");
    yes("[data-ob-identity]",v.identitySubmitted||v.identityVerified,"ID + live selfie");
    yes("[data-ob-location]",v.locationConfirmed,"Location confirmed");
    yes("[data-ob-proof]",v.proofOfAddressUploaded,"Proof of address");
    if(!state.businessComplete){stage(1);return;}
    if(!state.deliveryComplete){
      const delivery=(await getWorkspaceSection(user,"delivery")).data||{};
      fillDelivery(delivery);stage(2);return;
    }
    const [banking,payfast,other]=await Promise.all(["banking","payfast","paymentPreferences"].map(section=>getWorkspaceSection(user,section)));
    fillPayment(banking.data||{},payfast.data||{},other.data||{});stage(3);
  }finally{loading=false;}
}
async function reload(){try{await load();notice("");}catch(error){notice(error.message);}}
window.addEventListener("message",event=>{
  if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.type!=="teyza-onboarding-progress")return;
  reload();
});
q("[data-ob-refresh]").addEventListener("click",async()=>{
  await reload();
  if(!state?.businessComplete)notice("Complete every business field and the four verification checks above to continue.");
});
q("[data-ob-save-delivery]").addEventListener("click",async event=>{
  const button=event.currentTarget;button.disabled=true;
  try{
    const method=methodByCode(deliverySelect.value),location=state.businessVerification?.location||{},address=String(location.address||"").trim();
    const fee=Number(q("[data-ob-fee]").value);
    if(!state.businessVerification?.locationConfirmed||!address)throw new Error("Confirm your business address on the map before setting delivery.");
    if(q("[data-ob-fee]").value===""||!Number.isFinite(fee)||fee<0)throw new Error("Enter the delivery fee you will charge customers.");
    await saveWorkspaceSection(user,"delivery",{fulfilmentMode:method.mode,serviceCode:method.code,courierPreference:method.provider,pickupAddress:address,pickupLocation:{lat:location.lat,lng:location.lng},baseDeliveryFee:fee,trackingEnabled:true});
    await reload();
  }catch(error){notice(error.message);}finally{button.disabled=false;}
});
all("[data-ob-pay]").forEach(button=>button.addEventListener("click",()=>choosePayment(button.dataset.obPay)));
q("[data-ob-save-payment]").addEventListener("click",async event=>{
  const button=event.currentTarget;button.disabled=true;
  try{
    if(pay==="eft"){
      const bank=bankSelect.value.trim(),holder=q("[data-ob-holder]").value.trim(),account=q("[data-ob-account]").value.trim(),branch=branchInput.value.trim();
      if(!bank||bank==="__other__"&&!branch||!holder||!account)throw new Error("Complete the bank, account holder, account number and branch code.");
      if(!/^\d{6}$/.test(branch))throw new Error("Branch code must be 6 digits.");
      await saveWorkspaceSection(user,"banking",{bankName:bank==="__other__"?"Other South African bank":bank,accountHolder:holder,accountNumber:account,accountNumberLast4:account.slice(-4),branchCode:branch,accountType:"Business"});
    }else if(pay==="yeyza"){
      await saveWorkspaceSection(user,"paymentPreferences",{otherGateway:"Yeyza",otherReference:q("[data-ob-yeyza-reference]").value.trim()});
    }else if(pay==="ozow"){
      await saveWorkspaceSection(user,"paymentPreferences",{otherGateway:"Ozow",otherReference:q("[data-ob-ozow-reference]").value.trim()});
    }else if(pay==="payfast"){
      const id=q("[data-ob-merchant]").value.trim(),key=q("[data-ob-key]").value;
      if(!id||!key)throw new Error("Enter your PayFast Merchant ID and Merchant Key.");
      await saveWorkspaceSection(user,"payfast",{merchantId:id,merchantKey:key,connected:true});
    }else{
      const gateway=q("[data-ob-gateway]").value.trim();
      if(!gateway)throw new Error("Enter your payment gateway.");
      await saveWorkspaceSection(user,"paymentPreferences",{otherGateway:gateway,otherReference:q("[data-ob-reference]").value.trim()});
    }
    await reload();
    if(state?.productReady)location.assign("products.html#new-product");
    else notice("Setup is saved, but a required verification is still incomplete. Finish the highlighted step.");
  }catch(error){notice(error.message);}finally{button.disabled=false;}
});
onAuthStateChanged(auth,async current=>{if(!current)return;user=current;await reload();});
