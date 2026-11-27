import {initializeApp,getApps} from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js';
import {getAuth} from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js';
const config={apiKey:'AIzaSyC0dFsNcfwuYUbdCN6K2xrG3Ycx6tPvl_U',authDomain:'business-lift-3c19c.firebaseapp.com',
  projectId:'business-lift-3c19c',storageBucket:'business-lift-3c19c.firebasestorage.app',
  messagingSenderId:'983479810697',appId:'1:983479810697:web:bd021d86bbe6d787db2458'};
export const auth=getAuth(getApps()[0]||initializeApp(config));
