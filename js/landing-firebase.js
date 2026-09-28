import {getApps, initializeApp} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import {getAuth} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";
import {firebaseConfig} from "./firebase-settings.js";

const app = getApps()[0] || initializeApp(firebaseConfig);
export const auth = getAuth(app);
