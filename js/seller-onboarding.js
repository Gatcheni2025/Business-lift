import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {doc, getDoc} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import {getFunctions, httpsCallable} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-functions.js";
import {app, auth, db} from "./firebase-config.js";

const functions = getFunctions(app);
const getConnections = httpsCallable(functions, "getChannelConnections");
const getConnectUrl = httpsCallable(functions, "getSocialConnectUrl");
const getOps = httpsCallable(functions, "getSellerOperations");
const saveOps = httpsCallable(functions, "saveSellerOperations");
const saveSimple = httpsCallable(functions, "saveSellerSimplePreferences");
const getSummary = httpsCallable(functions, "getSellerDashboardSummary");

let businessId = "";
let selectedPay = "eft";
let selectedGender = "all";

function markStatus(id, text, connected = true) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("connected", connected);
}

function setPlatformStatus(provider, connected, label = "") {
  const el = document.querySelector(`[data-status="${provider}"]`);
  if (!el) return;
  el.textContent = connected ? (label || "Connected") : "Not linked";
  el.classList.toggle("connected", connected);
  const btn = document.querySelector(`[data-connect="${provider}"]`);
  if (btn) btn.textContent = connected ? "Reconnect" : "Connect";
}

function refreshProgress(ops, connections, summary) {
  const platformDone = Boolean(summary?.setup?.platforms || connections?.meta?.connected || connections?.google?.connected || connections?.whatsapp?.connected);
  const deliveryDone = Boolean(summary?.setup?.delivery || ops?.delivery?.fulfilmentMode);
  const paymentDone = Boolean(summary?.setup?.payments || ops?.banking?.bankName || ops?.payfast?.connected);
  const audienceDone = Boolean(summary?.setup?.audience);
  [["p1", platformDone], ["p2", deliveryDone], ["p3", paymentDone], ["p4", audienceDone]].forEach(([id, done]) => document.getElementById(id)?.classList.toggle("done", done));
  markStatus("platformSummary", platformDone ? "Linked" : "Connect at least one", platformDone);
  if (deliveryDone) markStatus("deliveryStatus", "Saved");
  if (paymentDone) markStatus("paymentStatus", "Saved");
  if (audienceDone) markStatus("audienceStatus", "Saved");
}

async function loadState() {
  const [connectionsRes, opsRes, summaryRes] = await Promise.all([
    getConnections({businessId}),
    getOps({businessId}),
    getSummary({businessId}),
  ]);
  const connections = connectionsRes.data || {};
  const ops = opsRes.data || {};
  const summary = summaryRes.data || {};
  setPlatformStatus("meta", Boolean(connections.meta?.connected), connections.meta?.displayName || "Connected");
  setPlatformStatus("google", Boolean(connections.google?.connected), connections.google?.displayName || "Connected");
  setPlatformStatus("whatsapp", Boolean(connections.whatsapp?.connected), connections.whatsapp?.displayName || "Connected");

  if (ops.delivery) {
    document.getElementById("deliveryMethod").value = ops.delivery.fulfilmentMode || "courier";
    document.getElementById("deliveryProvider").value = ops.delivery.courierPreference || "";
    document.getElementById("dispatchAddress").value = ops.delivery.pickupAddress || "";
    document.getElementById("deliveryFee").value = ops.delivery.baseDeliveryFee || 0;
  }
  if (ops.banking) {
    document.getElementById("bankName").value = ops.banking.bankName || "";
    document.getElementById("accountHolder").value = ops.banking.accountHolder || "";
    document.getElementById("branchCode").value = ops.banking.branchCode || "";
    if (ops.banking.accountNumberLast4) document.getElementById("accountNumber").placeholder = `Saved account ending ${ops.banking.accountNumberLast4}`;
  }
  if (ops.payfast) {
    document.getElementById("payfastMerchantId").value = ops.payfast.merchantId || "";
    document.getElementById("payfastSandbox").value = String(Boolean(ops.payfast.sandboxMode));
  }
  refreshProgress(ops, connections, summary);
}

