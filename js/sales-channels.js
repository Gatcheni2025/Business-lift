// sales-channels.js
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
    addDoc,
    collection,
    doc,
    getDoc,
    onSnapshot,
    query,
    serverTimestamp,
    where,
    updateDoc,
    deleteDoc
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

// State
let activeBusinessId = "";
let channels = [];
let products = [];
let unsubscribeChannels = null;
let unsubscribeProducts = null;

// Expose products globally for product toggle
window.products = products;

// DOM references
const channelGrid = document.querySelector("#channel-grid");
const channelCount = document.querySelector("[data-channel-count]");
const publishedCount = document.querySelector("[data-published-count]");
const channelRevenue = document.querySelector("[data-channel-revenue]");
const channelConversion = document.querySelector("[data-channel-conversion]");
const channelForm = document.querySelector("[data-channel-form]");
const channelStatus = document.querySelector("[data-channel-status]");
const productsTableBody = document.querySelector("[data-products-table-body]");
const channelFilter = document.querySelector("[data-channel-filter]");
const filterPublishedCheckbox = document.querySelector("[data-filter-published]");

const money = new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    maximumFractionDigits: 0
});

// Channel icons mapping - FIXED: Added all social channels
function getChannelIcon(type) {
    const icons = {
        whatsapp: "💬",
        facebook: "📘",
        youtube: "▶️",
        instagram: "📸",
        google: "🔍",
        website: "🌐",
        social: "📱",
        marketplace: "🏪",
        physical: "🏬",
        wholesale: "📦"
    };
    return icons[type] || "🔗";
}

// Channel color mapping
function getChannelColor(type) {
    const colors = {
        whatsapp: "#25D366",
        facebook: "#1877F2",
        youtube: "#FF0000",
        instagram: "#E4405F",
        google: "#4285F4",
        website: "#66736b",
        social: "#66736b",
        marketplace: "#66736b",
        physical: "#66736b",
        wholesale: "#66736b"
    };
    return colors[type] || "#66736b";
}

// Channel label mapping
function getChannelLabel(type) {
    const labels = {
        whatsapp: "WhatsApp",
        facebook: "Facebook",
        youtube: "YouTube",
        instagram: "Instagram",
        google: "Google",
        website: "Website",
        social: "Social Media",
        marketplace: "Marketplace",
        physical: "Physical Store",
        wholesale: "Wholesale"
    };
    return labels[type] || type;
}

// Modal controls
function openModal(modalId) {
    const modal = document.querySelector(`[data-modal="${modalId}"]`);
    if (modal) modal.hidden = false;
}

function closeModal(modalId) {
    const modal = document.querySelector(`[data-modal="${modalId}"]`);
    if (modal) modal.hidden = true;
}

// Show status
function showStatus(message, tone = "error", target = channelStatus) {
    if (!target) return;
    target.hidden = false;
    target.textContent = message;
    target.className = "form-status " + tone;
}

// Generate channel card HTML - FIXED: Added channel URL and color
function channelCardHTML(channel) {
    const statusColors = {
        active: "#27936f",
        draft: "#d89c2d",
        inactive: "#ef6b57"
    };
    const color = statusColors[channel.status] || "#66736b";
    const icon = getChannelIcon(channel.channelType);
    const label = getChannelLabel(channel.channelType);
    const channelColor = getChannelColor(channel.channelType);
    
    return `
        <article class="channel-card" data-channel-id="${channel.id}">
            <div class="channel-header">
                <span class="channel-icon" style="background: ${channelColor}22;">${icon}</span>
                <div class="channel-meta">
                    <strong>${channel.channelName}</strong>
                    <span>${label}</span>
                </div>
                <span class="status-dot" style="background:${color};"></span>
            </div>
            <div class="channel-stats">
                <div>
                    <p>Products</p>
                    <strong>${channel.productCount || 0}</strong>
                </div>
                <div>
                    <p>Revenue</p>
                    <strong>${money.format(channel.revenue || 0)}</strong>
                </div>
                <div>
                    <p>Conversion</p>
                    <strong>${(channel.conversionRate || 0).toFixed(1)}%</strong>
                </div>
            </div>
            ${channel.channelUrl ? `
                <div class="channel-url">
                    <span>🔗</span>
                    <a href="${channel.channelUrl}" target="_blank" rel="noopener">${channel.channelUrl}</a>
                </div>
            ` : ''}
            <div class="channel-actions">
                <button class="button button-secondary" data-channel-edit="${channel.id}">Edit</button>
                <button class="button button-secondary" data-channel-delete="${channel.id}">Delete</button>
            </div>
        </article>
    `;
}

// Render channels
function renderChannels(channelsData) {
    if (!channelGrid) return;
    
    if (channelsData.length === 0) {
        channelGrid.innerHTML = `
            <article class="empty-state">
                <span class="empty-icon">📢</span>
                <h3>No channels connected</h3>
                <p>Add your first sales channel to start publishing products across multiple touchpoints.</p>
                <button class="button button-primary" data-modal="channel-form">Connect Channel</button>
            </article>
        `;
        return;
    }
    
    channelGrid.innerHTML = channelsData.map(channelCardHTML).join("");
    
    if (channelCount) {
        channelCount.textContent = channelsData.length;
    }
}

