const {onCall, HttpsError} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

function requireAuth(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
  return request.auth.uid;
}

async function verifyBusinessAccess(uid, businessId) {
  if (!businessId) throw new HttpsError("invalid-argument", "businessId is required.");
  const snap = await db.collection("businesses").doc(businessId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Business not found.");
  const b = snap.data() || {};
  const allowed = b.ownerId === uid || b.uid === uid || b.userId === uid ||
    (Array.isArray(b.adminUids) && b.adminUids.includes(uid));
  if (!allowed) throw new HttpsError("permission-denied", "You cannot manage this business.");
  return b;
}

function s(value, max = 300) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

exports.saveSellerSimplePreferences = onCall(async (request) => {
  const uid = requireAuth(request);
  const {businessId, section, data} = request.data || {};
  await verifyBusinessAccess(uid, businessId);
  if (!data || typeof data !== "object") throw new HttpsError("invalid-argument", "data is required.");
  const now = admin.firestore.FieldValue.serverTimestamp();
  const ref = db.collection("sellerOperations").doc(businessId);
  let payload = {};

  if (section === "audience") {
    payload = {audience: {
      gender: ["all", "female", "male", "custom"].includes(data.gender) ? data.gender : "all",
      ageRange: s(data.ageRange, 40),
      targetArea: s(data.targetArea, 160),
      updatedAt: now,
    }};
  } else if (section === "paymentPreferences") {
    payload = {paymentPreferences: {
      otherGateway: s(data.otherGateway, 80),
      otherReference: s(data.otherReference, 120),
      updatedAt: now,
    }};
  } else if (section === "shop") {
    payload = {shop: {
      shopName: s(data.shopName, 120),
      supportEmail: s(data.supportEmail, 160),
      supportPhone: s(data.supportPhone, 40),
      returnsPolicy: s(data.returnsPolicy, 1200),
      orderNotifications: data.orderNotifications !== false,
      lowStockNotifications: data.lowStockNotifications !== false,
      updatedAt: now,
    }};
  } else {
    throw new HttpsError("invalid-argument", "Unsupported preferences section.");
  }

  await ref.set({...payload, businessId, ownerUid: uid, updatedAt: now}, {merge: true});
  return {ok: true, section};
});

exports.getSellerDashboardSummary = onCall(async (request) => {
  const uid = requireAuth(request);
  const {businessId} = request.data || {};
  const business = await verifyBusinessAccess(uid, businessId);

  const [opsSnap, integrationsSnap, ledgerSnap, ordersSnap] = await Promise.all([
    db.collection("sellerOperations").doc(businessId).get(),
    db.collection("integrations").doc(businessId).collection("channels").get(),
    db.collection("sellerBalances").doc(businessId).get(),
    db.collection("orders").where("businessId", "==", businessId).limit(250).get(),
  ]);

  const ops = opsSnap.exists ? (opsSnap.data() || {}) : {};
  const integrations = {};
  integrationsSnap.forEach((doc) => { integrations[doc.id] = doc.data() || {}; });

  let paidSales = 0;
  let pendingSales = 0;
  let orderCount = 0;
  ordersSnap.forEach((doc) => {
    const o = doc.data() || {};
    orderCount += 1;
    const amount = Number(o.totalAmount ?? o.total ?? o.grandTotal ?? o.amount ?? 0) || 0;
    const payment = String(o.paymentStatus || "").toLowerCase();
    const status = String(o.status || "").toLowerCase();
    const paid = ["paid", "completed", "success", "successful", "settled"].includes(payment) ||
      ["paid", "completed", "delivered"].includes(status);
    if (paid) paidSales += amount; else pendingSales += amount;
  });

  const ledger = ledgerSnap.exists ? (ledgerSnap.data() || {}) : {};
  const availableBalance = Number(ledger.availableBalance ?? paidSales) || 0;
  const pendingBalance = Number(ledger.pendingBalance ?? pendingSales) || 0;
  const lifetimeSales = Number(ledger.lifetimeSales ?? (paidSales + pendingSales)) || 0;

  const connectedProviders = Object.entries(integrations)
    .filter(([, v]) => v.status === "connected")
    .map(([k]) => k);

  const hasPlatform = connectedProviders.length > 0;
  const hasDelivery = Boolean(ops.delivery && ops.delivery.fulfilmentMode);
  const hasPayment = Boolean(
    (ops.banking && ops.banking.bankName) ||
    (ops.payfast && ops.payfast.connected) ||
    (ops.paymentPreferences && ops.paymentPreferences.otherGateway)
  );
  const hasAudience = Boolean(ops.audience && ops.audience.gender);

  return {
    business: {name: business.businessName || business.name || "Your business"},
    balances: {availableBalance, pendingBalance, lifetimeSales},
    orders: {count: orderCount},
    setup: {
      platforms: hasPlatform,
      delivery: hasDelivery,
      payments: hasPayment,
      audience: hasAudience,
      complete: hasPlatform && hasDelivery && hasPayment && hasAudience,
    },
    connections: connectedProviders,
    shop: ops.shop || null,
  };
});
