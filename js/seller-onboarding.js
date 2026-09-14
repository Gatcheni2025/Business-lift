import {getBusinessContext,workspaceError} from "./business-context.js";
import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {doc, getDoc} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import {getFunctions, httpsCallable} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-functions.js";
import {app, auth, db} from "./firebase-config.js";

const functions = getFunctions(app);
const getConnections = httpsCallable(functions, "getChannelConnections");
const getOps = httpsCallable(functions, "getSellerOperations");
const saveOps = httpsCallable(functions, "saveSellerOperations");
const saveSimple = httpsCallable(functions, "saveSellerSimplePreferences");

let businessId = "";
let selectedPay = "eft";
let selectedGender = "all";
let currentState = {platforms: false, delivery: false, payments: false, audience: false};

function markStatus(id, text, done = true) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.classList.toggle("connected", done);
}

function updateFinishState() {
  const complete = Object.values(currentState).every(Boolean);
  const doneCount = Object.values(currentState).filter(Boolean).length;
  const note = document.getElementById("finishNote");
  if (note) note.textContent = complete ? "Your seller setup is complete." : `${doneCount} of 4 steps complete.`;
  const finish = document.getElementById("finishSetup");
  if (finish) {
    finish.textContent = complete ? "Open dashboard →" : "Continue later →";
    finish.classList.toggle("soft", !complete);
  }
}

function setStep(key, done) {
  currentState[key] = Boolean(done);
  const ids = {platforms: "p1", delivery: "p2", payments: "p3", audience: "p4"};
  document.getElementById(ids[key])?.classList.toggle("done", Boolean(done));
  updateFinishState();
}

function choosePayment(type) {
  selectedPay = type;
  document.querySelectorAll("[data-pay]").forEach((b) => b.classList.toggle("active", b.dataset.pay === type));
  document.getElementById("eftFields").style.display = type === "eft" ? "grid" : "none";
  document.getElementById("payfastFields").style.display = type === "payfast" ? "grid" : "none";
  document.getElementById("otherFields").style.display = type === "other" ? "grid" : "none";
}

async function loadState() {
  const [connectionsRes, opsRes] = await Promise.all([
    getConnections({businessId}),
    getOps({businessId}),
  ]);
  const connections = connectionsRes.data || {};
  const ops = opsRes.data || {};
  const linked = [connections.meta, connections.google, connections.whatsapp].filter((v) => v?.connected);
  const platformDone = linked.length > 0;
  document.getElementById("connectionCount").textContent = platformDone ?
    `${linked.length} external selling connection${linked.length === 1 ? "" : "s"} linked` :
    "No external selling platforms linked yet";
  markStatus("platformSummary", platformDone ? "Connected" : "Not linked", platformDone);
  setStep("platforms", platformDone);

  if (ops.delivery) {
    document.getElementById("deliveryMethod").value = ops.delivery.fulfilmentMode || "courier";
    document.getElementById("deliveryProvider").value = ops.delivery.courierPreference || "";
    document.getElementById("dispatchAddress").value = ops.delivery.pickupAddress || "";
    document.getElementById("deliveryFee").value = ops.delivery.baseDeliveryFee || 0;
    markStatus("deliveryStatus", "Saved");
    setStep("delivery", Boolean(ops.delivery.fulfilmentMode));
  }

  if (ops.banking) {
    document.getElementById("bankName").value = ops.banking.bankName || "";
    document.getElementById("accountHolder").value = ops.banking.accountHolder || "";
    document.getElementById("branchCode").value = ops.banking.branchCode || "";
    if (ops.banking.accountNumberLast4) {
      document.getElementById("accountNumber").placeholder = `Saved account ending ${ops.banking.accountNumberLast4}`;
    }
    choosePayment("eft");
  } else if (ops.payfast?.connected) {
    document.getElementById("payfastMerchantId").value = ops.payfast.merchantId || "";
    document.getElementById("payfastSandbox").value = String(Boolean(ops.payfast.sandboxMode));
    choosePayment("payfast");
  } else if (ops.paymentPreferences?.otherGateway) {
    document.getElementById("otherGateway").value = ops.paymentPreferences.otherGateway || "";
    document.getElementById("otherReference").value = ops.paymentPreferences.otherReference || "";
    choosePayment("other");
  }
  const paymentDone = Boolean(ops.banking?.bankName || ops.payfast?.connected || ops.paymentPreferences?.otherGateway);
  if (paymentDone) markStatus("paymentStatus", "Saved");
  setStep("payments", paymentDone);

  if (ops.audience) {
    selectedGender = ops.audience.gender || "all";
    document.querySelectorAll("[data-gender]").forEach((b) => b.classList.toggle("active", b.dataset.gender === selectedGender));
    document.getElementById("ageRange").value = ops.audience.ageRange || "All adults";
    document.getElementById("targetArea").value = ops.audience.targetArea || "";
    markStatus("audienceStatus", "Saved");
    setStep("audience", Boolean(ops.audience.gender));
  }
}

