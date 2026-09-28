import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {getFunctions, httpsCallable} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-functions.js";
import {app, auth} from "./firebase-config.js";
import {getBusinessContext, hydrateBusiness, workspaceError} from "./business-context.js";

const functions = getFunctions(app);
const getConnectUrl = httpsCallable(functions, "getSocialConnectUrl");
const getGoogleConnectUrl = httpsCallable(functions, "getGoogleConnectUrl");
const getConnections = httpsCallable(functions, "getChannelConnections");
const disconnectChannel = httpsCallable(functions, "disconnectChannel");
const selectMetaPage = httpsCallable(functions, "selectMetaPage");
const selectGoogleMerchantAccount = httpsCallable(functions, "selectGoogleMerchantAccount");
const getWhatsAppConfig = httpsCallable(functions, "getWhatsAppEmbeddedSignupConfig");
const completeWhatsAppSignup = httpsCallable(functions, "completeWhatsAppEmbeddedSignup");

let businessId = "";
let connectionState = {};
let whatsappSession = null;
let whatsappCode = "";

function notify(message, tone = "info") {
  const box = document.getElementById("connectionNotice");
  if (box) {
    box.hidden = false;
    box.textContent = message;
    box.dataset.tone = tone;
    return;
  }
  console.log(message);
}

function metaLabel(view, state) {
  if (view === "facebook") {
    if (state?.connected) return state.displayName ? `Connected · ${state.displayName}` : "Connected";
    if (state?.status === "needs_page") return "Choose Facebook Page";
    if (state?.status === "no_pages") return "No Facebook Page found";
    return "Not linked";
  }
  if (state?.connected && state.instagramBusinessId) {
    return state.displayName ? `Connected through ${state.displayName}` : "Connected";
  }
  if (state?.connected) return "Facebook connected · Instagram professional account not found";
  if (state?.status === "needs_page") return "Choose the Facebook Page linked to Instagram";
  if (state?.status === "no_pages") return "No Facebook Page found";
  return "Not linked";
}

function genericLabel(provider, state) {
  if (state?.connected) return state.displayName ? `Connected · ${state.displayName}` : "Connected";
  if (state?.status === "needs_account") return "Choose Merchant account";
  if (state?.status === "no_accounts") return "No Merchant account found";
  return "Not linked";
}

function renderMetaChooser(state) {
  ["facebook","instagram"].forEach((view) => {
    const target = document.querySelector(`[data-chooser="${view}"]`);
    if (!target) return;
    target.innerHTML = "";
    if (!Array.isArray(state.availablePages) || !state.availablePages.length || state.connected) return;
    const label = document.createElement("p");
    label.className = "choose-label";
    label.textContent = view === "instagram" ?
      "Choose the Facebook Page connected to your professional Instagram account:" :
      "Choose the Facebook Page Teyza should use:";
    target.appendChild(label);
    state.availablePages.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "choose-account";
      button.dataset.chooseProvider = "meta";
      button.dataset.chooseId = item.id;
      button.textContent = item.instagramBusinessId && view === "instagram" ?
        `${item.name} · Instagram linked` : item.name;
      target.appendChild(button);
    });
  });
}

function renderGoogleChooser(state) {
  const target = document.querySelector('[data-chooser="google"]');
  if (!target) return;
  target.innerHTML = "";
  if (!Array.isArray(state.availableAccounts) || !state.availableAccounts.length || state.connected) return;
  const label = document.createElement("p");
  label.className = "choose-label";
  label.textContent = "Choose your Merchant Center account:";
  target.appendChild(label);
  state.availableAccounts.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choose-account";
    button.dataset.chooseProvider = "google";
    button.dataset.chooseId = item.accountId;
    button.textContent = item.accountName || item.accountId;
    target.appendChild(button);
  });
}

function renderConnections() {
  const meta = connectionState.meta || {};
  const google = connectionState.google || {};
  const whatsapp = connectionState.whatsapp || {};

  const facebookConnected = Boolean(meta.connected);
  const instagramConnected = Boolean(meta.connected && meta.instagramBusinessId);

  [
    {view:"facebook", state:meta, connected:facebookConnected, text:metaLabel("facebook",meta)},
    {view:"instagram", state:meta, connected:instagramConnected, text:metaLabel("instagram",meta)},
    {view:"google", state:google, connected:Boolean(google.connected), text:genericLabel("google",google)},
    {view:"whatsapp", state:whatsapp, connected:Boolean(whatsapp.connected), text:genericLabel("whatsapp",whatsapp)},
  ].forEach(({view,state,connected,text}) => {
    const badge = document.querySelector(`[data-status="${view}"]`);
    const btn = document.querySelector(`[data-connect="${view}"]`);
    if (badge) {
      badge.textContent = text;
      badge.classList.toggle("connected", connected);
      badge.classList.toggle("attention", ["needs_page","needs_account"].includes(state.status) || (view==="instagram" && meta.connected && !meta.instagramBusinessId));
    }
    if (btn) {
      btn.disabled = false;
      if (view === "instagram" && meta.connected && !meta.instagramBusinessId) btn.textContent = "Reconnect Meta";
      else if (connected) btn.textContent = "Disconnect";
      else if (["needs_page","needs_account"].includes(state.status)) btn.textContent = "Reconnect";
      else btn.textContent = "Connect";
      btn.classList.toggle("secondary", connected);
    }
  });

  renderMetaChooser(meta);
  renderGoogleChooser(google);

  const complete = [facebookConnected, instagramConnected, Boolean(google.connected), Boolean(whatsapp.connected)]
    .filter(Boolean).length;
  const summary = document.getElementById("connectionSummary");
  if (summary) summary.textContent = `${complete} external channel${complete === 1 ? "" : "s"} linked`;
}

