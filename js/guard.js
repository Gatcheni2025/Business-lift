import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {auth} from "./firebase-config.js";
import {getBusinessContext,hydrateBusiness,workspaceError} from "./business-context.js";
const page=location.pathname.split('/').pop() || 'dashboard.html';
onAuthStateChanged(auth, async user => {
 if(!user){location.replace('login.html?redirect='+encodeURIComponent(page+location.search+location.hash));return;}
 // Show the account identity even when the business service is unavailable.
 document.querySelectorAll('[data-auth-name]').forEach(el=>el.textContent=user.displayName || 'Business owner');
 document.querySelectorAll('[data-auth-initial]').forEach(el=>el.textContent=(user.displayName || user.email || 'U')[0].toUpperCase());
 try {
  const context=await getBusinessContext(user);
  hydrateBusiness(context,user);
  if(!context.businessId && page!=='business-profile.html')location.replace('business-profile.html');
 } catch(error) {
  console.error('Business access failed',error);
  const status=document.querySelector('[data-workspace-status]');
  if(status){status.hidden=false;status.classList.add('error');status.textContent=workspaceError(error);}
 }
});
