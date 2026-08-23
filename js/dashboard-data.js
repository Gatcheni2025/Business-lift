import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { collection, doc, getDoc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

const currencyFormatter = new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0
});

function setText(selector, value) {
    const node = document.querySelector(selector);
    if (!node) {
        return;
    }

    node.textContent = value;
}

function normaliseOrderStatus(status) {
    const value = String(status || "new").toLowerCase();
    if (value === "processing" || value === "shipping" || value === "completed") {
        return value;
    }
    return "new";
}

async function loadDashboardData(user) {
    const userSnapshot = await getDoc(doc(db, "users", user.uid));
    if (!userSnapshot.exists()) {
        return;
    }

    const userData = userSnapshot.data();
    const businessId = userData.activeBusinessId;
    if (!businessId) {
        return;
    }

    const businessSnapshot = await getDoc(doc(db, "businesses", businessId));
    if (!businessSnapshot.exists()) {
        return;
    }

    const business = businessSnapshot.data();

    const [ordersSnapshot, productsSnapshot] = await Promise.all([
        getDocs(query(collection(db, "orders"), where("businessId", "==", businessId))),
        getDocs(query(collection(db, "products"), where("businessId", "==", businessId)))
    ]);

    const orders = ordersSnapshot.docs.map((entry) => entry.data());
    const products = productsSnapshot.docs.map((entry) => entry.data());

    const totalRevenue = orders.reduce((sum, order) => {
        const total = Number(order.total || 0);
        return sum + (Number.isFinite(total) ? total : 0);
    }, 0);

    const ordersCount = orders.length;
    const uniqueCustomers = new Set(
        orders
            .map((order) => String(order.customerId || "").trim())
            .filter(Boolean)
    ).size;

    const paidOrders = orders.filter((order) => String(order.paymentStatus || "").toLowerCase() === "paid").length;
    const conversionRate = ordersCount > 0 ? (paidOrders / ordersCount) * 100 : 0;

    const pendingOrders = orders.filter((order) => {
        const payment = String(order.paymentStatus || "").toLowerCase();
        const status = normaliseOrderStatus(order.orderStatus);
        return payment === "pending" || status === "new";
    }).length;

    const lowStockItems = products.filter((product) => Number(product.stock || 0) > 0 && Number(product.stock || 0) <= 5).length;
    const newCustomersThisWeek = uniqueCustomers;

    setText("[data-business-name]", business.businessName || "Your Business");
    setText("[data-business-id]", business.businessId || businessId);
    setText("[data-plan-name]", (business.plan || "START").toUpperCase());
    setText("[data-setup-progress]", `${business.setupProgress || 0}%`);

    const heroLine = business.profileComplete
        ? "Your business profile is complete. Connect products, orders, and payments to activate full commerce operations."
        : "Complete your business profile to unlock your full operating dashboard and storefront setup.";
    setText("[data-hero-line]", heroLine);

    setText("[data-stat-revenue]", currencyFormatter.format(totalRevenue));
    setText("[data-stat-orders]", String(ordersCount));
    setText("[data-stat-customers]", String(uniqueCustomers));
    setText("[data-stat-conversion]", `${conversionRate.toFixed(1)}%`);

    setText("[data-opportunity-carts]", `Pending or new orders requiring action: ${pendingOrders}.`);
    setText("[data-opportunity-stock]", `Low stock alerts tracked: ${lowStockItems}.`);
    setText("[data-opportunity-customers]", `Unique customers in recent orders: ${newCustomersThisWeek}.`);
    setText(
        "[data-opportunity-summary]",
        `Your store has ${pendingOrders} pending/new orders and ${lowStockItems} low-stock products right now.`
    );
}

onAuthStateChanged(auth, (user) => {
    if (!user) {
        return;
    }

    loadDashboardData(user).catch((error) => {
        console.error("Dashboard data load failed", error);
    });
});
