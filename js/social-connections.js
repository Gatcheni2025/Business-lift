import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {getFunctions, httpsCallable} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-functions.js";
import {collection, getDocs, limit, query, where} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import {app, auth, db} from "./firebase-config.js";

const functions = getFunctions(app);
const getConnectUrl = httpsCallable(functions, "getSocialConnectUrl");
const getConnections = httpsCallable(functions, "getChannelConnections");
const disconnectChannel = httpsCallable(functions, "disconnectChannel");

let businessId = null;
let connectionState = {};

function notify(message) {
  if (typeof window.toast === "function") return window.toast(message);
  console.log(message);
}

async function resolveBusinessId(uid) {
  for (const field of ["ownerId", "uid", "userId"]) {
    try {
      const snap = await getDocs(query(collection(db, "businesses"), where(field, "==", uid), limit(1)));
      if (!snap.empty) return snap.docs[0].id;
    } catch (error) {
      console.debug(`Business lookup by ${field} skipped`, error);
    }
  }
  return null;
}

function providerForKey(key) {
  if (key === "facebook" || key === "instagram" || key === "meta") return "meta";
  if (key === "google") return "google";
  if (key === "whatsapp") return "whatsapp";
  return null;
}

function renderConnections() {
  document.querySelectorAll("[data-social-provider], .toggle-chan-btn[data-key]").forEach((btn) => {
    const key = btn.dataset.socialProvider || btn.dataset.key;
    const provider = providerForKey(key);
    if (!provider) return;
    const state = connectionState[provider] || {};
    const connected = !!state.connected;
    btn.disabled = false;
    btn.textContent = connected ? `Connected ✓${state.displayName ? ` · ${state.displayName}` : ""}` : "Connect";
    btn.classList.toggle("connected", connected);
  });
}

async function refreshConnections() {
  if (!businessId) return;
  const response = await getConnections({businessId});
  connectionState = response.data || {};
  renderConnections();
}

async function startConnect(provider) {
  if (!businessId) throw new Error("Business profile not found.");
  if (provider === "whatsapp") {
    notify("WhatsApp connection requires Meta Embedded Signup. Configure that in the Meta app first.");
    return;
  }
  const result = await getConnectUrl({businessId, provider});
  if (!result.data?.url) throw new Error("No OAuth URL returned.");
  window.location.assign(result.data.url);
}

async function disconnect(provider) {
  if (!businessId) return;
  const ok = window.confirm(`Disconnect ${provider === "meta" ? "Facebook / Instagram" : provider}?`);
  if (!ok) return;
  await disconnectChannel({businessId, provider});
  await refreshConnections();
  notify("Channel disconnected.");
}

document.addEventListener("click", async (event) => {
  const btn = event.target.closest?.("[data-social-provider], .toggle-chan-btn[data-key]");
  if (!btn) return;
  const key = btn.dataset.socialProvider || btn.dataset.key;
  const provider = providerForKey(key);
  if (!provider) return;
  event.preventDefault();
  try {
    btn.disabled = true;
    if (connectionState[provider]?.connected) await disconnect(provider);
    else await startConnect(provider);
  } catch (error) {
    console.error("Channel action failed", error);
    notify(error.message || "Channel connection failed.");
    btn.disabled = false;
  }
});

onAuthStateChanged(auth, async (user) => {
  if (!user) return;
  businessId = await resolveBusinessId(user.uid);
  if (!businessId) {
    notify("Firebase business profile not found for this account.");
    return;
  }
  await refreshConnections();
  const params = new URLSearchParams(location.search);
  if (params.get("social") === "connected") {
    notify(`${params.get("provider") || "Channel"} connected successfully.`);
    history.replaceState({}, "", location.pathname);
  }
});
