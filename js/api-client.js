import {auth} from "./firebase-config.js";

async function currentUser() {
  if (auth.currentUser) return auth.currentUser;
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { stop(); reject(new Error("Sign-in session is not ready.")); }, 10000);
    const stop = auth.onAuthStateChanged((user) => {
      clearTimeout(timer); stop();
      if (!user) reject(new Error("Sign in is required."));
      else resolve(user);
    });
  });
}

export async function apiFetch(path, options = {}) {
  const user = await currentUser();
  const token = await user.getIdToken();
  const headers = new Headers(options.headers || {});
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(path, {...options, headers, credentials: "same-origin"});
  let data = null;
  try { data = await response.json(); } catch (_) {}
  if (!response.ok) {
    const error = new Error(data?.message || `Request failed (${response.status}).`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data || {};
}

export function workspaceId(user) {
  return user?.uid || "";
}
