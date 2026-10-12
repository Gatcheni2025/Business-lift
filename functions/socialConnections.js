const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {onRequest} = require("firebase-functions/v2/https");
const {defineSecret, defineString} = require("firebase-functions/params");
const admin = require("firebase-admin");
const axios = require("axios");
const crypto = require("crypto");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

// Meta credentials are read only by the legacy Meta/WhatsApp handlers.
// Do not declare them as Firebase Secret params until those handlers are enabled,
// otherwise Firebase CLI prompts for them even during Google-only deployments.
const META_APP_ID = {value: () => process.env.META_APP_ID || ""};
const META_APP_SECRET = {value: () => process.env.META_APP_SECRET || ""};
const GOOGLE_CLIENT_ID = defineSecret("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = defineSecret("GOOGLE_CLIENT_SECRET");
const X_CLIENT_ID = defineSecret("X_CLIENT_ID");
const X_CLIENT_SECRET = defineSecret("X_CLIENT_SECRET");
const YOUTUBE_CLIENT_ID = defineSecret("YOUTUBE_CLIENT_ID");
const YOUTUBE_CLIENT_SECRET = defineSecret("YOUTUBE_CLIENT_SECRET");
const TIKTOK_CLIENT_KEY = defineSecret("TIKTOK_CLIENT_KEY");
const TIKTOK_CLIENT_SECRET = defineSecret("TIKTOK_CLIENT_SECRET");
const OAUTH_STATE_SECRET = defineSecret("OAUTH_STATE_SECRET");

const APP_URL = defineString("APP_URL", {
  default: "https://teyza.co.za",
});
const FUNCTIONS_BASE_URL = defineString("FUNCTIONS_BASE_URL", {
  default: "https://us-central1-business-lift-3c19c.cloudfunctions.net",
});
const META_GRAPH_VERSION = defineString("META_GRAPH_VERSION", {default: "v23.0"});
const META_WHATSAPP_CONFIG_ID = defineString("META_WHATSAPP_CONFIG_ID", {default: ""});

function requireAuth(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
  return request.auth.uid;
}

async function verifyBusinessAccess(uid, businessId) {
  if (!businessId || typeof businessId !== "string") {
    throw new HttpsError("invalid-argument", "businessId is required.");
  }
  const expected = "TZ_" + crypto.createHash("sha256").update(uid).digest("hex").slice(0, 8).toUpperCase();
  if (businessId === expected) return {businessId, ownerUid: uid, source: "teyza-workspace"};
  const snap = await db.collection("businesses").doc(businessId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Teyza workspace not found.");
  const b = snap.data() || {};
  const allowed = b.ownerId === uid || b.ownerUid === uid || b.uid === uid || b.userId === uid ||
    (Array.isArray(b.adminUids) && b.adminUids.includes(uid));
  if (!allowed) throw new HttpsError("permission-denied", "You cannot manage this business.");
  return b;
}

function b64url(value) {
  return Buffer.from(value).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function safeReturnTo(value) {
  const allowed = new Set([
    "/sales-channels.html",
    "/seller-onboarding.html",
    "/dashboard.html",
  ]);
  try {
    const parsed = new URL(String(value || "/sales-channels.html"), "https://teyza.local");
    const path = allowed.has(parsed.pathname) ? parsed.pathname : "/sales-channels.html";
    const query = new URLSearchParams();

    if (path === "/seller-onboarding.html") {
      if (parsed.searchParams.get("review") === "1") query.set("review", "1");
      const step = parsed.searchParams.get("step");
      if (["1", "2", "3", "4"].includes(step)) query.set("step", step);
    }

    if (path === "/sales-channels.html" && parsed.searchParams.get("return") === "dashboard") {
      query.set("return", "dashboard");
    }

    return `${path}${query.toString() ? `?${query.toString()}` : ""}`;
  } catch (_) {
    return "/sales-channels.html";
  }
}

function appRedirect(returnTo, params = {}) {
  const url = new URL(safeReturnTo(returnTo), APP_URL.value());
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  });
  return url.toString();
}

function signState(payload) {
  const encoded = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", OAUTH_STATE_SECRET.value())
    .update(encoded).digest("hex");
  return `${encoded}.${sig}`;
}

function readState(state) {
  const [encoded, supplied] = String(state || "").split(".");
  if (!encoded || !supplied) throw new Error("Invalid OAuth state");
  const expected = crypto.createHmac("sha256", OAUTH_STATE_SECRET.value())
    .update(encoded).digest("hex");
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new Error("OAuth state mismatch");
  }
  const json = Buffer.from(
    encoded.replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  ).toString("utf8");
  const payload = JSON.parse(json);
  if (!payload.exp || Date.now() > payload.exp) throw new Error("OAuth state expired");
  return payload;
}

function callbackUrl(provider) {
  return `${FUNCTIONS_BASE_URL.value()}/socialOAuthCallback?provider=${provider}`;
}

function channelRef(businessId, provider) {
  return db.collection("integrations").doc(businessId)
    .collection("channels").doc(provider);
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
    externalUserId: data.externalUserId || data.xUserId || data.openId || data.channelId || null,
    username: data.username || null,
    profileImageUrl: data.profileImageUrl || null,
    channelId: data.channelId || null,
    openId: data.openId || null,
    availablePages: Array.isArray(data.pages) ? data.pages.map((p) => ({
      id: p.id,
      name: p.name,
      instagramBusinessId: p.instagramBusinessId || null,
    })) : [],
    availableAccounts: Array.isArray(data.accounts) ? data.accounts.map((a) => ({
      name: a.name,
      accountId: a.accountId,
      accountName: a.accountName,
    })) : [],
  };
}


