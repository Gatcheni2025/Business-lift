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

const brand = `<div class="brand"><span class="brand-mark" aria-hidden="true">T</span><span>TEYZA<small>Local shops. Local growth.</small></span></div>`;
const providerButtons = mode => `<div class="auth-providers">
  <button class="auth-provider" type="button" data-provider="google" data-mode="${mode}"><svg aria-hidden="true" viewBox="0 0 24 24"><path fill="#4285F4" d="M21.35 12.24c0-.74-.07-1.46-.19-2.16H12v4.09h5.24a4.48 4.48 0 0 1-1.95 2.95v2.45h3.16c1.85-1.71 2.9-4.23 2.9-7.33Z"/><path fill="#34A853" d="M12 21.5c2.63 0 4.84-.87 6.45-2.36l-3.16-2.45c-.88.59-2 .94-3.29.94a5.87 5.87 0 0 1-5.52-4.07H3.22v2.52A9.75 9.75 0 0 0 12 21.5Z"/><path fill="#FBBC05" d="M6.48 13.56a5.9 5.9 0 0 1 0-3.12V7.92H3.22a9.75 9.75 0 0 0 0 8.16l3.26-2.52Z"/><path fill="#EA4335" d="M12 6.37c1.43 0 2.71.49 3.72 1.45l2.79-2.79A9.3 9.3 0 0 0 12 2.5a9.75 9.75 0 0 0-8.78 5.42l3.26 2.52A5.87 5.87 0 0 1 12 6.37Z"/></svg>Continue with Google</button>
</div>`;

function modal(mode) {
  const login = mode === "login";
  return `<div class="auth-backdrop" id="tz${login ? "Login" : "Register"}" aria-hidden="true">
    <section class="auth-card" role="dialog" aria-modal="true" aria-labelledby="tz${login ? "Login" : "Register"}Title">
      <button class="auth-close" type="button" data-close aria-label="Close dialog">×</button>${brand}
      <h2 id="tz${login ? "Login" : "Register"}Title">${login ? "Welcome back" : "Register your local shop"}</h2>
      <p class="auth-subtitle">${login ? "Sign in to manage your local shop." : "Create your account to manage products, stock and orders."}</p>
      <p class="auth-status" data-status role="status" aria-live="polite" hidden></p><div class="auth-recovery" data-auth-recovery hidden><a href="dashboard.html">Open shop dashboard (limited access) →</a><small>Firebase sign-in worked, but the website cannot load shop records. Full shop tools remain unavailable until the server is fixed.</small></div>
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
  const recovery = element.querySelector("[data-auth-recovery]");
  if (recovery) recovery.hidden = true;
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
    "auth/api-key-not-valid": "Teyza Firebase is using an invalid Web API key. The site administrator must restore the current Firebase Web app configuration.",
    "auth/invalid-api-key": "The Firebase API key is invalid. Check Project settings in the Firebase Console.",
    "auth/app-not-authorized": "The Firebase key is not authorized for this site. Check its HTTP referrer restrictions and allowed APIs.",
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

class TeyzaWorkspaceError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "TeyzaWorkspaceError";
    this.workspaceUnavailable = true;
    this.status = status;
  }
}
async function bootstrap(user, details = {}) {
  const token = await user.getIdToken();
  let response;
  try {
    response = await fetch("api/workspace.php?action=bootstrap", {
      method: "POST",
      headers: {Authorization: "Bearer " + token, "Content-Type": "application/json"},
      body: JSON.stringify(details)
    });
  } catch (_error) {
    throw new TeyzaWorkspaceError("Firebase sign-in succeeded, but the PHP shop workspace cannot be reached. Check the hosting server.");
  }
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json().catch(() => null) : null;
  if (!response.ok || !data?.ok) {
    const status = response.status;
    const hints = {
      401: "PHP could not verify your Firebase session. Check token verification and the Authorization header.",
      403: "This account has no permission for that Teyza shop.",
      404: "The server is missing api/workspace.php.",
      500: "The PHP server returned an error. Check PHP logs, extensions and private_html/teyza-data permissions.",
      503: "Firebase signing certificate verification or the PHP server is unavailable."
    };
    const detail = typeof data?.error === "string" && data.error.length < 280 ? data.error : (hints[status] || "The workspace did not return valid shop data.");
    throw new TeyzaWorkspaceError("Firebase sign-in succeeded, but shop records could not load (workspace HTTP " + status + "). " + detail, status);
  }
  return data;
}
function reportAuthenticationFailure(container, error, provider) {
  showStatus(container, error.workspaceUnavailable ? error.message : authError(error, provider));
  const recovery = container.querySelector("[data-auth-recovery]");
  if (recovery) recovery.hidden = !(error.workspaceUnavailable && !!auth.currentUser);
}
const allowedDestinations = new Set(["dashboard.html", "products.html", "orders.html", "customers.html", "business-profile.html", "seller-onboarding.html", "shop-settings.html", "delivery-settings.html", "payments.html", "sales-channels.html", "network.html", "store.html"]);
function loginDestination() {
  const target = new URLSearchParams(location.search).get("redirect") || "dashboard.html";
  return allowedDestinations.has(target.split(/[?#]/)[0]) && !target.includes("/") && !target.includes("\\") ? target : "dashboard.html";
}
const go = isNew => location.assign(isNew ? "dashboard.html?onboarding=1" : loginDestination());

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
    reportAuthenticationFailure(container, error, name);
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
    reportAuthenticationFailure(loginModal, error);
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
    reportAuthenticationFailure(registerModal, error);
    button.disabled = false;
  }
});

document.addEventListener("click", event => {
  const providerButton = event.target.closest("[data-provider]");
  if (providerButton) return void socialSignIn(providerButton);
  if (event.target.closest("[data-open-register],a[href='register.html']")) {
    event.preventDefault(); openModal(registerModal); return;
  }
  if (event.target.closest("[data-open-login],a[href='login.html']")) {
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
if (requested === "login" || location.pathname.endsWith("/login.html")) openModal(loginModal);
if (requested === "register" || location.pathname.endsWith("/register.html")) openModal(registerModal);
