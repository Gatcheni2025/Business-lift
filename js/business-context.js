import {apiFetch} from "./api-client.js";

const contexts = new Map();

export function workspaceError(error, action = "load your business") {
  const status = Number(error?.status || 0);
  if (status === 401) return "Your session has expired. Sign in again to continue.";
  if (status === 403) return `Your account does not have permission to ${action}.`;
  if (status >= 500) return `Unable to ${action} because the Business Expo service is temporarily unavailable. Please try again.`;
  const message = String(error?.message || "").trim();
  if (message && !message.startsWith("Request failed")) return message;
  return `Unable to ${action}. Please try again.`;
}

export function getBusinessContext(user, {refresh = false} = {}) {
  if (!user?.uid) return Promise.resolve({businessId:"",business:null,userData:{}});
  if (refresh) contexts.delete(user.uid);
  if (!contexts.has(user.uid)) {
    const promise = resolve(user).catch(error => { contexts.delete(user.uid); throw error; });
    contexts.set(user.uid, promise);
  }
  return contexts.get(user.uid);
}

async function resolve(user) {
  const response = await apiFetch("api/profile.php");
  const business = response.business || {};
  const firstName = String(user.displayName || business.businessName || user.email || "Business owner").split(/\s+/)[0];
  return {
    businessId: response.businessId || user.uid,
    business,
    userData: {uid:user.uid,email:user.email || "",firstName}
  };
}

export function hydrateBusiness({businessId,business}, user) {
  const set = (selector,value) => document.querySelectorAll(selector).forEach(node => node.textContent = value);
  set('[data-auth-name]', user?.displayName || user?.email || 'Business owner');
  set('[data-auth-initial]', (user?.displayName || user?.email || 'U').slice(0,1).toUpperCase());
  set('[data-business-name]', business?.businessName || 'Your business');
  set('[data-business-initial]', (business?.businessName || 'B').slice(0,1).toUpperCase());
  set('[data-business-id]', businessId || 'Not created yet');
}
