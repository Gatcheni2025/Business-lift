// products-data.js - Enhanced with channel support
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
    addDoc,
    collection,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
    query,
    serverTimestamp,
    where,
    updateDoc
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

const form = document.querySelector("[data-product-form]");
const statusNode = document.querySelector("[data-product-status]");
const tableBody = document.querySelector("[data-products-table-body]");
const businessIdNode = document.querySelector("[data-business-id]");
const channelTogglesContainer = document.querySelector("[data-channel-toggles]");
const channelDistribution = document.querySelector("[data-channel-distribution]");

const money = new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 2
});

let activeBusinessId = "";
let channels = [];
let unsubscribeProducts = null;
let unsubscribeChannels = null;

function showStatus(message, tone = "error") {
    if (!statusNode) return;
    statusNode.hidden = false;
    statusNode.textContent = message;
    statusNode.className = "form-status " + tone;
}

// Render channel toggles in form
function renderChannelToggles(channelsData) {
    if (!channelTogglesContainer) return;
    
    if (channelsData.length === 0) {
        channelTogglesContainer.innerHTML = `
            <p class="muted">No channels available. <a href="sales-channels.html">Connect a sales channel</a> first.</p>
        `;
        return;
    }
    
    channelTogglesContainer.innerHTML = channelsData
        .filter(c => c.status === "active")
        .map(channel => `
            <div class="channel-toggle">
                <input type="checkbox" 
                       id="channel-${channel.id}" 
                       name="channels" 
                       value="${channel.id}"
                       ${channel.defaultPublish !== false ? "checked" : ""}>
                <label for="channel-${channel.id}">${channel.channelName}</label>
            </div>
        `).join("");
}

// Render channel distribution
function renderChannelDistribution(productsData, channelsData) {
    if (!channelDistribution) return;
    
    const distribution = {};
    channelsData.forEach(c => {
        distribution[c.id] = {
            name: c.channelName,
            count: 0,
            revenue: 0
        };
    });
    
    productsData.forEach(product => {
        if (product.channelPublish) {
            Object.entries(product.channelPublish).forEach(([channelId, published]) => {
                if (published && distribution[channelId]) {
                    distribution[channelId].count++;
                    distribution[channelId].revenue += Number(product.price || 0);
                }
            });
        }
    });
    
    const totalProducts = productsData.length;
    
    channelDistribution.innerHTML = Object.values(distribution)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map(d => `
            <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(23,53,45,0.04);">
                <span>${d.name}</span>
                <span><strong>${d.count}</strong> products (${totalProducts > 0 ? ((d.count/totalProducts)*100).toFixed(0) : 0}%)</span>
            </div>
        `).join("");
}

// Enhanced product render with channel columns
function renderRows(productsData, channelsData) {
    if (!tableBody) return;
    
    if (productsData.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="8">No products yet. Add your first product above.</td></tr>';
        return;
    }
    
    const rows = productsData.map((product) => {
        const status = String(product.status || "draft");
        const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
        
        // Get published channels for this product
        const publishedChannels = Object.entries(product.channelPublish || {})
            .filter(([_, published]) => published === true)
            .map(([channelId]) => channelsData.find(c => c.id === channelId))
            .filter(Boolean);
        
        const channelBadges = publishedChannels.length > 0
            ? publishedChannels.map(c => `<span class="pill">${c.channelName}</span>`).join(" ")
            : '<span class="muted">Not published</span>';
        
        return `<tr>
            <td><strong>${product.name}</strong></td>
            <td>${product.sku || "-"}</td>
            <td>${money.format(Number(product.price || 0))}</td>
            <td>${money.format(Number(product.costPrice || 0))}</td>
            <td>${Number(product.stock || 0)}</td>
            <td>${channelBadges}</td>
            <td><span class="status-pill">${statusLabel}</span></td>
            <td>
                <button class="icon-button small" data-product-edit="${product.id}" title="Edit">✏️</button>
                <button class="icon-button small" data-product-toggle="${product.id}" title="Toggle publishing">📤</button>
            </td>
        </tr>`;
    }).join("");
    
    tableBody.innerHTML = rows;
}

// Listen to channels
function listenToChannels(businessId) {
    if (unsubscribeChannels) unsubscribeChannels();
    
    const channelsQuery = query(
        collection(db, "channels"),
        where("businessId", "==", businessId)
    );
    
    unsubscribeChannels = onSnapshot(channelsQuery, (snapshot) => {
        channels = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        renderChannelToggles(channels);
        renderChannelDistribution(products, channels);
    }, (error) => {
        console.error("Channels query failed", error);
    });
}

