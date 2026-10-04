import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {auth} from "./firebase-config.js";
import {getBusinessContext, hydrateBusiness, workspaceError} from "./business-context.js";

const FUNCTIONS_BASE_URL = "https://us-central1-business-lift-3c19c.cloudfunctions.net";

async function callFunction(name, payload = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in to manage sales channels.");
  const token = await user.getIdToken();
  const response = await fetch(`${FUNCTIONS_BASE_URL}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify({data: payload}),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.error) {
    const err = new Error(body?.error?.message || `Function ${name} failed with HTTP ${response.status}.`);
    err.code = body?.error?.status || body?.error?.code || `http-${response.status}`;
    err.details = body?.error?.details;
    err.customData = {serverResponse: body};
    throw err;
  }

  return {data: body.data ?? body.result ?? body};
}

const getConnectUrl = (payload) => callFunction("getSocialConnectUrl", payload);
const getGoogleConnectUrl = (payload) => callFunction("getGoogleConnectUrl", payload);
const getXConnectUrl = (payload) => callFunction("getXConnectUrl", payload);
const getYouTubeConnectUrl = (payload) => callFunction("getYouTubeConnectUrl", payload);
const getTikTokConnectUrl = (payload) => callFunction("getTikTokConnectUrl", payload);
const getConnections = (payload) => callFunction("getChannelConnections", payload);
const disconnectChannel = (payload) => callFunction("disconnectChannel", payload);
const selectMetaPage = (payload) => callFunction("selectMetaPage", payload);
const selectGoogleMerchantAccount = (payload) => callFunction("selectGoogleMerchantAccount", payload);
const getWhatsAppConfig = (payload) => callFunction("getWhatsAppEmbeddedSignupConfig", payload);
const completeWhatsAppSignup = (payload) => callFunction("completeWhatsAppEmbeddedSignup", payload);

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

function connectionError(error, fallback = "Connection failed.") {
  const details = error?.details;
  const detailMessage = typeof details === "string" ? details :
    (details?.message || details?.error?.message || "");
  const serverMessage = error?.customData?.serverResponse?.error?.message ||
    error?.customData?.serverResponse?.message || "";
  const message = error?.message || detailMessage || serverMessage || "";
  const code = error?.code ? String(error.code).replace(/^functions\//, "") : "";
  if (message && code && !message.includes(code)) return `${message} [${code}]`;
  return message || code || fallback;
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

    const label = document.createElement("div");
    label.className = "channel-choice-head";
    label.innerHTML = view === "instagram" ?
      "<strong>Choose your Instagram selling account</strong><span>Select the Facebook Page that has your Professional Instagram account attached.</span>" :
      "<strong>Choose your Facebook Page</strong><span>Select the business Page Teyza should publish approved products to.</span>";
    target.appendChild(label);

    const list = document.createElement("div");
    list.className = "channel-choice-list";
    let instagramOptions = 0;

    state.availablePages.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "channel-choice";
      button.dataset.chooseProvider = "meta";
      button.dataset.chooseId = item.id;
      const hasInstagram = Boolean(item.instagramBusinessId);
      if (view === "instagram" && !hasInstagram) {
        button.disabled = true;
        button.classList.add("unavailable");
      } else if (view === "instagram") {
        instagramOptions += 1;
      }
      const icon = view === "instagram" ? "ph-instagram-logo" : "ph-facebook-logo";
      button.innerHTML = `<span class="channel-choice-icon"><i class="ph ${icon}"></i></span><span class="channel-choice-copy"><strong>${escapeHtml(item.name)}</strong><small>${view === "instagram" ? (hasInstagram ? "Professional Instagram linked · ready to select" : "No Professional Instagram linked to this Page") : (hasInstagram ? "Facebook Page · Instagram also linked" : "Facebook Page")}</small></span><span class="channel-choice-action">${view === "instagram" && !hasInstagram ? "Unavailable" : "Select →"}</span>`;
      list.appendChild(button);
    });
    target.appendChild(list);

    if (view === "instagram" && instagramOptions === 0) {
      const empty = document.createElement("div");
      empty.className = "channel-choice-empty";
      empty.innerHTML = "<strong>No Professional Instagram account found</strong><span>Instagram is optional. You can continue selling on Teyza, Google or Facebook now. To add Instagram later, switch/create an Instagram Professional account, link it to a Facebook Page, then reconnect.</span>";
      target.appendChild(empty);
    }
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[char]));
}

function renderChannelGuidance(meta, whatsapp) {
  const instagramHelp = document.querySelector('[data-channel-help="instagram"]');
  if (instagramHelp) {
    if (meta?.connected && meta?.instagramBusinessId) {
      instagramHelp.innerHTML = "<strong>Instagram ready</strong><span>Your Professional Instagram account is linked through the selected Facebook Page.</span>";
      instagramHelp.classList.add("ready");
    } else if (meta?.connected) {
      instagramHelp.innerHTML = "<strong>No Instagram account on the selected Page?</strong><span>That is okay — Instagram is optional. Link a Professional Instagram account to a Facebook Page and choose Reconnect when you are ready.</span>";
      instagramHelp.classList.remove("ready");
    } else {
      instagramHelp.innerHTML = "<strong>Don't have Instagram yet?</strong><span>Skip it for now. Teyza Store, Google Shopping and Facebook can still be used independently. Instagram can be connected later.</span>";
      instagramHelp.classList.remove("ready");
    }
  }
  const whatsappHelp = document.querySelector('[data-channel-help="whatsapp"]');
  if (whatsappHelp) {
    if (whatsapp?.connected) {
      whatsappHelp.innerHTML = "<strong>WhatsApp Business ready</strong><span>Your seller WhatsApp Business account is connected through Meta.</span>";
      whatsappHelp.classList.add("ready");
    } else {
      whatsappHelp.innerHTML = "<strong>No WhatsApp Business account yet?</strong><span>You can skip this channel and continue setup. When you are ready, Connect opens Meta Embedded Signup so you can create or link the business account and number you will use with customers.</span>";
      whatsappHelp.classList.remove("ready");
    }
  }
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
  const x = connectionState.x || {};
  const youtube = connectionState.youtube || {};
  const tiktok = connectionState.tiktok || {};

  const facebookConnected = Boolean(meta.connected);
  const instagramConnected = Boolean(meta.connected && meta.instagramBusinessId);

  [
    {view:"facebook", state:meta, connected:facebookConnected, text:metaLabel("facebook",meta)},
    {view:"instagram", state:meta, connected:instagramConnected, text:metaLabel("instagram",meta)},
    {view:"google", state:google, connected:Boolean(google.connected), text:genericLabel("google",google)},
    {view:"whatsapp", state:whatsapp, connected:Boolean(whatsapp.connected), text:genericLabel("whatsapp",whatsapp)},
    {view:"x", state:x, connected:Boolean(x.connected), text:genericLabel("x",x)},
    {view:"youtube", state:youtube, connected:Boolean(youtube.connected), text:genericLabel("youtube",youtube)},
    {view:"tiktok", state:tiktok, connected:Boolean(tiktok.connected), text:genericLabel("tiktok",tiktok)},
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
  renderChannelGuidance(meta, whatsapp);

  const complete = [
    facebookConnected,
    instagramConnected,
    Boolean(google.connected),
    Boolean(whatsapp.connected),
    Boolean(x.connected),
    Boolean(youtube.connected),
    Boolean(tiktok.connected),
  ].filter(Boolean).length;
  const summary = document.getElementById("connectionSummary");
  if (summary) summary.textContent = `${complete} external channel${complete === 1 ? "" : "s"} linked`;
}

async function refreshConnections() {
  if (!businessId) return;
  const response = await getConnections({businessId});
  connectionState = response.data || {};
  renderConnections();
  focusRequestedChannel();
}

function returnPath() {
  return window.location.pathname.endsWith("seller-onboarding.html") ?
    "/seller-onboarding.html?review=1&step=1" : "/sales-channels.html";
}

async function startOauth(provider, channel = provider) {
  const callable =
    provider === "google" ? getGoogleConnectUrl :
    provider === "x" ? getXConnectUrl :
    provider === "youtube" ? getYouTubeConnectUrl :
    provider === "tiktok" ? getTikTokConnectUrl :
    getConnectUrl;
  const result = await callable({businessId, provider, channel, returnTo: returnPath()});
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
  let config;
  try {
    config = (await getWhatsAppConfig({businessId})).data || {};
  } catch (error) {
    console.error("WhatsApp config lookup failed", error);
    throw new Error(connectionError(error, "Teyza could not load the WhatsApp Business configuration."));
  }
  if (!config.appId) throw new Error("META_APP_ID is not configured in Firebase Functions.");
  if (!config.configId) {
    throw new Error("WhatsApp Embedded Signup is not configured yet. Add META_WHATSAPP_CONFIG_ID in Firebase Functions configuration.");
  }

  console.info("Starting WhatsApp Embedded Signup", {
    appId: String(config.appId),
    configId: String(config.configId),
    graphVersion: config.graphVersion || "v23.0",
  });

  const FB = await loadFacebookSdk(config.appId, config.graphVersion || "v23.0");

  if (!window.__teyzaWhatsAppMessageListener) {
    window.__teyzaWhatsAppMessageListener = true;
    window.addEventListener("message", function(event) {
      if (!event.origin.endsWith("facebook.com")) return;
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
        if (data.event === "FINISH") {
          whatsappSession = data.data || null;
          void finishWhatsAppIfReady().catch(function(error) {
            console.error("WhatsApp Embedded Signup completion failed", error);
            notify(connectionError(error, "WhatsApp setup could not be completed."), "error");
          });
        } else if (data.event === "ERROR") {
          const msg = data.data?.error_message || data.data?.error || "WhatsApp setup failed.";
          console.error("WhatsApp Embedded Signup event error", data);
          notify(String(msg), "error");
        } else if (data.event === "CANCEL") {
          notify("WhatsApp setup was cancelled.", "error");
        }
      } catch (error) {
        console.error("Unable to read WhatsApp Embedded Signup event", error);
      }
    });
  }

  function embeddedSignupCallback(response) {
    whatsappCode = response?.authResponse?.code || response?.code || "";
    if (!whatsappCode) {
      console.error("WhatsApp Embedded Signup returned no code", response);
      notify(response?.status === "not_authorized" ?
        "WhatsApp authorization was not completed." :
        "WhatsApp setup was cancelled or no authorization code was returned.", "error");
      return;
    }
    void finishWhatsAppIfReady().catch(function(error) {
      console.error("WhatsApp Embedded Signup completion failed", error);
      notify(connectionError(error, "WhatsApp setup could not be completed."), "error");
    });
  }

  try {
    FB.login(embeddedSignupCallback, {
      config_id: String(config.configId),
      response_type: "code",
      override_default_response_type: true,
      extras: {
        setup: {},
        featureType: "",
        sessionInfoVersion: "3",
      },
    });
  } catch (error) {
    console.error("Meta FB.login launch failed", error, {
      appId: config.appId,
      configId: config.configId,
    });
    throw new Error(connectionError(error, "Meta could not start WhatsApp Embedded Signup."));
  }
}

async function disconnect(provider, view) {
  const labels = {
    meta: "Facebook & Instagram",
    whatsapp: "WhatsApp Business",
    google: "Google Shopping",
    x: "X",
    youtube: "YouTube",
    tiktok: "TikTok",
  };
  const label = labels[provider] || view || provider;
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
    else await startOauth(provider, view);
  } catch (error) {
    console.error("Connection action failed", {view, provider, code:error?.code, message:error?.message, details:error?.details, error});
    notify(connectionError(error), "error");
    btn.disabled = false;
  }
});


function focusRequestedChannel() {
  const targetId =
    String(location.hash || "")
      .replace(/^#/, "");

  if (!targetId.startsWith("channel-")) {
    return;
  }

  const card =
    document.getElementById(targetId);

  if (!card) return;

  document
    .querySelectorAll("[data-channel-card]")
    .forEach((node) => {
      node.classList.toggle(
        "channel-card-focus",
        node === card
      );
    });

  requestAnimationFrame(() => {
    card.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  });
}

window.addEventListener(
  "hashchange",
  focusRequestedChannel
);

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
    const channel = params.get("channel");
    if (status === "connected") {
      if (provider === "meta" && channel === "instagram") notify("Instagram authorization received. Choose the Facebook Page that has your Professional Instagram account attached.", "success");
      else if (provider === "meta") notify("Meta authorization received. Choose the Facebook Page Teyza should use.", "success");
      else if (provider === "x") notify("X connected successfully. Teyza can now use this seller-authorized X account.", "success");
      else if (provider === "youtube") notify("YouTube connected successfully.", "success");
      else if (provider === "tiktok") notify("TikTok connected successfully.", "success");
      else notify("Authorization received. Confirm the account shown below.", "success");
    }
    if (status === "error") notify("The connection could not be completed. Check the provider setup and try again.", "error");
    if (status === "cancelled") notify("Connection cancelled.", "error");
  } catch (error) {
    console.error(error);
    notify(workspaceError(error, "load selling connections"), "error");
  }
});
