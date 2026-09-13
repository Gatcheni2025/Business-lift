import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-functions.js";
import { app, auth, db } from "./firebase-config.js";

const functions = getFunctions(app);
const saveSellerOperations = httpsCallable(functions, "saveSellerOperations");
const getSellerOperations = httpsCallable(functions, "getSellerOperations");
let activeBusinessId = "";

const statusEl = document.getElementById("saveStatus");
function status(message, tone = "success") {
  statusEl.textContent = message;
  statusEl.dataset.tone = tone;
  statusEl.hidden = false;
  clearTimeout(window.__sellerStatusTimer);
  window.__sellerStatusTimer = setTimeout(() => { statusEl.hidden = true; }, 5000);
}

function value(form, name) {
  const el = form.elements[name];
  return el ? String(el.value || "").trim() : "";
}
function checked(form, name) {
  const el = form.elements[name];
  return Boolean(el && el.checked);
}
function checkedValues(form, name) {
  return Array.from(form.querySelectorAll(`[name="${name}"]:checked`)).map((el) => el.value);
}

async function loadBusiness(user) {
  const userSnap = await getDoc(doc(db, "users", user.uid));
  if (!userSnap.exists()) throw new Error("User profile does not exist.");
  activeBusinessId = String(userSnap.data().activeBusinessId || "");
  if (!activeBusinessId) throw new Error("No active business is linked to this user.");
  document.querySelectorAll("[data-business-id]").forEach((el) => { el.textContent = activeBusinessId; });
  const result = await getSellerOperations({ businessId: activeBusinessId });
  hydrate(result.data || {});
}

function hydrate(data) {
  if (data.banking) {
    const f = document.getElementById("bankingForm");
    f.accountHolder.value = data.banking.accountHolder || "";
    f.bankName.value = data.banking.bankName || "";
    f.accountType.value = data.banking.accountType || "";
    f.branchCode.value = data.banking.branchCode || "";
    if (data.banking.accountNumberLast4) f.accountNumber.placeholder = `Saved account ending •••• ${data.banking.accountNumberLast4}`;
  }
  if (data.payfast) {
    const f = document.getElementById("payfastForm");
    f.merchantId.value = data.payfast.merchantId || "";
    f.splitPaymentsEnabled.checked = Boolean(data.payfast.splitPaymentsEnabled);
    f.sandboxMode.checked = Boolean(data.payfast.sandboxMode);
    if (data.payfast.connected) {
      f.merchantKey.placeholder = "Saved securely — leave blank to keep current key";
      f.passphrase.placeholder = "Saved securely — leave blank to keep current passphrase";
    }
  }
  if (data.delivery) {
    const f = document.getElementById("deliveryForm");
    Object.entries(data.delivery).forEach(([k, v]) => {
      if (f.elements[k] && typeof v !== "object") {
        if (f.elements[k].type === "checkbox") f.elements[k].checked = Boolean(v);
        else f.elements[k].value = v ?? "";
      }
    });
    (data.delivery.parcelTypes || []).forEach((v) => {
      const el = f.querySelector(`[name="parcelTypes"][value="${CSS.escape(v)}"]`);
      if (el) el.checked = true;
    });
  }
  ["accounting", "booking", "hr", "partner"].forEach((section) => {
    const d = data[section];
    const f = document.getElementById(`${section}Form`);
    if (!d || !f) return;
    Object.entries(d).forEach(([k, v]) => {
      const el = f.elements[k];
      if (!el || typeof v === "object") return;
      if (el.type === "checkbox") el.checked = Boolean(v);
      else el.value = v ?? "";
    });
  });
}

function wire(formId, section, serializer) {
  const form = document.getElementById(formId);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!activeBusinessId) return status("Business profile is still loading.", "error");
    const button = form.querySelector('button[type="submit"]');
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Saving…";
    try {
      await saveSellerOperations({ businessId: activeBusinessId, section, data: serializer(form) });
      status(`${section.charAt(0).toUpperCase() + section.slice(1)} settings saved.`);
    } catch (error) {
      console.error(error);
      status(error.message || "Unable to save settings.", "error");
    } finally {
      button.disabled = false;
      button.textContent = original;
    }
  });
}

wire("bankingForm", "banking", (f) => ({
  accountHolder: value(f, "accountHolder"), bankName: value(f, "bankName"),
  accountType: value(f, "accountType"), accountNumber: value(f, "accountNumber"), branchCode: value(f, "branchCode")
}));
wire("payfastForm", "payfast", (f) => ({
  merchantId: value(f, "merchantId"), merchantKey: value(f, "merchantKey"), passphrase: value(f, "passphrase"),
  splitPaymentsEnabled: checked(f, "splitPaymentsEnabled"), sandboxMode: checked(f, "sandboxMode")
}));
wire("deliveryForm", "delivery", (f) => ({
  fulfilmentMode: value(f, "fulfilmentMode"), courierPreference: value(f, "courierPreference"), pickupAddress: value(f, "pickupAddress"),
  baseDeliveryFee: value(f, "baseDeliveryFee"), freeDeliveryThreshold: value(f, "freeDeliveryThreshold"), deliveryRadiusKm: value(f, "deliveryRadiusKm"),
  parcelTypes: checkedValues(f, "parcelTypes"), allowCustomerPickup: checked(f, "allowCustomerPickup"), trackingEnabled: checked(f, "trackingEnabled")
}));
wire("accountingForm", "accounting", (f) => ({
  enabled: checked(f, "enabled"), vatRegistered: checked(f, "vatRegistered"), vatNumber: value(f, "vatNumber"),
  invoicePrefix: value(f, "invoicePrefix"), financialYearEnd: value(f, "financialYearEnd"), autoInvoices: checked(f, "autoInvoices"), trackExpenses: checked(f, "trackExpenses")
}));
wire("bookingForm", "booking", (f) => ({
  enabled: checked(f, "enabled"), appointmentDuration: value(f, "appointmentDuration"), bufferMinutes: value(f, "bufferMinutes"),
  leadTimeHours: value(f, "leadTimeHours"), locationType: value(f, "locationType"), bookingAddress: value(f, "bookingAddress"), cancellationHours: value(f, "cancellationHours")
}));
wire("hrForm", "hr", (f) => ({
  enabled: checked(f, "enabled"), employeeCount: value(f, "employeeCount"), payrollFrequency: value(f, "payrollFrequency"),
  payslipsEnabled: checked(f, "payslipsEnabled"), leaveTracking: checked(f, "leaveTracking"), attendanceTracking: checked(f, "attendanceTracking")
}));
wire("partnerForm", "partner", (f) => ({
  discoverable: checked(f, "discoverable"), category: value(f, "category"), serviceArea: value(f, "serviceArea"),
  offers: value(f, "offers"), needs: value(f, "needs"), allowContact: checked(f, "allowContact")
}));

onAuthStateChanged(auth, (user) => {
  if (!user) return window.location.href = "login.html";
  loadBusiness(user).catch((error) => {
    console.error(error);
    status(error.message || "Unable to load seller settings.", "error");
  });
});