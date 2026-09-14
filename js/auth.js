import {
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    signOut,
    updateProfile
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import { auth } from "./firebase-config.js";
import { apiFetch } from "./api-client.js";

let authSubmission = false;
let pendingRegistrationUser = null;

const registerForm = document.querySelector("[data-auth='register']");
const loginForm = document.querySelector("[data-auth='login']");
const resetForm = document.querySelector("[data-auth='reset']");
const logoutButtons = document.querySelectorAll("[data-logout], [data-sign-out]");

function showStatus(message, type = "error") {
    const status = document.querySelector("[data-auth-status]");
    if (!status) return;
    status.hidden = false;
    status.textContent = message;
    status.classList.remove("success", "error");
    status.classList.add(type);
}

function getRedirectTarget() {
    const target = new URLSearchParams(window.location.search).get("redirect") || "dashboard.html";
    const allowed = new Set(["dashboard.html", "products.html", "orders.html", "customers.html", "business-profile.html", "seller-onboarding.html", "shop-settings.html", "delivery-settings.html", "payments.html", "sales-channels.html", "website-builder.html", "domains.html", "store.html", "network.html"]);
    return allowed.has(target.split(/[?#]/)[0]) && !target.includes("\\") ? target : "dashboard.html";
}

function mapAuthError(error, fallback) {
    const messages = {
        "auth/email-already-in-use": "An account with this email already exists.",
        "auth/invalid-credential": "Incorrect email or password.",
        "auth/invalid-email": "Please enter a valid email address.",
        "auth/network-request-failed": "Network error. Please check your connection.",
        "auth/operation-not-allowed": "Email/Password sign-in is disabled in Firebase Authentication.",
        "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
        "auth/unauthorized-domain": "This host is not in Firebase authorized domains.",
        "auth/user-disabled": "This account has been disabled.",
        "auth/weak-password": "Your password is too weak. Use at least 6 characters."
    };
    return messages[error?.code] || error?.message || fallback;
}

if (registerForm) {
    registerForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submitButton = registerForm.querySelector('button[type="submit"]');
        if (!(submitButton instanceof HTMLButtonElement)) return;

        authSubmission = true;
        submitButton.disabled = true;
        submitButton.textContent = "Creating workspace...";
        const formData = new FormData(registerForm);
        const firstName = String(formData.get("first-name") || "").trim();
        const lastName = String(formData.get("last-name") || "").trim();
        const email = String(formData.get("email") || "").trim();
        const password = String(formData.get("password") || "");
        const businessName = String(formData.get("business-name") || "").trim();
        const businessType = String(formData.get("business-type") || "").trim();
        const industry = String(formData.get("industry") || "").trim();
        const country = String(formData.get("country") || "").trim();

        try {
            const user = pendingRegistrationUser || (await createUserWithEmailAndPassword(auth, email, password)).user;
            pendingRegistrationUser = user;
            await updateProfile(user, {displayName: `${firstName} ${lastName}`.trim()});
            await user.getIdToken(true);
            await apiFetch("api/profile.php", {
                method: "POST",
                body: JSON.stringify({businessName,businessType,industry,country,phone:"",address:"",about:""})
            });
            pendingRegistrationUser = null;
            showStatus("Your account is ready. Opening your dashboard…", "success");
            setTimeout(() => window.location.replace(getRedirectTarget()), 700);
        } catch (error) {
            console.error("Registration error:", error);
            showStatus(mapAuthError(error, pendingRegistrationUser ? "Your account was created, but workspace setup failed. Retry here to finish setup." : "Unable to create your account."));
            submitButton.disabled = false;
            submitButton.textContent = pendingRegistrationUser ? "Retry workspace setup" : "Create account";
        }
    });
}

if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submitButton = loginForm.querySelector('button[type="submit"]');
        if (!(submitButton instanceof HTMLButtonElement)) return;
        authSubmission = true; submitButton.disabled = true; submitButton.textContent = "Signing in...";
        const formData = new FormData(loginForm);
        const email = String(formData.get("email") || "").trim();
        const password = String(formData.get("password") || "");
        try {
            await signInWithEmailAndPassword(auth, email, password);
            showStatus("Login successful. Redirecting...", "success");
            setTimeout(() => window.location.replace(getRedirectTarget()), 500);
        } catch (error) {
            console.error("Login error:", error); showStatus(mapAuthError(error, "Unable to sign in."));
            submitButton.disabled = false; submitButton.textContent = "Sign in";
        }
    });
}

if (resetForm) {
    resetForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submitButton = resetForm.querySelector('button[type="submit"]');
        if (!(submitButton instanceof HTMLButtonElement)) return;
        authSubmission = true; submitButton.disabled = true; submitButton.textContent = "Sending...";
        const email = String(new FormData(resetForm).get("email") || "").trim();
        try {
            await sendPasswordResetEmail(auth, email);
            showStatus("Password reset email sent. Check your inbox.", "success");
        } catch (error) {
            console.error("Password reset error:", error); showStatus(mapAuthError(error, "Unable to send password reset email."));
        } finally {
            submitButton.disabled = false; submitButton.textContent = "Send reset link";
        }
    });
}

onAuthStateChanged(auth, (user) => {
    if (user && !authSubmission && (loginForm || registerForm)) window.location.replace(getRedirectTarget());
});

logoutButtons.forEach((button) => {
    button.addEventListener("click", async () => {
        try { await signOut(auth); window.location.href = "login.html"; }
        catch (error) { console.error("Logout error:", error); }
    });
});

if (loginForm || registerForm || resetForm) {
    document.querySelectorAll('a[href="login.html"], a[href="register.html"], a[href="forgot-password.html"]').forEach(link => {
        link.search = new URLSearchParams({redirect: getRedirectTarget()}).toString();
    });
}
