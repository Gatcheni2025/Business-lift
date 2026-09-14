import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {collection,doc,writeBatch,serverTimestamp,updateDoc} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import {auth,db} from "./firebase-config.js";
import {getBusinessContext,hydrateBusiness,workspaceError} from "./business-context.js";
const form=document.querySelector('[data-business-profile]');
const button=form.querySelector('[type=submit]');
const retry=document.querySelector('[data-profile-retry]');
const status=document.querySelector('[data-profile-status]');
let context=null, currentUser=null, busy=false;
const fields={'business-name':'businessName','business-type':'businessType',industry:'industry',country:'country',phone:'phone',address:'address',about:'about'};
function show(message,tone='error'){status.hidden=false;status.textContent=message;status.className='form-status '+tone;}
function completion(data){const values=Object.values(fields).map(key=>String(data[key] || '').trim());return Math.round(values.filter(Boolean).length/values.length*100);}
function updateSummary(data){document.querySelector('[data-profile-progress]').textContent=completion(data)+'%';document.querySelector('[data-verification-status]').textContent=data.profileComplete?'Ready':'In progress';}
async function load(){
 if(!currentUser || busy)return;
 button.disabled=true;retry.hidden=true;show('Loading your saved details…','info');
 try {
  context=await getBusinessContext(currentUser,{refresh:true});
  const business=context.business || {};
  for(const [field,key] of Object.entries(fields)){
   const control=form.elements[field];const value=business[key];
   if(value != null){
    if(control.tagName==='SELECT' && ![...control.options].some(option=>option.value===value))control.add(new Option(value,value));
    control.value=value;
   }
  }
  hydrateBusiness(context,currentUser);updateSummary(business);
  status.hidden=!!context.business;
  if(!context.business)show('Finish your business details to create your workspace.','info');
  button.disabled=false;button.textContent='Save changes';
 } catch(error){context=null;show(workspaceError(error,'load your business profile'));retry.hidden=false;button.textContent='Save changes';}
}
// Attach immediately, even if loading fails. Never submit profile details as a URL query.
form.addEventListener('submit',async event=>{
 event.preventDefault();
 if(busy)return;
 if(!context || !currentUser){show('Your profile has not loaded yet. Select Retry loading before saving.');retry.hidden=false;return;}
 if(!form.reportValidity())return;
 const payload={};for(const [field,key] of Object.entries(fields))payload[key]=form.elements[field].value.trim();
 if(!payload.businessName || !payload.industry){show('Enter a business name and industry.');return;}
 payload.profileComplete=completion(payload)===100;
 payload.setupProgress=completion(payload);
 payload.updatedAt=serverTimestamp();
 busy=true;button.disabled=true;button.textContent='Saving…';show('Saving your business profile…','info');
 try {
  if(context.businessId){
   await updateDoc(doc(db,'businesses',context.businessId),payload);
  } else {
   // Recover an authenticated account whose initial workspace was never created.
   const businessRef=doc(collection(db,'businesses'));
   const batch=writeBatch(db);
   batch.set(businessRef,{...payload,businessId:businessRef.id,ownerId:currentUser.uid,ownerUid:currentUser.uid,plan:'start',status:'active',createdAt:serverTimestamp()});
   batch.set(doc(db,'users',currentUser.uid),{uid:currentUser.uid,email:currentUser.email,activeBusinessId:businessRef.id,businessIds:[businessRef.id]},{merge:true});
   await batch.commit();context.businessId=businessRef.id;
  }
  context.business={...context.business,...payload};hydrateBusiness(context,currentUser);updateSummary(payload);
  show('Your business profile has been saved.','success');
 } catch(error){console.error('Profile save failed',error);show(workspaceError(error,'save your business profile'));}
 finally{busy=false;button.disabled=false;button.textContent='Save changes';}
});
retry.addEventListener('click',load);
onAuthStateChanged(auth,user=>{currentUser=user;if(user)load();else{context=null;button.disabled=true;}});
