/**
 * TEYZA service enquiries: buyer mobile app -> approved provider website.
 * Not a booking, payment authorization, or settlement.
 */
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const stamp = admin.firestore.FieldValue.serverTimestamp;
function auth(request) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in required.");
  return request.auth.uid;
}
function field(value, name, min, max) {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max)
    throw new HttpsError("invalid-argument", name + " must be " + min + "–" + max + " characters.");
  return value.trim();
}
function requestRef(id) { return db.collection("teyzaMarketplaceServiceRequests").doc(id); }

exports.requestMarketplaceService = onCall(async (request) => {
  const buyerUid = auth(request);
  const d = request.data || {};
  const listingId = field(d.listingId, "Service ID", 1, 120);
  const requestId = field(d.requestId, "Request reference", 8, 64);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(requestId))
    throw new HttpsError("invalid-argument", "Invalid request reference.");
  const details = field(d.details, "Job description", 15, 1000);
  const suburb = field(d.suburb, "Service area", 2, 160);
  const requestedDate = d.requestedDate ? field(d.requestedDate, "Preferred date", 10, 10) : "";
  if (requestedDate && (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ||
    Number.isNaN(Date.parse(requestedDate + "T00:00:00Z"))))
    throw new HttpsError("invalid-argument", "Preferred date must be YYYY-MM-DD.");
  const orderRef = requestRef(buyerUid + "_" + requestId);
  return db.runTransaction(async (tx) => {
    const prior = await tx.get(orderRef);
    if (prior.exists) return {requestId: orderRef.id, status: prior.data().status, duplicate: true};
    const listingSnap = await tx.get(db.collection("teyzaMarketplaceListings").doc(listingId));
    const listing = listingSnap.data();
    if (!listing || listing.status !== "active" || listing.kind !== "service")
      throw new HttpsError("failed-precondition", "Service is no longer offered.");
    const shopSnap = await tx.get(db.collection("teyzaMarketplaceShops").doc(listing.shopId));
    const shop = shopSnap.data();
    if (!shop || shop.status !== "approved" || shop.ownerUid !== listing.sellerUid)
      throw new HttpsError("failed-precondition", "Provider is not verified.");
    if (shop.ownerUid === buyerUid)
      throw new HttpsError("failed-precondition", "You cannot request your own service.");
    tx.create(orderRef, {
      buyerUid, providerUid: shop.ownerUid, shopId: listing.shopId,
      listingId, serviceName: listing.name, providerName: shop.name,
      details, suburb, requestedDate,
      status: "pending_quote", quotedAmountCents: null, quoteNote: "",
      currency: "ZAR", paymentStatus: "unpaid",
      createdAt: stamp(), updatedAt: stamp(),
    });
    return {requestId: orderRef.id, status: "pending_quote", duplicate: false};
  });
});

exports.respondMarketplaceServiceRequest = onCall(async (request) => {
  const providerUid = auth(request);
  const d = request.data || {};
  const id = field(d.requestId, "Service request", 1, 200);
  const action = field(d.action, "Action", 1, 20);
  if (!["quote", "decline"].includes(action))
    throw new HttpsError("invalid-argument", "Use quote or decline.");
  const quoteCents = action === "quote" ? d.quoteCents : null;
  if (action === "quote" &&
    (!Number.isSafeInteger(quoteCents) || quoteCents < 100 || quoteCents > 100000000))
    throw new HttpsError("invalid-argument", "Quote must be a valid amount in cents.");
  const quoteNote = action === "quote" ? field(d.quoteNote, "Quote details", 5, 500) : "";
  const ref = requestRef(id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data().providerUid !== providerUid)
      throw new HttpsError("permission-denied", "Not your service request.");
    if (snap.data().status !== "pending_quote")
      throw new HttpsError("failed-precondition", "Request was already reviewed.");
    const status = action === "quote" ? "quoted" : "declined";
    tx.update(ref, {
      status, quotedAmountCents: quoteCents, quoteNote, updatedAt: stamp(),
    });
    return {status};
  });
});

exports.decideMarketplaceServiceQuote = onCall(async (request) => {
  const buyerUid = auth(request);
  const d = request.data || {};
  const id = field(d.requestId, "Service request", 1, 200);
  const action = field(d.action, "Quote decision", 1, 20);
  if (!["accept", "decline"].includes(action))
    throw new HttpsError("invalid-argument", "Use accept or decline.");
  const ref = requestRef(id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data().buyerUid !== buyerUid)
      throw new HttpsError("permission-denied", "Not your request.");
    if (snap.data().status !== "quoted")
      throw new HttpsError("failed-precondition", "No outstanding quote to review.");
    const status = action === "accept" ? "quote_accepted" : "quote_declined";
    tx.update(ref, {status, updatedAt: stamp()});
    return {status, paymentStatus: "unpaid"};
  });
});
