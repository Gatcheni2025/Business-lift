import {
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    signOut,
    updateProfile
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import {
    doc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

import { auth, db } from "./firebase-config.js";

const registerForm = document.querySelector("[data-auth='register']");
const loginForm = document.querySelector("[data-auth='login']");
const resetForm = document.querySelector("[data-auth='reset']");
const logoutButtons = document.querySelectorAll("[data-logout], [data-sign-out]");

function showStatus(message, type = "error") {
    const status = document.querySelector("[data-auth-status]");
    if (!status) {
        return;
    }

    status.hidden = false;
    status.textContent = message;
    status.classList.remove("success", "error");
    status.classList.add(type);
}

function getRedirectTarget() {
    const params = new URLSearchParams(window.location.search);
    return params.get("redirect") || "dashboard.html";
}

function generateBusinessId() {
    const random = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `BL_${random}`;
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

    return messages[error?.code] || fallback;
}

if (registerForm) {
    registerForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const submitButton = registerForm.querySelector('button[type="submit"]');
        if (!(submitButton instanceof HTMLButtonElement)) {
            return;
        }

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
        const plan = String(formData.get("plan") || "start").trim();

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            await updateProfile(user, {
                displayName: `${firstName} ${lastName}`.trim()
            });

            const businessId = generateBusinessId();

            await setDoc(doc(db, "users", user.uid), {
                uid: user.uid,
                firstName,
                lastName,
                email,
                activeBusinessId: businessId,
                businessIds: [businessId],
                createdAt: serverTimestamp()
            });

            await setDoc(doc(db, "businesses", businessId), {
                businessId,
                ownerId: user.uid,
                ownerUid: user.uid,
                businessName,
                businessType,
                industry,
                country,
                plan,
                status: "active",
                profileComplete: false,
                setupProgress: 65,
                stats: {
                    revenueZar: 0,
                    ordersCount: 0,
                    customersCount: 0,
                    conversionRate: 0
                },
                opportunities: {
                    abandonedCarts: 0,
                    lowStockItems: 0,
                    newCustomersThisWeek: 0
                },
                createdAt: serverTimestamp()
            });

            showStatus("Business Lift workspace created successfully. Redirecting...", "success");

            setTimeout(() => {
                window.location.href = "dashboard.html";
            }, 1000);
        } catch (error) {
            console.error("Registration error:", error);
            showStatus(mapAuthError(error, "Unable to create your account."));
            submitButton.disabled = false;
            submitButton.textContent = "Create workspace";
        }
    });
}

if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const submitButton = loginForm.querySelector('button[type="submit"]');
        if (!(submitButton instanceof HTMLButtonElement)) {
            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = "Signing in...";

        const formData = new FormData(loginForm);
        const email = String(formData.get("email") || "").trim();
        const password = String(formData.get("password") || "");

        try {
            await signInWithEmailAndPassword(auth, email, password);

            showStatus("Login successful. Redirecting...", "success");

            setTimeout(() => {
                window.location.href = getRedirectTarget();
            }, 700);
        } catch (error) {
            console.error("Login error:", error);
            showStatus(mapAuthError(error, "Unable to sign in."));
            submitButton.disabled = false;
            submitButton.textContent = "Login";
        }
    });
}

if (resetForm) {
    resetForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const submitButton = resetForm.querySelector('button[type="submit"]');
        if (!(submitButton instanceof HTMLButtonElement)) {
            return;
        }

        submitButton.disabled = true;
        submitButton.textContent = "Sending...";

        const formData = new FormData(resetForm);
        const email = String(formData.get("email") || "").trim();

        try {
            await sendPasswordResetEmail(auth, email);
            showStatus("Password reset email sent. Check your inbox.", "success");
            submitButton.disabled = false;
            submitButton.textContent = "Send reset link";
        } catch (error) {
            console.error("Password reset error:", error);
            showStatus(mapAuthError(error, "Unable to send password reset email."));
            submitButton.disabled = false;
            submitButton.textContent = "Send reset link";
        }
    });
}

onAuthStateChanged(auth, (user) => {
    if (user) {
        if (loginForm || registerForm || resetForm) {
            window.location.href = getRedirectTarget();
        }
    }
});

logoutButtons.forEach((button) => {
    button.addEventListener("click", async () => {
        try {
            await signOut(auth);
            window.location.href = "login.html";
        } catch (error) {
            console.error("Logout error:", error);
        }
    });
});