document.querySelectorAll("[data-pay]").forEach((btn) => btn.addEventListener("click", () => choosePayment(btn.dataset.pay)));

document.querySelectorAll("[data-gender]").forEach((btn) => btn.addEventListener("click", () => {
  selectedGender = btn.dataset.gender;
  document.querySelectorAll("[data-gender]").forEach((b) => b.classList.toggle("active", b === btn));
}));

document.getElementById("saveDelivery")?.addEventListener("click", async (event) => {
  const btn = event.currentTarget;
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    await saveOps({businessId, section: "delivery", data: {
      fulfilmentMode: document.getElementById("deliveryMethod").value,
      courierPreference: document.getElementById("deliveryProvider").value,
      pickupAddress: document.getElementById("dispatchAddress").value,
      baseDeliveryFee: Number(document.getElementById("deliveryFee").value || 0),
      trackingEnabled: true,
    }});
    markStatus("deliveryStatus", "Saved");
    setStep("delivery", true);
  } finally {
    btn.disabled = false;
    btn.textContent = "Save delivery";
  }
});

document.getElementById("savePayments")?.addEventListener("click", async (event) => {
  const btn = event.currentTarget;
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    if (selectedPay === "eft") {
      const accountNumber = document.getElementById("accountNumber").value;
      const alreadySaved = document.getElementById("accountNumber").placeholder.includes("ending");
      if (!accountNumber && !alreadySaved) throw new Error("Enter the bank account number.");
      if (accountNumber) {
        await saveOps({businessId, section: "banking", data: {
          bankName: document.getElementById("bankName").value,
          accountHolder: document.getElementById("accountHolder").value,
          accountNumber,
          branchCode: document.getElementById("branchCode").value,
          accountType: "Business",
        }});
      }
    } else if (selectedPay === "payfast") {
      const merchantId = document.getElementById("payfastMerchantId").value;
      const merchantKey = document.getElementById("payfastMerchantKey").value;
      if (!merchantId || !merchantKey) throw new Error("Enter your PayFast Merchant ID and Merchant Key.");
      await saveOps({businessId, section: "payfast", data: {
        merchantId,
        merchantKey,
        passphrase: document.getElementById("payfastPassphrase").value,
        sandboxMode: document.getElementById("payfastSandbox").value === "true",
        splitPaymentsEnabled: true,
      }});
    } else {
      const otherGateway = document.getElementById("otherGateway").value.trim();
      if (!otherGateway) throw new Error("Enter the payment gateway name.");
      await saveSimple({businessId, section: "paymentPreferences", data: {
        otherGateway,
        otherReference: document.getElementById("otherReference").value,
      }});
    }
    markStatus("paymentStatus", "Saved");
    setStep("payments", true);
  } catch (error) {
    alert(error.message || "Unable to save payment settings.");
  } finally {
    btn.disabled = false;
    btn.textContent = "Save payment option";
  }
});

document.getElementById("saveAudience")?.addEventListener("click", async (event) => {
  const btn = event.currentTarget;
  btn.disabled = true;
  btn.textContent = "Saving…";
  try {
    await saveSimple({businessId, section: "audience", data: {
      gender: selectedGender,
      ageRange: document.getElementById("ageRange").value,
      targetArea: document.getElementById("targetArea").value,
    }});
    markStatus("audienceStatus", "Saved");
    setStep("audience", true);
  } finally {
    btn.disabled = false;
    btn.textContent = "Save audience";
  }
});

onAuthStateChanged(auth, async (user) => {
  if (!user) return window.location.href = "login.html";
  try { businessId = (await getBusinessContext(user)).businessId; } catch(error) {
    const status=document.querySelector("[data-workspace-status]");
    if(status){status.hidden=false;status.textContent=workspaceError(error);}
    return;
  }
  if (!businessId) return window.location.href = "business-profile.html";
  try { await loadState(); } catch (error) { console.error("Seller setup load failed", error); }
});
