import {getBusinessContext,workspaceError} from "./business-context.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {doc, getDoc} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import {getFunctions, httpsCallable} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-functions.js";
import {app, auth, db} from "./firebase-config.js";

const functions = getFunctions(app);
const saveSimple = httpsCallable(functions, "saveSellerSimplePreferences");
const getSummary = httpsCallable(functions, "getSellerDashboardSummary");
let businessId = "";

onAuthStateChanged(auth, async (user) => {
  if (!user) return window.location.href = "login.html";
  try { businessId = (await getBusinessContext(user)).businessId; } catch(error) {
    const status=document.querySelector("[data-workspace-status]");
    if(status){status.hidden=false;status.textContent=workspaceError(error);}
    return;
  }
  if (!businessId) return window.location.href = "business-profile.html";
  try {
    const result = await getSummary({businessId});
    const shop = result.data?.shop || {};
    document.getElementById("shopName").value = shop.shopName || result.data?.business?.name || "";
    document.getElementById("supportEmail").value = shop.supportEmail || "";
    document.getElementById("supportPhone").value = shop.supportPhone || "";
    document.getElementById("returnsPolicy").value = shop.returnsPolicy || "";
    document.getElementById("orderNotifications").checked = shop.orderNotifications !== false;
    document.getElementById("lowStockNotifications").checked = shop.lowStockNotifications !== false;
  } catch (e) { console.error(e); }
});

document.getElementById("saveShop")?.addEventListener("click", async () => {
  const btn = document.getElementById("saveShop");
  btn.disabled = true; btn.textContent = "Saving...";
  try {
    await saveSimple({businessId, section: "shop", data: {
      shopName: document.getElementById("shopName").value,
      supportEmail: document.getElementById("supportEmail").value,
      supportPhone: document.getElementById("supportPhone").value,
      returnsPolicy: document.getElementById("returnsPolicy").value,
      orderNotifications: document.getElementById("orderNotifications").checked,
      lowStockNotifications: document.getElementById("lowStockNotifications").checked,
    }});
    document.getElementById("saveStatus").textContent = "Saved";
  } catch (e) {
    document.getElementById("saveStatus").textContent = "Unable to save";
    console.error(e);
  } finally { btn.disabled = false; btn.textContent = "Save settings"; }
});
