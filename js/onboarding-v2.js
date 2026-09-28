import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {auth} from "./firebase-config.js";
import {getWorkspaceSection,saveWorkspaceSection} from "./business-context.js";

const modal=document.querySelector("#teyzaOnboarding"),message=document.querySelector("[data-ob-message]");
const frame=document.querySelector("[data-ob-business-frame]");
const q=s=>document.querySelector(s),all=s=>[...document.querySelectorAll(s)];
let user=null,state=null,pay="eft",loading=false;
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
function fillDelivery(data){
  q("[data-ob-delivery-method]").value=data.fulfilmentMode||"courier";
  q("[data-ob-provider]").value=data.courierPreference||"";
  q("[data-ob-address]").value=data.pickupAddress||"";
  q("[data-ob-fee]").value=data.baseDeliveryFee??0;
}
function fillPayment(banking,payfast,other){
  q("[data-ob-bank]").value=banking.bankName||"";
  q("[data-ob-holder]").value=banking.accountHolder||"";
  q("[data-ob-branch]").value=banking.branchCode||"";
  q("[data-ob-merchant]").value=payfast.merchantId||"";
  q("[data-ob-gateway]").value=other.otherGateway||"";
  q("[data-ob-reference]").value=other.otherReference||"";
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
    const mode=q("[data-ob-delivery-method]").value,address=q("[data-ob-address]").value.trim();
    const fee=Number(q("[data-ob-fee]").value);
    if(!address)throw new Error("Enter a dispatch or collection address.");
    if(!Number.isFinite(fee)||fee<0)throw new Error("Enter a valid delivery fee.");
    await saveWorkspaceSection(user,"delivery",{fulfilmentMode:mode,courierPreference:q("[data-ob-provider]").value.trim(),pickupAddress:address,baseDeliveryFee:fee,trackingEnabled:true});
    await reload();
  }catch(error){notice(error.message);}finally{button.disabled=false;}
});
all("[data-ob-pay]").forEach(button=>button.addEventListener("click",()=>{
  pay=button.dataset.obPay;
  all("[data-ob-pay]").forEach(item=>item.classList.toggle("active",item===button));
  all("[data-ob-pay-fields]").forEach(item=>item.hidden=item.dataset.obPayFields!==pay);
}));
q("[data-ob-save-payment]").addEventListener("click",async event=>{
  const button=event.currentTarget;button.disabled=true;
  try{
    if(pay==="eft"){
      const bank=q("[data-ob-bank]").value.trim(),holder=q("[data-ob-holder]").value.trim(),account=q("[data-ob-account]").value.trim();
      if(!bank||!holder||!account)throw new Error("Complete the bank, account holder and account number.");
      await saveWorkspaceSection(user,"banking",{bankName:bank,accountHolder:holder,accountNumber:account,accountNumberLast4:account.slice(-4),branchCode:q("[data-ob-branch]").value.trim(),accountType:"Business"});
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
