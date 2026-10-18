import {onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {doc, onSnapshot, collection, query, where, limit} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";
import {getFunctions, httpsCallable} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-functions.js";
import {app, auth, db} from "./firebase-config.js";

const functions = getFunctions(app);
const element = (id) => document.getElementById(id);
const formatMoney = (centsValue) => new Intl.NumberFormat("en-ZA", {
  style: "currency", currency: "ZAR",
}).format(Number(centsValue || 0) / 100);
const safe = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[ch]));
const call = (name, data) => httpsCallable(functions, name)(data);
function moneyInput(value) {
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(String(value).trim()))
    throw Error("Enter a Rand amount such as 12.50.");
  return Math.round(Number(value) * 100);
}
const cleanup = [];
let user = null;
let shop = null;
let listings = [];
let orders = [];
let serviceRequests = [];

function note(message, isError = false) {
  const target = element("message");
  target.textContent = String(message);
  target.className = "notice" + (isError ? " error" : "");
  target.hidden = false;
}
function report(error) {
  return String(error?.message || "Unable to complete this action.").replace(/^FirebaseError:\s*/i, "");
}
function show(name, visible) {
  element(name).hidden = !visible;
}
function listen(target, callback, label) {
  cleanup.push(onSnapshot(target, callback, (error) => {
    note(label + ": " + report(error), true);
  }));
}
function clearListeners() {
  while (cleanup.length) {
    const unsubscribe = cleanup.pop();
    if (unsubscribe) unsubscribe();
  }
}

onAuthStateChanged(auth, (signedIn) => {
  clearListeners();
  user = signedIn;
  show("merchantLogout", !!user);
  shop = null;
  listings = [];
  orders = [];
  serviceRequests = [];
  show("authRequired", !user);
  show("registerShop", false);
  show("merchantWorkspace", false);
  if (!user) return;
  listen(doc(db, "teyzaMarketplaceShops", user.uid), (snapshot) => {
    shop = snapshot.exists() ? snapshot.data() : null;
    show("registerShop", !shop);
    show("merchantWorkspace", !!shop);
    if (shop) renderMerchant();
  }, "Merchant registration");
  listen(query(collection(db, "teyzaMarketplaceListings"),
    where("sellerUid", "==", user.uid), limit(150)), (snapshot) => {
    listings = snapshot.docs.map((d) => ({id: d.id, ...d.data()}));
    renderListings();
  }, "Product catalogue");
  listen(query(collection(db, "teyzaMarketplaceOrders"),
    where("sellerUid", "==", user.uid), limit(150)), (snapshot) => {
    orders = snapshot.docs.map((d) => ({id: d.id, ...d.data()}));
    renderOrders();
  }, "Customer orders");
  listen(query(collection(db, "teyzaMarketplaceServiceRequests"),
    where("providerUid", "==", user.uid), limit(150)), (snapshot) => {
    serviceRequests = snapshot.docs.map((d) => ({id: d.id, ...d.data()}));
    renderRequests();
  }, "Service requests");
});

element("shopForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!user) return note("Sign in as a Teyza business owner first.", true);
  const btn = event.currentTarget.querySelector("button[type=submit]");
  const d = new FormData(event.currentTarget);
  btn.disabled = true;
  try {
    const deliveryEnabled = d.get("deliveryEnabled") === "on";
    await call("registerMarketplaceShop", {
      name: String(d.get("name") || "").trim(),
      type: String(d.get("type") || ""),
      city: String(d.get("city") || "").trim(),
      suburb: String(d.get("suburb") || "").trim(),
      pickupEnabled: d.get("pickupEnabled") === "on",
      deliveryEnabled,
      deliveryFeeCents: deliveryEnabled ? moneyInput(d.get("deliveryFee")) : 0,
    });
    note("Submitted for merchant verification. Your existing business workspace remains available.");
  } catch (error) {
    note(report(error), true);
  } finally {
    btn.disabled = false;
  }
});

function renderMerchant() {
  if (!shop) return;
  element("merchantTitle").textContent = shop.name || "My Teyza shop";
  element("merchantSummary").textContent = [
    String(shop.type || "business").replace(/_/g, " "),
    shop.suburb || "", shop.city || "",
  ].filter(Boolean).join(" · ");
  const approved = shop.status === "approved";
  element("shopStatus").textContent = approved ?
    "Verified merchant" : String(shop.status || "pending") + " verification";
  element("shopStatus").classList.toggle("pending", !approved);
  show("listingForm", approved);
  show("approvalNotice", !approved);
  renderListings();
  renderOrders();
  renderRequests();
}

