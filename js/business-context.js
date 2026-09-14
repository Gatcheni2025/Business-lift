import {collection, doc, getDoc, getDocs, query, where, limit} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import {db} from "./firebase-config.js";
const contexts = new Map();
export function workspaceError(error, action = "load your business") {
 const code = String(error?.code || "").replace(/^(firestore|functions)\//, "");
 if (code === "permission-denied") return `Your account does not have permission to ${action}. Your business access or database permissions need to be updated. Your entered details have not been cleared.`;
 if (code === "unavailable" || code === "network-request-failed") return `Unable to ${action} while the service is unreachable. Check your connection and try again.`;
 if (code === "unauthenticated") return "Your session has expired. Sign in again to continue.";
 if (code === "business-missing") return "The business linked to your account could not be found. Contact your workspace administrator to restore the business record.";
 return `Unable to ${action}. Please try again. If it continues, contact your workspace administrator.`;
}
export function getBusinessContext(user, {refresh = false} = {}) {
 if (refresh) contexts.delete(user.uid);
 if (!contexts.has(user.uid)) {
  const promise = resolve(user).catch(error => {contexts.delete(user.uid);throw error});
  contexts.set(user.uid, promise);
 }
 return contexts.get(user.uid);
}
async function resolve(user) {
 const userSnap = await getDoc(doc(db,"users",user.uid));
 const userData = userSnap.exists() ? userSnap.data() : {};
 const id = String(userData.activeBusinessId || userData.businessId || userData.businessIds?.[0] || "");
 if (id) {
  const businessSnap = await getDoc(doc(db,"businesses",id));
  if (!businessSnap.exists()) throw Object.assign(new Error("Business record missing"),{code:"business-missing"});
  return {businessId:id,business:businessSnap.data(),userData};
 }
 // Support accounts created before activeBusinessId was introduced.
 let accessError;
 for (const key of ["ownerId","ownerUid","uid","userId"]) {
  try {
   const results = await getDocs(query(collection(db,"businesses"),where(key,"==",user.uid),limit(1)));
   if (!results.empty) return {businessId:results.docs[0].id,business:results.docs[0].data(),userData};
  } catch(error) {accessError = error;}
 }
 // A denied ownership lookup must never be interpreted as an empty account.
 if (accessError) throw accessError;
 return {businessId:"",business:null,userData};
}
export function hydrateBusiness({businessId,business}, user) {
 const set = (selector,value) => document.querySelectorAll(selector).forEach(node=>node.textContent=value);
 set('[data-auth-name]', user.displayName || 'Business owner');
 set('[data-auth-initial]',(user.displayName || user.email || 'U').slice(0,1).toUpperCase());
 set('[data-business-name]',business?.businessName || 'Your business');
 set('[data-business-initial]',(business?.businessName || 'B').slice(0,1).toUpperCase());
 set('[data-business-id]',businessId || 'Not created yet');
}
