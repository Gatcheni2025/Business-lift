import { GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { auth } from "./firebase-config.js";

const modal = document.getElementById("loginModal");
const form = document.getElementById("premiumLogin");
const googleButton = document.getElementById("googleLogin");
const status = document.getElementById("authStatus");
const password = document.getElementById("loginPassword");
const togglePassword = document.getElementById("togglePassword");
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

function openLogin() {
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  setTimeout(() => document.getElementById("loginEmail")?.focus(), 180);
}
function closeLogin() {
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  hideStatus();
}
function showStatus(message, success = false) {
  status.hidden = false;
  status.textContent = message;
  status.classList.toggle("success", success);
}
function hideStatus(){ status.hidden = true; status.textContent = ""; status.classList.remove("success"); }
function friendlyError(error) {
  const messages = {
    "auth/invalid-credential": "The email or password is incorrect.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/popup-closed-by-user": "Google sign-in was closed before it finished.",
    "auth/popup-blocked": "Your browser blocked the Google sign-in window. Allow popups and try again.",
    "auth/unauthorized-domain": "Teyza is not yet authorised for Firebase sign-in on this domain.",
    "auth/operation-not-allowed": "This sign-in method is not enabled yet.",
    "auth/network-request-failed": "Check your internet connection and try again.",
    "auth/too-many-requests": "Too many attempts. Please wait a moment and try again."
  };
  return messages[error?.code] || "We couldn't log you in. Please try again.";
}
function enterWorkspace(){ window.location.assign("dashboard.html"); }

document.querySelectorAll("[data-open-login]").forEach(button => button.addEventListener("click", openLogin));
document.querySelectorAll("[data-close-login]").forEach(button => button.addEventListener("click", closeLogin));
modal.addEventListener("click", event => { if (event.target === modal) closeLogin(); });
document.addEventListener("keydown", event => { if (event.key === "Escape" && modal.classList.contains("open")) closeLogin(); });

togglePassword.addEventListener("click", () => {
  const showing = password.type === "text";
  password.type = showing ? "password" : "text";
  togglePassword.innerHTML = showing ? '<i class="ph ph-eye"></i>' : '<i class="ph ph-eye-slash"></i>';
  togglePassword.setAttribute("aria-label", showing ? "Show password" : "Hide password");
});

form.addEventListener("submit", async event => {
  event.preventDefault(); hideStatus();
  const button = form.querySelector("button[type='submit']");
  const email = document.getElementById("loginEmail").value.trim();
  const pass = password.value;
  button.disabled = true; button.innerHTML = '<i class="ph ph-circle-notch ph-spin"></i> Logging in…';
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    showStatus("Welcome back. Opening your workspace…", true);
    setTimeout(enterWorkspace, 450);
  } catch (error) {
    console.error("Teyza email login:", error);
    showStatus(friendlyError(error));
    button.disabled = false; button.innerHTML = 'Log in to Teyza <i class="ph ph-arrow-right"></i>';
  }
});

googleButton.addEventListener("click", async () => {
  hideStatus(); googleButton.disabled = true;
  googleButton.innerHTML = '<i class="ph ph-circle-notch ph-spin"></i> Connecting to Google…';
  try {
    await signInWithPopup(auth, provider);
    showStatus("Google sign-in successful. Opening your workspace…", true);
    setTimeout(enterWorkspace, 450);
  } catch (error) {
    console.error("Teyza Google login:", error);
    showStatus(friendlyError(error));
    googleButton.disabled = false; googleButton.innerHTML = '<span class="google-g">G</span> Continue with Google';
  }
});
