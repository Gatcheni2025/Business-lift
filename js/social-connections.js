import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {auth} from "./firebase-config.js";
import {apiFetch} from "./api-client.js";

let connectionState = {};
let whatsappSession = null;
let whatsappCode = "";

function notify(message, tone = "info") {
  const box = document.getElementById("connectionNotice");
  if (box) { box.hidden = false; box.textContent = message; box.dataset.tone = tone; return; }
  console.log(message);
}
function labelFor(provider, state) {
  if (state?.connected) return state.displayName ? `Connected · ${state.displayName}` : "Connected";
  if (state?.status === "needs_page") return "Choose Facebook Page";
  if (state?.status === "needs_account") return "Choose Merchant account";
  if (state?.status === "no_pages") return "No Facebook Page found";
  if (state?.status === "no_accounts") return "No Merchant account found";
  return "Not linked";
}
function renderChooser(provider, state) {
  const target = document.querySelector(`[data-chooser="${provider}"]`); if (!target) return;
  target.innerHTML = "";
  const items = provider === "meta" ? state.availablePages : state.availableAccounts;
  if (!Array.isArray(items) || !items.length || state.connected) return;
  const label = document.createElement("p"); label.className = "choose-label";
  label.textContent = provider === "meta" ? "Choose the Page Business Expo should use:" : "Choose your Merchant Center account:";
  target.appendChild(label);
  items.forEach((item) => {
    const button = document.createElement("button"); button.type = "button"; button.className = "choose-account";
    button.dataset.chooseProvider = provider; button.dataset.chooseId = provider === "meta" ? item.id : item.accountId;
    button.textContent = provider === "meta" ? item.name : (item.accountName || item.accountId); target.appendChild(button);
  });
}
function renderConnections() {
  ["meta","google","whatsapp"].forEach((provider) => {
    const state = connectionState[provider] || {};
    const badge = document.querySelector(`[data-status="${provider}"]`); const btn = document.querySelector(`[data-connect="${provider}"]`);
    if (badge) { badge.textContent = labelFor(provider,state); badge.classList.toggle("connected",Boolean(state.connected)); badge.classList.toggle("attention",["needs_page","needs_account"].includes(state.status)); }
    if (btn) { btn.disabled = false; btn.textContent = state.connected ? "Disconnect" : (["needs_page","needs_account"].includes(state.status) ? "Reconnect" : "Connect"); btn.classList.toggle("secondary",Boolean(state.connected)); }
    renderChooser(provider,state);
  });
  const complete = Object.values(connectionState).filter(v => v?.connected).length;
  const summary = document.getElementById("connectionSummary"); if (summary) summary.textContent = `${complete} external connection${complete===1?"":"s"} linked`;
}
async function refreshConnections() {
  const response = await apiFetch("api/social-connections.php?action=list");
  connectionState = response.connections || {}; renderConnections();
}
function returnPath() { return window.location.pathname.endsWith("seller-onboarding.html") ? "/seller-onboarding.html" : "/sales-channels.html"; }
async function post(action, extra = {}) { return apiFetch("api/social-connections.php",{method:"POST",body:JSON.stringify({action,...extra})}); }
async function startOauth(provider) {
  const result = await post("connect_url",{provider,returnTo:returnPath()});
  if (!result.url) throw new Error("No connection URL returned."); window.location.assign(result.url);
}
function loadFacebookSdk(appId, graphVersion) {
  return new Promise((resolve,reject) => {
    if (window.FB) return resolve(window.FB);
    window.fbAsyncInit = () => { window.FB.init({appId,cookie:true,xfbml:true,version:graphVersion}); resolve(window.FB); };
    if (document.getElementById("facebook-jssdk")) return;
    const js=document.createElement("script"); js.id="facebook-jssdk"; js.src="https://connect.facebook.net/en_US/sdk.js"; js.async=true; js.defer=true; js.onerror=reject; document.head.appendChild(js);
  });
}
async function finishWhatsAppIfReady() {
  if (!whatsappCode || !whatsappSession?.waba_id || !whatsappSession?.phone_number_id) return;
  await post("whatsapp_complete",{code:whatsappCode,wabaId:whatsappSession.waba_id,phoneNumberId:whatsappSession.phone_number_id});
  whatsappCode=""; whatsappSession=null; notify("WhatsApp Business connected successfully.","success"); await refreshConnections();
}
async function startWhatsApp() {
  const config = await post("whatsapp_config");
  await loadFacebookSdk(config.appId,config.graphVersion || "v23.0");
  window.addEventListener("message",async(event)=>{
    if (!event.origin.endsWith("facebook.com")) return;
    try { const data=JSON.parse(event.data); if(data.type!=="WA_EMBEDDED_SIGNUP")return; if(data.event==="FINISH"){whatsappSession=data.data||null;await finishWhatsAppIfReady();} else if(data.event==="ERROR")notify(data.data?.error_message||"WhatsApp setup failed.","error"); } catch(_){}
  });
  window.FB.login(async(response)=>{
    whatsappCode=response?.authResponse?.code || response?.code || "";
    if(!whatsappCode){notify("WhatsApp setup was cancelled.","error");return;}
    try{await finishWhatsAppIfReady();}catch(error){notify(error.message,"error");}
  },{config_id:config.configId,auth_type:"rerequest",response_type:"code",override_default_response_type:true,extras:{setup:{}}});
}
async function disconnect(provider) {
  if(!window.confirm(`Disconnect ${provider === "meta" ? "Facebook & Instagram" : provider}?`))return;
  await post("disconnect",{provider}); await refreshConnections(); notify("Connection removed.","success");
}
document.addEventListener("click",async(event)=>{
  const choose=event.target.closest?.("[data-choose-provider]");
  if(choose){try{choose.disabled=true;await post(choose.dataset.chooseProvider==="meta"?"select_meta_page":"select_google_account",choose.dataset.chooseProvider==="meta"?{pageId:choose.dataset.chooseId}:{accountId:choose.dataset.chooseId});await refreshConnections();notify("Selling account confirmed.","success");}catch(error){notify(error.message||"Unable to select account.","error");choose.disabled=false;}return;}
  const btn=event.target.closest?.("[data-connect]"); if(!btn)return; const provider=btn.dataset.connect; if(!provider)return;
  try{btn.disabled=true;if(connectionState[provider]?.connected)await disconnect(provider);else if(provider==="whatsapp")await startWhatsApp();else await startOauth(provider);}catch(error){console.error("Connection action failed",error);notify(error.message||"Connection failed.","error");btn.disabled=false;}
});
onAuthStateChanged(auth,async(user)=>{
  if(!user)return window.location.href="login.html";
  try{await refreshConnections();const params=new URLSearchParams(location.search);const status=params.get("social");if(status==="connected")notify("Authorization received. Confirm the account shown below.","success");if(status==="error")notify("The connection could not be completed. Check the PHP server credentials and try again.","error");if(status==="cancelled")notify("Connection cancelled.","error");}
  catch(error){console.error(error);notify(error.message||"Unable to load selling connections.","error");}
});
