import {onAuthStateChanged} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {doc, getDoc} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import {getFunctions, httpsCallable} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-functions.js";
import {app, auth, db} from "./firebase-config.js";

const money = new Intl.NumberFormat("en-ZA", {style: "currency", currency: "ZAR", maximumFractionDigits: 0});

export function initializeSellerDashboardSummary() {
  const page = window.location.pathname.split("/").pop() || "dashboard.html";
  if (page !== "dashboard.html") return;

  onAuthStateChanged(auth, async (user) => {
    if (!user) return;
    try {
      const userSnap = await getDoc(doc(db, "users", user.uid));
      const businessId = String(userSnap.data()?.activeBusinessId || "");
      if (!businessId) return;

      const functions = getFunctions(app);
      const getSummary = httpsCallable(functions, "getSellerDashboardSummary");
      const result = await getSummary({businessId});
      const data = result.data || {};

      const params = new URLSearchParams(window.location.search);
      if (!data.setup?.complete && params.get("skipSetup") !== "1") {
        window.location.replace("seller-onboarding.html");
        return;
      }

      const container = document.querySelector(".container");
      if (!container || document.getElementById("sellerMoneyHome")) return;
      const card = document.createElement("section");
      card.id = "sellerMoneyHome";
      card.innerHTML = `
        <style>
          .seller-home{margin-bottom:22px}.seller-home-head{display:flex;justify-content:space-between;gap:16px;align-items:end;margin-bottom:14px}.seller-home-head h2{font-family:'Plus Jakarta Sans',sans-serif;margin:0;font-size:1.35rem}.seller-home-head p{margin:4px 0 0;color:#64748b;font-size:.9rem}.seller-money-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.seller-money-card{background:#fff;border:1px solid #e2e8f0;border-radius:15px;padding:17px}.seller-money-card span{display:block;color:#64748b;font-size:.77rem;font-weight:700;text-transform:uppercase;margin-bottom:7px}.seller-money-card strong{font-family:'Plus Jakarta Sans',sans-serif;font-size:1.5rem}.seller-quick{display:flex;gap:9px;flex-wrap:wrap;margin-top:13px}.seller-quick a{text-decoration:none;border-radius:10px;padding:10px 13px;font-weight:800;font-size:.88rem;background:#fff;border:1px solid #e2e8f0;color:#0f172a}.seller-quick a.primary{background:#2563eb;color:#fff;border-color:#2563eb}@media(max-width:900px){.seller-money-grid{grid-template-columns:1fr 1fr}}@media(max-width:520px){.seller-money-grid{grid-template-columns:1fr}.seller-home-head{align-items:flex-start;flex-direction:column}}
        </style>
        <div class="seller-home">
          <div class="seller-home-head"><div><h2>${data.business?.name || "Your shop"}</h2><p>Your money and selling activity at a glance.</p></div><a href="seller-onboarding.html" style="color:#2563eb;font-weight:800;text-decoration:none">Setup</a></div>
          <div class="seller-money-grid">
            <div class="seller-money-card"><span>Available balance</span><strong>${money.format(data.balances?.availableBalance || 0)}</strong></div>
            <div class="seller-money-card"><span>Pending</span><strong>${money.format(data.balances?.pendingBalance || 0)}</strong></div>
            <div class="seller-money-card"><span>Total sales</span><strong>${money.format(data.balances?.lifetimeSales || 0)}</strong></div>
            <div class="seller-money-card"><span>Orders</span><strong>${Number(data.orders?.count || 0).toLocaleString()}</strong></div>
          </div>
          <div class="seller-quick"><a class="primary" href="#wizardPanel"><i class="ph ph-plus-circle"></i> Sell more</a><a href="sales-channels.html?return=dashboard"><i class="ph ph-plugs-connected"></i> Connections</a><a href="delivery-settings.html"><i class="ph ph-truck"></i> Delivery</a><a href="shop-settings.html"><i class="ph ph-gear"></i> Shop settings</a><a href="network.html"><i class="ph ph-handshake"></i> Network</a></div>
        </div>`;
      container.prepend(card);
    } catch (error) {
      console.error("Seller dashboard summary failed", error);
    }
  });
}