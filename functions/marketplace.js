/**
 * TEYZA Marketplace v0.1. Isolated from the legacy PHP seller workspace.
 * This module makes no payment or lending claims and must not be deployed
 * without Firestore rules, App Check, monitoring and end-to-end testing.
 */
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();
const timestamp = admin.firestore.FieldValue.serverTimestamp;
const increment = admin.firestore.FieldValue.increment;

const SHOP_TYPES = ["spaza", "retailer", "informal_seller", "wholesaler", "service_provider"];
const PRODUCT_CATEGORIES = ["groceries", "food", "household", "beauty", "fashion", "electronics", "other", "services"];
const validString = (v, min, max) => typeof v === "string" && v.trim().length >= min && v.trim().length <= max;
const requiredString = (v, label, max = 160) => {
  if (!validString(v, 1, max)) throw new HttpsError("invalid-argument", label + " is required.");
  return v.trim();
};
const unsignedInt = (v, max, label) => {
  if (!Number.isSafeInteger(v) || v < 0 || v > max)
    throw new HttpsError("invalid-argument", label + " is invalid.");
  return v;
};
const authUid = (request) => {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Please sign in.");
  return request.auth.uid;
};
const shopRef = (uid) => db.collection("teyzaMarketplaceShops").doc(uid);
const listingRef = (id) => db.collection("teyzaMarketplaceListings").doc(id);
function approvedShop(data, uid) {
  if (!data || data.ownerUid !== uid) throw new HttpsError("permission-denied", "This is not your shop.");
  if (data.status !== "approved") throw new HttpsError("failed-precondition", "Your shop must be approved before selling.");
}
function money(v, label) { return unsignedInt(v, 100000000, label); }

exports.registerMarketplaceShop = onCall(async (request) => {
  const uid = authUid(request);
  const data = request.data || {};
  const type = requiredString(data.type, "Shop type", 40);
  if (!SHOP_TYPES.includes(type)) throw new HttpsError("invalid-argument", "Unknown shop type.");
  const name = requiredString(data.name, "Shop name", 100);
  const city = requiredString(data.city, "City", 100);
  const suburb = requiredString(data.suburb, "Suburb", 100);
  const pickupEnabled = data.pickupEnabled === true;
  const deliveryEnabled = data.deliveryEnabled === true;
  if (type !== "service_provider" && !pickupEnabled && !deliveryEnabled) {
    throw new HttpsError("invalid-argument", "Choose collection or delivery.");
  }
  const deliveryFeeCents = deliveryEnabled ? money(data.deliveryFeeCents, "Delivery fee") : 0;
  const shop = shopRef(uid);
  try {
    await shop.create({
      ownerUid: uid, type, name, city, suburb,
      pickupEnabled, deliveryEnabled, deliveryFeeCents,
      status: "pending", createdAt: timestamp(), updatedAt: timestamp(),
    });
  } catch (error) {
    if (error.code === 6 || error.code === "already-exists")
      throw new HttpsError("already-exists", "A marketplace shop already exists for this account.");
    throw error;
  }
  return {shopId: uid, status: "pending", message: "Shop submitted for manual verification."};
});

exports.configureMarketplaceFulfilment = onCall(async (request) => {
  const uid = authUid(request);
  const data = request.data || {};
  const ref = shopRef(uid);
  const snapshot = await ref.get();
  if (!snapshot.exists || snapshot.data().ownerUid !== uid)
    throw new HttpsError("permission-denied", "Not your shop.");
  const pickupEnabled = data.pickupEnabled === true;
  const deliveryEnabled = data.deliveryEnabled === true;
  if (snapshot.data().type !== "service_provider" && !pickupEnabled && !deliveryEnabled)
    throw new HttpsError("invalid-argument", "Choose collection or delivery.");
  await ref.update({
    pickupEnabled, deliveryEnabled,
    deliveryFeeCents: deliveryEnabled ? money(data.deliveryFeeCents, "Delivery fee") : 0,
    updatedAt: timestamp(),
  });
  return {ok: true};
});