function xOAuthPendingRef(businessId, nonce) {
  return db.collection("integrations").doc(businessId)
    .collection("oauth_pending").doc(`x_${nonce}`);
}

function xRedirectUri() {
  return `${FUNCTIONS_BASE_URL.value()}/xOAuthCallback`;
}

function xBasicAuthHeader() {
  return `Basic ${Buffer.from(
    `${X_CLIENT_ID.value()}:${X_CLIENT_SECRET.value()}`,
    "utf8",
  ).toString("base64")}`;
}

exports.getXConnectUrl = onCall({
  secrets: [X_CLIENT_ID, OAUTH_STATE_SECRET],
}, async (request) => {
  const uid = requireAuth(request);
  const {businessId, returnTo} = request.data || {};
  await verifyBusinessAccess(uid, businessId);

  const nonce = crypto.randomBytes(18).toString("hex");
  const codeVerifier = b64url(crypto.randomBytes(48));
  const codeChallenge = b64url(
    crypto.createHash("sha256").update(codeVerifier).digest(),
  );
  const exp = Date.now() + 10 * 60 * 1000;

  await xOAuthPendingRef(businessId, nonce).set({
    provider: "x",
    uid,
    businessId,
    codeVerifier,
    returnTo: safeReturnTo(returnTo),
    expiresAt: admin.firestore.Timestamp.fromMillis(exp),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const state = signState({
    uid,
    businessId,
    provider: "x",
    returnTo: safeReturnTo(returnTo),
    nonce,
    exp,
  });

  const qs = new URLSearchParams({
    response_type: "code",
    client_id: X_CLIENT_ID.value(),
    redirect_uri: xRedirectUri(),
    scope: "tweet.read tweet.write users.read offline.access",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return {
    provider: "x",
    url: `https://twitter.com/i/oauth2/authorize?${qs.toString()}`,
  };
});

exports.xOAuthCallback = onRequest({
  secrets: [X_CLIENT_ID, X_CLIENT_SECRET, OAUTH_STATE_SECRET],
}, async (req, res) => {
  let returnTo = "/sales-channels.html";
  let pendingRef = null;

  try {
    const stateValue = String(req.query.state || "");
    let payload = null;

    if (stateValue) {
      payload = readState(stateValue);
      returnTo = safeReturnTo(payload.returnTo);
      if (payload.provider !== "x") throw new Error("Invalid X OAuth state");
      pendingRef = xOAuthPendingRef(payload.businessId, payload.nonce);
    }

    if (req.query.error) {
      return res.redirect(appRedirect(returnTo, {
        social: "cancelled",
        provider: "x",
      }));
    }

    if (!payload) throw new Error("Missing X OAuth state");

    const code = String(req.query.code || "");
    if (!code) throw new Error("Missing X authorization code");

    await verifyBusinessAccess(payload.uid, payload.businessId);

    const pendingSnap = await pendingRef.get();
    if (!pendingSnap.exists) throw new Error("X OAuth session was not found or already used");

    const pending = pendingSnap.data() || {};
    const pendingExpiry = pending.expiresAt?.toMillis?.() || 0;
    if (pending.uid !== payload.uid ||
        pending.businessId !== payload.businessId ||
        !pending.codeVerifier ||
        (pendingExpiry && Date.now() > pendingExpiry)) {
      throw new Error("X OAuth session expired");
    }

    const tokenRes = await axios.post(
      "https://api.x.com/2/oauth2/token",
      new URLSearchParams({
        code,
        grant_type: "authorization_code",
        redirect_uri: xRedirectUri(),
        code_verifier: pending.codeVerifier,
        client_id: X_CLIENT_ID.value(),
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: xBasicAuthHeader(),
        },
      },
    );

    const token = tokenRes.data || {};
    if (!token.access_token) throw new Error("X did not return an access token");

    const meRes = await axios.get(
      "https://api.x.com/2/users/me",
      {
        params: {
          "user.fields": "id,name,username,profile_image_url",
        },
        headers: {
          Authorization: `Bearer ${token.access_token}`,
        },
      },
    );

    const xUser = meRes.data?.data || {};
    const username = String(xUser.username || "").trim();

    await channelRef(payload.businessId, "x").set({
      provider: "x",
      status: "connected",
      accessToken: token.access_token,
      refreshToken: token.refresh_token || null,
      tokenType: token.token_type || "bearer",
      expiresAt: token.expires_in ?
        admin.firestore.Timestamp.fromMillis(Date.now() + Number(token.expires_in) * 1000) :
        null,
      scope: token.scope || "tweet.read tweet.write users.read offline.access",
      externalUserId: xUser.id || null,
      username: username || null,
      accountName: xUser.name || null,
      profileImageUrl: xUser.profile_image_url || null,
      displayName: username ? `@${username}` : (xUser.name || "X account"),
      connectedByUid: payload.uid,
      connectedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, {merge: true});

    await pendingRef.delete().catch(() => {});

    return res.redirect(appRedirect(returnTo, {
      social: "connected",
      provider: "x",
    }));
  } catch (error) {
    console.error("xOAuthCallback", error.response?.data || error);
    if (pendingRef) await pendingRef.delete().catch(() => {});
    return res.redirect(appRedirect(returnTo, {
      social: "error",
      provider: "x",
    }));
  }
});


function providerPendingRef(businessId, provider, nonce) {
  return db.collection("integrations").doc(businessId)
    .collection("oauth_pending").doc(`${provider}_${nonce}`);
}

function youtubeRedirectUri() {
  return `${FUNCTIONS_BASE_URL.value()}/youtubeOAuthCallback`;
}

function tiktokRedirectUri() {
  return `${FUNCTIONS_BASE_URL.value()}/tiktokOAuthCallback`;
}

exports.getYouTubeConnectUrl = onCall({
  secrets: [YOUTUBE_CLIENT_ID, OAUTH_STATE_SECRET],
}, async (request) => {
  const uid = requireAuth(request);
  const {businessId, returnTo} = request.data || {};
  await verifyBusinessAccess(uid, businessId);

  const nonce = crypto.randomBytes(18).toString("hex");
  const exp = Date.now() + 10 * 60 * 1000;
  const safeReturn = safeReturnTo(returnTo);

  await providerPendingRef(businessId, "youtube", nonce).set({
    provider: "youtube",
    uid,
    businessId,
    returnTo: safeReturn,
    expiresAt: admin.firestore.Timestamp.fromMillis(exp),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const state = signState({
    uid,
    businessId,
    provider: "youtube",
    returnTo: safeReturn,
    nonce,
    exp,
  });

  const scopes = [
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
    "https://www.googleapis.com/auth/youtube.upload",
  ];

  const qs = new URLSearchParams({
    client_id: YOUTUBE_CLIENT_ID.value(),
    redirect_uri: youtubeRedirectUri(),
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });

  return {
    provider: "youtube",
    url: `https://accounts.google.com/o/oauth2/v2/auth?${qs.toString()}`,
  };
});

exports.youtubeOAuthCallback = onRequest({
  secrets: [
    YOUTUBE_CLIENT_ID,
    YOUTUBE_CLIENT_SECRET,
    OAUTH_STATE_SECRET,
  ],
}, async (req, res) => {
  let returnTo = "/sales-channels.html";
  let pendingRef = null;

  try {
    const stateValue = String(req.query.state || "");
    let payload = null;

    if (stateValue) {
      payload = readState(stateValue);
      returnTo = safeReturnTo(payload.returnTo);

      if (payload.provider !== "youtube") {
        throw new Error("Invalid YouTube OAuth state");
      }

      pendingRef = providerPendingRef(
        payload.businessId,
        "youtube",
        payload.nonce,
      );
    }

    if (req.query.error) {
      return res.redirect(appRedirect(returnTo, {
        social: "cancelled",
        provider: "youtube",
      }));
    }

    if (!payload) throw new Error("Missing YouTube OAuth state");

    const code = String(req.query.code || "");
    if (!code) throw new Error("Missing YouTube authorization code");

    await verifyBusinessAccess(payload.uid, payload.businessId);

    const pendingSnap = await pendingRef.get();
    if (!pendingSnap.exists) {
      throw new Error("YouTube OAuth session was not found or already used");
    }

    const pending = pendingSnap.data() || {};
    const pendingExpiry = pending.expiresAt?.toMillis?.() || 0;

    if (
      pending.uid !== payload.uid ||
      pending.businessId !== payload.businessId ||
      (pendingExpiry && Date.now() > pendingExpiry)
    ) {
      throw new Error("YouTube OAuth session expired");
    }

    const tokenRes = await axios.post(
      "https://oauth2.googleapis.com/token",
      new URLSearchParams({
        code,
        client_id: YOUTUBE_CLIENT_ID.value(),
        client_secret: YOUTUBE_CLIENT_SECRET.value(),
        redirect_uri: youtubeRedirectUri(),
        grant_type: "authorization_code",
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    );

    const token = tokenRes.data || {};
    if (!token.access_token) {
      throw new Error("YouTube did not return an access token");
    }

    const channelsRes = await axios.get(
      "https://www.googleapis.com/youtube/v3/channels",
      {
        params: {
          part: "snippet",
          mine: "true",
          maxResults: 1,
        },
        headers: {
          Authorization: `Bearer ${token.access_token}`,
        },
      },
    );

    const channel = channelsRes.data?.items?.[0] || null;

    if (!channel) {
      await channelRef(payload.businessId, "youtube").set({
        provider: "youtube",
        status: "no_channel",
        accessToken: token.access_token,
        refreshToken: token.refresh_token || null,
        tokenType: token.token_type || "Bearer",
        expiresAt: token.expires_in ?
          admin.firestore.Timestamp.fromMillis(
            Date.now() + Number(token.expires_in) * 1000,
          ) :
          null,
        scope: token.scope || null,
        connectedByUid: payload.uid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, {merge: true});

      await pendingRef.delete().catch(() => {});

      return res.redirect(appRedirect(returnTo, {
        social: "connected",
        provider: "youtube",
        account: "no_channel",
      }));
    }

    const snippet = channel.snippet || {};
    const profileImageUrl =
      snippet.thumbnails?.high?.url ||
      snippet.thumbnails?.medium?.url ||
      snippet.thumbnails?.default?.url ||
      null;

    await channelRef(payload.businessId, "youtube").set({
      provider: "youtube",
      status: "connected",
      accessToken: token.access_token,
      refreshToken: token.refresh_token || null,
      tokenType: token.token_type || "Bearer",
      expiresAt: token.expires_in ?
        admin.firestore.Timestamp.fromMillis(
          Date.now() + Number(token.expires_in) * 1000,
        ) :
        null,
      scope: token.scope || null,
      channelId: channel.id || null,
      externalUserId: channel.id || null,
      displayName: snippet.title || "YouTube channel",
      profileImageUrl,
      connectedByUid: payload.uid,
      connectedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, {merge: true});

    await pendingRef.delete().catch(() => {});

    return res.redirect(appRedirect(returnTo, {
      social: "connected",
      provider: "youtube",
    }));
  } catch (error) {
    console.error(
      "youtubeOAuthCallback",
      error.response?.data || error,
    );

    if (pendingRef) await pendingRef.delete().catch(() => {});

    return res.redirect(appRedirect(returnTo, {
      social: "error",
      provider: "youtube",
    }));
  }
});

exports.getTikTokConnectUrl = onCall({
  secrets: [TIKTOK_CLIENT_KEY, OAUTH_STATE_SECRET],
}, async (request) => {
  const uid = requireAuth(request);
  const {businessId, returnTo} = request.data || {};
  await verifyBusinessAccess(uid, businessId);

  const nonce = crypto.randomBytes(18).toString("hex");
  const exp = Date.now() + 10 * 60 * 1000;
  const safeReturn = safeReturnTo(returnTo);

  await providerPendingRef(businessId, "tiktok", nonce).set({
    provider: "tiktok",
    uid,
    businessId,
    returnTo: safeReturn,
    expiresAt: admin.firestore.Timestamp.fromMillis(exp),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const state = signState({
    uid,
    businessId,
    provider: "tiktok",
    returnTo: safeReturn,
    nonce,
    exp,
  });

  const qs = new URLSearchParams({
    client_key: TIKTOK_CLIENT_KEY.value(),
    response_type: "code",
    scope: "user.info.basic,video.list,video.publish",
    redirect_uri: tiktokRedirectUri(),
    state,
  });

  return {
    provider: "tiktok",
    url: `https://www.tiktok.com/v2/auth/authorize/?${qs.toString()}`,
  };
});

exports.tiktokOAuthCallback = onRequest({
  secrets: [
    TIKTOK_CLIENT_KEY,
    TIKTOK_CLIENT_SECRET,
    OAUTH_STATE_SECRET,
  ],
}, async (req, res) => {
  let returnTo = "/sales-channels.html";
  let pendingRef = null;

  try {
    const stateValue = String(req.query.state || "");
    let payload = null;

    if (stateValue) {
      payload = readState(stateValue);
      returnTo = safeReturnTo(payload.returnTo);

      if (payload.provider !== "tiktok") {
        throw new Error("Invalid TikTok OAuth state");
      }

      pendingRef = providerPendingRef(
        payload.businessId,
        "tiktok",
        payload.nonce,
      );
    }

    if (req.query.error) {
      return res.redirect(appRedirect(returnTo, {
        social: "cancelled",
        provider: "tiktok",
      }));
    }

    if (!payload) throw new Error("Missing TikTok OAuth state");

    const code = String(req.query.code || "");
    if (!code) throw new Error("Missing TikTok authorization code");

    await verifyBusinessAccess(payload.uid, payload.businessId);

    const pendingSnap = await pendingRef.get();
    if (!pendingSnap.exists) {
      throw new Error("TikTok OAuth session was not found or already used");
    }

    const pending = pendingSnap.data() || {};
    const pendingExpiry = pending.expiresAt?.toMillis?.() || 0;

    if (
      pending.uid !== payload.uid ||
      pending.businessId !== payload.businessId ||
      (pendingExpiry && Date.now() > pendingExpiry)
    ) {
      throw new Error("TikTok OAuth session expired");
    }

    const tokenRes = await axios.post(
      "https://open.tiktokapis.com/v2/oauth/token/",
      new URLSearchParams({
        client_key: TIKTOK_CLIENT_KEY.value(),
        client_secret: TIKTOK_CLIENT_SECRET.value(),
        code,
        grant_type: "authorization_code",
        redirect_uri: tiktokRedirectUri(),
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Cache-Control": "no-cache",
        },
      },
    );

    const token = tokenRes.data || {};
    if (!token.access_token) {
      throw new Error(
        token.error_description ||
        token.error ||
        "TikTok did not return an access token",
      );
    }

    const userRes = await axios.get(
      "https://open.tiktokapis.com/v2/user/info/",
      {
        params: {
          fields: "open_id,avatar_url,display_name",
        },
        headers: {
          Authorization: `Bearer ${token.access_token}`,
        },
      },
    );

    const userInfo = userRes.data?.data?.user || {};
    const apiError = userRes.data?.error || {};

    if (apiError.code && apiError.code !== "ok") {
      throw new Error(apiError.message || "TikTok user lookup failed");
    }

    await channelRef(payload.businessId, "tiktok").set({
      provider: "tiktok",
      status: "connected",
      accessToken: token.access_token,
      refreshToken: token.refresh_token || null,
      tokenType: token.token_type || "Bearer",
      expiresAt: token.expires_in ?
        admin.firestore.Timestamp.fromMillis(
          Date.now() + Number(token.expires_in) * 1000,
        ) :
        null,
      refreshExpiresAt: token.refresh_expires_in ?
        admin.firestore.Timestamp.fromMillis(
          Date.now() + Number(token.refresh_expires_in) * 1000,
        ) :
        null,
      scope: token.scope || null,
      openId: token.open_id || userInfo.open_id || null,
      externalUserId: token.open_id || userInfo.open_id || null,
      displayName: userInfo.display_name || "TikTok account",
      profileImageUrl: userInfo.avatar_url || null,
      connectedByUid: payload.uid,
      connectedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, {merge: true});

    await pendingRef.delete().catch(() => {});

    return res.redirect(appRedirect(returnTo, {
      social: "connected",
      provider: "tiktok",
    }));
  } catch (error) {
    console.error(
      "tiktokOAuthCallback",
      error.response?.data || error,
    );

    if (pendingRef) await pendingRef.delete().catch(() => {});

    return res.redirect(appRedirect(returnTo, {
      social: "error",
      provider: "tiktok",
    }));
  }
});

exports.getGoogleConnectUrl = onCall({
  secrets: [GOOGLE_CLIENT_ID, OAUTH_STATE_SECRET],
}, async (request) => {
  const uid = requireAuth(request);
  const {businessId, returnTo} = request.data || {};
  await verifyBusinessAccess(uid, businessId);
  const state = signState({
    uid,
    businessId,
    provider: "google",
    returnTo: safeReturnTo(returnTo),
    nonce: crypto.randomBytes(16).toString("hex"),
    exp: Date.now() + 10 * 60 * 1000,
  });
  const redirectUri = `${FUNCTIONS_BASE_URL.value()}/googleOAuthCallback`;
  const qs = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID.value(),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/content",
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state,
  });
  return {provider: "google", url: `https://accounts.google.com/o/oauth2/v2/auth?${qs}`};
});

exports.googleOAuthCallback = onRequest({
  secrets: [GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OAUTH_STATE_SECRET],
}, async (req, res) => {
  let returnTo = "/sales-channels.html";
  try {
    if (req.query.error) {
      return res.redirect(appRedirect(returnTo, {social: "cancelled", provider: "google"}));
    }
    const code = String(req.query.code || "");
    const payload = readState(String(req.query.state || ""));
    returnTo = safeReturnTo(payload.returnTo);
    if (!code || payload.provider !== "google") throw new Error("Invalid Google OAuth callback");
    await verifyBusinessAccess(payload.uid, payload.businessId);
    const redirectUri = `${FUNCTIONS_BASE_URL.value()}/googleOAuthCallback`;
    const tokenRes = await axios.post(
      "https://oauth2.googleapis.com/token",
      new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID.value(),
        client_secret: GOOGLE_CLIENT_SECRET.value(),
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
      {headers: {"Content-Type": "application/x-www-form-urlencoded"}},
    );
    const t = tokenRes.data;
    const accountsRes = await axios.get(
      "https://merchantapi.googleapis.com/accounts/v1/accounts",
      {headers: {Authorization: `Bearer ${t.access_token}`}},
    );
    const accounts = (accountsRes.data.accounts || []).map((a) => ({
      name: a.name || "",
      accountId: String(a.name || "").split("/").pop(),
      accountName: a.accountName || a.account_name || "Merchant Center",
    }));
    const selected = accounts.length === 1 ? accounts[0] : null;
    const status = accounts.length === 1 ? "connected" :
      (accounts.length > 1 ? "needs_account" : "no_accounts");
    await channelRef(payload.businessId, "google").set({
      provider: "google",
      status,
      accessToken: t.access_token,
      refreshToken: t.refresh_token || null,
      scope: t.scope || null,
      accounts,
      merchantAccountId: selected?.accountId || null,
      displayName: selected?.accountName || null,
      connectedByUid: payload.uid,
      connectedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, {merge: true});
    return res.redirect(appRedirect(returnTo, {
      social: "connected",
      provider: "google",
    }));
  } catch (error) {
    console.error("googleOAuthCallback", error.response?.data || error);
    return res.redirect(appRedirect(returnTo, {social: "error", provider: "google"}));
  }
});

const getSocialConnectUrlLegacy = onCall({
  secrets: [
    META_APP_ID,
    META_APP_SECRET,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    OAUTH_STATE_SECRET,
  ],
}, async (request) => {
  const uid = requireAuth(request);
  const {businessId, provider, returnTo} = request.data || {};
  await verifyBusinessAccess(uid, businessId);
  const state = signState({
    uid,
    businessId,
    provider,
    returnTo: safeReturnTo(returnTo),
    nonce: crypto.randomBytes(16).toString("hex"),
    exp: Date.now() + 10 * 60 * 1000,
  });

  if (provider === "meta") {
    const scopes = [
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_posts",
      "instagram_basic",
      "instagram_content_publish",
      "business_management",
    ];
    const qs = new URLSearchParams({
      client_id: META_APP_ID.value(),
      redirect_uri: callbackUrl("meta"),
      state,
      response_type: "code",
      scope: scopes.join(","),
    });
    return {
      provider,
      url: `https://www.facebook.com/${META_GRAPH_VERSION.value()}/dialog/oauth?${qs}`,
    };
  }

  if (provider === "google") {
    const qs = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID.value(),
      redirect_uri: callbackUrl("google"),
      response_type: "code",
      scope: "https://www.googleapis.com/auth/content",
      access_type: "offline",
      include_granted_scopes: "true",
      prompt: "consent",
      state,
    });
    return {provider, url: `https://accounts.google.com/o/oauth2/v2/auth?${qs}`};
  }

  throw new HttpsError("invalid-argument", "Unsupported provider.");
});

const socialOAuthCallbackLegacy = onRequest({
  secrets: [
    META_APP_ID,
    META_APP_SECRET,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    OAUTH_STATE_SECRET,
  ],
}, async (req, res) => {
  let returnTo = "/sales-channels.html";
  try {
    const provider = String(req.query.provider || "");
    if (req.query.error) {
      return res.redirect(`${APP_URL.value()}${returnTo}?social=cancelled`);
    }
    const code = String(req.query.code || "");
    const payload = readState(String(req.query.state || ""));
    returnTo = safeReturnTo(payload.returnTo);
    if (!code || payload.provider !== provider) {
      throw new Error("Invalid OAuth callback");
    }
    await verifyBusinessAccess(payload.uid, payload.businessId);

    if (provider === "meta") {
      const token = await axios.get(
        `https://graph.facebook.com/${META_GRAPH_VERSION.value()}/oauth/access_token`,
        {params: {
          client_id: META_APP_ID.value(),
          client_secret: META_APP_SECRET.value(),
          redirect_uri: callbackUrl("meta"),
          code,
        }},
      );
      const long = await axios.get(
        `https://graph.facebook.com/${META_GRAPH_VERSION.value()}/oauth/access_token`,
        {params: {
          grant_type: "fb_exchange_token",
          client_id: META_APP_ID.value(),
          client_secret: META_APP_SECRET.value(),
          fb_exchange_token: token.data.access_token,
        }},
      );
      const userAccessToken = long.data.access_token;
      const pagesRes = await axios.get(
        `https://graph.facebook.com/${META_GRAPH_VERSION.value()}/me/accounts`,
        {params: {
          fields: "id,name,access_token,instagram_business_account",
          access_token: userAccessToken,
        }},
      );
      const pages = (pagesRes.data.data || []).map((p) => ({
        id: p.id,
        name: p.name,
        pageAccessToken: p.access_token,
        instagramBusinessId: p.instagram_business_account?.id || null,
      }));
      const selected = pages.length === 1 ? pages[0] : null;
      const status = pages.length === 1 ? "connected" :
        (pages.length > 1 ? "needs_page" : "no_pages");
      await channelRef(payload.businessId, "meta").set({
        provider: "meta",
        status,
        userAccessToken,
        pages,
        displayName: selected?.name || null,
        pageId: selected?.id || null,
        pageAccessToken: selected?.pageAccessToken || null,
        instagramBusinessId: selected?.instagramBusinessId || null,
        connectedByUid: payload.uid,
        connectedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, {merge: true});
    } else if (provider === "google") {
      const tokenRes = await axios.post(
        "https://oauth2.googleapis.com/token",
        new URLSearchParams({
          code,
          client_id: GOOGLE_CLIENT_ID.value(),
          client_secret: GOOGLE_CLIENT_SECRET.value(),
          redirect_uri: callbackUrl("google"),
          grant_type: "authorization_code",
        }).toString(),
        {headers: {"Content-Type": "application/x-www-form-urlencoded"}},
      );
      const t = tokenRes.data;
      const accountsRes = await axios.get(
        "https://merchantapi.googleapis.com/accounts/v1/accounts",
        {headers: {Authorization: `Bearer ${t.access_token}`}},
      );
      const accounts = (accountsRes.data.accounts || []).map((a) => ({
        name: a.name || "",
        accountId: String(a.name || "").split("/").pop(),
        accountName: a.accountName || a.account_name || "Merchant Center",
      }));
      const selected = accounts.length === 1 ? accounts[0] : null;
      const status = accounts.length === 1 ? "connected" :
        (accounts.length > 1 ? "needs_account" : "no_accounts");
      await channelRef(payload.businessId, "google").set({
        provider: "google",
        status,
        accessToken: t.access_token,
        refreshToken: t.refresh_token || null,
        scope: t.scope || null,
        accounts,
        merchantAccountId: selected?.accountId || null,
        displayName: selected?.accountName || null,
        connectedByUid: payload.uid,
        connectedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, {merge: true});
    } else {
      throw new Error("Unsupported provider");
    }

    return res.redirect(
      `${APP_URL.value()}${returnTo}?social=connected&provider=${encodeURIComponent(provider)}`,
    );
  } catch (error) {
    console.error("socialOAuthCallback", error.response?.data || error);
    return res.redirect(`${APP_URL.value()}${returnTo}?social=error`);
  }
});

exports.getChannelConnections = onCall(async (request) => {
  const uid = requireAuth(request);
  const {businessId} = request.data || {};
  await verifyBusinessAccess(uid, businessId);
  const snap = await db.collection("integrations").doc(businessId)
    .collection("channels").get();
  const out = {};
  snap.forEach((d) => { out[d.id] = safeConnection(d.id, d.data()); });
  return {
    meta: out.meta || safeConnection("meta"),
    google: out.google || safeConnection("google"),
    whatsapp: out.whatsapp || safeConnection("whatsapp"),
    x: out.x || safeConnection("x"),
    youtube: out.youtube || safeConnection("youtube"),
    tiktok: out.tiktok || safeConnection("tiktok"),
  };
});

exports.disconnectChannel = onCall({
  secrets: [
    X_CLIENT_ID,
    X_CLIENT_SECRET,
    YOUTUBE_CLIENT_ID,
    YOUTUBE_CLIENT_SECRET,
    TIKTOK_CLIENT_KEY,
    TIKTOK_CLIENT_SECRET,
  ],
}, async (request) => {
  const uid = requireAuth(request);
  const {businessId, provider} = request.data || {};
  await verifyBusinessAccess(uid, businessId);
  if (!["meta", "google", "whatsapp", "x", "youtube", "tiktok"].includes(provider)) {
    throw new HttpsError("invalid-argument", "Unsupported provider.");
  }

  const ref = channelRef(businessId, provider);
  const snap = await ref.get();
  const data = snap.exists ? (snap.data() || {}) : {};

  if (provider === "x") {
    const token = data.refreshToken || data.accessToken || "";
    if (token) {
      try {
        await axios.post(
          "https://api.x.com/2/oauth2/revoke",
          new URLSearchParams({
            token,
            token_type_hint: data.refreshToken ? "refresh_token" : "access_token",
            client_id: X_CLIENT_ID.value(),
          }).toString(),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              Authorization: xBasicAuthHeader(),
            },
          },
        );
      } catch (error) {
        console.warn(
          "X token revocation failed",
          error.response?.data || error.message,
        );
      }
    }
  }

  if (provider === "youtube") {
    const token = data.refreshToken || data.accessToken || "";
    if (token) {
      try {
        await axios.post(
          "https://oauth2.googleapis.com/revoke",
          new URLSearchParams({token}).toString(),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
          },
        );
      } catch (error) {
        console.warn(
          "YouTube token revocation failed",
          error.response?.data || error.message,
        );
      }
    }
  }

  if (provider === "tiktok") {
    const token = data.accessToken || "";
    if (token) {
      try {
        await axios.post(
          "https://open.tiktokapis.com/v2/oauth/revoke/",
          new URLSearchParams({
            client_key: TIKTOK_CLIENT_KEY.value(),
            client_secret: TIKTOK_CLIENT_SECRET.value(),
            token,
          }).toString(),
          {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "Cache-Control": "no-cache",
            },
          },
        );
      } catch (error) {
        console.warn(
          "TikTok token revocation failed",
          error.response?.data || error.message,
        );
      }
    }
  }

  await ref.delete();
  return {ok: true, provider};
});

exports.selectMetaPage = onCall(async (request) => {
  const uid = requireAuth(request);
  const {businessId, pageId} = request.data || {};
  await verifyBusinessAccess(uid, businessId);
  const ref = channelRef(businessId, "meta");
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("failed-precondition", "Meta is not connected.");
  }
  const pages = snap.data()?.pages || [];
  const page = pages.find((p) => p.id === pageId);
  if (!page) throw new HttpsError("not-found", "Page not found.");
  await ref.set({
    status: "connected",
    displayName: page.name,
    pageId: page.id,
    pageAccessToken: page.pageAccessToken,
    instagramBusinessId: page.instagramBusinessId || null,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, {merge: true});
  return {
    ok: true,
    page: {
      id: page.id,
      name: page.name,
      instagramBusinessId: page.instagramBusinessId || null,
    },
  };
});

exports.selectGoogleMerchantAccount = onCall(async (request) => {
  const uid = requireAuth(request);
  const {businessId, accountId} = request.data || {};
  await verifyBusinessAccess(uid, businessId);
  const ref = channelRef(businessId, "google");
  const snap = await ref.get();
  if (!snap.exists) {
    throw new HttpsError("failed-precondition", "Google is not connected.");
  }
  const accounts = snap.data()?.accounts || [];
  const account = accounts.find((a) => a.accountId === accountId);
  if (!account) throw new HttpsError("not-found", "Merchant account not found.");
  await ref.set({
    status: "connected",
    merchantAccountId: account.accountId,
    displayName: account.accountName || "Google Merchant Center",
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, {merge: true});
  return {ok: true, account};
});

const getWhatsAppEmbeddedSignupConfigLegacy = onCall({secrets: [META_APP_ID]}, async (request) => {
  const uid = requireAuth(request);
  const {businessId} = request.data || {};
  await verifyBusinessAccess(uid, businessId);
  return {
    appId: META_APP_ID.value(),
    configId: META_WHATSAPP_CONFIG_ID.value(),
    graphVersion: META_GRAPH_VERSION.value(),
  };
});

const completeWhatsAppEmbeddedSignupLegacy = onCall({
  secrets: [META_APP_ID, META_APP_SECRET],
}, async (request) => {
  const uid = requireAuth(request);
  const {businessId, code, wabaId, phoneNumberId} = request.data || {};
  await verifyBusinessAccess(uid, businessId);
  if (!code || !wabaId || !phoneNumberId) {
    throw new HttpsError(
      "invalid-argument",
      "code, wabaId and phoneNumberId are required.",
    );
  }
  const token = await axios.get(
    `https://graph.facebook.com/${META_GRAPH_VERSION.value()}/oauth/access_token`,
    {params: {
      client_id: META_APP_ID.value(),
      client_secret: META_APP_SECRET.value(),
      code,
    }},
  );
  const accessToken = token.data.access_token;
  const phone = await axios.get(
    `https://graph.facebook.com/${META_GRAPH_VERSION.value()}/${phoneNumberId}`,
    {params: {
      fields: "display_phone_number,verified_name",
      access_token: accessToken,
    }},
  );
  try {
    await axios.post(
      `https://graph.facebook.com/${META_GRAPH_VERSION.value()}/${wabaId}/subscribed_apps`,
      null,
      {params: {access_token: accessToken}},
    );
  } catch (error) {
    console.warn("Unable to subscribe WABA", error.response?.data || error.message);
  }
  await channelRef(businessId, "whatsapp").set({
    provider: "whatsapp",
    status: "connected",
    accessToken,
    wabaId,
    phoneNumberId,
    displayPhoneNumber: phone.data.display_phone_number || null,
    displayName: phone.data.verified_name ||
      phone.data.display_phone_number || "WhatsApp Business",
    connectedByUid: uid,
    connectedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, {merge: true});
  return {ok: true, provider: "whatsapp"};
});


function reportDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function safeOfferId(value) {
  const id = String(value || "").trim();
  return /^[A-Za-z0-9._:-]{1,120}$/.test(id) ? id : null;
}

async function googleReportingAccessToken(ref, data) {
  if (data.refreshToken) {
    try {
      const tokenRes = await axios.post(
        "https://oauth2.googleapis.com/token",
        new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID.value(),
          client_secret: GOOGLE_CLIENT_SECRET.value(),
          refresh_token: data.refreshToken,
          grant_type: "refresh_token",
        }).toString(),
        {headers: {"Content-Type": "application/x-www-form-urlencoded"}},
      );
      const accessToken = tokenRes.data.access_token;
      if (accessToken) {
        await ref.set({
          accessToken,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, {merge: true});
        return accessToken;
      }
    } catch (error) {
      console.warn(
        "Google token refresh failed",
        error.response?.data || error.message,
      );
    }
  }
  return data.accessToken || null;
}

exports.getProductPerformance = onCall({
  secrets: [GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET],
}, async (request) => {
  const uid = requireAuth(request);
  const {businessId, offerIds, period, createdAt} = request.data || {};
  await verifyBusinessAccess(uid, businessId);

  const ref = channelRef(businessId, "google");
  const snap = await ref.get();
  if (!snap.exists) {
    return {google: {
      connected: false,
      available: false,
      message: "Google Shopping is not connected.",
    }};
  }

  const connection = snap.data() || {};
  const connected = connection.status === "connected";
  const merchantAccountId = String(connection.merchantAccountId || "");
  if (!connected || !merchantAccountId) {
    return {google: {
      connected,
      available: false,
      message: connected ?
        "Select a Google Merchant Center account first." :
        "Google Shopping is not connected.",
    }};
  }

  const token = await googleReportingAccessToken(ref, connection);
  if (!token) {
    return {google: {
      connected: true,
      available: false,
      message: "Google authorization needs to be refreshed.",
    }};
  }

  const end = new Date();
  let start = new Date(end);
  if (String(period) === "today") {
    start = new Date(end);
  } else if (String(period) === "7") {
    start.setUTCDate(start.getUTCDate() - 6);
  } else if (String(period) === "30") {
    start.setUTCDate(start.getUTCDate() - 29);
  } else if (String(period) === "all") {
    const created = createdAt ? new Date(createdAt) : null;
    start = created && !Number.isNaN(created.getTime()) ?
      created : new Date(Date.UTC(end.getUTCFullYear() - 3, 0, 1));
  } else {
    start.setUTCDate(start.getUTCDate() - 29);
  }

  const startDate = reportDate(start);
  const endDate = reportDate(end);
  const ids = Array.isArray(offerIds) ?
    [...new Set(offerIds.map(safeOfferId).filter(Boolean))].slice(0, 3) : [];

  if (!ids.length) {
    return {google: {
      connected: true,
      available: false,
      message: "No Google offer ID is available for this product yet.",
    }};
  }

  const endpoint =
    `https://merchantapi.googleapis.com/reports/v1/accounts/` +
    `${encodeURIComponent(merchantAccountId)}/reports:search`;

  let matched = null;
  for (const offerId of ids) {
    const query = [
      "SELECT offer_id, clicks, impressions, click_through_rate",
      "FROM product_performance_view",
      `WHERE date BETWEEN '${startDate}' AND '${endDate}'`,
      `AND offer_id = '${offerId}'`,
    ].join(" ");

    try {
      const response = await axios.post(
        endpoint,
        {query, pageSize: 100},
        {headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        }},
      );
      const rows = response.data.results || [];
      if (!rows.length) continue;

      let impressions = 0;
      let clicks = 0;
      let ctr = 0;
      rows.forEach((row) => {
        const p = row.productPerformanceView || {};
        impressions += Number(p.impressions || 0);
        clicks += Number(p.clicks || 0);
        if (p.clickThroughRate != null) ctr = Number(p.clickThroughRate || 0);
      });
      if (impressions > 0) ctr = clicks / impressions;
      matched = {offerId, impressions, clicks, clickThroughRate: ctr};
      break;
    } catch (error) {
      console.warn(
        "Google Merchant performance query failed",
        error.response?.data || error.message,
      );
      if (error.response?.status === 401) {
        return {google: {
          connected: true,
          available: false,
          message: "Reconnect Google Shopping to refresh reporting access.",
        }};
      }
    }
  }

  if (!matched) {
    return {google: {
      connected: true,
      available: true,
      offerId: ids[0],
      impressions: 0,
      clicks: 0,
      clickThroughRate: 0,
      startDate,
      endDate,
    }};
  }

  return {google: {
    connected: true,
    available: true,
    ...matched,
    startDate,
    endDate,
  }};
});


// Keep Meta/WhatsApp handlers out of the deployed manifest until their
// provider credentials are configured. Google OAuth uses dedicated exports.
void getSocialConnectUrlLegacy;
void socialOAuthCallbackLegacy;
void getWhatsAppEmbeddedSignupConfigLegacy;
void completeWhatsAppEmbeddedSignupLegacy;