// Render products with channel status
function renderProductsWithChannels(productsData, channelsData) {
    if (!productsTableBody) return;
    
    const filterChannel = channelFilter ? channelFilter.value : "all";
    const showPublishedOnly = filterPublishedCheckbox ? filterPublishedCheckbox.checked : false;
    
    let filteredProducts = productsData;
    
    if (filterChannel !== "all") {
        filteredProducts = filteredProducts.filter(p => 
            p.channelPublish && p.channelPublish[filterChannel]
        );
    }
    
    if (showPublishedOnly) {
        filteredProducts = filteredProducts.filter(p => 
            p.status === "active" && Object.values(p.channelPublish || {}).some(v => v === true)
        );
    }
    
    if (filteredProducts.length === 0) {
        productsTableBody.innerHTML = '<tr><td colspan="8">No products match the current filters.</td></tr>';
        return;
    }
    
    const rows = filteredProducts.map(product => {
        const publishedChannels = Object.entries(product.channelPublish || {})
            .filter(([_, published]) => published === true)
            .map(([channelId]) => channelsData.find(c => c.id === channelId))
            .filter(Boolean);
        
        const status = String(product.status || "draft");
        const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
        
        const channelBadges = publishedChannels.length > 0
            ? publishedChannels.map(c => {
                const icon = getChannelIcon(c.channelType);
                const color = getChannelColor(c.channelType);
                return `<span class="pill" style="background: ${color}22; border-color: ${color}44;">${icon} ${c.channelName}</span>`;
              }).join(" ")
            : '<span class="muted">Not published</span>';
        
        return `
            <tr>
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
            </tr>
        `;
    }).join("");
    
    productsTableBody.innerHTML = rows;
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
        
        renderChannels(channels);
        renderProductsWithChannels(products, channels);
        updateChannelFilter(channels);
        updateChannelStats();
    }, (error) => {
        console.error("Channels query failed", error);
    });
}

// Listen to products - FIXED: Removed extra quote
function listenToProducts(businessId) {
    if (unsubscribeProducts) unsubscribeProducts();
    
    const productsQuery = query(
        collection(db, "products"),
        where("businessId", "==", businessId)  // FIXED: was "==",
    );
    
    unsubscribeProducts = onSnapshot(productsQuery, (snapshot) => {
        products = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        window.products = products; // Update global reference
        
        renderProductsWithChannels(products, channels);
        updateChannelStats();
    }, (error) => {
        console.error("Products query failed", error);
    });
}

// Update channel filter dropdown - FIXED: Added icons
function updateChannelFilter(channelsData) {
    if (!channelFilter) return;
    
    const currentValue = channelFilter.value;
    channelFilter.innerHTML = `
        <option value="all">All Channels</option>
        ${channelsData.map(c => {
            const icon = getChannelIcon(c.channelType);
            return `<option value="${c.id}">${icon} ${c.channelName}</option>`;
        }).join("")}
    `;
    if (currentValue) channelFilter.value = currentValue;
}

// Update channel statistics
function updateChannelStats() {
    if (!channelRevenue || !channelConversion || !publishedCount) return;
    
    const totalRevenue = channels.reduce((sum, c) => sum + (c.revenue || 0), 0);
    const totalConversion = channels.length > 0 
        ? channels.reduce((sum, c) => sum + (c.conversionRate || 0), 0) / channels.length
        : 0;
    
    const publishedProducts = products.filter(p => 
        p.status === "active" && Object.values(p.channelPublish || {}).some(v => v === true)
    ).length;
    
    channelRevenue.textContent = money.format(totalRevenue);
    channelConversion.textContent = `${totalConversion.toFixed(1)}%`;
    publishedCount.textContent = publishedProducts;
}

// Quick connect buttons - FIXED: Added pre-fill for all social channels
document.querySelectorAll("[data-channel-type]").forEach(btn => {
    btn.addEventListener("click", () => {
        const type = btn.dataset.channelType;
        const icon = getChannelIcon(type);
        const label = getChannelLabel(type);
        const color = getChannelColor(type);
        
        if (channelForm) {
            channelForm.elements["channelType"].value = type;
            channelForm.elements["channelName"].value = `${label} Shop`;
            channelForm.elements["status"].value = "active";
            
            const urlInput = channelForm.elements["channelUrl"];
            const placeholders = {
                whatsapp: "https://wa.me/27123456789",
                facebook: "https://facebook.com/yourpage",
                youtube: "https://youtube.com/@yourchannel",
                instagram: "https://instagram.com/yourhandle",
                google: "https://google.com/search?q=your+business"
            };
            if (urlInput && placeholders[type]) {
                urlInput.placeholder = placeholders[type];
            }
            
            const descTextarea = channelForm.elements["description"];
            const descriptions = {
                whatsapp: "WhatsApp Business channel for direct customer messaging and orders",
                facebook: "Facebook Shop and social commerce presence",
                youtube: "YouTube channel for product videos and demonstrations",
                instagram: "Instagram Shop for visual product discovery",
                google: "Google Shopping and search presence"
            };
            if (descTextarea && descriptions[type]) {
                descTextarea.value = descriptions[type];
            }
            
            openModal("channel-form");
        }
    });
});