exports.publishMarketplaceListing = onCall(async (request) => {
  const uid = authUid(request);
  const data = request.data || {};
  const shop = (await shopRef(uid).get()).data();
  approvedShop(shop, uid);
  const kind = data.kind === "service" ? "service" : "product";
  const name = requiredString(data.name, "Product name", 120);
  const description = requiredString(data.description, "Description", 1200);
  const category = requiredString(data.category, "Category", 40);
  if (!PRODUCT_CATEGORIES.includes(category) || (kind === "service" && category !== "services") || (kind === "product" && category === "services"))
    throw new HttpsError("invalid-argument", "Unsupported listing category.");
  const priceCents = money(data.priceCents, "Price");
  if (priceCents === 0) throw new HttpsError("invalid-argument", "Price must exceed zero.");
  const stock = kind === "product" ? unsignedInt(data.stock, 100000, "Stock") : 0;
  const imageUrl = typeof data.imageUrl === "string" ? data.imageUrl.trim() : "";
  if (imageUrl && (imageUrl.length > 1800 || !/^https:\/\//i.test(imageUrl)))
    throw new HttpsError("invalid-argument", "Use an HTTPS image URL.");
  const id = validString(data.listingId, 8, 120) ? data.listingId.trim() : null;
  const ref = id ? listingRef(id) : db.collection("teyzaMarketplaceListings").doc();
  await db.runTransaction(async (tx) => {
    const old = await tx.get(ref);
    if (old.exists && old.data().sellerUid !== uid)
      throw new HttpsError("permission-denied", "You cannot edit this listing.");
    const payload = {
      shopId: uid, sellerUid: uid, shopName: shop.name, kind, name,
      description, category, priceCents, stock, imageUrl, currency: "ZAR",
      status: "active", updatedAt: timestamp(),
    };
    if (old.exists) tx.update(ref, payload);
    else tx.create(ref, {...payload, createdAt: timestamp()});
  });
  return {listingId: ref.id, status: "active"};
});

exports.unpublishMarketplaceListing = onCall(async (request) => {
  const uid = authUid(request);
  const id = requiredString(request.data?.listingId, "Listing ID", 120);
  const ref = listingRef(id);
  const snap = await ref.get();
  if (!snap.exists || snap.data().sellerUid !== uid)
    throw new HttpsError("permission-denied", "Not your listing.");
  await ref.update({status: "hidden", updatedAt: timestamp()});
  return {ok: true};
});

/**
 * Phase 1 checkout is a request, never a settled payment.
 * The seller accepts and atomically decrements stock.
 * Orders are intentionally single-shop; multi-shop carts split at checkout.
 */
exports.placeMarketplaceOrder = onCall(async (request) => {
  const uid = authUid(request);
  const data = request.data || {};
  const shopId = requiredString(data.shopId, "Shop", 120);
  const requestId = requiredString(data.requestId, "Request ID", 64);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(requestId))
    throw new HttpsError("invalid-argument", "Invalid request reference.");
  const fulfilment = data.fulfilment;
  if (!["pickup", "delivery"].includes(fulfilment))
    throw new HttpsError("invalid-argument", "Choose pickup or delivery.");
  const deliveryAddress = fulfilment === "delivery" ?
    requiredString(data.deliveryAddress, "Delivery address", 250) : "";
  const items = data.items;
  if (!Array.isArray(items) || items.length < 1 || items.length > 20)
    throw new HttpsError("invalid-argument", "Add between 1 and 20 products.");
  const ids = new Set();
  for (const item of items) {
    if (!validString(item.listingId, 1, 120) || ids.has(item.listingId) ||
      !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 30)
      throw new HttpsError("invalid-argument", "Invalid or duplicate cart item.");
    ids.add(item.listingId);
  }
  const ref = db.collection("teyzaMarketplaceOrders").doc(uid + "_" + requestId);
  const result = await db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) {
      if (existing.data().buyerUid !== uid) throw new HttpsError("permission-denied", "Order not yours.");
      return {orderId: ref.id, status: existing.data().status, duplicate: true};
    }
    const shopSnap = await tx.get(shopRef(shopId));
    const shop = shopSnap.data();
    if (!shop || shop.status !== "approved" || shop.type === "wholesaler")
      throw new HttpsError("failed-precondition", "This shop is not accepting retail orders.");
    if (shop.ownerUid === uid) throw new HttpsError("failed-precondition", "Cannot order from your own shop.");
    if (fulfilment === "pickup" && !shop.pickupEnabled ||
        fulfilment === "delivery" && !shop.deliveryEnabled)
      throw new HttpsError("failed-precondition", "This fulfilment method is unavailable.");
    let subtotalCents = 0;
    const lines = [];
    for (const item of items) {
      const snap = await tx.get(listingRef(item.listingId));
      const product = snap.data();
      if (!product || product.shopId !== shopId || product.kind !== "product" ||
          product.status !== "active" || product.stock < item.quantity)
        throw new HttpsError("failed-precondition", "An item is out of stock or unavailable.");
      const priceCents = money(product.priceCents, "Catalog price");
      subtotalCents += priceCents * item.quantity;
      if (!Number.isSafeInteger(subtotalCents) || subtotalCents > 100000000)
        throw new HttpsError("invalid-argument", "Cart total is too large.");
      lines.push({listingId: snap.id, name: product.name, quantity: item.quantity, priceCents});
    }
    const deliveryFeeCents = fulfilment === "delivery" ? money(shop.deliveryFeeCents, "Delivery fee") : 0;
    tx.create(ref, {
      buyerUid: uid, sellerUid: shop.ownerUid, shopId, shopName: shop.name,
      items: lines, subtotalCents, deliveryFeeCents,
      totalCents: subtotalCents + deliveryFeeCents, currency: "ZAR",
      fulfilment, deliveryAddress, status: "pending_seller",
      paymentMethod: "cash_on_fulfilment", paymentStatus: "unpaid",
      createdAt: timestamp(), updatedAt: timestamp(),
    });
    return {orderId: ref.id, status: "pending_seller", totalCents: subtotalCents + deliveryFeeCents, duplicate: false};
  });
  return result;
});