element("listingKind").addEventListener("change", (event) => {
  const services = event.target.value === "service";
  show("stockRow", !services);
  element("listingCategory").innerHTML = services
    ? '<option value="services">Local services</option>'
    : '<option value="groceries">Groceries</option>' +
      '<option value="food">Food &amp; snacks</option>' +
      '<option value="household">Household</option>' +
      '<option value="beauty">Beauty</option>' +
      '<option value="fashion">Fashion</option>' +
      '<option value="electronics">Electronics</option>' +
      '<option value="other">Other</option>';
});

element("listingForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!user || shop?.status !== "approved")
    return note("Marketplace approval is required before listing.", true);
  const button = event.currentTarget.querySelector("button[type=submit]");
  const d = new FormData(event.currentTarget);
  button.disabled = true;
  try {
    const kind = String(d.get("kind"));
    await call("publishMarketplaceListing", {
      name: String(d.get("name") || "").trim(),
      description: String(d.get("description") || "").trim(),
      kind,
      category: String(d.get("category") || ""),
      priceCents: moneyInput(d.get("price")),
      stock: kind === "service" ? 0 : Number(d.get("stock")),
      imageUrl: String(d.get("imageUrl") || "").trim(),
    });
    event.currentTarget.reset();
    element("listingKind").dispatchEvent(new Event("change"));
    note("Published to the Teyza shopping app. Existing website stock is not automatically modified.");
  } catch (error) {
    note(report(error), true);
  } finally {
    button.disabled = false;
  }
});

function renderListings() {
  element("statListings").textContent = String(listings.filter((l) => l.status === "active").length);
  if (!shop) return;
  element("listings").innerHTML = listings.length ? listings.map((listing) => {
    const controls = listing.status === "active"
      ? '<div class="action-row"><button type="button" class="btn danger" data-hide-listing="' +
        safe(listing.id) + '">Unpublish</button></div>' : "";
    return '<article class="item">' +
      '<div class="item-header"><h3>' + safe(listing.name) + '</h3>' +
      '<span class="tag">' + safe(listing.status || "unknown") + '</span></div>' +
      '<p>' + safe(listing.kind) + ' · ' + formatMoney(listing.priceCents) +
      (listing.kind === "service" ? "" : " · " + safe(listing.stock) + " available") +
      '</p>' + controls + '</article>';
  }).join("") : '<p class="muted">No marketplace listings. Add your first item using the form above.</p>';
}

function renderOrders() {
  element("statOrders").textContent = String(orders.length);
  if (!shop) return;
  element("orders").innerHTML = orders.length ? orders.map((order) => {
    const actionButtons = order.status === "pending_seller"
      ? '<button type="button" class="btn" data-order-action="accept">Accept</button>' +
        '<button type="button" class="btn danger" data-order-action="decline">Decline</button>'
      : order.status === "accepted"
      ? '<button type="button" class="btn" data-order-action="ready">Mark ready</button>'
      : order.status === "ready"
      ? '<button type="button" class="btn" data-order-action="fulfilled">Fulfilled</button>'
      : "";
    const items = (Array.isArray(order.items) ? order.items : []).map(
      (v) => String(v.name || "Product") + " ×" + String(v.quantity || 0)
    ).join(", ");
    return '<article class="item" data-order-id="' + safe(order.id) + '">' +
      '<div class="item-header"><h3>' + safe(order.shopName) + '</h3><span class="tag">' +
        safe(order.status) + '</span></div>' +
      '<p>' + safe(order.fulfilment) + ' · ' + formatMoney(order.totalCents) +
      ' · Payment: ' + safe(order.paymentStatus || "unpaid") + '</p>' +
      '<p>' + safe(items) + '</p>' +
      (order.fulfilment === "delivery" ? '<p>Delivery: ' + safe(order.deliveryAddress) + '</p>' : "") +
      '<div class="action-row">' + actionButtons + '</div></article>';
  }).join("") : '<p class="muted">Orders from the shopper app will appear here.</p>';
  pending();
}

