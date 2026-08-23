import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

const currentPage = window.location.pathname.split("/").pop() || "dashboard.html";
const isBusinessProfilePage = currentPage === "business-profile.html";

const authNameTargets = document.querySelectorAll("[data-auth-name]");
const businessNameTargets = document.querySelectorAll("[data-business-name]");
const businessIdTargets = document.querySelectorAll("[data-business-id]");

function hydrateText(nodes, value) {
    nodes.forEach((node) => {
        node.textContent = value;
    });
}

onAuthStateChanged(auth, (user) => {
    if (!user) {
        const redirect = encodeURIComponent(currentPage);
        window.location.href = `login.html?redirect=${redirect}`;
        return;
    }

    hydrateText(authNameTargets, user.displayName || "Business owner");

    (async () => {
        const userSnapshot = await getDoc(doc(db, "users", user.uid));

        if (!userSnapshot.exists()) {
            if (!isBusinessProfilePage) {
                window.location.href = "business-profile.html";
            }
            return;
        }

        const userData = userSnapshot.data();
        const activeBusinessId = userData.activeBusinessId || "";

        if (!activeBusinessId) {
            if (!isBusinessProfilePage) {
                window.location.href = "business-profile.html";
            }
            return;
        }

        const businessSnapshot = await getDoc(doc(db, "businesses", activeBusinessId));
        const businessData = businessSnapshot.exists() ? businessSnapshot.data() : null;
        const businessName = businessData?.businessName || "Your Business";
        const profileComplete = Boolean(businessData?.profileComplete);

        hydrateText(businessNameTargets, businessName);
        hydrateText(businessIdTargets, activeBusinessId);

        if (!profileComplete && !isBusinessProfilePage) {
            window.location.href = "business-profile.html";
            return;
        }

        console.log("Authenticated:", user.uid, "Business:", activeBusinessId);
    })().catch((error) => {
        console.error("Guard data load failed", error);
        if (!isBusinessProfilePage) {
            window.location.href = "business-profile.html";
        }
    });
});