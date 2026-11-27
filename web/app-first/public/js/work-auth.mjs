import {initializeApp,getApps} from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js';
import {getAuth,setPersistence,browserSessionPersistence} from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js';
const config={apiKey:'AIzaSyC0dFsNcfwuYUbdCN6K2xrG3Ycx6tPvl_U',authDomain:'business-lift-3c19c.firebaseapp.com',projectId:'business-lift-3c19c',storageBucket:'business-lift-3c19c.firebasestorage.app',messagingSenderId:'983479810697',appId:'1:983479810697:web:bd021d86bbe6d787db2458'};
export const auth=getAuth(getApps()[0]||initializeApp(config));
export const ready=setPersistence(auth,browserSessionPersistence);
export async function api(action,data={}){
 const user=auth.currentUser,uid=user?.uid;if(!user)throw Error('Sign in to continue.');const token=await user.getIdToken();
 const response=await fetch('https://us-central1-business-lift-3c19c.cloudfunctions.net/teyzaMobile',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({action,data})});
 if(auth.currentUser?.uid!==uid)throw Error('Your account changed. Reopen the page.');
 let r;try{r=await response.json();}catch{throw Error('Teyza is temporarily unavailable. Please retry.');}if(!response.ok){let message=r.error||'The request could not be completed.';if(response.status===404&&action.startsWith('agent_')&&message==='This shop service is not available.')message='The field-team service is not active yet. Teyza support must deploy the latest field-work backend before applications can be submitted.';const e=Error(message);e.status=response.status;throw e;}return r;
}
export const el=(tag,text,className='')=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(className)n.className=className;return n;};
export const label=s=>String(s||'pending').replaceAll('_',' ');
export const money=c=>'R'+((c||0)/100).toFixed(2);
