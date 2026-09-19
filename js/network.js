import {getBusinessContext,workspaceError} from "./business-context.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {doc, getDoc} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import {getFunctions, httpsCallable} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-functions.js";
import {app, auth, db} from "./firebase-config.js";

const functions = getFunctions(app);
const getOps = httpsCallable(functions, "getSellerOperations");
const saveOps = httpsCallable(functions, "saveSellerOperations");
let businessId = "";

function setStatus(message) {
  const el = document.getElementById("networkStatus");
  if (el) el.textContent = message;
}

async function loadProfile() {
  const result = await getOps({businessId});
  const p = result.data?.partner || {};
  document.getElementById("category").value = p.category || "";
  document.getElementById("serviceArea").value = p.serviceArea || "";
  document.getElementById("offers").value = p.offers || "";
  document.getElementById("needs").value = p.needs || "";
  document.getElementById("discoverable").checked = p.discoverable !== false;
  document.getElementById("allowContact").checked = p.allowContact !== false;
}

document.getElementById("saveNetwork")?.addEventListener("click", async (event) => {
  const btn = event.currentTarget;
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    await saveOps({businessId, section: "partner", data: {
      discoverable: document.getElementById("discoverable").checked,
      category: document.getElementById("category").value,
      serviceArea: document.getElementById("serviceArea").value,
      offers: document.getElementById("offers").value,
      needs: document.getElementById("needs").value,
      allowContact: document.getElementById("allowContact").checked,
    }});
    setStatus("Saved ✓");
  } catch (error) {
    console.error(error);
    setStatus("Unable to save");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save network profile";
  }
});

onAuthStateChanged(auth, async (user) => {
  if (!user) return window.location.href = "index.html?auth=login";
  try { businessId = (await getBusinessContext(user)).businessId; } catch(error) {
    const status=document.querySelector("[data-workspace-status]");
    if(status){status.hidden=false;status.textContent=workspaceError(error);}
    return;
  }
  if (!businessId) return window.location.href = "business-profile.html";
  try { await loadProfile(); } catch (error) { console.error(error); }
});
