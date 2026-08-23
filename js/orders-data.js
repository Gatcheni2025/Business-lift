import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
    addDoc,
    collection,
    doc,
    getDoc,
    onSnapshot,
    query,
    serverTimestamp,
    where
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

const form = document.querySelector("[data-order-form]");
const statusNode = document.querySelector("[data-order-status]");
const businessIdNode = document.querySelector("[data-business-id]");
const tableBody = document.querySelector("[data-orders-table-body]");
const productSelect = form ? form.elements["productId"] : null;

const newColumn = document.querySelector('[data-order-column="new"]');
const processingColumn = document.querySelector('[data-order-column="processing"]');
const shippingColumn = document.querySelector('[data-order-column="shipping"]');

const money = new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 2
});

let activeBusinessId = "";
let productsById = new Map();
let unsubscribeOrders = null;
let unsubscribeProducts = null;

function showStatus(message, tone = "error") {
    if (!statusNode) {
        return;
    }

    statusNode.hidden = false;
    statusNode.textContent = message;
    statusNode.classList.remove("success", "error");
    statusNode.classList.add(tone);
}

function emptyColumnMessage(label) {
    return `<article><strong>No ${label} orders</strong><span>New orders will appear here.</span></article>`;
}

function normaliseOrderStatus(status) {
    const value = String(status || "new").toLowerCase();
    if (value === "processing" || value === "shipping" || value === "completed") {
        return value;
    }
    return "new";
}

function renderKanban(orders) {
    const byStatus = {
        new: [],
        processing: [],
        shipping: []
    };

    orders.forEach((order) => {
        const status = normaliseOrderStatus(order.orderStatus);
        if (byStatus[status]) {
            byStatus[status].push(order);
        }
    });

    const renderItems = (list) => {
        if (list.length === 0) {
            return "";
        }

        return list.slice(0, 5).map((order) => `
            <article>
                <strong>${order.orderNumber || order.id}</strong>
                <span>${order.paymentStatus.toUpperCase()} - ${money.format(Number(order.total || 0))}</span>
            </article>
        `).join("");
    };

    if (newColumn) {
        newColumn.innerHTML = renderItems(byStatus.new) || emptyColumnMessage("new");
    }
    if (processingColumn) {
        processingColumn.innerHTML = renderItems(byStatus.processing) || emptyColumnMessage("processing");
    }
    if (shippingColumn) {
        shippingColumn.innerHTML = renderItems(byStatus.shipping) || emptyColumnMessage("shipping");
    }
}

function renderTable(orders) {
    if (!tableBody) {
        return;
    }

    if (orders.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5">No orders yet. Create your first order above.</td></tr>';
        return;
    }

    const rows = orders.map((order) => {
        const status = normaliseOrderStatus(order.orderStatus);
        const displayStatus = status.charAt(0).toUpperCase() + status.slice(1);
        const payment = String(order.paymentStatus || "pending");

        return `<tr>
            <td>${order.orderNumber || order.id}</td>
            <td>${order.customerId || "-"}</td>
            <td>${displayStatus}</td>
            <td>${payment.toUpperCase()}</td>
            <td>${money.format(Number(order.total || 0))}</td>
        </tr>`;
    }).join("");

    tableBody.innerHTML = rows;
}

function listenToOrders(businessId) {
    if (unsubscribeOrders) {
        unsubscribeOrders();
    }

    const ordersQuery = query(
        collection(db, "orders"),
        where("businessId", "==", businessId)
    );

    unsubscribeOrders = onSnapshot(ordersQuery, (snapshot) => {
        const orders = snapshot.docs.map((entry) => ({
            id: entry.id,
            ...entry.data()
        }));

        orders.sort((a, b) => {
            const aTime = a.createdAt?.seconds || 0;
            const bTime = b.createdAt?.seconds || 0;
            return bTime - aTime;
        });

        renderTable(orders);
        renderKanban(orders);
    }, (error) => {
        console.error("Orders query failed", error);
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="5">Unable to load orders.</td></tr>';
        }
    });
}

