const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {defineSecret} = require("firebase-functions/params");
const admin = require("firebase-admin");
const crypto = require("crypto");

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const FIELD_ENCRYPTION_KEY = defineSecret("FIELD_ENCRYPTION_KEY");

function requireAuth(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
  return request.auth.uid;
}

async function verifyBusinessAccess(uid, businessId) {
  if (!businessId) throw new HttpsError("invalid-argument", "businessId is required.");
  const snap = await db.collection("businesses").doc(businessId).get();
  if (!snap.exists) throw new HttpsError("not-found", "Business not found.");
  const b = snap.data() || {};
  const allowed = b.ownerId === uid || b.ownerUid === uid || b.uid === uid || b.userId === uid ||
    (Array.isArray(b.adminUids) && b.adminUids.includes(uid));
  if (!allowed) throw new HttpsError("permission-denied", "You cannot manage this business.");
}

function keyBuffer() {
  const raw = FIELD_ENCRYPTION_KEY.value();
  if (!raw) throw new Error("FIELD_ENCRYPTION_KEY is not configured.");
  const key = /^[a-f0-9]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("FIELD_ENCRYPTION_KEY must decode to 32 bytes.");
  return key;
}

function encrypt(value) {
  if (!value) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyBuffer(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {iv: iv.toString("base64"), tag: tag.toString("base64"), data: ciphertext.toString("base64")};
}

function safeString(value, max = 500) {
  return String(value == null ? "" : value).trim().slice(0, max);
}

exports.saveSellerOperations = onCall({secrets: [FIELD_ENCRYPTION_KEY]}, async (request) => {
  const uid = requireAuth(request);
  const {businessId, section, data} = request.data || {};
  await verifyBusinessAccess(uid, businessId);
  if (!section || !data || typeof data !== "object") throw new HttpsError("invalid-argument", "section and data are required.");

  const ref = db.collection("sellerOperations").doc(businessId);
  const now = admin.firestore.FieldValue.serverTimestamp();
  let payload;

  if (section === "banking") {
    const accountNumber = safeString(data.accountNumber, 40);
    payload = {banking: {
      accountHolder: safeString(data.accountHolder, 120),
      bankName: safeString(data.bankName, 80),
      accountType: safeString(data.accountType, 60),
      branchCode: safeString(data.branchCode, 20),
      accountNumberEncrypted: encrypt(accountNumber),
      accountNumberLast4: accountNumber.slice(-4),
      verified: false,
      updatedAt: now,
    }};
  } else if (section === "payfast") {
    payload = {payfast: {
      merchantId: safeString(data.merchantId, 80),
      merchantKeyEncrypted: encrypt(safeString(data.merchantKey, 200)),
      passphraseEncrypted: encrypt(safeString(data.passphrase, 200)),
      splitPaymentsEnabled: Boolean(data.splitPaymentsEnabled),
      sandboxMode: Boolean(data.sandboxMode),
      connected: Boolean(data.merchantId && data.merchantKey),
      updatedAt: now,
    }};
  } else if (section === "delivery") {
    payload = {delivery: {
      fulfilmentMode: safeString(data.fulfilmentMode, 40),
      courierPreference: safeString(data.courierPreference, 120),
      pickupAddress: safeString(data.pickupAddress, 300),
      baseDeliveryFee: Number(data.baseDeliveryFee || 0),
      freeDeliveryThreshold: Number(data.freeDeliveryThreshold || 0),
      deliveryRadiusKm: Number(data.deliveryRadiusKm || 0),
      parcelTypes: Array.isArray(data.parcelTypes) ? data.parcelTypes.slice(0, 10).map((v) => safeString(v, 40)) : [],
      allowCustomerPickup: Boolean(data.allowCustomerPickup),
      trackingEnabled: Boolean(data.trackingEnabled),
      updatedAt: now,
    }};
  } else if (section === "accounting") {
    payload = {accounting: {
      enabled: Boolean(data.enabled),
      vatRegistered: Boolean(data.vatRegistered),
      vatNumber: safeString(data.vatNumber, 40),
      invoicePrefix: safeString(data.invoicePrefix, 20),
      financialYearEnd: safeString(data.financialYearEnd, 30),
      autoInvoices: Boolean(data.autoInvoices),
      trackExpenses: Boolean(data.trackExpenses),
      updatedAt: now,
    }};
  } else if (section === "booking") {
    payload = {booking: {
      enabled: Boolean(data.enabled),
      appointmentDuration: Number(data.appointmentDuration || 30),
      bufferMinutes: Number(data.bufferMinutes || 0),
      leadTimeHours: Number(data.leadTimeHours || 0),
      locationType: safeString(data.locationType, 40),
      bookingAddress: safeString(data.bookingAddress, 300),
      cancellationHours: Number(data.cancellationHours || 0),
      updatedAt: now,
    }};
  } else if (section === "hr") {
    payload = {hr: {
      enabled: Boolean(data.enabled),
      employeeCount: Number(data.employeeCount || 0),
      payrollFrequency: safeString(data.payrollFrequency, 40),
      payslipsEnabled: Boolean(data.payslipsEnabled),
      leaveTracking: Boolean(data.leaveTracking),
      attendanceTracking: Boolean(data.attendanceTracking),
      updatedAt: now,
    }};
  } else if (section === "partner") {
    payload = {partner: {
      discoverable: Boolean(data.discoverable),
      category: safeString(data.category, 120),
      serviceArea: safeString(data.serviceArea, 160),
      offers: safeString(data.offers, 1000),
      needs: safeString(data.needs, 1000),
      allowContact: Boolean(data.allowContact),
      updatedAt: now,
    }};
  } else {
    throw new HttpsError("invalid-argument", "Unsupported seller operations section.");
  }

  await ref.set({...payload, businessId, ownerUid: uid, updatedAt: now}, {merge: true});
  return {ok: true, section};
});

exports.getSellerOperations = onCall(async (request) => {
  const uid = requireAuth(request);
  const {businessId} = request.data || {};
  await verifyBusinessAccess(uid, businessId);
  const snap = await db.collection("sellerOperations").doc(businessId).get();
  if (!snap.exists) return {};
  const d = snap.data() || {};
  return {
    banking: d.banking ? {
      accountHolder: d.banking.accountHolder || "",
      bankName: d.banking.bankName || "",
      accountType: d.banking.accountType || "",
      branchCode: d.banking.branchCode || "",
      accountNumberLast4: d.banking.accountNumberLast4 || "",
      verified: Boolean(d.banking.verified),
    } : null,
    payfast: d.payfast ? {
      merchantId: d.payfast.merchantId || "",
      connected: Boolean(d.payfast.connected),
      splitPaymentsEnabled: Boolean(d.payfast.splitPaymentsEnabled),
      sandboxMode: Boolean(d.payfast.sandboxMode),
    } : null,
    delivery: d.delivery || null,
    accounting: d.accounting || null,
    booking: d.booking || null,
    hr: d.hr || null,
    partner: d.partner || null,
    audience: d.audience || null,
    paymentPreferences: d.paymentPreferences || null,
    shop: d.shop || null,
  };
});