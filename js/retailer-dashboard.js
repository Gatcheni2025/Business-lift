import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {auth} from "./firebase-config.js";
import {getBusinessContext,hydrateBusiness,getWorkspaceSummary,workspaceApi} from "./business-context.js";

const status=document.getElementById("retailStatus");
const form=document.getElementById("retailTypeForm");
let seller=null;
let approved=false;
const set=(selector,value)=>document.querySelectorAll(selector).forEach(e=>e.textContent=value);
function notify(text,error=false){status.textContent=text;status.classList.toggle("error",error)}
function step(name,ok){set('[data-r-step="'+name+'"]',ok?"Complete ✓":"Pending")}
function legalState(){
  const registered=form.elements.legalStructure.value==="registered";
  const row=document.getElementById("registrationRow");
  row.hidden=!registered;
  form.elements.registrationNumber.required=registered;
}
form.elements.legalStructure.addEventListener("change",legalState);
document.getElementById("retailMenuToggle").addEventListener("click",()=>{
  const side=document.getElementById("sidebar");
  const expanded=side.classList.toggle("is-open");
  document.getElementById("retailMenuToggle").setAttribute("aria-expanded",String(expanded));
});
async function show(){
  const [summary,details,readiness]=await Promise.all([
    getWorkspaceSummary(seller),
    workspaceApi(seller,"retail-details"),
    workspaceApi(seller,"seller-readiness")
  ]);
  const d=details.details||{};
  for(const key of ["retailKind","legalStructure","registrationNumber","minimumOrder"]) {
    if(d[key]!==undefined)form.elements[key].value=String(d[key]);
  }
  form.elements.businessCustomers.checked=d.businessCustomers===true;
  legalState();
  const business=summary.business||{};
  const v=readiness.businessVerification||{};
  const approval=readiness.companyApproval||{};
  approved=approval.status==="approved";
  set("[data-welcome]",(business.businessName||"Your shop")+" — Retail dashboard");
  set("[data-retail-products]",String((summary.products||[]).length));
  set("[data-retail-orders]",String((summary.orders||[]).length));
  set("[data-retail-approval]",approved?"Approved ✓":approval.status==="rejected"?"Needs correction":"Awaiting review");
  step("retail",details.complete===true);
  step("phone",v.phoneVerified===true);
  step("identity",v.identityVerified===true);
  step("location",v.locationConfirmed===true);
  step("address",v.proofAddressMatchVerified===true);
  step("approval",approved);
  for(const field of form.elements)if(field.name)field.disabled=approved;
  document.getElementById("saveRetail").disabled=approved;
  notify(approved?"Retail account approved. Company verification details are locked to protect your listing.":
    details.complete?"Retail business details saved. Continue your identity and shop address verification.":
    "Complete the retail business details below, then continue verification.");
}
form.addEventListener("submit",async e=>{
  e.preventDefault();
  if(!seller||approved||!form.reportValidity())return;
  const button=document.getElementById("saveRetail");
  button.disabled=true;
  notify("Saving retail shop details…");
  try {
    await workspaceApi(seller,"retail-details",{method:"POST",body:JSON.stringify({
      retailKind:form.elements.retailKind.value,
      legalStructure:form.elements.legalStructure.value,
      registrationNumber:form.elements.registrationNumber.value.trim(),
      minimumOrder:Number(form.elements.minimumOrder.value||0),
      businessCustomers:form.elements.businessCustomers.checked
    })});
    await show();
  }catch(error){notify(error.message||"Unable to save retail details.",true);}
  finally{button.disabled=approved;}
});
onAuthStateChanged(auth,async user=>{
  if(!user){
    location.replace("index.html?auth=login&redirect=retailer-dashboard.html");
    return;
  }
  seller=user;
  try {
    const ctx=await getBusinessContext(user);
    hydrateBusiness(ctx,user);
    if(ctx.sellerCategory!=="retail"){
      location.replace("dashboard.html");
      return;
    }
    await show();
  }catch(e){notify(e.message||"Unable to load retail dashboard. Try again.",true);}
});