document.querySelectorAll("[data-connect]").forEach((btn) => {
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    const original = btn.textContent;
    btn.textContent = "Opening...";
    try {
      const result = await getConnectUrl({businessId, provider: btn.dataset.connect});
      if (!result.data?.url) throw new Error("No connection URL returned");
      window.location.href = result.data.url;
    } catch (error) {
      alert(error.message || "Unable to start connection.");
      btn.disabled = false;
      btn.textContent = original;
    }
  });
});

document.querySelectorAll("[data-pay]").forEach((btn) => btn.addEventListener("click", () => {
  selectedPay = btn.dataset.pay;
  document.querySelectorAll("[data-pay]").forEach((b) => b.classList.toggle("active", b === btn));
  document.getElementById("eftFields").style.display = selectedPay === "eft" ? "grid" : "none";
  document.getElementById("payfastFields").style.display = selectedPay === "payfast" ? "grid" : "none";
  document.getElementById("otherFields").style.display = selectedPay === "other" ? "grid" : "none";
}));

document.querySelectorAll("[data-gender]").forEach((btn) => btn.addEventListener("click", () => {
  selectedGender = btn.dataset.gender;
  document.querySelectorAll("[data-gender]").forEach((b) => b.classList.toggle("active", b === btn));
}));

document.getElementById("saveDelivery")?.addEventListener("click", async () => {
  await saveOps({businessId, section: "delivery", data: {
    fulfilmentMode: document.getElementById("deliveryMethod").value,
    courierPreference: document.getElementById("deliveryProvider").value,
    pickupAddress: document.getElementById("dispatchAddress").value,
    baseDeliveryFee: Number(document.getElementById("deliveryFee").value || 0),
    trackingEnabled: true,
  }});
  markStatus("deliveryStatus", "Saved"); document.getElementById("p2")?.classList.add("done");
});

document.getElementById("savePayments")?.addEventListener("click", async () => {
  if (selectedPay === "eft") {
    const accountNumber = document.getElementById("accountNumber").value;
    if (!accountNumber && !document.getElementById("accountNumber").placeholder.includes("ending")) return alert("Enter the bank account number.");
    if (accountNumber) await saveOps({businessId, section: "banking", data: {
      bankName: document.getElementById("bankName").value,
      accountHolder: document.getElementById("accountHolder").value,
      accountNumber,
      branchCode: document.getElementById("branchCode").value,
      accountType: "Business",
    }});
  } else if (selectedPay === "payfast") {
    await saveOps({businessId, section: "payfast", data: {
      merchantId: document.getElementById("payfastMerchantId").value,
      merchantKey: document.getElementById("payfastMerchantKey").value,
      passphrase: document.getElementById("payfastPassphrase").value,
      sandboxMode: document.getElementById("payfastSandbox").value === "true",
      splitPaymentsEnabled: true,
    }});
  } else {
    await saveSimple({businessId, section: "paymentPreferences", data: {
      otherGateway: document.getElementById("otherGateway").value,
      otherReference: document.getElementById("otherReference").value,
    }});
  }
  markStatus("paymentStatus", "Saved"); document.getElementById("p3")?.classList.add("done");
});

document.getElementById("saveAudience")?.addEventListener("click", async () => {
  await saveSimple({businessId, section: "audience", data: {
    gender: selectedGender,
    ageRange: document.getElementById("ageRange").value,
    targetArea: document.getElementById("targetArea").value,
  }});
  markStatus("audienceStatus", "Saved"); document.getElementById("p4")?.classList.add("done");
});

onAuthStateChanged(auth, async (user) => {
  if (!user) return window.location.href = "login.html";
  const userSnap = await getDoc(doc(db, "users", user.uid));
  businessId = String(userSnap.data()?.activeBusinessId || "");
  if (!businessId) return window.location.href = "business-profile.html";
  try { await loadState(); } catch (error) { console.error(error); markStatus("platformSummary", "Setup unavailable", false); }
});
