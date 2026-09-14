import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {auth} from "./firebase-config.js";
import {apiFetch} from "./api-client.js";
import {getBusinessContext,hydrateBusiness,workspaceError} from "./business-context.js";

const form=document.querySelector('[data-business-profile]');
const button=form?.querySelector('[type=submit]');
const retry=document.querySelector('[data-profile-retry]');
const status=document.querySelector('[data-profile-status]');
let context=null, currentUser=null, busy=false;
const fields={'business-name':'businessName','business-type':'businessType',industry:'industry',country:'country',phone:'phone',address:'address',about:'about'};

function show(message,tone='error'){
  if(!status)return;
  status.hidden=false;status.textContent=message;status.className='form-status '+tone;
}
function completion(data){
  const values=Object.values(fields).map(key=>String(data[key] || '').trim());
  return Math.round(values.filter(Boolean).length/values.length*100);
}
function updateSummary(data){
  document.querySelector('[data-profile-progress]')?.replaceChildren(document.createTextNode(completion(data)+'%'));
  const verify=document.querySelector('[data-verification-status]');if(verify)verify.textContent=data.profileComplete?'Ready':'In progress';
}
async function load(){
  if(!currentUser || busy || !form || !button)return;
  button.disabled=true;if(retry)retry.hidden=true;show('Loading your saved details…','info');
  try{
    context=await getBusinessContext(currentUser,{refresh:true});
    const business=context.business || {};
    for(const [field,key] of Object.entries(fields)){
      const control=form.elements[field];if(!control)continue;const value=business[key];
      if(value != null){
        if(control.tagName==='SELECT' && ![...control.options].some(option=>option.value===value))control.add(new Option(value,value));
        control.value=value;
      }
    }
    hydrateBusiness(context,currentUser);updateSummary(business);status.hidden=false;
    show(context.business ? 'Business profile ready.' : 'Finish your business details to create your workspace.','info');
  }catch(error){context=null;show(workspaceError(error,'load your business profile'));if(retry)retry.hidden=false;}
  finally{button.disabled=false;button.textContent='Save changes';}
}

form?.addEventListener('submit',async event=>{
  event.preventDefault();if(busy || !form || !button)return;
  if(!currentUser){show('Sign in again before saving your business profile.');return;}
  if(!form.reportValidity())return;
  const payload={};for(const [field,key] of Object.entries(fields))payload[key]=form.elements[field]?.value.trim() || '';
  if(!payload.businessName || !payload.industry){show('Enter a business name and industry.');return;}
  busy=true;button.disabled=true;button.textContent='Saving…';show('Saving your business profile…','info');
  try{
    const response=await apiFetch('api/profile.php',{method:'POST',body:JSON.stringify(payload)});
    context={businessId:response.businessId,business:response.business,userData:{firstName:(currentUser.displayName||'Business owner').split(' ')[0]}};
    hydrateBusiness(context,currentUser);updateSummary(response.business || payload);
    show('Your business profile has been saved.','success');
  }catch(error){console.error('Profile save failed',error);show(workspaceError(error,'save your business profile'));}
  finally{busy=false;button.disabled=false;button.textContent='Save changes';}
});
retry?.addEventListener('click',load);
onAuthStateChanged(auth,user=>{currentUser=user;if(user)load();else{context=null;if(button)button.disabled=true;}});
