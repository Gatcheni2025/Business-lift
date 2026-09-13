import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyC0dFsNcfwuYUbdCN6K2xrG3Ycx6tPvl_U",
    authDomain: "business-lift-3c19c.firebaseapp.com",
    projectId: "business-lift-3c19c",
    storageBucket: "business-lift-3c19c.firebasestorage.app",
    messagingSenderId: "983479810697",
    appId: "1:983479810697:web:bd021d86bbe6d787db2458"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

// Temporary compatibility layer while older Business Expose pages are being
// migrated one-by-one. Pages that load the shared Firebase config now display
// the new Business Expo brand immediately without changing database IDs.
function applyBusinessExpoBranding() {
    document.title = document.title.replaceAll("Business Expose", "Business Expo");
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
        if (node.nodeValue && node.nodeValue.includes("Business Expose")) {
            node.nodeValue = node.nodeValue.replaceAll("Business Expose", "Business Expo");
        }
    }
}

function installDashboardResponsiveLayout() {
    const page = window.location.pathname.split("/").pop() || "dashboard.html";
    if (page !== "dashboard.html") return;

    if (!document.getElementById("businessExpoResponsiveStyles")) {
        const style = document.createElement("style");
        style.id = "businessExpoResponsiveStyles";
        style.textContent = `
            html, body { max-width: 100%; }
            .main-content { min-width: 0; }
            .wizard-body > *, .container > *, .topbar > * { min-width: 0; }
            .table-panel { overflow-x: auto; -webkit-overflow-scrolling: touch; }
            .data-table { min-width: 760px; }
            .mockup-card, .upload-area, .reach-box { max-width: 100%; }
            img { max-width: 100%; }

            .mobile-menu-btn {
                display: none;
                width: 42px;
                height: 42px;
                border: 1px solid var(--border, #e2e8f0);
                border-radius: 11px;
                background: #fff;
                color: var(--text-primary, #0f172a);
                align-items: center;
                justify-content: center;
                font-size: 1.35rem;
                cursor: pointer;
                flex: 0 0 auto;
            }

            .mobile-sidebar-backdrop {
                display: none;
                position: fixed;
                inset: 0;
                background: rgba(15,23,42,.48);
                z-index: 45;
                backdrop-filter: blur(2px);
            }

            @media (max-width: 1100px) {
                .sidebar { width: 88px; flex: 0 0 88px; }
                .sidebar-header { justify-content: center; padding: 20px 12px; }
                .sidebar-header .brand, .nav-label { display: none !important; }
                .nav-list { padding: 16px 10px; }
                .nav-link {
                    justify-content: center;
                    padding: 13px 10px;
                    font-size: 0;
                    gap: 0;
                }
                .nav-link i { font-size: 1.45rem; }
                .topbar { padding: 20px 24px; }
                .container { padding: 24px; }
                .wizard-body { grid-template-columns: 1fr !important; gap: 28px !important; }
                .wizard-header { padding: 20px 24px; gap: 14px; flex-wrap: wrap; }
                .pricing-grid { grid-template-columns: 1fr !important; }
                .paywall-modal { max-height: 88vh; overflow-y: auto; }
            }

            @media (max-width: 760px) {
                body {
                    display: block !important;
                    height: auto !important;
                    min-height: 100vh;
                    overflow: auto !important;
                }
                .sidebar {
                    position: fixed !important;
                    top: 0;
                    left: 0;
                    bottom: 0;
                    width: min(82vw, 300px) !important;
                    height: 100vh;
                    z-index: 60;
                    transform: translateX(-105%);
                    transition: transform .25s ease;
                    box-shadow: 18px 0 45px rgba(15,23,42,.16);
                }
                .sidebar.mobile-open { transform: translateX(0); }
                .sidebar.mobile-open + .mobile-sidebar-backdrop,
                .mobile-sidebar-backdrop.active { display: block; }
                .sidebar-header {
                    justify-content: flex-start;
                    padding: 20px;
                }
                .sidebar-header .brand { display: block !important; }
                .nav-label { display: block !important; }
                .nav-list { padding: 14px 16px 28px; }
                .nav-link {
                    justify-content: flex-start;
                    padding: 12px;
                    font-size: .95rem;
                    gap: 12px;
                }
                .nav-link i { font-size: 1.3rem; }

                .main-content {
                    width: 100%;
                    min-height: 100vh;
                    overflow: visible !important;
                }
                .topbar {
                    position: sticky;
                    top: 0;
                    padding: 14px 16px;
                    gap: 12px;
                }
                .topbar > div:first-child { flex: 1; min-width: 0; }
                .topbar h1 { font-size: 1.12rem !important; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .topbar p { font-size: .76rem !important; }
                .user-profile span { display: none; }
                .avatar { width: 36px; height: 36px; font-size: .8rem; }
                .mobile-menu-btn { display: inline-flex; order: -1; }

                .container { padding: 16px; }
                .wizard-panel, .table-panel { border-radius: 16px; margin-bottom: 20px; }
                .wizard-header {
                    padding: 18px;
                    align-items: flex-start;
                    flex-direction: column;
                }
                .wizard-header h2 { font-size: 1.15rem; }
                .wizard-body { padding: 18px !important; gap: 22px !important; }
                .form-section { margin-bottom: 24px; }
                .upload-area { padding: 24px 16px; }
                .channel-grid { grid-template-columns: 1fr !important; }
                .channel-opt { min-height: 52px; }
                .reach-box { padding: 20px 14px; }
                .reach-box h2 { font-size: 2rem !important; overflow-wrap: anywhere; }
                .mockup-img { height: 210px !important; }
                .mockup-body { padding: 16px; }
                .btn { max-width: 100%; }
                #exposeBtn { padding: 15px !important; font-size: .98rem !important; }

                .table-panel { padding: 16px; }
                .table-panel h2 { font-size: 1.1rem; }
                .data-table { min-width: 700px; font-size: .86rem; }
                .data-table th, .data-table td { padding: 12px; }

                .modal-overlay { padding: 12px; align-items: flex-start; overflow-y: auto; }
                .paywall-modal {
                    width: 100% !important;
                    max-height: none;
                    margin: 20px 0;
                    padding: 28px 18px !important;
                    border-radius: 18px;
                }
                .paywall-modal > h2 { font-size: 1.5rem !important; padding-right: 30px; }
                .paywall-modal > p { font-size: .95rem !important; }
                .pricing-grid { gap: 16px !important; margin-top: 24px !important; }
                .price-card { padding: 20px 16px; }
            }

            @media (max-width: 420px) {
                .topbar { padding: 12px; }
                .container { padding: 12px; }
                .wizard-body { padding: 14px !important; }
                .wizard-header { padding: 16px 14px; }
                .channel-opt { padding: 11px 10px; }
                .mockup-meta { align-items: flex-start; line-height: 1.35; }
                .reach-box h2 { font-size: 1.65rem !important; }
            }
        `;
        document.head.appendChild(style);
    }

    const sidebar = document.getElementById("sidebar");
    const topbar = document.querySelector(".topbar");
    if (!sidebar || !topbar || document.getElementById("dashboardMobileMenu")) return;

    const menuButton = document.createElement("button");
    menuButton.id = "dashboardMobileMenu";
    menuButton.className = "mobile-menu-btn";
    menuButton.type = "button";
    menuButton.setAttribute("aria-label", "Open navigation");
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.innerHTML = '<i class="ph ph-list"></i>';
    topbar.prepend(menuButton);

    const backdrop = document.createElement("div");
    backdrop.className = "mobile-sidebar-backdrop";
    backdrop.setAttribute("aria-hidden", "true");
    document.body.appendChild(backdrop);

    const closeMenu = () => {
        sidebar.classList.remove("mobile-open");
        backdrop.classList.remove("active");
        menuButton.setAttribute("aria-expanded", "false");
        menuButton.innerHTML = '<i class="ph ph-list"></i>';
    };

    const openMenu = () => {
        sidebar.classList.add("mobile-open");
        backdrop.classList.add("active");
        menuButton.setAttribute("aria-expanded", "true");
        menuButton.innerHTML = '<i class="ph ph-x"></i>';
    };

    menuButton.addEventListener("click", () => {
        if (sidebar.classList.contains("mobile-open")) closeMenu();
        else openMenu();
    });
    backdrop.addEventListener("click", closeMenu);
    sidebar.querySelectorAll("a").forEach((link) => link.addEventListener("click", closeMenu));
    window.addEventListener("resize", () => {
        if (window.innerWidth > 760) closeMenu();
    });
}

function initializeSharedUi() {
    applyBusinessExpoBranding();
    installDashboardResponsiveLayout();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeSharedUi);
} else {
    initializeSharedUi();
}

export { app };
