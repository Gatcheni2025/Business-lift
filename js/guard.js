import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {auth} from "./firebase-config.js";
import {getBusinessContext,hydrateBusiness,workspaceError} from "./business-context.js";

const page=location.pathname.split('/').pop() || 'dashboard.html';
const onboardingPages=new Set(['seller-onboarding.html','business-profile.html','delivery-settings.html','payments.html','sales-channels.html']);

async function readiness(user){
 const token=await user.getIdToken();
 const response=await fetch('api/workspace.php?action=seller-readiness',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
 const data=await response.json().catch(()=>({}));
 if(!response.ok||!data.ok)throw new Error(data.error||'Unable to load seller setup.');
 return data;
}

onAuthStateChanged(auth,async user=>{
 if(!user){location.replace('index.html?auth=login&redirect='+encodeURIComponent(page+location.search+location.hash));return;}
 document.querySelectorAll('[data-auth-name]').forEach(el=>el.textContent=user.displayName||'Business owner');
 document.querySelectorAll('[data-auth-initial]').forEach(el=>el.textContent=(user.displayName||user.email||'U')[0].toUpperCase());
 try{
  const [context,setup]=await Promise.all([getBusinessContext(user),readiness(user)]);
  hydrateBusiness(context,user);
  const complete=setup.sellerSetupComplete===true;
  if(!complete){
   if(!onboardingPages.has(page)){location.replace('seller-onboarding.html');return;}
   document.documentElement.classList.add('onboarding-locked');
   document.body?.classList.add('onboarding-locked');
  }else if(page==='seller-onboarding.html'&&!new URLSearchParams(location.search).has('review')){
   location.replace('dashboard.html');return;
  }
 }catch(error){
  console.error('Business access failed',error);
  const status=document.querySelector('[data-workspace-status]');
  if(status){status.hidden=false;status.classList.add('error');status.textContent=workspaceError(error);}
 }
});