function listenToProducts(businessId) {
    if (unsubscribeProducts) {
        unsubscribeProducts();
    }

    const productsQuery = query(
        collection(db, "products"),
        where("businessId", "==", businessId)
    );

    unsubscribeProducts = onSnapshot(productsQuery, (snapshot) => {
        const products = snapshot.docs.map((entry) => ({
            id: entry.id,
            ...entry.data()
        }));

        productsById = new Map(products.map((product) => [product.id, product]));

        if (!(productSelect instanceof HTMLSelectElement)) {
            return;
        }

        const options = ['<option value="">Select product</option>'];

        products
            .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
            .forEach((product) => {
                options.push(
                    `<option value="${product.id}">${product.name} (${money.format(Number(product.price || 0))})</option>`
                );
            });

        productSelect.innerHTML = options.join("");
    }, (error) => {
        console.error("Products for orders query failed", error);
    });
}

function createOrderNumber() {
    const random = Math.floor(Math.random() * 9000) + 1000;
    return `#BL-${random}`;
}

async function loadBusiness(user) {
    const userSnapshot = await getDoc(doc(db, "users", user.uid));
    if (!userSnapshot.exists()) {
        throw new Error("User profile does not exist.");
    }

    const userData = userSnapshot.data();
    activeBusinessId = String(userData.activeBusinessId || "");

    if (!activeBusinessId) {
        throw new Error("No active business is linked to this user.");
    }

    if (businessIdNode) {
        businessIdNode.textContent = activeBusinessId;
    }

    listenToProducts(activeBusinessId);
    listenToOrders(activeBusinessId);
}

if (form) {
    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const submitButton = form.querySelector('button[type="submit"]');
        if (!(submitButton instanceof HTMLButtonElement)) {
            return;
        }

        if (!activeBusinessId) {
            showStatus("Business context not loaded yet. Please wait and try again.");
            return;
        }

        const formData = new FormData(form);
        const productId = String(formData.get("productId") || "");
        const customerId = String(formData.get("customerId") || "").trim();
        const quantity = Number(formData.get("quantity") || 0);
        const shipping = Number(formData.get("shipping") || 0);
        const tax = Number(formData.get("tax") || 0);
        const paymentStatus = String(formData.get("paymentStatus") || "pending").trim();
        const orderStatus = String(formData.get("orderStatus") || "new").trim();

        const product = productsById.get(productId);
        if (!product) {
            showStatus("Select a valid product before creating an order.");
            return;
        }

        if (!customerId) {
            showStatus("Customer ID is required.");
            return;
        }

        if (!Number.isInteger(quantity) || quantity <= 0) {
            showStatus("Quantity must be a valid whole number.");
            return;
        }

        if (!Number.isFinite(shipping) || shipping < 0 || !Number.isFinite(tax) || tax < 0) {
            showStatus("Shipping and tax must be valid positive numbers.");
            return;
        }

        const unitPrice = Number(product.price || 0);
        const subtotal = unitPrice * quantity;
        const total = subtotal + shipping + tax;

        const orderPayload = {
            businessId: activeBusinessId,
            orderNumber: createOrderNumber(),
            customerId,
            items: [
                {
                    productId,
                    name: String(product.name || ""),
                    quantity,
                    price: unitPrice
                }
            ],
            subtotal,
            shipping,
            tax,
            total,
            paymentStatus,
            orderStatus,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };

        submitButton.disabled = true;
        submitButton.textContent = "Creating...";

        try {
            await addDoc(collection(db, "orders"), orderPayload);
            showStatus("Order created successfully.", "success");
            form.reset();
            form.elements["quantity"].value = "1";
            form.elements["shipping"].value = "0";
            form.elements["tax"].value = "0";
            form.elements["paymentStatus"].value = "pending";
            form.elements["orderStatus"].value = "new";
        } catch (error) {
            console.error("Create order failed", error);
            showStatus("Unable to create order. Check Firestore rules and try again.");
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = "Create order";
        }
    });
}

onAuthStateChanged(auth, (user) => {
    if (!user) {
        return;
    }

    loadBusiness(user).catch((error) => {
        console.error("Order business context load failed", error);
        showStatus("Unable to load business context for orders.");
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="5">Unable to load orders.</td></tr>';
        }
    });
});