function renderRequests() {
  element("statServices").textContent = String(serviceRequests.length);
  if (!shop) return;
  element("serviceRequests").innerHTML = serviceRequests.length ? serviceRequests.map((req) => {
    const quoteForm = req.status === "pending_quote"
      ? '<form class="quote-form" data-service-quote="' + safe(req.id) + '">' +
        '<label>Quote (R)<input type="number" step="0.01" min="1" name="amount" required></label>' +
        '<label>Quote details<textarea name="note" required minlength="5" maxlength="500" ' +
          'placeholder="Scope, timing and what is included"></textarea></label>' +
        '<button type="submit" class="action">Send quote</button></form>' +
        '<div class="action-row"><button type="button" class="btn danger" data-service-decline="' +
        safe(req.id) + '">Decline enquiry</button></div>'
      : "";
    return '<article class="item"><div class="item-header"><h3>' +
      safe(req.serviceName) + '</h3><span class="tag">' + safe(req.status) +
      '</span></div><p>' + safe(req.suburb) +
      (req.requestedDate ? ' · Preferred ' + safe(req.requestedDate) : "") +
      '</p><p>' + safe(req.details) + '</p>' +
      (req.quotedAmountCents == null ? "" : '<p>Quote: ' +
        formatMoney(req.quotedAmountCents) + ' · ' + safe(req.quoteNote) + '</p>') +
      quoteForm + '</article>';
  }).join("") : '<p class="muted">New service enquiries will appear here.</p>';
  pending();
}

function pending() {
  element("statPending").textContent = String(
    orders.filter((o) => o.status === "pending_seller").length +
    serviceRequests.filter((r) => r.status === "pending_quote").length);
}

element("listings").addEventListener("click", async (event) => {
  const btn = event.target.closest("[data-hide-listing]");
  if (!btn || !confirm("Unpublish this item from the customer app?")) return;
  btn.disabled = true;
  try {
    await call("unpublishMarketplaceListing", {listingId: btn.dataset.hideListing});
    note("Listing unpublished. Existing website catalogue is unchanged.");
  } catch (error) {
    note(report(error), true);
  } finally {
    btn.disabled = false;
  }
});

element("orders").addEventListener("click", async (event) => {
  const btn = event.target.closest("[data-order-action]");
  if (!btn) return;
  btn.disabled = true;
  try {
    await call("reviewMarketplaceOrder", {
      orderId: btn.closest("[data-order-id]")?.dataset.orderId,
      action: btn.dataset.orderAction,
    });
    note("Order status updated. This does not confirm payment.");
  } catch (error) {
    note(report(error), true);
  } finally {
    btn.disabled = false;
  }
});

element("serviceRequests").addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-service-quote]");
  if (!form) return;
  event.preventDefault();
  const btn = form.querySelector("button[type=submit]");
  const d = new FormData(form);
  btn.disabled = true;
  try {
    await call("respondMarketplaceServiceRequest", {
      requestId: form.dataset.serviceQuote, action: "quote",
      quoteCents: moneyInput(d.get("amount")),
      quoteNote: String(d.get("note") || "").trim(),
    });
    note("Quote sent. The customer can accept or decline it in the app.");
  } catch (error) {
    note(report(error), true);
  } finally {
    btn.disabled = false;
  }
});

element("serviceRequests").addEventListener("click", async (event) => {
  const btn = event.target.closest("[data-service-decline]");
  if (!btn || !confirm("Decline this service enquiry?")) return;
  btn.disabled = true;
  try {
    await call("respondMarketplaceServiceRequest", {
      requestId: btn.dataset.serviceDecline, action: "decline",
    });
    note("Service enquiry declined.");
  } catch (error) {
    note(report(error), true);
  } finally {
    btn.disabled = false;
  }
});

const merchantAuthForm = element("merchantAuthForm");
let merchantAuthAction = "login";
merchantAuthForm.querySelectorAll("[data-auth-action]").forEach((button) => {
  button.addEventListener("click", () => {merchantAuthAction = button.dataset.authAction;});
});
merchantAuthForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const data = new FormData(merchantAuthForm);
  const email = String(data.get("email") || "").trim();
  const password = String(data.get("password") || "");
  const controls = merchantAuthForm.querySelectorAll("button");
  controls.forEach((button) => {button.disabled = true;});
  try {
    if (merchantAuthAction === "register") {
      await createUserWithEmailAndPassword(auth, email, password);
      note("Merchant account created. Complete your shop registration for verification.");
    } else {
      await signInWithEmailAndPassword(auth, email, password);
      note("Signed in to your Teyza merchant account.");
    }
  } catch (error) {
    note(report(error), true);
  } finally {
    controls.forEach((button) => {button.disabled = false;});
  }
});
element("merchantLogout").addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    note(report(error), true);
  }
});
