import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {auth} from "./firebase-config.js";

const form=document.querySelector("[data-payout-form]");
const bankSelect=document.querySelector("[data-bank-select]");
const ownershipSelect=document.querySelector("[data-account-ownership]");
const documentTypeSelect=document.querySelector("[data-document-type]");
const documentNumberLabel=document.querySelector("[data-document-number-label]");
const connectButton=document.querySelector("[data-connect-payout]");
const statusNode=document.querySelector("[data-payout-status]");
const summary=document.querySelector("[data-payout-summary]");
const formCard=document.querySelector("[data-payout-form-card]");

let currentUser=null;
let banks=[];

function status(message,type="error"){
  statusNode.hidden=false;
  statusNode.className="payout-form-status "+type;
  statusNode.textContent=message;
}

function clearStatus(){
  statusNode.hidden=true;
  statusNode.textContent="";
}

async function token(){
  if(!currentUser)throw new Error("Sign in again.");
  return currentUser.getIdToken();
}

async function paystackApi(action,{method="GET",body}={}){
  const t=await token();
  const url=new URL("api/paystack-subaccount.php",location.href);
  url.searchParams.set("action",action);

  const response=await fetch(url,{
    method,
    cache:"no-store",
    headers:{
      Authorization:`Bearer ${t}`,
      ...(body?{"Content-Type":"application/json"}:{})
    },
    body:body?JSON.stringify(body):undefined
  });

  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.ok)throw new Error(data.error||"Banking request failed.");
  return data;
}

async function workspaceBanking(){
  const t=await token();
  const response=await fetch("api/workspace.php?action=section&section=banking",{
    headers:{Authorization:`Bearer ${t}`},
    cache:"no-store"
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.ok)throw new Error(data.error||"Unable to load banking details.");
  return data.data||{};
}

function showSummary(bank){
  if(!bank?.paystackSubaccountCode)return;

  summary.hidden=false;
  formCard.hidden=true;

  document.querySelector("[data-payout-bank]").textContent=bank.bankName||"Bank account";
  document.querySelector("[data-payout-holder]").textContent=bank.accountHolder||"Account holder";
  document.querySelector("[data-payout-last4]").textContent=bank.accountNumberLast4?`•••• ${bank.accountNumberLast4}`:"Connected";
}

function syncIdentityFields(){
  const ownership=ownershipSelect.value;

  if(ownership==="business"){
    documentTypeSelect.innerHTML='<option value="businessRegistrationNumber">Business registration number</option>';
    documentNumberLabel.textContent="Business registration number";
    form.elements.documentNumber.placeholder="e.g. CIPC / company registration number";
  }else{
    documentTypeSelect.innerHTML=
      '<option value="identityNumber">South African ID number</option>'+
      '<option value="passportNumber">Passport number</option>';
    documentNumberLabel.textContent="South African ID number";
    form.elements.documentNumber.placeholder="Used once for Paystack bank validation";
  }
}

async function loadBanks(){
  const data=await paystackApi("banks");
  banks=data.banks||[];

  if(!banks.length){
    bankSelect.innerHTML='<option value="">No Paystack-verifiable South African banks returned</option>';
    return;
  }

  bankSelect.innerHTML='<option value="">Choose your bank</option>'+
    banks.map(bank=>`<option value="${bank.code}">${bank.name}</option>`).join("");
}

ownershipSelect.addEventListener("change",syncIdentityFields);

documentTypeSelect.addEventListener("change",()=>{
  if(ownershipSelect.value==="business"){
    documentNumberLabel.textContent="Business registration number";
  }else{
    documentNumberLabel.textContent=
      documentTypeSelect.value==="passportNumber"
        ?"Passport number"
        :"South African ID number";
  }
});

form.addEventListener("submit",async event=>{
  event.preventDefault();
  clearStatus();

  const bankCode=form.elements.bankCode.value;
  const accountNumber=form.elements.accountNumber.value.replace(/\s+/g,"");
  const accountName=form.elements.accountName.value.trim();
  const accountOwnership=form.elements.accountOwnership.value;
  const documentType=form.elements.documentType.value;
  const documentNumber=form.elements.documentNumber.value.trim();

  if(!bankCode){
    status("Choose your bank.");
    return;
  }

  if(!/^\d{5,20}$/.test(accountNumber)){
    status("Enter a valid numeric bank account number.");
    return;
  }

  if(accountName.length<2){
    status("Enter the account holder name exactly as registered with the bank.");
    return;
  }

  if(!["personal","business"].includes(accountOwnership)){
    status("Choose whether this is a personal or business account.");
    return;
  }

  if(documentNumber.length<4){
    status(accountOwnership==="business"
      ?"Enter the business registration number."
      :"Enter the required ID or passport number.");
    return;
  }

  if(!form.elements.confirmAccount.checked){
    status("Confirm that these payout details are correct.");
    return;
  }

  connectButton.disabled=true;
  connectButton.innerHTML=
    '<span class="payout-inline-spinner" aria-hidden="true"></span>'+
    '<span>Validating with Paystack…</span>';

  try{
    const data=await paystackApi("connect",{
      method:"POST",
      body:{
        bankCode,
        accountNumber,
        accountName,
        accountOwnership,
        documentType,
        documentNumber
      }
    });

    status("Bank account verified and payout account connected ✓","success");
    showSummary(data.banking);

    form.elements.documentNumber.value="";
    form.elements.accountNumber.value="";
  }catch(error){
    status(error.message);
  }finally{
    connectButton.disabled=false;
    connectButton.textContent="Verify & connect payout account";
  }
});

document.querySelector("[data-change-payout]").addEventListener("click",()=>{
  summary.hidden=true;
  formCard.hidden=false;
  form.reset();
  syncIdentityFields();
  clearStatus();
});

async function load(){
  syncIdentityFields();

  try{
    await Promise.all([
      loadBanks(),
      workspaceBanking().then(showSummary)
    ]);
  }catch(error){
    status(error.message);
  }
}

onAuthStateChanged(auth,user=>{
  currentUser=user;
  if(user)load();
});
