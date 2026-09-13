const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {onRequest} = require("firebase-functions/v2/https");
const {defineSecret, defineString} = require("firebase-functions/params");
const admin = require("firebase-admin");
const axios = require("axios");
const crypto = require("crypto");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

const META_APP_ID = defineSecret("META_APP_ID");
const META_APP_SECRET = defineSecret("META_APP_SECRET");
const GOOGLE_CLIENT_ID = defineSecret("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = defineSecret("GOOGLE_CLIENT_SECRET");
const OAUTH_STATE_SECRET = defineSecret("OAUTH_STATE_SECRET");

const APP_URL = defineString("APP_URL", {default: "https://business-lift-3c19c.web.app"});
const FUNCTIONS_BASE_URL = defineString("FUNCTIONS_BASE_URL", {
  default: "https://us-central1-business-lift-3c19c.cloudfunctions.net",
});
const META_GRAPH_VERSION = defineString("META_GRAPH_VERSION", {default: "v23.0"});

function requireAuth(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
  return request.auth.uid;
}

async function verifyBusinessAccess(uid, businessId) {
  if (!businessId || typeof businessId !== "string") {
    throw new HttpsError("invalid-argument", "businessId is required.");
  }
  const snap = await db.collection("businesses").doc(businessId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Business not found.");
  const b = snap.data() || {};
  const allowed = b.ownerId === uid || b.uid === uid || b.userId === uid ||
    (Array.isArray(b.adminUids) && b.adminUids.includes(uid));
  if (!allowed) throw new HttpsError("permission-denied", "You cannot manage this business.");
  return b;
}

function b64url(value) {
  return Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}
function signState(payload) {
  const encoded = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", OAUTH_STATE_SECRET.value()).update(encoded).digest("hex");
  return `${encoded}.${sig}`;
}
function readState(state) {
  const [encoded, supplied] = String(state || "").split(".");
  if (!encoded || !supplied) throw new Error("Invalid OAuth state");
  const expected = crypto.createHmac("sha256", OAUTH_STATE_SECRET.value()).update(encoded).digest("hex");
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error("OAuth state mismatch");
  const json = Buffer.from(encoded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
  const payload = JSON.parse(json);
  if (!payload.exp || Date.now() > payload.exp) throw new Error("OAuth state expired");
  return payload;
}
function callbackUrl(provider) {
  return `${FUNCTIONS_BASE_URL.value()}/socialOAuthCallback?provider=${provider}`;
}
function channelRef(businessId, provider) {
  return db.collection("integrations").doc(businessId).collection("channels").doc(provider);
}
function safeConnection(provider, data = {}) {
  return {
    provider,
    connected: data.status === "connected",
    status: data.status || "not_connected",
    displayName: data.displayName || null,
    pageId: data.pageId || null,
    instagramBusinessId: data.instagramBusinessId || null,
    merchantAccountId: data.merchantAccountId || null,
  };
}

exports.getSocialConnectUrl = onCall({secrets: [META_APP_ID, META_APP_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OAUTH_STATE_SECRET]}, async (request) => {
  const uid = requireAuth(request);
  const {businessId, provider} = request.data || {};
  await verifyBusinessAccess(uid, businessId);
  const state = signState({uid, businessId, provider, nonce: crypto.randomBytes(16).toString("hex"), exp: Date.now() + 10 * 60 * 1000});

  if (provider === "meta") {
    const scopes = ["pages_show_list", "pages_read_engagement", "pages_manage_posts", "instagram_basic", "instagram_content_publish", "business_management"];
    const qs = new URLSearchParams({client_id: META_APP_ID.value(), redirect_uri: callbackUrl("meta"), state, response_type: "code", scope: scopes.join(",")});
    return {provider, url: `https://www.facebook.com/${META_GRAPH_VERSION.value()}/dialog/oauth?${qs}`};
  }
  if (provider === "google") {
    const qs = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID.value(), redirect_uri: callbackUrl("google"), response_type: "code",
      scope: "https://www.googleapis.com/auth/content", access_type: "offline", include_granted_scopes: "true", prompt: "consent", state,
    });
    return {provider, url: `https://accounts.google.com/o/oauth2/v2/auth?${qs}`};
  }
  throw new HttpsError("invalid-argument", "Unsupported provider.");
});

exports.socialOAuthCallback = onRequest({secrets: [META_APP_ID, META_APP_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OAUTH_STATE_SECRET]}, async (req, res) => {
  try {
    const provider = String(req.query.provider || "");
    if (req.query.error) return res.redirect(`${APP_URL.value()}/dashboard.html?social=cancelled&provider=${encodeURIComponent(provider)}`);
    const code = String(req.query.code || "");
    const payload = readState(String(req.query.state || ""));
    if (!code || payload.provider !== provider) throw new Error("Invalid OAuth callback");
    await verifyBusinessAccess(payload.uid, payload.businessId);

    if (provider === "meta") {
      const token = await axios.get(`https://graph.facebook.com/${META_GRAPH_VERSION.value()}/oauth/access_token`, {
        params: {client_id: META_APP_ID.value(), client_secret: META_APP_SECRET.value(), redirect_uri: callbackUrl("meta"), code},
      });
      const long = await axios.get(`https://graph.facebook.com/${META_GRAPH_VERSION.value()}/oauth/access_token`, {
        params: {grant_type: "fb_exchange_token", client_id: META_APP_ID.value(), client_secret: META_APP_SECRET.value(), fb_exchange_token: token.data.access_token},
      });
      const userAccessToken = long.data.access_token;
      const pagesRes = await axios.get(`https://graph.facebook.com/${META_GRAPH_VERSION.value()}/me/accounts`, {
        params: {fields: "id,name,access_token,instagram_business_account", access_token: userAccessToken},
      });
      const pages = pagesRes.data.data || [];
      const selected = pages.length === 1 ? pages[0] : null;
      await channelRef(payload.businessId, "meta").set({
        provider: "meta", status: pages.length ? "connected" : "needs_page", userAccessToken,
        pages: pages.map((p) => ({id: p.id, name: p.name, pageAccessToken: p.access_token, instagramBusinessId: p.instagram_business_account?.id || null})),
        displayName: selected?.name || null, pageId: selected?.id || null, pageAccessToken: selected?.access_token || null,
        instagramBusinessId: selected?.instagram_business_account?.id || null,
        connectedByUid: payload.uid, connectedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, {merge: true});
    } else if (provider === "google") {
      const tokenRes = await axios.post("https://oauth2.googleapis.com/token", new URLSearchParams({
        code, client_id: GOOGLE_CLIENT_ID.value(), client_secret: GOOGLE_CLIENT_SECRET.value(), redirect_uri: callbackUrl("google"), grant_type: "authorization_code",
      }).toString(), {headers: {"Content-Type": "application/x-www-form-urlencoded"}});
      const t = tokenRes.data;
      await channelRef(payload.businessId, "google").set({
        provider: "google", status: "connected", accessToken: t.access_token, refreshToken: t.refresh_token || null,
        scope: t.scope || null, merchantAccountId: null, displayName: "Google Merchant Center",
        connectedByUid: payload.uid, connectedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, {merge: true});
    } else {
      throw new Error("Unsupported provider");
    }
    return res.redirect(`${APP_URL.value()}/dashboard.html?social=connected&provider=${encodeURIComponent(provider)}`);
  } catch (error) {
    console.error("socialOAuthCallback", error.response?.data || error);
    return res.redirect(`${APP_URL.value()}/dashboard.html?social=error`);
  }
});

exports.getChannelConnections = onCall(async (request) => {
  const uid = requireAuth(request);
  const {businessId} = request.data || {};
  await verifyBusinessAccess(uid, businessId);
  const snap = await db.collection("integrations").doc(businessId).collection("channels").get();
  const out = {};
  snap.forEach((d) => { out[d.id] = safeConnection(d.id, d.data()); });
  return {
    meta: out.meta || safeConnection("meta"),
    google: out.google || safeConnection("google"),
    whatsapp: out.whatsapp || safeConnection("whatsapp"),
  };
});

exports.disconnectChannel = onCall(async (request) => {
  const uid = requireAuth(request);
  const {businessId, provider} = request.data || {};
  await verifyBusinessAccess(uid, businessId);
  if (!["meta", "google", "whatsapp"].includes(provider)) throw new HttpsError("invalid-argument", "Unsupported provider.");
  await channelRef(businessId, provider).delete();
  return {ok: true, provider};
});

exports.selectMetaPage = onCall(async (request) => {
  const uid = requireAuth(request);
  const {businessId, pageId} = request.data || {};
  await verifyBusinessAccess(uid, businessId);
  const ref = channelRef(businessId, "meta");
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("failed-precondition", "Meta is not connected.");
  const pages = snap.data()?.pages || [];
  const page = pages.find((p) => p.id === pageId);
  if (!page) throw new HttpsError("not-found", "Page not found.");
  await ref.set({status: "connected", displayName: page.name, pageId: page.id, pageAccessToken: page.pageAccessToken, instagramBusinessId: page.instagramBusinessId || null, updatedAt: admin.firestore.FieldValue.serverTimestamp()}, {merge: true});
  return {ok: true, page: {id: page.id, name: page.name, instagramBusinessId: page.instagramBusinessId || null}};
});

exports.completeWhatsAppEmbeddedSignup = onCall({secrets: [META_APP_ID, META_APP_SECRET]}, async (request) => {
  const uid = requireAuth(request);
  const {businessId, code, wabaId, phoneNumberId, displayPhoneNumber} = request.data || {};
  await verifyBusinessAccess(uid, businessId);
  if (!code || !wabaId || !phoneNumberId) throw new HttpsError("invalid-argument", "code, wabaId and phoneNumberId are required.");
  const token = await axios.get(`https://graph.facebook.com/${META_GRAPH_VERSION.value()}/oauth/access_token`, {
    params: {client_id: META_APP_ID.value(), client_secret: META_APP_SECRET.value(), code},
  });
  await channelRef(businessId, "whatsapp").set({
    provider: "whatsapp", status: "connected", accessToken: token.data.access_token, wabaId, phoneNumberId,
    displayPhoneNumber: displayPhoneNumber || null, displayName: displayPhoneNumber || "WhatsApp Business",
    connectedByUid: uid, connectedAt: admin.firestore.FieldValue.serverTimestamp(), updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, {merge: true});
  return {ok: true, provider: "whatsapp"};
});