async function refreshConnections() {
  if (!businessId) return;
  const response = await getConnections({businessId});
  connectionState = response.data || {};
  renderConnections();
}

function returnPath() {
  return window.location.pathname.endsWith("seller-onboarding.html") ?
    "/seller-onboarding.html" : "/sales-channels.html";
}

async function startOauth(provider) {
  const callable = provider === "google" ? getGoogleConnectUrl : getConnectUrl;
  const result = await callable({businessId, provider, returnTo: returnPath()});
  if (!result.data?.url) throw new Error("No connection URL returned.");
  window.location.assign(result.data.url);
}

function loadFacebookSdk(appId, graphVersion) {
  return new Promise((resolve, reject) => {
    if (window.FB) return resolve(window.FB);
    window.fbAsyncInit = () => {
      window.FB.init({appId, cookie: true, xfbml: true, version: graphVersion});
      resolve(window.FB);
    };
    const existing = document.getElementById("facebook-jssdk");
    if (existing) return;
    const js = document.createElement("script");
    js.id = "facebook-jssdk";
    js.src = "https://connect.facebook.net/en_US/sdk.js";
    js.async = true;
    js.defer = true;
    js.onerror = reject;
    document.head.appendChild(js);
  });
}

async function finishWhatsAppIfReady() {
  if (!whatsappCode || !whatsappSession?.waba_id || !whatsappSession?.phone_number_id) return;
  await completeWhatsAppSignup({
    businessId,
    code: whatsappCode,
    wabaId: whatsappSession.waba_id,
    phoneNumberId: whatsappSession.phone_number_id,
  });
  whatsappCode = "";
  whatsappSession = null;
  notify("WhatsApp Business connected successfully.", "success");
  await refreshConnections();
}

async function startWhatsApp() {
  const config = (await getWhatsAppConfig({businessId})).data || {};
  if (!config.appId) throw new Error("META_APP_ID is not configured in Firebase Functions.");
  if (!config.configId) {
    throw new Error("WhatsApp Embedded Signup is not configured yet. Add META_WHATSAPP_CONFIG_ID in Firebase Functions configuration.");
  }
  await loadFacebookSdk(config.appId, config.graphVersion || "v23.0");
  window.addEventListener("message", async (event) => {
    if (!event.origin.endsWith("facebook.com")) return;
    try {
      const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
      if (data.event === "FINISH") {
        whatsappSession = data.data || null;
        await finishWhatsAppIfReady();
      } else if (data.event === "ERROR") {
        notify(data.data?.error_message || "WhatsApp setup failed.", "error");
      }
    } catch (_) {}
  });

  window.FB.login(async (response) => {
    whatsappCode = response?.authResponse?.code || response?.code || "";
    if (!whatsappCode) {
      notify("WhatsApp setup was cancelled.", "error");
      return;
    }
    try { await finishWhatsAppIfReady(); } catch (error) { notify(error.message, "error"); }
  }, {
    config_id: config.configId,
    auth_type: "rerequest",
    response_type: "code",
    override_default_response_type: true,
    extras: {setup: {}},
  });
}

async function disconnect(provider, view) {
  const label = provider === "meta" ? "Facebook & Instagram" : (view === "whatsapp" ? "WhatsApp Business" : "Google Shopping");
  if (!window.confirm(`Disconnect ${label}?`)) return;
  await disconnectChannel({businessId, provider});
  await refreshConnections();
  notify("Connection removed.", "success");
}

document.addEventListener("click", async (event) => {
  const choose = event.target.closest?.("[data-choose-provider]");
  if (choose) {
    try {
      choose.disabled = true;
      if (choose.dataset.chooseProvider === "meta") {
        await selectMetaPage({businessId, pageId: choose.dataset.chooseId});
      } else {
        await selectGoogleMerchantAccount({businessId, accountId: choose.dataset.chooseId});
      }
      await refreshConnections();
      notify("Selling account confirmed.", "success");
    } catch (error) {
      notify(error.message || "Unable to select account.", "error");
      choose.disabled = false;
    }
    return;
  }

  const btn = event.target.closest?.("[data-connect]");
  if (!btn) return;
  const view = btn.dataset.connect;
  if (!view) return;
  const provider = ["facebook","instagram"].includes(view) ? "meta" : view;
  const currentlyConnected = provider === "meta" ?
    (view === "facebook" ? Boolean(connectionState.meta?.connected) :
      Boolean(connectionState.meta?.connected && connectionState.meta?.instagramBusinessId)) :
    Boolean(connectionState[provider]?.connected);
  try {
    btn.disabled = true;
    if (currentlyConnected) await disconnect(provider, view);
    else if (provider === "whatsapp") await startWhatsApp();
    else await startOauth(provider);
  } catch (error) {
    console.error("Connection action failed", error);
    notify(error.message || "Connection failed.", "error");
    btn.disabled = false;
  }
});

onAuthStateChanged(auth, async (user) => {
  if (!user) return window.location.href = "index.html?auth=login";
  try {
    const context = await getBusinessContext(user);
    businessId = String(context.businessId || user.uid);
    hydrateBusiness(context, user);
    if (!businessId) throw new Error("Your Teyza workspace could not be identified.");
    await refreshConnections();
    const params = new URLSearchParams(location.search);
    const status = params.get("social");
    const provider = params.get("provider");
    if (status === "connected") notify(provider === "meta" ? "Meta authorization received. Confirm your Facebook Page below." : "Authorization received. Confirm the account shown below.", "success");
    if (status === "error") notify("The connection could not be completed. Check the provider setup and try again.", "error");
    if (status === "cancelled") notify("Connection cancelled.", "error");
  } catch (error) {
    console.error(error);
    notify(workspaceError(error, "load selling connections"), "error");
  }
});