exports.reviewMarketplaceOrder = onCall(async (request) => {
  const uid = authUid(request);
  const id = requiredString(request.data?.orderId, "Order ID", 200);
  const action = requiredString(request.data?.action, "Action", 30);
  if (!["accept", "decline", "ready", "fulfilled"].includes(action))
    throw new HttpsError("invalid-argument", "Invalid order action.");
  const ref = db.collection("teyzaMarketplaceOrders").doc(id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const order = snap.data();
    if (!order || order.sellerUid !== uid)
      throw new HttpsError("permission-denied", "This order is not yours.");
    if (["accept", "decline"].includes(action)) {
      if (order.status !== "pending_seller")
        throw new HttpsError("failed-precondition", "Order was already reviewed.");
      if (action === "decline") {
        tx.update(ref, {status: "declined", updatedAt: timestamp()});
        return {status: "declined"};
      }
      const toUpdate = [];
      for (const line of order.items) {
        const productRef = listingRef(line.listingId);
        const productSnap = await tx.get(productRef);
        const product = productSnap.data();
        if (!product || product.shopId !== order.shopId || product.status !== "active" ||
            product.stock < line.quantity)
          throw new HttpsError("failed-precondition", "Insufficient stock. Decline this order or update inventory.");
        toUpdate.push({ref: productRef, quantity: line.quantity});
      }
      for (const item of toUpdate) tx.update(item.ref, {stock: increment(-item.quantity), updatedAt: timestamp()});
      tx.update(ref, {status: "accepted", acceptedAt: timestamp(), updatedAt: timestamp()});
      return {status: "accepted"};
    }
    if (action === "ready" && order.status === "accepted") {
      tx.update(ref, {status: "ready", updatedAt: timestamp()});
      return {status: "ready"};
    }
    if (action === "fulfilled" && order.status === "ready") {
      tx.update(ref, {status: "fulfilled", fulfilledAt: timestamp(), updatedAt: timestamp()});
      return {status: "fulfilled", paymentStatus: "unpaid"};
    }
    throw new HttpsError("failed-precondition", "This status transition is not allowed.");
  });
});
