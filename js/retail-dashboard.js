import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {auth} from "./firebase-config.js";

const $=selector=>document.querySelector(selector);
let seller=null,category=null;
function status(message,warn=false){
  const node=$("[data-retail-status]");
  node.textContent=message;node.classList.toggle("warn",warn);
}
async function request(action,options={}){
  if(!seller)throw Error("Please log in first");
  const token=await seller.getIdToken();
  const response=await fetch("api/workspace.php?action="+encodeURIComponent(action),{
    ...options,headers:{"Authorization":"Bearer "+token,
      ...(options.body?{"Content-Type":"application/json"}:{}),...(options.headers||{})}
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.ok)throw Error(data.error||"Retail workspace unavailable");
  return data;
}
async function load(){
  const ctx=await request("context");
  category=ctx.business?.shopperCategory||ctx.shopperCategory||"spaza";
  if(category!=="variety"){
    window.location.replace("dashboard.html");
    return;
  }
  const business=ctx.business||{};
  $("[data-retail-name]").textContent=business.businessName||"Your retail shop";
  $("[data-retail-summary]").textContent="Retail & Wholesale • "+
    (business.retailKind||"general retailer").replaceAll("_"," ");
  const [readiness,summary,details]=await Promise.all([
    request("seller-readiness"),request("summary"),request("retail-details")
  ]);
  const approval=readiness.companyApproval?.status||"pending";
  $("[data-count-products]").textContent=String((summary.products||[]).length);
  $("[data-count-orders]").textContent=String((summary.orders||[]).length);
  $("[data-retail-approval]").textContent=approval==="approved"?"Approved":
    approval==="rejected"?"Needs review":"Pending";
  if(approval==="approved"){
    status("Your retail business is approved. Manage stock, prices, products and orders using the tools below.");
  }else{
    const checks=readiness.businessVerification||{};
    status("Retail business review: "+approval+". Complete phone, identity, confirmed map location and matching proof of address in your Business Profile. Approval is only granted after verification.",true);
  }
  const data=details.retailDetails||{};
  for(const field of ["retailKind","retailOperatingMode","retailTradingName","businessRegistrationNumber","vatNumber"]){
    const input=document.getElementById("retailDetails").elements.namedItem(field);
    if(input && data[field]!=null)input.value=data[field];
  }
  const current=document.getElementById("retailDetails").elements.namedItem("retailKind");
  if(!data.retailKind&&business.retailKind)current.value=business.retailKind;
}
document.getElementById("retailDetails").addEventListener("submit",async event=>{
  event.preventDefault();
  const form=event.currentTarget;
  const button=form.querySelector('button[type="submit"]');
  const node=$("[data-retail-form-status]");
  button.disabled=true;node.textContent="Saving retail details…";
  const data=Object.fromEntries(new FormData(form));
  try{
    await request("retail-details",{method:"POST",body:JSON.stringify(data)});
    node.textContent="Retail shop details saved successfully.";
  }catch(error){node.textContent=error.message;}
  finally{button.disabled=false;}
});
onAuthStateChanged(auth,async user=>{
  if(!user){
    location.replace("index.html?auth=login&redirect=retail-dashboard.html");
    return;
  }
  seller=user;
  try{await load();}
  catch(error){status("Unable to load retail dashboard: "+error.message,true);}
});
