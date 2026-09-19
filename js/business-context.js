const contexts = new Map();
export function workspaceError(error, action = "load your Teyza workspace") {
 const message=String(error?.message||'');
 if(message) return message;
 return `Unable to ${action}. Please try again.`;
}
async function api(user, action='context', options={}) {
 const token=await user.getIdToken();
 const response=await fetch(`api/workspace.php?action=${encodeURIComponent(action)}`,{...options,headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json',...(options.headers||{})}});
 const data=await response.json().catch(()=>({}));
 if(!response.ok || !data.ok) throw new Error(data.error||`Unable to ${action}.`);
 return data;
}
export function getBusinessContext(user,{refresh=false}={}) {
 if(refresh) contexts.delete(user.uid);
 if(!contexts.has(user.uid)){const promise=api(user,'context').catch(error=>{contexts.delete(user.uid);throw error});contexts.set(user.uid,promise);}
 return contexts.get(user.uid);
}
export async function bootstrapBusiness(user, details={}) {
 const data=await api(user,'bootstrap',{method:'POST',body:JSON.stringify(details)}); contexts.delete(user.uid); return data;
}
export function hydrateBusiness({businessId,business,userData},user){
 const set=(selector,value)=>document.querySelectorAll(selector).forEach(node=>node.textContent=value);
 set('[data-auth-name]',user.displayName||userData?.firstName||'Teyza seller');
 set('[data-auth-initial]',(user.displayName||user.email||'T').slice(0,1).toUpperCase());
 set('[data-business-name]',business?.businessName||'Your Teyza Store');
 set('[data-business-initial]',(business?.businessName||'T').slice(0,1).toUpperCase());
 set('[data-business-id]',businessId||'');
}
export async function getWorkspaceSummary(user){ return api(user,'summary'); }

export async function workspaceApi(user,action,options={}){return api(user,action,options);}
export async function getWorkspaceSection(user,section){return api(user,'section&section='+encodeURIComponent(section));}
export async function saveWorkspaceSection(user,section,data){return api(user,'section&section='+encodeURIComponent(section),{method:'POST',body:JSON.stringify(data)});}
export async function saveBusinessProfile(user,data){const result=await api(user,'business',{method:'POST',body:JSON.stringify(data)});contexts.delete(user.uid);return result;}
export async function getWorkspaceOrders(user){return api(user,'orders');}
export async function createWorkspaceOrder(user,data){return api(user,'orders',{method:'POST',body:JSON.stringify(data)});}
