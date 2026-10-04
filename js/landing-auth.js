import {
  FacebookAuthProvider,
  GoogleAuthProvider,
  OAuthProvider,
  createUserWithEmailAndPassword,
  getAdditionalUserInfo,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {auth} from "./landing-firebase.js";

const google = new GoogleAuthProvider();
google.setCustomParameters({prompt: "select_account"});
const facebook = new FacebookAuthProvider();
facebook.addScope("email");
const apple = new OAuthProvider("apple.com");
apple.addScope("email");
apple.addScope("name");
const providers = {google, facebook, apple};
const providerNames = {google: "Google", facebook: "Facebook", apple: "Apple"};

const brand = `<div class="brand"><span class="brand-mark" aria-hidden="true">T</span><span>TEYZA<small>Everyone can sell.</small></span></div>`;
const providerButtons = mode => `<div class="auth-providers">
  <button class="auth-provider" type="button" data-provider="google" data-mode="${mode}"><svg aria-hidden="true" viewBox="0 0 24 24"><path fill="#4285F4" d="M21.35 12.24c0-.74-.07-1.46-.19-2.16H12v4.09h5.24a4.48 4.48 0 0 1-1.95 2.95v2.45h3.16c1.85-1.71 2.9-4.23 2.9-7.33Z"/><path fill="#34A853" d="M12 21.5c2.63 0 4.84-.87 6.45-2.36l-3.16-2.45c-.88.59-2 .94-3.29.94a5.87 5.87 0 0 1-5.52-4.07H3.22v2.52A9.75 9.75 0 0 0 12 21.5Z"/><path fill="#FBBC05" d="M6.48 13.56a5.9 5.9 0 0 1 0-3.12V7.92H3.22a9.75 9.75 0 0 0 0 8.16l3.26-2.52Z"/><path fill="#EA4335" d="M12 6.37c1.43 0 2.71.49 3.72 1.45l2.79-2.79A9.3 9.3 0 0 0 12 2.5a9.75 9.75 0 0 0-8.78 5.42l3.26 2.52A5.87 5.87 0 0 1 12 6.37Z"/></svg>Continue with Google</button>
  <button class="auth-provider" type="button" data-provider="facebook" data-mode="${mode}"><span class="facebook-symbol" aria-hidden="true">f</span>Continue with Facebook</button>
  <button class="auth-provider" type="button" data-provider="apple" data-mode="${mode}"><svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M16.49 12.56c.03 2.68 2.38 3.57 2.41 3.59-.02.06-.38 1.35-1.24 2.69-.75 1.16-1.53 2.3-2.75 2.33-1.2.02-1.59-.72-2.96-.72-1.36 0-1.79.7-2.93.74-1.18.05-2.07-1.25-2.82-2.4-1.54-2.36-2.72-6.68-1.13-9.36a4.37 4.37 0 0 1 3.69-2.25c1.15-.02 2.23.79 2.94.79.7 0 2.01-.97 3.39-.83.58.03 2.22.23 3.27 1.8-.09.06-1.95 1.2-1.87 3.62ZM14.93 5.65c.62-.76 1.04-1.82.93-2.88-.9.04-2 .6-2.66 1.35-.59.67-1.1 1.75-.97 2.79 1 .08 2.04-.51 2.7-1.26Z"/></svg>Continue with Apple</button>
</div>`;

function modal(mode) {
  const login = mode === "login";
  return `<div class="auth-backdrop" id="tz${login ? "Login" : "Register"}" aria-hidden="true">
    <section class="auth-card" role="dialog" aria-modal="true" aria-labelledby="tz${login ? "Login" : "Register"}Title">
      <button class="auth-close" type="button" data-close aria-label="Close dialog">×</button>${brand}
      <h2 id="tz${login ? "Login" : "Register"}Title">${login ? "Welcome back" : "Start selling with Teyza"}</h2>
      <p class="auth-subtitle">${login ? "Log in to your business workspace." : "Create your free account, then follow the guided business setup."}</p>
      <p class="auth-status" data-status role="status" aria-live="polite" hidden></p>
      ${providerButtons(mode)}<div class="auth-divider">or continue with email</div>
      <form id="tz${login ? "Login" : "Register"}Form">
        ${login ? "" : `<div class="auth-grid"><label class="auth-field">First name<input name="firstName" autocomplete="given-name" required></label><label class="auth-field">Last name<input name="lastName" autocomplete="family-name" required></label></div>`}
        <label class="auth-field">Email address<input type="email" name="email" autocomplete="email" required></label>
        <label class="auth-field">Password<span class="auth-password"><input type="password" name="password" autocomplete="${login ? "current-password" : "new-password"}" minlength="6" required><button type="button" data-toggle-password aria-label="Show password">Show</button></span></label>
        ${login ? `<a class="auth-forgot" href="forgot-password.html">Forgot password?</a>` : `<label class="auth-field">Business name <span class="auth-optional">(optional for now)</span><input name="businessName" autocomplete="organization" placeholder="e.g. Gatcheni Stores"></label>`}
        <button class="auth-submit" type="submit">${login ? "Log in" : "Create account"}</button>
      </form>
      <p class="auth-switch">${login ? "New to Teyza? <button type=\"button\" data-open-register>Create an account</button>" : "Already have an account? <button type=\"button\" data-open-login>Log in</button>"}</p>
    </section></div>`;
}

document.body.insertAdjacentHTML("beforeend", modal("login") + modal("register"));
const loginModal = document.getElementById("tzLogin");
const registerModal = document.getElementById("tzRegister");
let returnFocus = null;
function showStatus(element, message, tone = "error") {
  const node = element.querySelector("[data-status]");
  node.hidden = false;
  node.textContent = message;
  node.className = "auth-status " + tone;
}
function clearStatus(element) {
  const node = element.querySelector("[data-status]");
  node.hidden = true;
  node.textContent = "";
}
function openModal(element) {
  document.querySelectorAll(".auth-backdrop.open").forEach(closeModal);
  returnFocus = document.activeElement;
  clearStatus(element);
  element.classList.add("open");
  element.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  element.querySelector("[data-close]").focus();
}
function closeModal(element) {
  element.classList.remove("open");
  element.setAttribute("aria-hidden", "true");
  document.body.classList.remove("modal-open");
  if (returnFocus?.isConnected) returnFocus.focus();
}

function authError(error, provider) {
  const label = providerNames[provider] || "Email/password";
  const messages = {
    "auth/invalid-credential": "Email or password not recognised. If you created your account with Google, use Google to sign in. Otherwise reset your password.",
    "auth/wrong-password": "Incorrect password. Reset your password if you need a new one.",
    "auth/user-not-found": "No email/password account was found. Create an account or use the provider you signed up with.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/too-many-requests": "Too many attempts. Wait a little and try again, or reset your password.",
    "auth/email-already-in-use": "This email already has a Teyza account. Log in instead.",
    "auth/account-exists-with-different-credential": "This email already has an account with another sign-in method. Use that method to log in.",
    "auth/operation-not-allowed": `${label} sign-in is not enabled yet. Please use another method for now.`,
    "auth/unauthorized-domain": "This website is not authorized for sign-in. Please contact Teyza support.",
    "auth/popup-blocked": "Your browser blocked the sign-in window. Allow popups for this site and try again.",
    "auth/popup-closed-by-user": "The sign-in window was closed. Try again when you are ready.",
    "auth/cancelled-popup-request": "Another sign-in window was opened. Please try again.",
    "auth/network-request-failed": "Connection failed. Check your internet connection and try again.",
    "auth/weak-password": "Choose a password with at least 6 characters."
  };
  return messages[error?.code] || error?.message || "Sign-in failed. Please try again.";
}
async function bootstrap(user, details = {}) {
  const token = await user.getIdToken();
  const response = await fetch("api/workspace.php?action=bootstrap", {
    method: "POST",
    headers: {Authorization: `Bearer ${token}`, "Content-Type": "application/json"},
    body: JSON.stringify(details)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) throw new Error(data.error || "Sign-in succeeded, but the seller workspace is unavailable. Please contact Teyza support or try again later.");
}
const allowedDestinations = new Set(["dashboard.html", "products.html", "orders.html", "customers.html", "business-profile.html", "seller-onboarding.html", "shop-settings.html", "delivery-settings.html", "payments.html", "sales-channels.html", "network.html", "store.html"]);
function loginDestination() {
  const target = new URLSearchParams(location.search).get("redirect") || "dashboard.html";
  return allowedDestinations.has(target.split(/[?#]/)[0]) && !target.includes("/") && !target.includes("\\") ? target : "dashboard.html";
}
const go = isNew => location.assign(isNew ? "business-profile.html?onboarding=1" : loginDestination());

async function socialSignIn(button) {
  if (button.disabled) return;
  const mode = button.dataset.mode;
  const name = button.dataset.provider;
  const container = button.closest(".auth-backdrop");
  button.disabled = true;
  showStatus(container, `Opening ${providerNames[name]} sign-in…`, "info");
  try {
    const result = await signInWithPopup(auth, providers[name]);
    const isNew = getAdditionalUserInfo(result)?.isNewUser === true;
    await bootstrap(result.user);
    showStatus(container, isNew ? "Account created. Opening business setup…" : "Signed in. Opening your workspace…", "success");
    go(isNew);
  } catch (error) {
    showStatus(container, authError(error, name));
    button.disabled = false;
  }
}

const loginForm = document.getElementById("tzLoginForm");
loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  const button = loginForm.querySelector('[type="submit"]');
  button.disabled = true;
  const details = new FormData(loginForm);
  showStatus(loginModal, "Signing in…", "info");
  try {
    const result = await signInWithEmailAndPassword(auth, String(details.get("email")).trim(), String(details.get("password")));
    await bootstrap(result.user);
    showStatus(loginModal, "Signed in. Opening your workspace…", "success");
    go(false);
  } catch (error) {
    showStatus(loginModal, authError(error));
    button.disabled = false;
  }
});

const registerForm = document.getElementById("tzRegisterForm");
registerForm.addEventListener("submit", async event => {
  event.preventDefault();
  const button = registerForm.querySelector('[type="submit"]');
  button.disabled = true;
  const details = new FormData(registerForm);
  const email = String(details.get("email")).trim();
  const fullName = `${details.get("firstName")} ${details.get("lastName")}`.trim();
  showStatus(registerModal, "Creating your account…", "info");
  try {
    let user = auth.currentUser;
    const pendingUid = sessionStorage.getItem("teyzaPendingEnrollment");
    if (!user || user.uid !== pendingUid || user.email?.toLowerCase() !== email.toLowerCase()) {
      user = (await createUserWithEmailAndPassword(auth, email, String(details.get("password")))).user;
      sessionStorage.setItem("teyzaPendingEnrollment", user.uid);
    }
    if (user.displayName !== fullName) await updateProfile(user, {displayName: fullName});
    await bootstrap(user, {firstName: String(details.get("firstName")).trim(), businessName: String(details.get("businessName")).trim()});
    sessionStorage.removeItem("teyzaPendingEnrollment");
    showStatus(registerModal, "Account created. Opening business setup…", "success");
    go(true);
  } catch (error) {
    showStatus(registerModal, authError(error));
    button.disabled = false;
  }
});

document.addEventListener("click", event => {
  const providerButton = event.target.closest("[data-provider]");
  if (providerButton) return void socialSignIn(providerButton);
  if (event.target.closest("[data-open-register],a[href='register.html']")) {
    event.preventDefault(); openModal(registerModal); return;
  }
  if (event.target.closest("[data-open-login]")) {
    event.preventDefault(); openModal(loginModal); return;
  }
  const toggle = event.target.closest("[data-toggle-password]");
  if (toggle) {
    const input = toggle.parentElement.querySelector("input");
    const visible = input.type === "text";
    input.type = visible ? "password" : "text";
    toggle.textContent = visible ? "Show" : "Hide";
    toggle.setAttribute("aria-label", visible ? "Show password" : "Hide password");
    return;
  }
  const close = event.target.closest("[data-close]");
  if (close) return void closeModal(close.closest(".auth-backdrop"));
  if (event.target.classList.contains("auth-backdrop")) closeModal(event.target);
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    const open = document.querySelector(".auth-backdrop.open");
    if (open) closeModal(open);
  }
});
const requested = new URLSearchParams(location.search).get("auth");
if (requested === "login") openModal(loginModal);
if (requested === "register" || location.pathname.endsWith("/register.html")) openModal(registerModal);