// Listen to products
function listenToProducts(businessId) {
    if (unsubscribeProducts) unsubscribeProducts();
    
    const productsQuery = query(
        collection(db, "products"),
        where("businessId", "==", businessId)
    );
    
    unsubscribeProducts = onSnapshot(productsQuery, (snapshot) => {
        const productsData = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        // Store for distribution
        window.products = productsData;
        
        renderRows(productsData, channels);
        renderChannelDistribution(productsData, channels);
    }, (error) => {
        console.error("Products query failed", error);
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="8">Unable to load products.</td></tr>';
        }
    });
}

// Load business
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
    
    listenToChannels(activeBusinessId);
    listenToProducts(activeBusinessId);
}

// Product form submission with channel publishing
if (form) {
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        
        const submitButton = form.querySelector('button[type="submit"]');
        if (!(submitButton instanceof HTMLButtonElement)) return;
        
        if (!activeBusinessId) {
            showStatus("Business context not loaded yet. Please wait and try again.");
            return;
        }
        
        const formData = new FormData(form);
        
        // Get selected channels
        const selectedChannels = [];
        form.querySelectorAll('input[name="channels"]:checked').forEach(checkbox => {
            selectedChannels.push(checkbox.value);
        });
        
        const channelPublish = {};
        channels.forEach(channel => {
            channelPublish[channel.id] = selectedChannels.includes(channel.id);
        });
        
        const payload = {
            businessId: activeBusinessId,
            name: String(formData.get("name") || "").trim(),
            description: String(formData.get("description") || "").trim(),
            price: Number(formData.get("price") || 0),
            costPrice: Number(formData.get("costPrice") || 0),
            sku: String(formData.get("sku") || "").trim().toUpperCase(),
            stock: Number(formData.get("stock") || 0),
            category: String(formData.get("category") || "").trim(),
            imageUrl: String(formData.get("imageUrl") || "").trim(),
            status: String(formData.get("status") || "draft").trim(),
            channelPublish: channelPublish,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };
        
        if (!payload.name || !payload.description || !payload.category || !payload.sku) {
            showStatus("Complete all required product fields before saving.");
            return;
        }
        
        if (!Number.isFinite(payload.price) || payload.price < 0 || !Number.isFinite(payload.costPrice) || payload.costPrice < 0) {
            showStatus("Price and cost price must be valid positive numbers.");
            return;
        }
        
        submitButton.disabled = true;
        submitButton.textContent = "Saving...";
        
        try {
            await addDoc(collection(db, "products"), payload);
            showStatus("Product saved successfully.", "success");
            form.reset();
            form.elements["status"].value = "active";
            
            // Re-check default channels
            channels.forEach(channel => {
                const checkbox = form.querySelector(`input[name="channels"][value="${channel.id}"]`);
                if (checkbox && channel.defaultPublish !== false) {
                    checkbox.checked = true;
                }
            });
        } catch (error) {
            console.error("Create product failed", error);
            showStatus("Unable to save product. Check Firestore rules and try again.");
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = "Add Product";
        }
    });
    
    // Set default status
    if (form.elements["status"]) {
        form.elements["status"].value = "active";
    }
}

// Product actions (edit/toggle)
document.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    
    // Toggle product publishing
    const toggleButton = target.closest("[data-product-toggle]");
    if (toggleButton) {
        const productId = toggleButton.dataset.productToggle;
        const product = window.products?.find(p => p.id === productId);
        if (product) {
            // Toggle: if any channel is published, unpublish all; if none, publish to all active channels
            const hasPublished = Object.values(product.channelPublish || {}).some(v => v === true);
            const newPublish = {};
            channels.forEach(channel => {
                newPublish[channel.id] = !hasPublished && channel.status === "active";
            });
            
            try {
                await updateDoc(doc(db, "products", productId), {
                    channelPublish: newPublish,
                    updatedAt: serverTimestamp()
                });
            } catch (error) {
                console.error("Toggle publish failed", error);
                alert("Unable to update product publishing.");
            }
        }
    }
});

// Auth
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }
    
    loadBusiness(user).catch((error) => {
        console.error("Products load failed", error);
        showStatus("Unable to load business context for products.");
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="8">Unable to load products.</td></tr>';
        }
    });
});