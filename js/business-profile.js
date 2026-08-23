import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { doc, getDoc, serverTimestamp, updateDoc } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";
import { auth, db } from "./firebase-config.js";

const form = document.querySelector("[data-business-profile]");
const status = document.querySelector("[data-profile-status]");
const progressTarget = document.querySelector("[data-profile-progress]");
const planTarget = document.querySelector("[data-plan-name]");
const verificationTarget = document.querySelector("[data-verification-status]");

function showStatus(message, tone = "error") {
    if (!status) {
        return;
    }

    status.hidden = false;
    status.textContent = message;
    status.classList.remove("success", "error");
    status.classList.add(tone);
}

function completionFromBusiness(data) {
    const requiredFields = [
        data.businessName,
        data.businessType,
        data.industry,
        data.country,
        data.phone,
        data.address,
        data.about
    ];

    const completeCount = requiredFields.filter((value) => String(value || "").trim().length > 0).length;
    const pct = Math.round((completeCount / requiredFields.length) * 100);
    return Math.min(100, Math.max(0, pct));
}

async function loadProfile(user) {
    if (!form) {
        return;
    }

    const userSnapshot = await getDoc(doc(db, "users", user.uid));
    if (!userSnapshot.exists()) {
        showStatus("No user record found. Please sign out and register again.");
        return;
    }

    const userData = userSnapshot.data();
    const businessId = userData.activeBusinessId;

    if (!businessId) {
        showStatus("No active business found for this account.");
        return;
    }

    const businessSnapshot = await getDoc(doc(db, "businesses", businessId));
    if (!businessSnapshot.exists()) {
        showStatus("Business record missing. Please contact support.");
        return;
    }

    const business = businessSnapshot.data();

    form.elements["business-name"].value = business.businessName || "";
    form.elements["business-type"].value = business.businessType || "Retail";
    form.elements["industry"].value = business.industry || "";
    form.elements["country"].value = business.country || "South Africa";
    form.elements["phone"].value = business.phone || "";
    form.elements["address"].value = business.address || "";
    form.elements["about"].value = business.about || "";

    if (planTarget) {
        planTarget.textContent = (business.plan || "START").toUpperCase();
    }

    const completion = completionFromBusiness(business);
    if (progressTarget) {
        progressTarget.textContent = `${completion}%`;
    }

    if (verificationTarget) {
        verificationTarget.textContent = business.profileComplete ? "Profile ready" : "In progress";
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const submitButton = form.querySelector('button[type="submit"]');
        if (!(submitButton instanceof HTMLButtonElement)) {
            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = "Saving profile...";

        const payload = {
            businessName: String(form.elements["business-name"].value || "").trim(),
            businessType: String(form.elements["business-type"].value || "").trim(),
            industry: String(form.elements["industry"].value || "").trim(),
            country: String(form.elements["country"].value || "").trim(),
            phone: String(form.elements["phone"].value || "").trim(),
            address: String(form.elements["address"].value || "").trim(),
            about: String(form.elements["about"].value || "").trim(),
            profileComplete: true,
            setupProgress: 100,
            updatedAt: serverTimestamp()
        };

        try {
            await updateDoc(doc(db, "businesses", businessId), payload);
            showStatus("Business profile saved. Redirecting to dashboard...", "success");
            if (progressTarget) {
                progressTarget.textContent = "100%";
            }
            if (verificationTarget) {
                verificationTarget.textContent = "Profile ready";
            }

            setTimeout(() => {
                window.location.href = "dashboard.html";
            }, 900);
        } catch (error) {
            console.error("Business profile update failed", error);
            showStatus("Unable to save profile right now. Please try again.");
            submitButton.disabled = false;
            submitButton.textContent = "Save profile and continue";
        }
    });
}

onAuthStateChanged(auth, (user) => {
    if (!user) {
        return;
    }

    loadProfile(user).catch((error) => {
        console.error("Business profile load failed", error);
        showStatus("Unable to load business profile data.");
    });
});