// Channel form submission
if (channelForm) {
    channelForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        
        const submitButton = channelForm.querySelector('button[type="submit"]');
        if (!(submitButton instanceof HTMLButtonElement)) return;
        
        if (!activeBusinessId) {
            showStatus("Business context not loaded. Please try again.");
            return;
        }
        
        const formData = new FormData(channelForm);
        const payload = {
            businessId: activeBusinessId,
            channelName: String(formData.get("channelName") || "").trim(),
            channelType: String(formData.get("channelType") || "").trim(),
            channelUrl: String(formData.get("channelUrl") || "").trim(),
            status: String(formData.get("status") || "draft").trim(),
            description: String(formData.get("description") || "").trim(),
            productCount: 0,
            revenue: 0,
            conversionRate: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        };
        
        if (!payload.channelName || !payload.channelType) {
            showStatus("Channel name and type are required.");
            return;
        }
        
        submitButton.disabled = true;
        submitButton.textContent = "Creating...";
        
        try {
            await addDoc(collection(db, "channels"), payload);
            showStatus("Channel created successfully!", "success");
            channelForm.reset();
            closeModal("channel-form");
        } catch (error) {
            console.error("Create channel failed", error);
            showStatus("Unable to create channel. Check Firestore rules.");
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = "Create Channel";
        }
    });
}

// Channel actions (edit/delete)
document.addEventListener("click", async (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    
    const editButton = target.closest("[data-channel-edit]");
    if (editButton) {
        const channelId = editButton.dataset.channelEdit;
        const channel = channels.find(c => c.id === channelId);
        if (channel && channelForm) {
            channelForm.elements["channelName"].value = channel.channelName || "";
            channelForm.elements["channelType"].value = channel.channelType || "";
            channelForm.elements["channelUrl"].value = channel.channelUrl || "";
            channelForm.elements["status"].value = channel.status || "draft";
            channelForm.elements["description"].value = channel.description || "";
            
            const submitButton = channelForm.querySelector('button[type="submit"]');
            if (submitButton) {
                submitButton.textContent = "Update Channel";
                submitButton.dataset.channelId = channelId;
            }
            
            openModal("channel-form");
        }
    }
    
    const deleteButton = target.closest("[data-channel-delete]");
    if (deleteButton) {
        const channelId = deleteButton.dataset.channelDelete;
        if (confirm("Delete this channel? Products published to it will be unpublished.")) {
            try {
                const productUpdates = products
                    .filter(p => p.channelPublish && p.channelPublish[channelId])
                    .map(async (product) => {
                        const updates = { ...product.channelPublish };
                        delete updates[channelId];
                        await updateDoc(doc(db, "products", product.id), {
                            channelPublish: updates,
                            updatedAt: serverTimestamp()
                        });
                    });
                
                await Promise.all(productUpdates);
                await deleteDoc(doc(db, "channels", channelId));
            } catch (error) {
                console.error("Delete channel failed", error);
                alert("Unable to delete channel. Please try again.");
            }
        }
    }
});

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
    
    document.querySelectorAll("[data-business-id]").forEach(el => {
        el.textContent = activeBusinessId;
    });
    
    listenToChannels(activeBusinessId);
    listenToProducts(activeBusinessId);
}

// Filters
if (channelFilter) {
    channelFilter.addEventListener("change", () => {
        renderProductsWithChannels(products, channels);
    });
}

if (filterPublishedCheckbox) {
    filterPublishedCheckbox.addEventListener("change", () => {
        renderProductsWithChannels(products, channels);
    });
}

// Modal triggers
document.querySelectorAll("[data-modal]").forEach(trigger => {
    trigger.addEventListener("click", () => {
        const modalId = trigger.dataset.modal;
        openModal(modalId);
        
        if (modalId === "channel-form" && channelForm) {
            channelForm.reset();
            const submitButton = channelForm.querySelector('button[type="submit"]');
            if (submitButton) {
                submitButton.textContent = "Create Channel";
                delete submitButton.dataset.channelId;
            }
            if (channelStatus) {
                channelStatus.hidden = true;
            }
        }
    });
});

document.querySelectorAll("[data-modal-close]").forEach(close => {
    close.addEventListener("click", () => {
        const modalId = close.dataset.modalClose;
        closeModal(modalId);
    });
});

document.querySelectorAll(".modal-overlay").forEach(overlay => {
    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) {
            overlay.hidden = true;
        }
    });
});

// Auth
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }
    
    loadBusiness(user).catch((error) => {
        console.error("Sales channels load failed", error);
    });
});